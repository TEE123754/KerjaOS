"""Active, scoped recruiter tools. Existing deterministic agents; no model writes."""
import json
from uuid import UUID
from datetime import datetime
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator
from .auth import Principal, require_user, require_write
from .gateway import gateway
from .privacy import normalize_document_text, cipher, decrypt
from .config import get_settings

router=APIRouter(prefix='/recruiting',tags=['Recruiter desktop'])
profile_router=APIRouter(prefix='/profile',tags=['Candidate profile'])


class Preview(BaseModel):
    model_config=ConfigDict(extra='forbid')
    title:str=Field(min_length=2,max_length=120)
    department:str=Field(default='',max_length=120)
    description:str=Field(default='',max_length=6000)
    resume_text:str=Field(default='',max_length=20000)
    answers:list[str]=Field(default_factory=list,max_length=3)
    intake_answers:list[str]=Field(default_factory=list,max_length=4)
    blind:bool=True
    anonymized:bool=False

    @model_validator(mode='after')
    def bounds(self):
        if any(len(v)>2000 for v in self.answers+self.intake_answers):raise ValueError('Answer too long')
        return self


def preview(payload:Preview):
    # Imports retain the established algorithms; base_agent external calls are
    # disabled. No legacy graph/database/status/email endpoint is mounted.
    from app.services.agents.requirement_agent import normalize_requirement_output,build_fallback_intake_turn
    from app.services.agents.resume_agent import parse_resume_text_fallback
    from app.services.agents.bias_agent import _rule_based_analysis,neutralize_candidate_profile,lookup_qs_rank_details
    from app.services.agents.matching_agent import build_position_fit_assessment
    from app.services.agents.interview_agent import run_interview_agent_phase_a,build_position_specific_evaluation
    from app.services.agents.report_agent import run_report_agent
    requirements=normalize_requirement_output(payload.title,payload.description,{})
    job={**requirements,'title':payload.title,'department':payload.department}
    intake=build_fallback_intake_turn(payload.title,payload.department,[{'role':'manager','content':v} for v in payload.intake_answers])
    profile=parse_resume_text_fallback(normalize_document_text(payload.resume_text,20000))
    # Short mixed-language resumes may expose an institution only in the
    # qualification field. Include it in the existing local neutralizer too.
    import re
    qualification=str(profile.get('qualification') or '')
    if not profile.get('education') and re.search(r'\b(university|universiti|college|institute|politeknik)\b',qualification,re.I):
        profile['education']=[{'school':qualification}]
    bias=_rule_based_analysis(profile,payload.resume_text,local_only=True)
    # Visibility preference must never reintroduce an institution-rank bonus.
    scoring_profile=neutralize_candidate_profile(profile,bias)
    for entry in scoring_profile.get('education',[]):
        if isinstance(entry,dict):
            for key in ('school','institution','qs_rank'):entry.pop(key,None)
    # Personal/protected attributes are never role-match features.
    for key in ('name','email','phone','age','address','came_from','location'):scoring_profile.pop(key,None)
    fit=build_position_fit_assessment(job,scoring_profile,{'neutralize_prestige':payload.blind,'anonymized_blind_hiring':True,'scoring_mode':'blind_merit','prestige_weight':0},bias)
    questions=run_interview_agent_phase_a(scoring_profile,fit,job)
    evaluation=build_position_specific_evaluation(questions,payload.answers,job) if payload.answers else None
    report=run_report_agent(profile,fit,job)
    report['sourcing_pitch']=f"Role-fit review for {payload.title}: inspect the matched/missing signals and validate evidence with a human reviewer. This is a recommendation, not a hiring decision."
    report['outreach_email']=f"Subject: Invitation to discuss {payload.title}\n\nHello,\nWe would like to discuss the {payload.title} role in {payload.department or 'our team'}. Please sign in to KerjaOS to review the role and next steps. A recruiter will confirm the details.\n\nKerjaOS Recruitment Team"
    rankings=[{'school':e.get('school',''),'ranking':lookup_qs_rank_details(e.get('school',''))} for e in profile.get('education',[]) if isinstance(e,dict)]
    result={'requirements':requirements,'intake':intake,'profile':profile,'bias':bias,'fit':fit,'questions':questions,'evaluation':evaluation,'report':report,'rankings':rankings,
            'provenance':{'mode':'deterministic','external_calls':False,'final_decision':'human','fallback_warning':'offline_rules'},
            'agents':['Requirement','Resume','Bias','Matching','Interview A','Interview B','Report','Email planning','Action policy']}
    result['fit']['bias_control']['anonymized_blind_hiring']=payload.anonymized
    # Display controls apply to all artifacts, not just a name label. Scores are
    # still derived from merit with zero reputation weight in either view.
    if payload.blind:
        result=neutralize_candidate_profile(result,bias)
    if payload.anonymized:
        import re
        values=[str(profile.get(k) or '').strip() for k in ('name','email','phone','address','location')]
        def redact(value):
            if isinstance(value,dict):return {k:('Hidden for blind review' if k in ('name','email','phone','address','location','age','came_from') else redact(v)) for k,v in value.items()}
            if isinstance(value,list):return [redact(v) for v in value]
            if isinstance(value,str):
                for token in sorted((v for v in values if len(v)>2),key=len,reverse=True):value=re.sub(re.escape(token),'Hidden for blind review',value,flags=re.IGNORECASE)
            return value
        result=redact(result)
    return result


