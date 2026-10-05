import base64,json
from datetime import datetime,timezone
from uuid import uuid4
import pytest
from app.foundation import interviews,chat
from app.foundation.interviews import calendar,Slot,DisabledInterviewSender
from test_boundary import boundary,login,write_headers

def row():return {'id':str(uuid4()),'revision':3,'state':'confirmed','title':'Role \nBEGIN:VEVENT, injected; '+('界'*70),'slot':{'starts_at':'2026-10-03T08:00:00+00:00','ends_at':'2026-10-03T09:00:00+00:00','timezone':'Asia/Kuala_Lumpur','location':'Office; Room, 1'}}
def test_ics_unicode_folding_escaping_utc_sequence_and_cancel():
 r=row();s=calendar(r);assert s.count('BEGIN:VEVENT')==2 # one literal escaped title, one actual record
 lines=s.split('\r\n');assert len([l for l in lines if l=='BEGIN:VEVENT'])==1
 assert all(len(l.encode())<=75 for l in lines) and 'DTSTART:20261003T080000Z' in s and 'SEQUENCE:3' in s and '\\nBEGIN:VEVENT' in s
 r['state']='cancelled';r['revision']=4;s=calendar(r);assert 'METHOD:CANCEL' in s and 'STATUS:CANCELLED' in s and 'SEQUENCE:4' in s
 assert DisabledInterviewSender().send('never-send@example.test')['sent'] is False

def test_api_auth_csrf_timezone_schema_sender_and_scoped_export(boundary,monkeypatch):
 client,fake=boundary;assert client.get('/api/v1/interviews/context').status_code==401
 fake.token='header.'+base64.urlsafe_b64encode(json.dumps({'aal':'aal2'}).encode()).decode().rstrip('=')+'.signature';login(client);calls=[]
 def rpc(name,**kw):
  calls.append((name,kw))
  if name=='m8_booking':return row()
  if name=='m8_context':return {'applications':[],'slots':[],'bookings':[],'interviewers':[],'email_delivery':'disabled'}
  if name=='m8_reminders':return []
  return str(uuid4())
 monkeypatch.setattr(interviews,'gateway',type('G',(),{'rpc':staticmethod(rpc)})())
 slot={'job_id':str(uuid4()),'interviewer_id':str(uuid4()),'starts_at':'2026-10-05T08:00:00Z','ends_at':'2026-10-05T09:00:00Z','timezone':'Asia/Kuala_Lumpur','mode':'online','location':'https://meet.example.test/room'}
 assert client.post('/api/v1/interviews/slots',json=slot).status_code==403
 for bad in [slot|{'role':'admin'},slot|{'starts_at':'2026-10-05T08:00:00'},slot|{'location':'https://127.0.0.1/room'}]:assert client.post('/api/v1/interviews/slots',headers=write_headers(client),json=bad).status_code==422
 assert client.post('/api/v1/interviews/slots',headers=write_headers(client),json=slot).status_code==200
 assert calls[-1][1]['token']==fake.token and 'actor_id' not in calls[-1][1]['payload']
 r=client.get('/api/v1/interviews/bookings/'+str(uuid4())+'/calendar.ics');assert r.status_code==200 and r.headers['cache-control']=='no-store' and 'attachment' in r.headers['content-disposition']
 assert client.get('/api/v1/interviews/context?staff_scope=true').json()['email_delivery']=='disabled'
 assert client.post('/api/v1/interviews/applications/'+str(uuid4())+'/outcome',headers=write_headers(client),json={'expected_version':0,'outcome':'hired','reason':'Human review reason here','human_attested':True,'actor':'AI'}).status_code==422

def test_scoped_scheduled_chat_has_no_private_scorecard():
 from chat_fixture import ChatFixture,principal,AX
 class Store(ChatFixture):
  def rpc(self,name,**kw):
   if name=='m8_context':
    r=row();r.update(application_id=AX,updated_at='2026-10-03T00:00:00Z',scorecard={'private_notes':'DO NOT SHOW'},candidate_id='A');r['slot']['mode']='physical';return {'bookings':[r]}
   return super().rpc(name,**kw)
 r=chat.answer(chat.ChatRequest(message='When is my interview?',application_id=AX),principal(),Store());assert r['citations'][0]['source']=='my_interviews' and 'private_notes' not in json.dumps(r)
