"""Truthful demo release notice and user-token privacy facade."""
from uuid import UUID
from typing import Literal
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from .auth import Principal, require_user, require_write
from .config import get_settings
from .gateway import gateway

router = APIRouter(prefix='/privacy', tags=['Release privacy'])

@router.get('/notice')
def notice():
    cfg = get_settings()
    return {'version':'privacy-demo-v4','mode':cfg.APP_MODE,'release':'local_synthetic_demo',
        'contact':cfg.PRIVACY_CONTACT or None,'real_data_enabled':False,
        'text':{
            'en':'Synthetic demo only. Use invented identities and documents. Applications, consent and interview records support human recruitment review. Rules and manual review are the default; practice is private and is not a validated acceptance probability. No official credit, criminal or biometric verification is enabled. Your private company notes, self-reported tracker and resume versions support your job search. Library removal revokes access while application copies may remain for reviewed retention. Descriptive scoped analytics uses application metadata and stage observations, with no external analytics SDK or acceptance prediction. Stage history follows reviewed application retention. Private reminders stay in-app by default. Optional account email requires opt-in; queued work cancels on opt-out, while already dispatching messages may arrive. Terminal reminder metadata expires after the demo 90-day cleanup period. Your scoped export excludes confidential staff notes, question keys and raw files. Request access, correction or deletion here; an operator must review lawful retention before account erasure. Hosting/transfer, contact and retention approvals remain pending. No PDPA compliance claim is made.',
            'ms':'Demo sintetik sahaja. Gunakan identiti dan dokumen rekaan. Rekod permohonan, persetujuan dan temu duga menyokong semakan manusia. Peraturan dan semakan manual ialah lalai; latihan adalah peribadi dan bukan kebarangkalian penerimaan yang disahkan. Semakan kredit, jenayah atau biometrik rasmi tidak diaktifkan. Nota syarikat peribadi, penjejak laporan kendiri dan versi resume menyokong pencarian kerja anda. Pembuangan pustaka membatalkan akses; salinan permohonan mungkin kekal untuk semakan penyimpanan. Analitik deskriptif berskop menggunakan metadata permohonan dan pemerhatian fasa, tanpa SDK analitik luaran atau ramalan penerimaan. Sejarah fasa mengikut semakan penyimpanan permohonan. Peringatan peribadi menggunakan aplikasi secara lalai. E-mel akaun pilihan memerlukan izin; kerja beratur dibatalkan apabila izin ditarik, tetapi mesej sedang dihantar mungkin tiba. Metadata peringatan tamat luput selepas tempoh pembersihan demo 90 hari. Eksport berskop mengecualikan nota sulit kakitangan, kunci soalan dan fail mentah. Mohon akses, pembetulan atau pemadaman di sini; operator mesti menyemak penyimpanan yang sah sebelum pemadaman akaun. Kelulusan pengehosan/pemindahan, hubungan dan penyimpanan masih tertangguh. Tiada dakwaan pematuhan PDPA dibuat.'}}

class PrivacyRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['access','correction','erase_private_workspace','erase_account']
    reason: str = Field(min_length=10,max_length=1000)
    idempotency_key: UUID

@router.post('/requests',status_code=202)
def request_review(payload: PrivacyRequest,user:Principal=Depends(require_write)):
    return gateway.rpc('m9_request',token=user.token,payload={'p_kind':payload.kind,'p_reason':payload.reason,'p_key':str(payload.idempotency_key)})

@router.get('/requests')
def requests(user:Principal=Depends(require_user)):
    return gateway.rpc('m9_requests',token=user.token)

@router.get('/export')
def export(section:Literal['profile','applications','events','consents','documents','practice','quiz','saved','tracking','chat','interviews','identity','background','requests','companies','manual_tracker','manual_history','resume_library','resume_links','analytics_observations','reminders','reminder_history','reminder_deliveries','reminder_preferences']='profile',offset:int=Query(0,ge=0,le=100000),user:Principal=Depends(require_user)):
    result=gateway.rpc('m9_export',token=user.token,payload={'p_section':section,'p_offset':offset})
    return JSONResponse(result,headers={'Content-Disposition':f'attachment; filename="kerjaos-{section}-{offset}.json"'})
