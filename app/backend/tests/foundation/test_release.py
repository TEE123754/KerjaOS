import io,json,zipfile
from pathlib import Path
from uuid import uuid4
import pytest
from cryptography.fernet import Fernet,InvalidToken
from app.foundation import release
from app.foundation.config import FoundationSettings
from app.foundation.recovery import seal,open_archive,stage,safe_name
from test_boundary import boundary,login,write_headers

def test_release_mode_rejects_unapproved_pilot():
 assert FoundationSettings(_env_file=None,APP_MODE='demo_free').APP_MODE=='demo_free'
 with pytest.raises(ValueError):FoundationSettings(_env_file=None,APP_MODE='controlled_pilot')

def test_authenticated_archive_restore_and_tamper(tmp_path):
 key=Fernet.generate_key();payload=seal(b'synthetic database',{'A/resume.enc':b'encrypted object'},{'documents':[]},key)
 recovered=open_archive(payload,key);assert recovered['database.dump']==b'synthetic database' and recovered['objects/A/resume.enc']==b'encrypted object'
 assert stage(payload,key,tmp_path/'restore')==3
 assert (tmp_path/'restore/objects/A/resume.enc').read_bytes()==b'encrypted object'
 with pytest.raises(FileExistsError):stage(payload,key,tmp_path/'restore')
 with pytest.raises(InvalidToken):open_archive(payload,Fernet.generate_key())
 with pytest.raises(InvalidToken):open_archive(payload[:-8]+b'changed!',key)
 for name in ['../outside','/outside','A/../../outside','C:/outside','A\\outside','A//B']:
  with pytest.raises(ValueError):safe_name(name)
 stream=io.BytesIO()
 with zipfile.ZipFile(stream,'w') as z:z.writestr('../outside','escape');z.writestr('manifest.json','{}')
 with pytest.raises(ValueError):stage(Fernet(key).encrypt(stream.getvalue()),key,tmp_path/'bad')
 assert not (tmp_path/'bad').exists()

def test_privacy_auth_csrf_export_and_requests(boundary,monkeypatch):
 client,fake=boundary;calls=[]
 class Store:
  def rpc(self,name,**kwargs):
   calls.append((name,kwargs));return {'rows':[],'next_offset':None} if name=='m9_export' else [] if name=='m9_requests' else {'state':'pending_review'}
 monkeypatch.setattr(release,'gateway',Store())
 r=client.get('/api/v1/privacy/notice');assert r.status_code==200 and r.json()['real_data_enabled'] is False and r.json()['contact'] is None and r.json()['text']['ms']
 assert client.get('/api/v1/privacy/export').status_code==401
 body={'kind':'erase_account','reason':'Please review my account erasure','idempotency_key':str(uuid4())}
 login(client)
 assert client.post('/api/v1/privacy/requests',json=body).status_code==403
 assert client.post('/api/v1/privacy/requests',json=body,headers=write_headers(client)).json()['state']=='pending_review'
 r=client.get('/api/v1/privacy/export?section=quiz&offset=100');assert r.status_code==200 and r.headers['cache-control']=='no-store' and 'attachment' in r.headers['content-disposition']
 assert calls[-1][1]['token']==fake.token and 'admin' not in calls[-1][1]
 for query in ['section=staff_notes','offset=-1','offset=100001']:assert client.get('/api/v1/privacy/export?'+query).status_code==422
 body['owner_id']=str(uuid4());assert client.post('/api/v1/privacy/requests',json=body,headers=write_headers(client)).status_code==422
