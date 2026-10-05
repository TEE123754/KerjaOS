import io
from uuid import uuid4
import pytest
from fastapi import HTTPException
from pypdf import PdfWriter
from app.foundation import background
from app.foundation.background_providers import MockCheckProvider,ManualEvidenceProvider,UnconfiguredCreditProvider,UnconfiguredCriminalProvider,provider
from app.foundation.background_worker import cleanup_once,process_claim
from test_boundary import boundary,login,write_headers,A,APP

@pytest.mark.parametrize('kind',['ctos_basic','ccris','criminal'])
def test_provider_provenance_never_fakes_clear(kind):
 for p in (MockCheckProvider(),ManualEvidenceProvider(),UnconfiguredCreditProvider(),UnconfiguredCriminalProvider()):
  assert not p.request(kind).official and not p.status(kind).official and p.cancel().state=='cancelled'
 assert provider('official',kind).request(kind).coverage=='no_check_performed'
 assert MockCheckProvider().request(kind,'consistent').state=='evidence_consistent'
 with pytest.raises(ValueError):MockCheckProvider().request(kind,'clear')

def test_api_auth_csrf_mfa_no_credentials_no_real_capture(boundary):
 client,_=boundary;assert client.get('/api/v1/background/cases').status_code==401;login(client)
 assert client.get('/api/v1/background/review-queue').status_code==403
 assert client.post('/api/v1/background/cases/'+APP+'/process',headers=write_headers(client)).status_code==403
 body={'application_id':APP,'kind':'ccris','idempotency_key':APP,'synthetic':True}
 assert client.post('/api/v1/background/cases',json=body).status_code==403
 assert client.post('/api/v1/background/cases',headers=write_headers(client),json={**body,'synthetic':False}).status_code==409
 r=client.post('/api/v1/background/cases',headers=write_headers(client),json={**body,'portal_password':'secret-password'});assert r.status_code==422 and 'secret-password' not in r.text
 r=client.get('/api/v1/background/policy');assert r.json()['official_provider']=='not_configured' and len(r.json()['checks'])==3
 assert all('v1' in c['version'] and c['text']['ms'] for c in r.json()['checks'])
 assert client.post('/api/v1/background/webhook',json={'clear':True}).status_code==404

def pdf():
 out=io.BytesIO();w=PdfWriter();w.add_blank_page(width=300,height=300);w.write(out);return out.getvalue()

def test_report_bounds_no_model_parsing(caplog):
 assert background.validate_report(pdf(),'application/pdf').startswith(b'%PDF')
 for data,media in [(b'%PDF-broken','application/pdf'),(pdf(),'text/html'),(b'x'*(background.MAX_REPORT_BYTES+1),'application/pdf')]:
  with pytest.raises(HTTPException):background.validate_report(data,media)
 with pytest.raises(HTTPException):background.validate_report(b'secret-report-header','application/pdf')
 assert 'secret-report-header' not in caplog.text

def test_encrypted_report_session_and_consent_recheck(boundary,monkeypatch):
 client,fake=boundary;login(client);case=str(uuid4());meta={};original=fake.rpc
 def rpc(name,**kw):
  if name=='m5_cases':return [{'id':case,'synthetic':True}]
  if name=='m5_upload_intent':
   meta.update(id=kw['payload']['p_doc'],object_key=A+'/'+kw['payload']['p_doc']+'.enc',media_type='application/pdf');return {**meta,'expires_at':'2026-10-03T00:00:00Z'}
  if name=='m5_document':return meta or None
  return original(name,**kw)
 original_request=fake.request
 def request(method,path,**kw):
  if path.endswith('m5_document_ready'):return None
  return original_request(method,path,**kw)
 monkeypatch.setattr(fake,'rpc',rpc);monkeypatch.setattr(fake,'request',request);monkeypatch.setattr(background,'gateway',fake)
 r=client.post('/api/v1/background/cases/'+case+'/document',headers=write_headers(client),files={'file':('account-123-secret.pdf',pdf(),'application/pdf')});assert r.status_code==201 and 'account-123' not in r.text
 assert next(iter(fake.objects.values())).startswith(b'gAAAA')
 url=client.post('/api/v1/background/cases/'+case+'/access',headers=write_headers(client)).json()['url'];assert client.get(url).status_code==200
 meta.clear();assert client.get(url).status_code==404
 login(client);assert client.get(url).status_code==404

def test_cleanup_actual_fixture_deletion_and_retry_after_crash():
 class Store:
  def __init__(self):self.objects={'report.enc':b'encrypted'};self.fail=True;self.complete=False
  def request(self,method,path,**kw):
   if path.endswith('m5_cleanup_claim'):return None if self.complete else {'id':APP,'object_key':'report.enc'}
   if method=='DELETE':self.objects.pop('report.enc',None);return None
   if path.endswith('m5_cleanup_complete'):
    assert not self.objects
    if self.fail:self.fail=False;raise RuntimeError('fixture crash')
    self.complete=True;return True
   raise AssertionError(path)
 store=Store()
 with pytest.raises(RuntimeError):cleanup_once(store)
 assert store.objects=={} and not store.complete
 assert cleanup_once(store)==1 and store.complete

def test_worker_sends_only_normalized_minimal_result():
 class Store:
  def request(self,method,path,**kw):
   assert kw['admin'] and set(kw['json'])=={'p_case','p_lease','p_code'}
   assert kw['json']['p_code']=='unavailable';return {'coverage':'no_check_performed'}
 assert process_claim({'id':APP,'kind':'criminal','provider':'official','scenario':'consistent','lease':APP},Store())['coverage']=='no_check_performed'
