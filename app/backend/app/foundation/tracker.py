"""M10 candidate-token tracker. Storage admin access follows scoped metadata lookup."""
import hashlib
from datetime import date,datetime
from zoneinfo import ZoneInfo
from io import BytesIO
from typing import Literal
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode
from uuid import UUID,uuid4
from fastapi import APIRouter,Depends,Query,UploadFile,File,Form,HTTPException,Response
from pydantic import BaseModel,ConfigDict,Field,field_validator
from itsdangerous import URLSafeTimedSerializer,BadSignature,SignatureExpired
from pypdf import PdfReader
from .auth import Principal,require_user,require_write
from .config import get_settings
from .gateway import gateway
from .privacy import cipher,decrypt
from .job_fetch import safe_url,FetchFailure

def enabled():
 if not get_settings().TRACKER_ENABLED:raise HTTPException(503,'Tracker is paused; existing data and cleanup are preserved')
router=APIRouter(prefix='/tracker',tags=['Owned tracker and resumes'],dependencies=[Depends(enabled)])

def normalize_url(value):
 if not value:return ''
 try:
  u=urlsplit(value);host=(u.hostname or '').encode('idna').decode().lower()
  clean=safe_url(urlunsplit((u.scheme,u.netloc,u.path,u.query,'')),[u.hostname])
  p=urlsplit(clean);query=sorted((k,v) for k,v in parse_qsl(p.query,keep_blank_values=True) if not k.lower().startswith('utm_') and k.lower() not in ('fbclid','gclid'))
  return urlunsplit(('https',host,p.path.rstrip('/') or '/',urlencode(query),''))
 except (FetchFailure,ValueError,UnicodeError):raise HTTPException(422,'Use a public HTTPS link without credentials') from None

class Company(BaseModel):
 model_config=ConfigDict(extra='forbid')
 id:UUID|None=None
 expected_revision:int=Field(default=0,ge=0)
 name:str=Field(min_length=1,max_length=120)
 domain:str=Field(default='',max_length=253)
 employer_id:UUID|None=None
 note:str=Field(default='',max_length=1000)
 @field_validator('name')
 @classmethod
 def name_trim(cls,v):
  if not v.strip():raise ValueError('Company name required')
  return v.strip()
 @field_validator('domain')
 @classmethod
 def domain_normalize(cls,v):
  if not v:return ''
  normalized=normalize_url('https://'+v.strip()+'/')
  p=urlsplit(normalized)
  if p.path!='/' or p.query:raise ValueError('Domain only')
  return p.hostname

class Manual(BaseModel):
 model_config=ConfigDict(extra='forbid')
 id:UUID|None=None
 expected_revision:int=Field(default=0,ge=0)
 company_id:UUID
 title:str=Field(min_length=1,max_length=200)
 url:str=Field(default='',max_length=2000)
 status:Literal['considering','applied','interview','offer','rejected','withdrawn','hired']='considering'
 applied_on:date|None=None
 note:str=Field(default='',max_length=1000)
 resume_version_id:UUID|None=None
 archived:bool=False
 @field_validator('title')
 @classmethod
 def title_trim(cls,v):
  if not v.strip():raise ValueError('Title required')
  return v.strip()
 @field_validator('url')
 @classmethod
 def url_normalize(cls,v):return normalize_url(v)
 @field_validator('applied_on')
 @classmethod
 def past_date(cls,v):
  if v and not date(1900,1,1)<=v<=datetime.now(ZoneInfo('Asia/Kuala_Lumpur')).date():raise ValueError('Use a known past or current date')
  return v

class Forget(BaseModel):
 model_config=ConfigDict(extra='forbid')
 kind:Literal['company','manual']
 id:UUID
 expected_revision:int=Field(ge=0)
class Clone(BaseModel):
 model_config=ConfigDict(extra='forbid')
 application_id:UUID
 expected_version:int=Field(ge=0)
 idempotency_key:UUID

