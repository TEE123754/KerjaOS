from io import BytesIO
from typing import Literal
from uuid import UUID,uuid4
from fastapi import APIRouter,Depends,HTTPException,UploadFile,File,Response
from pydantic import BaseModel,ConfigDict,Field,StrictInt
from .auth import Principal,require_user,require_write
from .config import get_settings
from .gateway import gateway
from .privacy import cipher,decrypt
from .background_worker import process_claim
router=APIRouter(prefix='/background',tags=['Background manual and mock evidence'])
Kind=Literal['ctos_basic','ccris','criminal']
MAX_REPORT_BYTES=3*1024*1024
class Check(BaseModel):
 model_config=ConfigDict(extra='forbid')
 kind:Kind
 provider:Literal['mock','manual','official']
 necessity:str=Field(min_length=15,max_length=1000)
 exception_allowed:bool=False
class Configure(BaseModel):
 model_config=ConfigDict(extra='forbid')
 job_id:UUID
 checks:list[Check]=Field(max_length=3)
class Consent(BaseModel):
 model_config=ConfigDict(extra='forbid')
 application_id:UUID
 kind:Kind
 version:str=Field(max_length=60)
 agree:bool
class Start(BaseModel):
 model_config=ConfigDict(extra='forbid')
 application_id:UUID
 kind:Kind
 idempotency_key:UUID
 synthetic:bool=True
 scenario:Literal['ambiguous','consistent','unavailable']='ambiguous'
class Dispute(BaseModel):
 model_config=ConfigDict(extra='forbid')
 expected_version:StrictInt=Field(ge=0)
 explanation:str=Field(min_length=5,max_length=1000)
class Review(BaseModel):
 model_config=ConfigDict(extra='forbid')
 expected_version:StrictInt=Field(ge=0)
 decision:Literal['satisfied','adverse_reviewed','exception']
 reason:str=Field(min_length=15,max_length=1000)
 attested:bool
 explanation_considered:bool=False
def staff(user):
 if user.aal!='aal2':raise HTTPException(403,'Staff MFA verification is required')
@router.get('/policy')
def policy(user:Principal=Depends(require_user)):
 return {'official_provider':'not_configured','real_capture_enabled':False,'retention_hours':24,'stage':'after_quiz','checks':[
 {'kind':kind,'label':label,'version':'background-'+kind+'-v1','text':{
 'en':f'I consent to {label} evidence review for this application and employer. Mock checks cover synthetic workflow only; manual reports are unverified evidence, not an official clearance. Reports are encrypted and due for deletion within 24 hours. I can explain/dispute and revoke consent; a human reviews decisions. No portal credentials or new paid report purchase is required.',
 'ms':f'Saya bersetuju dengan semakan bukti {label} untuk permohonan dan majikan ini. Semakan mock meliputi aliran sintetik sahaja; laporan manual ialah bukti belum disahkan, bukan pelepasan rasmi. Laporan disulitkan dan perlu dipadam dalam 24 jam. Saya boleh memberi penjelasan/mempertikaikan dan menarik balik persetujuan; keputusan disemak manusia. Tiada kelayakan akaun portal atau pembelian laporan berbayar baharu diperlukan.'}}
 for kind,label in [('ctos_basic','CTOS Basic'),('ccris','CCRIS'),('criminal','Criminal evidence / Bukti jenayah')]]}
@router.post('/policies')
def configure(payload:Configure,user:Principal=Depends(require_write)):
 staff(user)
 return gateway.rpc('m5_configure',token=user.token,payload={'p_job':str(payload.job_id),'p_checks':[c.model_dump() for c in payload.checks]})
@router.get('/applications')
def applications(user:Principal=Depends(require_user)):
 return gateway.rpc('m5_applications',token=user.token,payload={'p_staff':False})
@router.get('/cases')
def cases(user:Principal=Depends(require_user)):
 return gateway.rpc('m5_cases',token=user.token,payload={'p_staff':False})
@router.get('/review-queue')
def queue(user:Principal=Depends(require_user)):
 staff(user)
 return gateway.rpc('m5_cases',token=user.token,payload={'p_staff':True})
@router.post('/consents')
def consent(payload:Consent,user:Principal=Depends(require_write)):
 return gateway.rpc('m5_consent',token=user.token,payload={'p_application':str(payload.application_id),'p_kind':payload.kind,'p_version':payload.version,'p_agree':payload.agree})
@router.post('/cases')
def start(payload:Start,user:Principal=Depends(require_write)):
 if not payload.synthetic:raise HTTPException(409,'Real background processing awaits approved legal and operational activation')
 return gateway.rpc('m5_start',token=user.token,payload={'p_application':str(payload.application_id),'p_kind':payload.kind,'p_key':str(payload.idempotency_key),'p_synthetic':payload.synthetic,'p_scenario':payload.scenario})
