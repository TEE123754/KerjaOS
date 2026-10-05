"""One bounded run. Durable dispatch boundary; ambiguous delivery never auto-retries."""
import smtplib,ssl
from email.message import EmailMessage
from uuid import uuid4
from .config import get_settings
from .gateway import gateway
SUBJECT='KerjaOS reminder'
BODY='A personal reminder is due. Sign in to KerjaOS to review your reminders. No employer has been contacted.'
class DisabledSender:
 mode='disabled'
 def preflight(self):return False
 def send(self,dispatch):return ('disabled',None)
class FixtureSender:
 mode='fixture'
 def preflight(self):return True
 def send(self,dispatch):return ('fixture','synthetic-receipt')
class SMTPSender:
 mode='smtp'
 def preflight(self):
  c=get_settings();return bool(c.REMINDER_EMAIL_APPROVED and c.REMINDER_FREE_SMTP_APPROVED and c.SMTP_HOST and c.SMTP_USER and c.SMTP_PASSWORD and c.SMTP_FROM==c.SMTP_USER and '@' in c.SMTP_FROM and all('\r' not in x and '\n' not in x for x in [c.SMTP_HOST,c.SMTP_USER,c.SMTP_FROM]))
 def send(self,dispatch):
  if not self.preflight():return ('disabled',None)
  c=get_settings();recipient=dispatch['recipient']
  if any(ch in recipient for ch in '\r\n') or '@' not in recipient:return ('failed',None)
  message=EmailMessage();message['Subject']=SUBJECT;message['From']=c.SMTP_FROM;message['To']=recipient;message['Message-ID']=dispatch['message_id'];message.set_content(BODY+'\n\n'+c.PUBLIC_APP_URL.rstrip('/')+'/foundation?view=Reminders\nChange email preferences in Reminders to unsubscribe.')
  try:
   # Existing SMTP protocol/settings shape, with mandatory TLS and account-only envelope.
   with smtplib.SMTP(c.SMTP_HOST,c.SMTP_PORT,timeout=15) as smtp:
    smtp.ehlo();smtp.starttls(context=ssl.create_default_context());smtp.ehlo();smtp.login(c.SMTP_USER,c.SMTP_PASSWORD)
    refused=smtp.send_message(message,from_addr=c.SMTP_FROM,to_addrs=[recipient])
    if refused:return ('failed',None)
   return ('sent',dispatch['message_id'])
  except (smtplib.SMTPAuthenticationError,smtplib.SMTPRecipientsRefused,smtplib.SMTPSenderRefused):return ('failed',None)
  except Exception:return ('unknown',None)

def sender():
 return {'disabled':DisabledSender,'fixture':FixtureSender,'smtp':SMTPSender}[get_settings().REMINDER_SENDER]()
def run_once(store=None,adapter=None,limit=20):
 store=store or gateway;cfg=get_settings();adapter=adapter or sender();counts={'queued':0,'processed':0,'fixture':0,'sent':0,'unknown':0,'disabled':0,'failed':0}
 if not cfg.REMINDER_WORKER_ENABLED:return counts
 def rpc(name,payload=None):return store.request('POST','/rest/v1/rpc/'+name,admin=True,json=payload or {})
 counts['queued']=rpc('m12_enqueue')
 for _ in range(min(max(limit,0),50)):
  lease=str(uuid4());claim=rpc('m12_claim',{'p_lease':lease})
  if not claim:break
  if not adapter.preflight():rpc('m12_retry_before_dispatch',{'p_id':claim['id'],'p_lease':lease});counts['failed']+=1;continue
  dispatch=rpc('m12_dispatch',{'p_id':claim['id'],'p_lease':lease})
  if not dispatch:continue
  if dispatch['mode']!=adapter.mode:outcome,receipt='disabled',None
  else:
   try:outcome,receipt=adapter.send(dispatch)
   except Exception:outcome,receipt='unknown',None
  if outcome not in ('sent','fixture','unknown','disabled','failed'):outcome,receipt='unknown',None
  # If completion crashes, durable sending state expires to unknown, never back to queued.
  rpc('m12_finish',{'p_id':claim['id'],'p_lease':lease,'p_outcome':outcome,'p_receipt':receipt});counts[outcome]+=1;counts['processed']+=1
 return counts
