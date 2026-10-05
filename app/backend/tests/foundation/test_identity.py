import io
import pytest
from uuid import uuid4
from fastapi import HTTPException
from PIL import Image
from app.foundation import identity
from app.foundation.identity_providers import mykad_consistency,ManualEvidenceProvider,MockIdentityProvider,UnconfiguredEkycProvider
from app.foundation.identity_retention import cleanup_once
from test_boundary import boundary,login,write_headers,A,APP


def test_providers_never_claim_official_verification():
 for provider in (ManualEvidenceProvider(),MockIdentityProvider(),UnconfiguredEkycProvider()):
  assert provider.request().official is False
 assert ManualEvidenceProvider().result(attested=False).state=='needs_review'
 assert MockIdentityProvider().result(attested=True).state=='verified_mock'
 assert UnconfiguredEkycProvider().result(attested=True).state=='not_configured'

def test_mykad_flags_do_not_return_raw_identity():
 result=mykad_consistency('No kad 900101-14-1234 Nama Contoh')
 assert result['date_component_consistent'] and not result['official']
 assert '900101' not in str(result) and 'Contoh' not in str(result)
 assert mykad_consistency('991399-14-1234')['state']=='needs_review'

def test_malformed_and_low_detail_document_handling():
 for raw,media in ((b'not an image','image/png'),(b'%PDF-broken','application/pdf'),(b'executable','text/html')):
  with pytest.raises(HTTPException):identity.validate_identity_document(raw,media)
 buffer=io.BytesIO();Image.new('RGB',(600,400),'white').save(buffer,format='PNG')
 data,media,quality=identity.validate_identity_document(buffer.getvalue(),'image/png')
 assert media=='image/jpeg' and quality=='needs_review' and data.startswith(b'\xff\xd8')
 with pytest.raises(HTTPException) as e:identity.validate_identity_document(b'x'*(identity.MAX_IDENTITY_BYTES+1),'image/png')
 assert e.value.status_code==413

def test_real_capture_off_and_raw_fields_not_reflected(boundary):
 client,_=boundary;login(client)
 result=client.post('/api/v1/identity/cases',headers=write_headers(client),json={'application_id':APP,'route':'mykad','synthetic':False})
 assert result.status_code==409
 result=client.post('/api/v1/identity/cases',headers=write_headers(client),json={'application_id':APP,'route':'mykad','synthetic':True,'number':'900101-14-1234'})
 assert result.status_code==422 and '900101' not in result.text
 assert client.get('/api/v1/identity/review-queue').status_code==403

def test_identity_link_expiry_and_new_session_replay_denied(boundary,monkeypatch):
 from itsdangerous import URLSafeTimedSerializer,TimestampSigner
 from app.foundation.auth import digest
 from app.foundation.config import get_settings
 client,_=boundary;login(client)
 data={'case':str(uuid4()),'document':str(uuid4()),'user':A,'session':digest(client.cookies.get('kerja-local'))}
 serializer=URLSafeTimedSerializer(get_settings().SESSION_ENCRYPTION_KEY,salt='identity-access')
 with monkeypatch.context() as scoped:
  scoped.setattr(TimestampSigner,'get_timestamp',lambda self:1)
  expired=serializer.dumps(data)
 assert client.get('/api/v1/identity/documents/view',params={'ticket':expired}).status_code==403
 ticket=serializer.dumps(data);login(client)
 assert client.get('/api/v1/identity/documents/view',params={'ticket':ticket}).status_code==404

def test_identity_upload_private_encrypted_and_links_recheck_scope(boundary,monkeypatch):
 client,fake=boundary;login(client);case=str(uuid4());docmeta={};original=fake.rpc
 def rpc(name,**kw):
  if name=='m3_cases':return [{'id':case,'synthetic':True}]
  if name=='m3_upload_intent':
   docmeta.update(id=kw['payload']['p_doc'],object_key=A+'/'+kw['payload']['p_doc']+'.enc',media_type='image/jpeg');return {**docmeta,'expires_at':'2026-10-03T00:00:00Z'}
  if name=='m3_document':return docmeta or None
  return original(name,**kw)
 original_request=fake.request
 def request(method,path,**kw):
  if path.endswith('m3_document_ready'):return None
  return original_request(method,path,**kw)
 monkeypatch.setattr(fake,'rpc',rpc);monkeypatch.setattr(fake,'request',request);monkeypatch.setattr(identity,'gateway',fake)
 buffer=io.BytesIO();Image.new('RGB',(600,400),'white').save(buffer,format='PNG')
 result=client.post('/api/v1/identity/cases/'+case+'/document',headers=write_headers(client),files={'file':('raw-id-900101.png',buffer.getvalue(),'image/png')})
 assert result.status_code==201 and '900101' not in result.text and not result.json()['official']
 assert next(iter(fake.objects.values())).startswith(b'gAAAA')
 link=client.post('/api/v1/identity/cases/'+case+'/access',headers=write_headers(client)).json()['url']
 assert client.get(link).status_code==200
 docmeta.clear()
 assert client.get(link).status_code==404

def test_cleanup_deletes_real_fixture_object_then_records_completion():
 class StorageFixture:
  def __init__(self):self.objects={'fixture.enc':b'encrypted'};self.deleted=False;self.claimed=False
  def request(self,method,path,**kw):
   if path.endswith('m3_cleanup_claim'):
    if self.claimed:return None
    self.claimed=True;return {'id':'doc','object_key':'fixture.enc'}
   if method=='DELETE':self.objects.pop('fixture.enc',None);return None
   if path.endswith('m3_cleanup_complete'):
    assert not self.objects;self.deleted=True;return True
 adapter=StorageFixture();assert cleanup_once(adapter)==1 and adapter.deleted and not adapter.objects

def test_cleanup_crash_does_not_mark_deletion_and_retry_is_idempotent():
 class RetryFixture:
  def __init__(self):self.objects={'fixture.enc':b'encrypted'};self.first=True;self.done=False
  def request(self,method,path,**kw):
   if path.endswith('m3_cleanup_claim'):return None if self.done else {'id':'doc','object_key':'fixture.enc'}
   if method=='DELETE':self.objects.pop('fixture.enc',None);return None
   if path.endswith('m3_cleanup_complete'):
    if self.first:self.first=False;raise RuntimeError('synthetic crash after deletion')
    self.done=True;return True
 adapter=RetryFixture()
 with pytest.raises(RuntimeError):cleanup_once(adapter)
 assert not adapter.done and not adapter.objects
 assert cleanup_once(adapter)==1 and adapter.done
