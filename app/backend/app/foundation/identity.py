from io import BytesIO
from typing import Literal
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from .auth import Principal, require_user, require_write
from .config import get_settings
from .gateway import gateway
from .privacy import cipher, decrypt

router=APIRouter(prefix='/identity',tags=['Private identity review'])
MAX_IDENTITY_BYTES=3*1024*1024
VERSION='identity-v1'
TEXT={
 'en':'I consent to identity review for this application and employer. Evidence is encrypted, accessible only to me and an assigned qualified reviewer, and due for deletion within 24 hours (or one hour after verification). Manual review is not an official registry check. Reuse requires fresh consent to the receiving employer and a new reviewer approval. I can revoke consent/sharing without deleting my profile.',
 'ms':'Saya bersetuju dengan semakan identiti untuk permohonan dan majikan ini. Bukti disulitkan, hanya boleh diakses oleh saya dan penyemak berkelayakan yang ditugaskan, dan perlu dipadam dalam 24 jam (atau satu jam selepas pengesahan). Semakan manual bukan semakan daftar rasmi. Penggunaan semula memerlukan persetujuan baharu kepada majikan penerima dan kelulusan penyemak baharu. Saya boleh menarik balik persetujuan/perkongsian tanpa memadam profil.'}


class Consent(BaseModel):
 model_config=ConfigDict(extra='forbid')
 application_id:UUID
 version:str=Field(max_length=40)
 agree:bool

class Start(BaseModel):
 model_config=ConfigDict(extra='forbid')
 application_id:UUID
 route:Literal['mykad','passport','alternative']
 synthetic:bool

class Review(BaseModel):
 model_config=ConfigDict(extra='forbid')
 expected_version:int=Field(ge=0)
 decision:Literal['verified_manual','needs_review','evidence_consistent']
 reason_code:Literal['review_completed','blurred','inconsistent','missing_document','alternative_completed']
 attested:bool=False

class Share(BaseModel):
 model_config=ConfigDict(extra='forbid')
 assertion_id:UUID
 application_id:UUID


@router.get('/policy')
def policy(user:Principal=Depends(require_user)):
 return {'version':VERSION,'text':TEXT,'retention_hours':24,'real_capture_enabled':get_settings().IDENTITY_REAL_ENABLED,
         'face_liveness_enabled':False,'ekyc':'not_configured'}

@router.post('/consents')
def consent(payload:Consent,user:Principal=Depends(require_write)):
 return gateway.rpc('m3_consent',token=user.token,payload={'p_application':str(payload.application_id),'p_version':payload.version,'p_agree':payload.agree})

@router.post('/cases')
def start(payload:Start,user:Principal=Depends(require_write)):
 if not payload.synthetic and not get_settings().IDENTITY_REAL_ENABLED:
  raise HTTPException(409,'Real identity capture is disabled; use synthetic fixtures or await approved setup')
 return gateway.rpc('m3_start',token=user.token,payload={'p_application':str(payload.application_id),'p_route':payload.route,'p_synthetic':payload.synthetic})

@router.get('/cases')
def cases(user:Principal=Depends(require_user)):
 return gateway.rpc('m3_cases',token=user.token,payload={'p_staff':False})

@router.get('/review-queue')
def queue(user:Principal=Depends(require_user)):
 if user.aal!='aal2':raise HTTPException(403,'Staff MFA verification is required')
 return gateway.rpc('m3_cases',token=user.token,payload={'p_staff':True})


def validate_identity_document(data:bytes,content_type:str):
 if len(data)>MAX_IDENTITY_BYTES:raise HTTPException(413,'Identity document exceeds 3 MB')
 if content_type=='application/pdf':
  from pypdf import PdfReader
  try:
   pdf=PdfReader(BytesIO(data),strict=True)
   if pdf.is_encrypted or not 1<=len(pdf.pages)<=2:raise ValueError()
  except Exception:raise HTTPException(422,'Use a valid unencrypted PDF with at most two pages') from None
  return data,'application/pdf','evidence_consistent'
 if content_type not in ('image/jpeg','image/png'):raise HTTPException(422,'Use a PDF, PNG or JPEG')
 from PIL import Image,ImageFilter,ImageStat
 try:
  with Image.open(BytesIO(data)) as image:
   if image.format not in ('PNG','JPEG') or image.width*image.height>4000000 or min(image.size)<100:raise ValueError()
   image.load();normalized=image.convert('RGB');normalized.thumbnail((2000,2000))
   gray=normalized.convert('L')
   # Exclude filter border pixels; a blank card must not gain artificial edges.
   edges=gray.filter(ImageFilter.FIND_EDGES).crop((2,2,gray.width-2,gray.height-2))
   quality='needs_review' if min(normalized.size)<350 or ImageStat.Stat(edges).var[0]<20 else 'evidence_consistent'
   output=BytesIO();normalized.save(output,format='JPEG',quality=90)
   return output.getvalue(),'image/jpeg',quality
 except Exception:raise HTTPException(422,'Use a valid image up to four megapixels') from None


