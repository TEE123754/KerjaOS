"""User-JWT quiz RPC boundary. No scoring model, legacy sandbox or graph writes."""
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator
from .auth import Principal, require_user, require_write
from .gateway import gateway

router=APIRouter(prefix='/quiz',tags=['Versioned quiz and private practice'])
Mode=Literal['real','practice']

class Question(BaseModel):
 model_config=ConfigDict(extra='forbid')
 id:str=Field(min_length=1,max_length=40,pattern=r'^[A-Za-z0-9_-]+$')
 kind:Literal['objective','subjective']
 prompt:str=Field(min_length=3,max_length=2000)
 competency:str=Field(min_length=2,max_length=80)
 rubric:str=Field(min_length=3,max_length=1000)
 max_points:StrictInt=Field(ge=1,le=10)
 options:list[str]|None=Field(default=None,min_length=2,max_length=6)
 correct:StrictInt|None=Field(default=None,ge=0,le=5)
 @model_validator(mode='after')
 def key_rules(self):
  if self.kind=='objective' and (not self.options or self.correct is None or self.correct>=len(self.options) or any(not o.strip() or len(o)>300 for o in self.options)):
   raise ValueError('Invalid objective question')
  if self.kind=='subjective' and (self.options is not None or self.correct is not None):raise ValueError('Subjective answers require human review')
  return self

class Publish(BaseModel):
 model_config=ConfigDict(extra='forbid')
 mode:Mode
 job_id:UUID
 title:str=Field(min_length=3,max_length=120)
 competencies:list[str]=Field(min_length=1,max_length=10)
 questions:list[Question]=Field(min_length=1,max_length=20)
 duration_minutes:StrictInt=Field(ge=5,le=120)
 sample_count:StrictInt=Field(ge=1,le=20)
 @model_validator(mode='after')
 def version_rules(self):
  if self.sample_count>len(self.questions) or len({q.id for q in self.questions})!=len(self.questions) or any(q.competency not in self.competencies for q in self.questions) or any(not 2<=len(c)<=80 for c in self.competencies):raise ValueError('Invalid question version')
  return self

class Start(BaseModel):
 model_config=ConfigDict(extra='forbid')
 bank_id:UUID
 application_id:UUID|None=None
 idempotency_key:UUID

class Save(BaseModel):
 model_config=ConfigDict(extra='forbid')
 expected_revision:StrictInt=Field(ge=0)
 answers:dict[str,StrictInt|str]=Field(default_factory=dict,max_length=20)
 submit:bool=False
 @model_validator(mode='after')
 def bounds(self):
  if any(len(k)>40 or isinstance(v,str) and len(v)>2000 for k,v in self.answers.items()):raise ValueError('Answer exceeds limit')
  return self

class Review(BaseModel):
 model_config=ConfigDict(extra='forbid')
 expected_revision:StrictInt=Field(ge=0)
 decision:Literal['approve','needs_review']
 scores:dict[str,StrictInt]=Field(default_factory=dict,max_length=20)
 reason:str=Field(min_length=5,max_length=1000)
 attested:bool

class Adjust(BaseModel):
 model_config=ConfigDict(extra='forbid')
 application_id:UUID
 action:Literal['request','extend','retake']
 minutes:StrictInt|None=Field(default=None,ge=5,le=120)
 reason:str=Field(min_length=5,max_length=1000)
 expected_revision:StrictInt|None=Field(default=None,ge=0)

def staff(user):
 if user.aal!='aal2':raise HTTPException(403,'Staff MFA verification is required')

@router.get('/banks/{mode}')
def banks(mode:Mode,user:Principal=Depends(require_user)):
 return gateway.rpc('m4_banks',token=user.token,payload={'p_mode':mode})

@router.post('/banks')
def publish(payload:Publish,user:Principal=Depends(require_write)):
 staff(user)
 return gateway.rpc('m4_publish',token=user.token,payload={'p_mode':payload.mode,'p_job':str(payload.job_id),'p_title':payload.title,
 'p_competencies':payload.competencies,'p_questions':[q.model_dump(exclude_none=True) for q in payload.questions],
 'p_minutes':payload.duration_minutes,'p_count':payload.sample_count})

@router.get('/attempts')
def attempts(user:Principal=Depends(require_user)):
 return gateway.rpc('m4_attempts',token=user.token,payload={'p_staff':False})

@router.get('/review-queue')
def queue(user:Principal=Depends(require_user)):
 staff(user)
 return gateway.rpc('m4_attempts',token=user.token,payload={'p_staff':True})