@router.post('/cases/{case_id}/process')
def process(case_id:UUID,user:Principal=Depends(require_write)):
 staff(user)
 claim=gateway.rpc('m5_claim_user',token=user.token,payload={'p_case':str(case_id),'p_lease':str(uuid4())})
 return process_claim(claim,gateway) or {'state':'not_claimed'}
@router.post('/cases/{case_id}/dispute')
def dispute(case_id:UUID,payload:Dispute,user:Principal=Depends(require_write)):
 return gateway.rpc('m5_dispute',token=user.token,payload={'p_case':str(case_id),'p_version':payload.expected_version,'p_explanation':payload.explanation})
@router.post('/cases/{case_id}/review')
def review(case_id:UUID,payload:Review,user:Principal=Depends(require_write)):
 staff(user)
 return gateway.rpc('m5_review',token=user.token,payload={'p_case':str(case_id),'p_version':payload.expected_version,'p_decision':payload.decision,'p_reason':payload.reason,'p_attested':payload.attested,'p_considered':payload.explanation_considered})
@router.post('/cases/{case_id}/revoke')
def revoke(case_id:UUID,user:Principal=Depends(require_write)):
 return gateway.rpc('m5_revoke',token=user.token,payload={'p_case':str(case_id)})

def validate_report(data:bytes,media:str):
 if len(data)>MAX_REPORT_BYTES:raise HTTPException(413,'Report exceeds 3 MB')
 # Reject non-PDF bytes before the parser can log an invalid raw header.
 if media!='application/pdf' or not data.startswith(b'%PDF-'):raise HTTPException(422,'Use an unencrypted PDF with at most 20 pages')
 from pypdf import PdfReader
 try:
  pdf=PdfReader(BytesIO(data),strict=True)
  if pdf.is_encrypted or not 1<=len(pdf.pages)<=20 or pdf.trailer['/Root'].get('/OpenAction') or pdf.trailer['/Root'].get('/AA'):raise ValueError()
 except Exception:raise HTTPException(422,'Use an unencrypted PDF with at most 20 pages and no automatic actions') from None
 return data
@router.post('/cases/{case_id}/document',status_code=201)
async def upload(case_id:UUID,file:UploadFile=File(...),user:Principal=Depends(require_write)):
 owned=gateway.rpc('m5_cases',token=user.token,payload={'p_staff':False});case=next((c for c in owned if c['id']==str(case_id)),None)
 if not case:raise HTTPException(404,'Background case not found')
 if not case['synthetic']:raise HTTPException(409,'Real report capture is disabled')
 data=validate_report(await file.read(MAX_REPORT_BYTES+1),file.content_type or '')
 doc=str(uuid4());intent=gateway.rpc('m5_upload_intent',token=user.token,payload={'p_case':str(case_id),'p_doc':doc});cfg=get_settings()
 gateway.request('POST',f"/storage/v1/object/{cfg.DOCUMENT_BUCKET}/{intent['object_key']}",admin=True,content=cipher(cfg.DOCUMENT_ENCRYPTION_KEY).encrypt(data),headers={'Content-Type':'application/octet-stream','x-upsert':'false'})
 gateway.request('POST','/rest/v1/rpc/m5_document_ready',admin=True,json={'p_doc':doc})
 return {'id':doc,'state':'quarantined','official':False,'expires_at':intent['expires_at']}
@router.post('/cases/{case_id}/access')
def access(case_id:UUID,user:Principal=Depends(require_write)):
 doc=gateway.rpc('m5_document',token=user.token,payload={'p_case':str(case_id)})
 if not doc:raise HTTPException(404,'Background report unavailable')
 from itsdangerous import URLSafeTimedSerializer
 ticket=URLSafeTimedSerializer(get_settings().SESSION_ENCRYPTION_KEY,salt='background-access').dumps({'case':str(case_id),'document':doc['id'],'user':user.id,'session':user.session_hash})
 return {'url':'/api/v1/background/documents/view?ticket='+ticket,'expires_in':60}
@router.get('/documents/view')
def view(ticket:str,user:Principal=Depends(require_user)):
 from itsdangerous import URLSafeTimedSerializer,BadSignature,SignatureExpired
 cfg=get_settings()
 try:data=URLSafeTimedSerializer(cfg.SESSION_ENCRYPTION_KEY,salt='background-access').loads(ticket,max_age=60)
 except (BadSignature,SignatureExpired):raise HTTPException(403,'Background link expired') from None
 if data.get('user')!=user.id or data.get('session')!=user.session_hash:raise HTTPException(404,'Background report unavailable')
 doc=gateway.rpc('m5_document',token=user.token,payload={'p_case':data['case']})
 if not doc or doc['id']!=data['document']:raise HTTPException(404,'Background report unavailable')
 encrypted=gateway.request('GET',f"/storage/v1/object/{cfg.DOCUMENT_BUCKET}/{doc['object_key']}",admin=True)
 return Response(decrypt(cfg.DOCUMENT_ENCRYPTION_KEY,encrypted),media_type='application/pdf',headers={'Cache-Control':'no-store','Content-Disposition':'attachment; filename="background-report.pdf"'})