@router.get('/list')
def listing(q:str=Query('',max_length=120),origin:Literal['all','internal','manual','discovery']='all',status:str=Query('',max_length=40),company:str=Query('',max_length=120),from_date:date|None=None,to_date:date|None=None,archived:bool=False,offset:int=Query(0,ge=0,le=10000),user:Principal=Depends(require_user)):
 if from_date and to_date and from_date>to_date:raise HTTPException(422,'Invalid date range')
 rows=gateway.rpc('m10_list',token=user.token,payload={'p_query':q,'p_origin':origin,'p_status':status,'p_company':company,'p_from':from_date.isoformat() if from_date else None,'p_to':to_date.isoformat() if to_date else None,'p_archive':archived,'p_offset':offset})
 for row in rows:
  try:row['url']=normalize_url(row.get('url',''))
  except HTTPException:row['url']=''
 return rows
@router.get('/companies')
def companies(offset:int=Query(0,ge=0,le=10000),user:Principal=Depends(require_user)):return gateway.rpc('m10_companies',token=user.token,payload={'p_offset':offset})
@router.post('/companies')
def company_edit(p:Company,user:Principal=Depends(require_write)):return gateway.rpc('m10_company',token=user.token,payload={'p_id':str(p.id) if p.id else None,'p_revision':p.expected_revision,'p_name':p.name,'p_domain':p.domain,'p_employer':str(p.employer_id) if p.employer_id else None,'p_note':p.note})
@router.post('/manual')
def manual_edit(p:Manual,user:Principal=Depends(require_write)):return gateway.rpc('m10_manual',token=user.token,payload={'p_id':str(p.id) if p.id else None,'p_revision':p.expected_revision,'p_company':str(p.company_id),'p_title':p.title,'p_url':p.url,'p_status':p.status,'p_applied':p.applied_on.isoformat() if p.applied_on else None,'p_note':p.note,'p_resume':str(p.resume_version_id) if p.resume_version_id else None,'p_archive':p.archived})
@router.post('/forget')
def forget(p:Forget,user:Principal=Depends(require_write)):
 gateway.rpc('m10_forget',token=user.token,payload={'p_kind':p.kind,'p_id':str(p.id),'p_revision':p.expected_revision});return {'forgotten':True}
@router.get('/history/{origin}/{record_id}')
def history(origin:Literal['internal','manual','discovery'],record_id:UUID,user:Principal=Depends(require_user)):return gateway.rpc('m10_history',token=user.token,payload={'p_origin':origin,'p_id':str(record_id)})
@router.get('/resumes')
def resumes(offset:int=Query(0,ge=0,le=10000),user:Principal=Depends(require_user)):return gateway.rpc('m10_resumes',token=user.token,payload={'p_offset':offset})
@router.get('/resume-links')
def links(user:Principal=Depends(require_user)):return gateway.rpc('m10_links',token=user.token)

def validate_pdf(data,content_type):
 if len(data)>get_settings().MAX_UPLOAD_BYTES:raise HTTPException(413,'Resume exceeds 10 MB')
 if content_type!='application/pdf' or not data.startswith(b'%PDF-'):raise HTTPException(422,'Upload a PDF resume')
 try:
  pdf=PdfReader(BytesIO(data),strict=True)
  if pdf.is_encrypted or not 1<=len(pdf.pages)<=20:raise ValueError()
 except Exception:raise HTTPException(422,'Use an unencrypted PDF with at most 20 pages') from None

@router.post('/resumes/upload',status_code=201)
async def upload(label:str=Form(min_length=1,max_length=120),file:UploadFile=File(...),user:Principal=Depends(require_write)):
 cfg=get_settings();data=await file.read(cfg.MAX_UPLOAD_BYTES+1);validate_pdf(data,file.content_type)
 if not label.strip():raise HTTPException(422,'Resume label required')
 meta=gateway.rpc('m10_resume_register',token=user.token,payload={'p_label':label.strip(),'p_sha':hashlib.sha256(data).hexdigest()})
 gateway.request('POST',f"/storage/v1/object/{cfg.DOCUMENT_BUCKET}/{meta['object_key']}",admin=True,content=cipher(cfg.DOCUMENT_ENCRYPTION_KEY).encrypt(data),headers={'Content-Type':'application/octet-stream','x-upsert':'false'})
 gateway.request('POST','/rest/v1/rpc/m10_resume_ready',admin=True,json={'p_id':meta['id']})
 return {'id':meta['id'],'state':'ready','expires_in_days':90}