@router.post('/attempts/{mode}')
def start(mode:Mode,payload:Start,user:Principal=Depends(require_write)):
 if mode=='practice' and payload.application_id is not None:raise HTTPException(422,'Practice has no application link')
 if mode=='real' and payload.application_id is None:raise HTTPException(422,'Select a real application')
 return gateway.rpc('m4_start',token=user.token,payload={'p_mode':mode,'p_bank':str(payload.bank_id),
 'p_application':str(payload.application_id) if payload.application_id else None,'p_key':str(payload.idempotency_key)})

@router.get('/attempts/{mode}/{attempt_id}')
def get_attempt(mode:Mode,attempt_id:UUID,user:Principal=Depends(require_user)):
 return gateway.rpc('m4_attempt',token=user.token,payload={'p_mode':mode,'p_id':str(attempt_id)})

@router.post('/attempts/{mode}/{attempt_id}')
def save(mode:Mode,attempt_id:UUID,payload:Save,user:Principal=Depends(require_write)):
 return gateway.rpc('m4_save',token=user.token,payload={'p_mode':mode,'p_id':str(attempt_id),'p_revision':payload.expected_revision,'p_answers':payload.answers,'p_submit':payload.submit})

@router.post('/attempts/real/{attempt_id}/review')
def review(attempt_id:UUID,payload:Review,user:Principal=Depends(require_write)):
 staff(user)
 return gateway.rpc('m4_review',token=user.token,payload={'p_id':str(attempt_id),'p_revision':payload.expected_revision,
 'p_decision':payload.decision,'p_scores':payload.scores,'p_reason':payload.reason,'p_attested':payload.attested})

@router.post('/attempts/real/{attempt_id}/expire')
def expire(attempt_id:UUID,user:Principal=Depends(require_write)):
 staff(user)
 return gateway.rpc('m4_expire',token=user.token,payload={'p_id':str(attempt_id)})

@router.get('/adjustments')
def adjustments(user:Principal=Depends(require_user)):
 return gateway.rpc('m4_requests',token=user.token)

@router.post('/adjustments')
def adjust(payload:Adjust,user:Principal=Depends(require_write)):
 if payload.action!='request':staff(user)
 return gateway.rpc('m4_adjust',token=user.token,payload={'p_application':str(payload.application_id),'p_action':payload.action,
 'p_minutes':payload.minutes,'p_reason':payload.reason,'p_revision':payload.expected_revision})

def readiness(attempt:dict,locale:str='en'):
 """Offline report from objective practice totals only; no CV/identity/real data."""
 if attempt.get('mode')!='practice' or attempt.get('state')!='submitted':raise HTTPException(409,'Submit a private practice attempt first')
 r=attempt.get('objective_result') or {};possible=r.get('possible',0);n=r.get('objective_questions',0)
 index=round(100*max(0,min(r.get('earned',0),possible))/possible) if possible and n>=3 else None
 missing=[]
 if n<3:missing.append('at_least_three_objective_questions')
 if r.get('subjective_pending',0):missing.append('human_subjective_feedback')
 if r.get('answered',0)<n:missing.append('unanswered_objective_questions')
 pillars=[{'competency':k,'earned':v['earned'],'possible':v['possible'],'percent':round(100*v['earned']/v['possible']) if v['possible'] else None} for k,v in r.get('pillars',{}).items()]
 weak=sorted((p for p in pillars if p['percent'] is not None and p['percent']<70),key=lambda p:p['percent'])
 ms=locale=='ms'
 return {'attempt_id':attempt['id'],'bank_version':attempt['bank_id'],'index':index,
 'band':'insufficient_data' if index is None else 'developing' if index<50 else 'building' if index<75 else 'ready_for_more_practice',
 'components':{'objective':r,'pillars':pillars},'missing_inputs':missing,'weak_pillars':[p['competency'] for p in weak],
 'roadmap':[{'competency':p['competency'],'action':'Ulang kaji asas, cuba contoh dan ambil latihan baharu.' if ms else 'Review fundamentals, work through examples and try a new practice set.'} for p in weak],
 'summary':'Indeks latihan objektif sahaja; bukan kebarangkalian diterima. Jawapan subjektif belum dinilai. Majikan tidak boleh melihat laporan ini.' if ms else 'Objective practice index only; no hiring probability. Subjective answers are ungraded. Employers cannot view this report.',
 'provenance':{'scorer':'deterministic-v1','report':'offline-template-v1','external_model':False,'input_scope':'this_private_practice_attempt'},
 'future_probability_requirements':['lawful_consented_outcomes','representative_role_specific_samples','held_out_calibration','fairness_uncertainty_review']}

@router.get('/practice/{attempt_id}/report')
def report(attempt_id:UUID,locale:Literal['en','ms']='en',user:Principal=Depends(require_user)):
 attempt=gateway.rpc('m4_attempt',token=user.token,payload={'p_mode':'practice','p_id':str(attempt_id)})
 return readiness(attempt,locale)
