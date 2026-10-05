from uuid import uuid4
from app.foundation import reminders,reminder_worker
from app.foundation.config import get_settings
from test_boundary import boundary,login,write_headers
class Store:
 def __init__(self):self.calls=[];self.next=True;self.mode='fixture';self.dispatch=True;self.fail_complete=False
 def rpc(self,name,**kw):
  self.calls.append((name,kw))
  if name=='m12_context':return {'reminders':[],'preference':{'email_opt_in':False,'revision':0},'policy':{'enabled':False,'mode':'disabled'}}
  return {}
 def request(self,method,path,**kw):
  self.calls.append((path,kw));name=path.split('/')[-1]
  if name=='m12_enqueue':return 1
  if name=='m12_claim':
   if not self.next:return None
   self.next=False;return {'id':str(uuid4())}
  if name=='m12_dispatch':return {'id':str(uuid4()),'recipient':'verified-owner@example.test','mode':self.mode,'message_id':'<fixture@kerjaos.local>'} if self.dispatch else None
  if name=='m12_finish' and self.fail_complete:raise RuntimeError('Completion crash')
  return True

def test_reminders_auth_csrf_actor_recipient_dates_and_preferences(boundary,monkeypatch):
 client,fake=boundary;store=Store();monkeypatch.setattr(reminders,'gateway',store)
 assert client.get('/api/v1/reminders/context').status_code==401;assert client.get('/api/v1/reminders/email-preview').status_code==401
 login(client);h=write_headers(client);body={'action':'create','idempotency_key':str(uuid4()),'title':'Personal','due_at':'2026-11-01T01:30:00-04:00','timezone':'America/New_York'}
 assert client.post('/api/v1/reminders/edit',json=body).status_code==403
 assert client.post('/api/v1/reminders/edit',json=body,headers=h).status_code==200
 assert store.calls[-1][1]['payload']['p_due']=='2026-11-01T05:30:00+00:00' and store.calls[-1][1]['token']==fake.token and 'admin' not in store.calls[-1][1]
 for changes in [{'owner_id':str(uuid4())},{'recipient':'employer@example.test'},{'due_at':'2026-11-01T01:30:00'},{'timezone':'EST'},{'timezone':'Bad/Zone'},{'title':'Bad\nTitle'},{'action':'send'}]:assert client.post('/api/v1/reminders/edit',json={**body,**changes},headers=h).status_code==422
 assert client.post('/api/v1/reminders/preference',json={'email_opt_in':True,'expected_revision':0,'idempotency_key':str(uuid4())},headers=h).status_code==200
 assert client.get('/api/v1/reminders/context').json()['worker_configured'] is False
 assert client.get('/api/v1/reminders/context?offset=-1').status_code==422
 preview=client.get('/api/v1/reminders/email-preview');assert 'verified account' in preview.json()['recipient'] and preview.headers['cache-control']=='no-store'

def test_disabled_worker_and_fixture_receipts_do_not_send(monkeypatch):
 store=Store();assert reminder_worker.run_once(store)=={'queued':0,'processed':0,'fixture':0,'sent':0,'unknown':0,'disabled':0,'failed':0};assert store.calls==[]
 monkeypatch.setenv('REMINDER_WORKER_ENABLED','true');get_settings.cache_clear()
 counts=reminder_worker.run_once(store,reminder_worker.FixtureSender());assert counts['fixture']==1 and counts['sent']==0 and counts['processed']==1
 assert all(kw.get('admin') is True for path,kw in store.calls)
 assert reminder_worker.DisabledSender().send({})==('disabled',None)

def test_worker_stale_dispatch_mode_mismatch_and_ambiguous_crash(monkeypatch):
 monkeypatch.setenv('REMINDER_WORKER_ENABLED','true');get_settings.cache_clear()
 store=Store();store.dispatch=False;assert reminder_worker.run_once(store,reminder_worker.FixtureSender())['processed']==0
 store=Store();store.mode='smtp';assert reminder_worker.run_once(store,reminder_worker.FixtureSender())['disabled']==1
 class Broken(reminder_worker.FixtureSender):
  def send(self,d):raise TimeoutError()
 store=Store();assert reminder_worker.run_once(store,Broken())['unknown']==1;assert store.calls[-2][1]['json']['p_outcome']=='unknown'
 store=Store();store.fail_complete=True
 import pytest
 with pytest.raises(RuntimeError):reminder_worker.run_once(store,reminder_worker.FixtureSender())
 assert sum(p.endswith('m12_dispatch') for p,k in store.calls)==1

def test_smtp_is_reviewed_tls_account_only_and_no_private_title(monkeypatch):
 assert reminder_worker.SMTPSender().preflight() is False
 for k,v in {'REMINDER_EMAIL_APPROVED':'true','REMINDER_FREE_SMTP_APPROVED':'true','SMTP_HOST':'smtp.example.test','SMTP_USER':'sender@example.test','SMTP_PASSWORD':'synthetic','SMTP_FROM':'sender@example.test'}.items():monkeypatch.setenv(k,v)
 get_settings.cache_clear();assert reminder_worker.SMTPSender().preflight() is True
 sent=[]
 class FakeSMTP:
  def __init__(self,*args,**kw):assert kw['timeout']==15
  def __enter__(self):return self
  def __exit__(self,*args):return False
  def ehlo(self):pass
  def starttls(self,context):assert context.check_hostname
  def login(self,*args):pass
  def send_message(self,msg,**kw):sent.append((msg,kw));return {}
 monkeypatch.setattr(reminder_worker.smtplib,'SMTP',FakeSMTP)
 assert reminder_worker.SMTPSender().send({'recipient':'verified-owner@example.test','message_id':'<fixture@kerjaos.local>'})==('sent','<fixture@kerjaos.local>')
 assert sent[0][1]['to_addrs']==['verified-owner@example.test'];assert sent[0][0]['Subject']=='KerjaOS reminder';assert 'unsubscribe' in sent[0][0].get_content()
 class TimeoutSMTP(FakeSMTP):
  def send_message(self,*args,**kw):raise TimeoutError()
 monkeypatch.setattr(reminder_worker.smtplib,'SMTP',TimeoutSMTP)
 assert reminder_worker.SMTPSender().send({'recipient':'verified-owner@example.test','message_id':'<fixture@kerjaos.local>'})==('unknown',None)
