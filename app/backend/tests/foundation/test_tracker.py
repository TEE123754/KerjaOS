import hashlib,io
from uuid import uuid4
from pypdf import PdfWriter
from fastapi import HTTPException
from itsdangerous import URLSafeTimedSerializer,TimestampSigner
from app.foundation import tracker
from app.foundation.config import get_settings
from app.foundation.privacy import cipher,decrypt
from test_boundary import boundary,login,write_headers,A,APP

def pdf():
 out=io.BytesIO();writer=PdfWriter();writer.add_blank_page(width=100,height=100);writer.write(out);return out.getvalue()

class Store:
 def __init__(self):self.calls=[];self.data=pdf();self.id=str(uuid4());self.doc=str(uuid4());self.object_key=A+'/library/'+self.id+'.enc';self.objects={};self.live=True;self.complete=True
 def rpc(self,name,**kwargs):
  self.calls.append((name,kwargs))
  if name=='m10_resume_register':return {'id':self.id,'object_key':self.object_key}
  if name=='m10_resume_read':
   if not self.live:raise HTTPException(403,'Expired library version')
   return {'id':self.id,'object_key':self.object_key,'sha256':hashlib.sha256(self.data).hexdigest()}
  if name=='m10_clone':return {'id':self.doc,'object_key':A+'/'+self.doc+'.enc','state':'upload_pending'}
  if name=='m10_list':return [{'id':APP,'url':'https://127.0.0.1/private','origin':'manual'}]
  return []
 def request(self,method,path,**kwargs):
  self.calls.append((path,kwargs))
  if '/storage/v1/object/' in path:
   if method=='POST':self.objects[path]=kwargs['content'];return None
   if method=='GET':return self.objects.get(path,cipher(get_settings().DOCUMENT_ENCRYPTION_KEY).encrypt(self.data))
  if path.endswith('m10_clone_ready'):return self.complete
  return None

def test_tracker_facade_auth_csrf_schema_urls_and_scope(boundary,monkeypatch):
 client,fake=boundary;store=Store();monkeypatch.setattr(tracker,'gateway',store)
 assert client.get('/api/v1/tracker/list').status_code==401
 login(client);h=write_headers(client)
 body={'company_id':str(uuid4()),'title':'External role','url':'https://example.test/job/?utm_source=x&b=2&a=1#part','applied_on':None}
 assert client.post('/api/v1/tracker/manual',json=body).status_code==403
 assert client.post('/api/v1/tracker/manual',json=body,headers=h).status_code==200
 call=store.calls[-1];assert call[1]['payload']['p_url']=='https://example.test/job?a=1&b=2' and call[1]['token']==fake.token and 'admin' not in call[1]
 assert client.get('/api/v1/tracker/list').json()[0]['url']==''
 for url in ['http://example.test/job','https://127.0.0.1/job','https://user:pass@example.test/job','https://localhost/job']:
  assert client.post('/api/v1/tracker/manual',json={**body,'url':url},headers=h).status_code==422
 assert client.post('/api/v1/tracker/manual',json={**body,'owner_id':str(uuid4())},headers=h).status_code==422
 assert client.get('/api/v1/tracker/list?offset=-1').status_code==422
 assert client.get('/api/v1/tracker/list?from_date=2026-12-01&to_date=2026-01-01').status_code==422
 assert client.post('/api/v1/tracker/companies',json={'name':'Company','domain':'EXAMPLE.test'},headers=h).status_code==200
 assert store.calls[-1][1]['payload']['p_domain']=='example.test'

def test_pdf_upload_private_ticket_clone_and_expiry(boundary,monkeypatch):
 client,fake=boundary;store=Store();monkeypatch.setattr(tracker,'gateway',store);login(client);h=write_headers(client)
 r=client.post('/api/v1/tracker/resumes/upload',data={'label':'Version one'},files={'file':('resume.pdf',store.data,'application/pdf')},headers=h)
 assert r.status_code==201 and 'object_key' not in r.json()
 encrypted=next(iter(store.objects.values()));assert not encrypted.startswith(b'%PDF-') and decrypt(get_settings().DOCUMENT_ENCRYPTION_KEY,encrypted)==store.data
 r=client.post('/api/v1/tracker/resumes/'+store.id+'/access',headers=h);url=r.json()['url'];assert r.json()['expires_in']==60
 preview=client.get(url);assert preview.status_code==200 and preview.content==store.data and preview.headers['cache-control']=='no-store'
 forged=URLSafeTimedSerializer(get_settings().SESSION_ENCRYPTION_KEY,salt='resume-library').dumps({'id':store.id,'user':str(uuid4()),'session':'forged'})
 assert client.get('/api/v1/tracker/resume-view?ticket='+forged).status_code==404
 with monkeypatch.context() as m:
  m.setattr(TimestampSigner,'get_timestamp',lambda self:1)
  expired=URLSafeTimedSerializer(get_settings().SESSION_ENCRYPTION_KEY,salt='resume-library').dumps({'id':store.id,'user':A,'session':'fixture'})
 assert client.get('/api/v1/tracker/resume-view?ticket='+expired).status_code==403
 body={'application_id':APP,'expected_version':0,'idempotency_key':str(uuid4())}
 r=client.post('/api/v1/tracker/resumes/'+store.id+'/clone',json=body,headers=h);assert r.status_code==200
 copies=list(store.objects.values());assert len(copies)==2 and copies[0]!=copies[1] and all(decrypt(get_settings().DOCUMENT_ENCRYPTION_KEY,v)==store.data for v in copies)
 store.complete=False;assert client.post('/api/v1/tracker/resumes/'+store.id+'/clone',json=body,headers=h).status_code==409
 store.live=False;assert client.get(url).status_code==403

def test_reject_bad_pdf_before_register_and_flag(boundary,monkeypatch):
 client,_=boundary;store=Store();monkeypatch.setattr(tracker,'gateway',store);login(client);h=write_headers(client)
 assert client.post('/api/v1/tracker/resumes/upload',data={'label':'Bad'},files={'file':('bad.pdf',b'%PDF-not-valid','application/pdf')},headers=h).status_code==422
 assert not store.calls
 monkeypatch.setenv('TRACKER_ENABLED','false');get_settings.cache_clear();assert client.get('/api/v1/tracker/list').status_code==503

def test_library_cleanup_never_completes_failed_object_delete():
 class Cleanup:
  def __init__(self,fail=False):self.claimed=False;self.complete=False;self.fail=fail
  def request(self,method,path,**kwargs):
   if path.endswith('m10_cleanup_claim'):
    if self.claimed:return None
    self.claimed=True;return {'id':str(uuid4()),'object_key':'fixture/library.enc'}
   if method=='DELETE':
    if self.fail:raise HTTPException(503,'Storage unavailable')
    return None
   self.complete=True;return True
 good=Cleanup();assert tracker.cleanup_once(good)==1 and good.complete
 bad=Cleanup(True)
 try:tracker.cleanup_once(bad)
 except HTTPException:pass
 assert not bad.complete