@router.post('/resumes/{version_id}/access')
def access(version_id:UUID,user:Principal=Depends(require_write)):
 gateway.rpc('m10_resume_read',token=user.token,payload={'p_id':str(version_id)})
 ticket=URLSafeTimedSerializer(get_settings().SESSION_ENCRYPTION_KEY,salt='resume-library').dumps({'id':str(version_id),'user':user.id,'session':user.session_hash})
 return {'url':'/api/v1/tracker/resume-view?ticket='+ticket,'expires_in':60}
@router.get('/resume-view')
def view(ticket:str,user:Principal=Depends(require_user)):
 cfg=get_settings()
 try:data=URLSafeTimedSerializer(cfg.SESSION_ENCRYPTION_KEY,salt='resume-library').loads(ticket,max_age=60)
 except (BadSignature,SignatureExpired):raise HTTPException(403,'Resume link expired') from None
 if data.get('user')!=user.id or data.get('session')!=user.session_hash:raise HTTPException(404,'Resume not found')
 meta=gateway.rpc('m10_resume_read',token=user.token,payload={'p_id':data['id']})
 encrypted=gateway.request('GET',f"/storage/v1/object/{cfg.DOCUMENT_BUCKET}/{meta['object_key']}",admin=True)
 return Response(decrypt(cfg.DOCUMENT_ENCRYPTION_KEY,encrypted),media_type='application/pdf',headers={'Content-Disposition':'inline; filename="resume.pdf"','Cache-Control':'no-store'})
@router.post('/resumes/{version_id}/retire')
def retire(version_id:UUID,user:Principal=Depends(require_write)):
 gateway.rpc('m10_resume_retire',token=user.token,payload={'p_id':str(version_id)});return {'access_revoked':True,'object_cleanup':'pending','application_copies':'retained for separate review'}
@router.post('/resumes/{version_id}/clone')
def clone(version_id:UUID,p:Clone,user:Principal=Depends(require_write)):
 cfg=get_settings();meta=gateway.rpc('m10_resume_read',token=user.token,payload={'p_id':str(version_id)})
 row=gateway.rpc('m10_clone',token=user.token,payload={'p_version':str(version_id),'p_application':str(p.application_id),'p_expected':p.expected_version,'p_key':str(p.idempotency_key)})
 if row['state'] in ('quarantined','ready'):return {'id':row['id'],'state':row['state']}
 data=decrypt(cfg.DOCUMENT_ENCRYPTION_KEY,gateway.request('GET',f"/storage/v1/object/{cfg.DOCUMENT_BUCKET}/{meta['object_key']}",admin=True))
 if hashlib.sha256(data).hexdigest()!=meta['sha256']:raise HTTPException(503,'Resume integrity check failed')
 validate_pdf(data,'application/pdf')
 path=f"/storage/v1/object/{cfg.DOCUMENT_BUCKET}/{row['object_key']}"
 try:gateway.request('POST',path,admin=True,content=cipher(cfg.DOCUMENT_ENCRYPTION_KEY).encrypt(data),headers={'Content-Type':'application/octet-stream','x-upsert':'false'})
 except HTTPException as e:
  if e.status_code!=409:raise
  stored=decrypt(cfg.DOCUMENT_ENCRYPTION_KEY,gateway.request('GET',path,admin=True))
  if stored!=data:raise HTTPException(503,'Pending copy needs operator review') from None
 if not gateway.request('POST','/rest/v1/rpc/m10_clone_ready',admin=True,json={'p_document':row['id']}):raise HTTPException(409,'Application changed; pending copy expired without replacing its snapshot')
 return {'id':row['id'],'state':'quarantined','snapshot':'fixed by existing human screening transition'}

def cleanup_once(store=gateway,limit=100):
 deleted=0
 for _ in range(min(max(0,limit),100)):
  lease=str(uuid4());row=store.request('POST','/rest/v1/rpc/m10_cleanup_claim',admin=True,json={'p_lease':lease})
  if not row:break
  store.request('DELETE',f'/storage/v1/object/{get_settings().DOCUMENT_BUCKET}',admin=True,json={'prefixes':[row['object_key']]})
  if store.request('POST','/rest/v1/rpc/m10_cleanup_complete',admin=True,json={'p_id':row['id'],'p_lease':lease}):deleted+=1
 return deleted
