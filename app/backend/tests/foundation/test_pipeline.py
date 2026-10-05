import base64
import json
from uuid import uuid4
import pytest
from app.foundation import pipeline as service
from test_boundary import boundary, login, write_headers, APP, A


def test_candidate_withdraw_delegates_uuid_and_verified_actor_only(boundary, monkeypatch):
    client,fake=boundary
    calls=[]
    def rpc(name,**kwargs): calls.append((name,kwargs));return {'id':APP,'status':'withdrawn','version':1}
    monkeypatch.setattr(service,'gateway',type('Adapter',(),{'rpc':staticmethod(rpc)})())
    login(client)
    payload={'action':'withdraw','reason':'Candidate withdraws voluntarily','expected_version':0,'idempotency_key':str(uuid4()),'evidence_ids':[]}
    result=client.post('/api/v1/applications/'+APP+'/transitions',headers=write_headers(client),json=payload)
    assert result.status_code==200 and result.json()['status']=='withdrawn'
    assert calls[0][0]=='m2_transition' and calls[0][1]['token']==fake.token
    assert calls[0][1]['payload']['p_id']==APP and 'admin' not in calls[0][1]
    payload['actor_type']='human'
    assert client.post('/api/v1/applications/'+APP+'/transitions',headers=write_headers(client),json=payload).status_code==422


@pytest.mark.parametrize('action',['advance','pause','resume','shortlist','reject','reopen','skip','interview_entry','note'])
def test_aal1_cannot_make_staff_changes(boundary,action):
    client,_=boundary;login(client)
    payload={'action':action,'reason':'Reviewed evidence supplied','expected_version':0,'idempotency_key':str(uuid4()),'evidence_ids':[APP]}
    assert client.post('/api/v1/applications/'+APP+'/transitions',headers=write_headers(client),json=payload).status_code==403


def test_candidate_dto_and_scope_exclude_internal_data(boundary,monkeypatch):
    client,fake=boundary;login(client)
    original=fake.table
    def table(name,**kw):
        result=original(name,**kw)
        if name=='m1_applications':
            if not kw['params'].get('id'): assert kw['params']['candidate_id']=='eq.'+A
            for row in result: row.update(private_note='never disclose',submission_snapshot={'job_title':'X','internal_notes':'secret'},policy_snapshot={'version':3})
        return result
    monkeypatch.setattr(fake,'table',table)
    result=client.get('/api/v1/applications')
    assert result.status_code==200 and result.json()[0]['job_title']=='X'
    assert 'secret' not in result.text and 'never disclose' not in result.text
    assert client.get('/api/v1/staff/queue').status_code==403
    assert client.get('/api/v1/staff/applications/'+APP+'/notes').status_code==403


def test_staff_queue_keeps_user_token_and_pagination_bounded(boundary,monkeypatch):
    client,fake=boundary
    fake.token='header.'+base64.urlsafe_b64encode(json.dumps({'aal':'aal2'}).encode()).decode().rstrip('=')+'.signature'
    original=fake.rpc;calls=[]
    def rpc(name,**kw):
        if name=='m2_staff_queue': calls.append(kw);return [{'id':APP,'submission_snapshot':{'job_title':'Scoped role'}}]
        return original(name,**kw)
    monkeypatch.setattr(fake,'rpc',rpc);login(client)
    assert client.get('/api/v1/staff/queue?offset=50').json()[0]['job_title']=='Scoped role'
    assert calls==[{'token':fake.token,'payload':{'p_offset':50}}]
    assert client.get('/api/v1/staff/queue?offset=-1').status_code==422


def test_resume_replacement_freezes_after_screening(boundary,monkeypatch):
    client,fake=boundary;login(client);original=fake.table
    def table(name,**kw):
        result=original(name,**kw)
        if name=='m1_applications':
            for row in result: row['stage']='P2'
        return result
    monkeypatch.setattr(fake,'table',table)
    assert client.post('/api/v1/applications/'+APP+'/resume',headers=write_headers(client),files={'file':('fake.pdf',b'%PDF-fixture','application/pdf')}).status_code==409