@profile_router.post('/resume-preview')
async def resume_preview(file:UploadFile=File(...),user:Principal=Depends(require_write)):
    if file.content_type!='application/pdf':raise HTTPException(422,'Use a PDF resume')
    contents=await file.read(get_settings().MAX_UPLOAD_BYTES+1)
    if len(contents)>get_settings().MAX_UPLOAD_BYTES:raise HTTPException(413,'Resume too large')
    try:
        from io import BytesIO
        from pypdf import PdfReader
        from app.services.agents.resume_agent import parse_resume_text_fallback
        reader=PdfReader(BytesIO(contents))
        if reader.is_encrypted or len(reader.pages)>20:raise ValueError()
        text=normalize_document_text('\n'.join(p.extract_text() or '' for p in reader.pages),20000)
        return {'profile':parse_resume_text_fallback(text),'provenance':'offline_resume_parser','stored':False}
    except Exception:
        raise HTTPException(422,'Use an unencrypted PDF with readable text and at most 20 pages') from None


def staff(user):
    if user.aal!='aal2':raise HTTPException(403,'Staff MFA verification is required')
    # Database checks active session and server-owned employer membership.
    return gateway.rpc('m14_recruiter_context',token=user.token)


@router.get('/context')
def context(user:Principal=Depends(require_user)):
    return staff(user)


@router.post('/preview')
def agent_preview(payload:Preview,user:Principal=Depends(require_write)):
    staff(user)
    return preview(payload)


@router.post('/demo-preview')
def demo_preview(payload:Preview,request:Request):
    cfg=get_settings()
    if not cfg.DEMO_PREVIEW_ENABLED or cfg.APP_MODE!='demo_free' or not request.client or request.client.host not in ('127.0.0.1','::1','testclient'):
        raise HTTPException(404,'Demo preview unavailable')
    if request.headers.get('origin','').rstrip('/') not in cfg.origins:
        raise HTTPException(403,'Local demo origin required')
    return preview(payload)


@router.post('/stream')
def agent_stream(payload:Preview,user:Principal=Depends(require_write)):
    staff(user)
    def events():
        # Real offline processing before artifacts; never invented agent scores.
        yield 'event: progress\ndata: '+json.dumps({'node':'Guardrail','state':'complete'})+'\n\n'
        result=preview(payload)
        for node in result['agents']:
            yield 'event: progress\ndata: '+json.dumps({'node':node,'state':'complete'})+'\n\n'
        yield 'event: result\ndata: '+json.dumps(result)+'\n\n'
    return StreamingResponse(events(),media_type='text/event-stream',headers={'Cache-Control':'no-store','X-Accel-Buffering':'no'})