@router.post('/cases/{case_id}/document',status_code=201)
async def upload(case_id:UUID,file:UploadFile=File(...),user:Principal=Depends(require_write)):
 # Authorize before reading/parsing raw bytes. The server never persists plaintext.
 owned=gateway.rpc('m3_cases',token=user.token,payload={'p_staff':False})
 case=next((row for row in owned if row['id']==str(case_id)),None)
 if not case:raise HTTPException(404,'Identity case not found')
 if not case['synthetic'] and not get_settings().IDENTITY_REAL_ENABLED:raise HTTPException(409,'Real capture is disabled')
 data=await file.read(MAX_IDENTITY_BYTES+1)
 normalized,media,quality=validate_identity_document(data,file.content_type or '')
 doc=str(uuid4())
 intent=gateway.rpc('m3_upload_intent',token=user.token,payload={'p_case':str(case_id),'p_doc':doc})
 cfg=get_settings()
 gateway.request('POST',f"/storage/v1/object/{cfg.DOCUMENT_BUCKET}/{intent['object_key']}",admin=True,
  content=cipher(cfg.DOCUMENT_ENCRYPTION_KEY).encrypt(normalized),headers={'Content-Type':'application/octet-stream','x-upsert':'false'})
 gateway.request('POST','/rest/v1/rpc/m3_document_ready',admin=True,json={'p_doc':doc,'p_quality':quality,'p_media':media})
 return {'id':doc,'state':'quarantined','quality_hint':quality,'official':False,'expires_at':intent['expires_at']}


@router.post('/cases/{case_id}/access')
def access(case_id:UUID,user:Principal=Depends(require_write)):
 document=gateway.rpc('m3_document',token=user.token,payload={'p_case':str(case_id)})
 if not document:raise HTTPException(404,'Identity document unavailable')
 from itsdangerous import URLSafeTimedSerializer
 ticket=URLSafeTimedSerializer(get_settings().SESSION_ENCRYPTION_KEY,salt='identity-access').dumps({'case':str(case_id),'document':document['id'],'user':user.id,'session':user.session_hash})
 return {'url':'/api/v1/identity/documents/view?ticket='+ticket,'expires_in':60}

@router.get('/documents/view')
def view(ticket:str,user:Principal=Depends(require_user)):
 from itsdangerous import URLSafeTimedSerializer,BadSignature,SignatureExpired
 cfg=get_settings()
 try:data=URLSafeTimedSerializer(cfg.SESSION_ENCRYPTION_KEY,salt='identity-access').loads(ticket,max_age=60)
 except (BadSignature,SignatureExpired):raise HTTPException(403,'Identity link expired') from None
 if data.get('user')!=user.id or data.get('session')!=user.session_hash:raise HTTPException(404,'Identity document unavailable')
 document=gateway.rpc('m3_document',token=user.token,payload={'p_case':data['case']})
 if not document or document['id']!=data['document']:raise HTTPException(404,'Identity document unavailable')
 encrypted=gateway.request('GET',f"/storage/v1/object/{cfg.DOCUMENT_BUCKET}/{document['object_key']}",admin=True)
 return Response(decrypt(cfg.DOCUMENT_ENCRYPTION_KEY,encrypted),media_type=document['media_type'],headers={'Cache-Control':'no-store','Content-Disposition':'inline; filename="identity-evidence"'})

@router.post('/cases/{case_id}/review')
def review(case_id:UUID,payload:Review,user:Principal=Depends(require_write)):
 if user.aal!='aal2':raise HTTPException(403,'Staff MFA verification is required')
 return gateway.rpc('m3_review',token=user.token,payload={'p_case':str(case_id),'p_version':payload.expected_version,'p_decision':payload.decision,'p_reason':payload.reason_code,'p_attested':payload.attested})

@router.get('/assertions')
def assertions(user:Principal=Depends(require_user)):
 return gateway.rpc('m3_assertions',token=user.token)

@router.post('/shares')
def share(payload:Share,user:Principal=Depends(require_write)):
 return gateway.rpc('m3_share',token=user.token,payload={'p_assertion':str(payload.assertion_id),'p_application':str(payload.application_id)})

@router.get('/shares')
def shares(user:Principal=Depends(require_user)):
 return gateway.rpc('m3_shares',token=user.token)

@router.post('/{kind}/{target_id}/revoke')
def revoke(kind:Literal['consent','sharing','assertion'],target_id:UUID,user:Principal=Depends(require_write)):
 gateway.rpc('m3_revoke',token=user.token,payload={'p_id':str(target_id),'p_kind':kind})
 return {'revoked':True,'profile_deleted':False}