class JobDraft(BaseModel):
    model_config=ConfigDict(extra='forbid')
    employer_id:UUID
    job_id:UUID|None=None
    title:str=Field(min_length=2,max_length=120)
    department:str=Field(default='',max_length=120)
    description:str=Field(default='',max_length=6000)
    requirements:list[str]=Field(default_factory=list,max_length=20)
    published:bool=False
    opens_at:datetime|None=None
    closes_at:datetime|None=None
    expected_revision:int=Field(default=0,ge=0)
    idempotency_key:UUID
    @model_validator(mode='after')
    def valid_window(self):
        if self.opens_at and self.closes_at and self.closes_at<=self.opens_at:raise ValueError('Invalid application window')
        if any(len(v)>500 for v in self.requirements):raise ValueError('Requirement too long')
        return self


@router.post('/jobs')
def save_job(payload:JobDraft,user:Principal=Depends(require_write)):
    staff(user)
    return gateway.rpc('m14_job_save',token=user.token,payload={'p_data':payload.model_dump(mode='json')})


@router.get('/accounts')
def accounts(user:Principal=Depends(require_user)):
    staff(user)
    return gateway.rpc('m14_candidate_accounts',token=user.token)


@router.get('/dashboard')
def dashboard(offset:int=0,user:Principal=Depends(require_user)):
    if not 0<=offset<=10000:raise HTTPException(422,'Invalid page')
    staff(user)
    return gateway.rpc('m15_dashboard',token=user.token,payload={'p_offset':offset})


class ReviewControls(BaseModel):
    model_config=ConfigDict(extra='forbid')
    blind:bool=True
    anonymized:bool=True


@router.post('/applications/{application_id}/review')
def review_application(application_id:UUID,controls:ReviewControls,user:Principal=Depends(require_write)):
    staff(user)
    context=gateway.rpc('m15_resume_context',token=user.token,payload={'p_app':str(application_id)})
    if not context:raise HTTPException(404,'No current authorized resume is available')
    cfg=get_settings()
    encrypted=gateway.request('GET',f"/storage/v1/object/{cfg.DOCUMENT_BUCKET}/{context['object_key']}",admin=True)
    if len(encrypted)>cfg.MAX_UPLOAD_BYTES*2:raise HTTPException(413,'Resume too large')
    contents=decrypt(cfg.DOCUMENT_ENCRYPTION_KEY,encrypted)
    try:
        from io import BytesIO
        from pypdf import PdfReader
        pdf=PdfReader(BytesIO(contents),strict=True)
        if pdf.is_encrypted or not 1<=len(pdf.pages)<=20:raise ValueError()
        text=normalize_document_text('\n'.join(p.extract_text() or '' for p in pdf.pages),20000)
        if not text.strip():raise ValueError()
    except Exception:
        raise HTTPException(422,'Resume requires readable text and at most 20 pages') from None
    # Recommendations stay read-only and session-local, never pipeline evidence.
    result=preview(Preview(title=context['title'],department=context['department'],description=context['description'],resume_text=text,blind=controls.blind,anonymized=controls.anonymized))
    return {'application_id':str(application_id),'document_id':context['document_id'],'result':result,'stored':False}


class SourceDraft(BaseModel):
    model_config=ConfigDict(extra='forbid')
    job_id:UUID
    name:str=Field(min_length=1,max_length=120)
    headline:str=Field(default='',max_length=500)
    source_url:HttpUrl
    attested:Literal[True]


@router.post('/sources')
def stage_source(payload:SourceDraft,user:Principal=Depends(require_write)):
    staff(user)
    encrypted=cipher(get_settings().DOCUMENT_ENCRYPTION_KEY).encrypt(json.dumps(payload.model_dump(mode='json')).encode()).decode()
    return gateway.rpc('m14_source_stage',token=user.token,payload={'p_job':str(payload.job_id),'p_encrypted':encrypted})


@router.get('/sources')
def sources(user:Principal=Depends(require_user)):
    staff(user)
    rows=gateway.rpc('m14_sources',token=user.token)
    return [{**{k:v for k,v in row.items() if k!='encrypted_profile'},'profile':json.loads(decrypt(get_settings().DOCUMENT_ENCRYPTION_KEY,row['encrypted_profile']))} for row in rows]
