from datetime import datetime,timezone
from typing import Literal
from uuid import UUID
from urllib.parse import urlsplit
from fastapi import APIRouter,Depends,HTTPException,Response
from pydantic import BaseModel,ConfigDict,Field,field_validator
from .auth import Principal,require_user,require_write
from .gateway import gateway
from .job_fetch import safe_url,FetchFailure
router=APIRouter(prefix='/interviews',tags=['Human interviews'])
class Strict(BaseModel):model_config=ConfigDict(extra='forbid')
class Slot(Strict):
 job_id:UUID
 interviewer_id:UUID
 starts_at:datetime
 ends_at:datetime
 timezone:str=Field(min_length=1,max_length=80,pattern=r'^[A-Za-z0-9_+/-]+$')
 mode:Literal['online','physical']
 location:str=Field(min_length=1,max_length=500)
 @field_validator('starts_at','ends_at')
 @classmethod
 def aware(cls,v):
  if v.tzinfo is None:raise ValueError('Timezone offset required')
  return v
 @field_validator('location')
 @classmethod
 def printable(cls,v):
  if any(ord(c)<32 for c in v):raise ValueError('Invalid location')
  return v
class Proposal(Strict):
 application_id:UUID
 slot_id:UUID
 reason:str=Field(min_length=5,max_length=1000)
class Change(Strict):
 expected_revision:int=Field(ge=0)
 action:Literal['confirm','reschedule','cancel']
 slot_id:UUID|None=None
 reason:str=Field(min_length=5,max_length=1000)
class Scores(Strict):
 skills:int=Field(ge=0,le=5,strict=True)
 communication:int=Field(ge=0,le=5,strict=True)
 reasoning:int=Field(ge=0,le=5,strict=True)
class Scorecard(Strict):
 expected_revision:int=Field(ge=0)
 scores:Scores
 notes:str=Field(min_length=10,max_length=2000)
class Outcome(Strict):
 expected_version:int=Field(ge=0)
 outcome:Literal['offer','hired','not_selected']
 reason:str=Field(min_length=15,max_length=1000)
 human_attested:bool
class Accept(Strict):expected_version:int=Field(ge=0)
class CancelSlot(Strict):reason:str=Field(min_length=5,max_length=1000)
def staff(user):
 if user.aal!='aal2':raise HTTPException(403,'Staff MFA verification required')
@router.get('/context')
def context(staff_scope:bool=False,user:Principal=Depends(require_user)):
 if staff_scope:staff(user)
 return gateway.rpc('m8_context',token=user.token,payload={'p_staff':staff_scope})
@router.get('/reminders')
def reminders(user:Principal=Depends(require_user)):return gateway.rpc('m8_reminders',token=user.token)
@router.post('/slots')
def slot(payload:Slot,user:Principal=Depends(require_write)):
 staff(user)
 if payload.mode=='online':
  try:safe_url(payload.location,[urlsplit(payload.location).hostname])
  except (FetchFailure,ValueError):raise HTTPException(422,'Use a safe HTTPS meeting link') from None
 return {'id':gateway.rpc('m8_slot',token=user.token,payload={'p_job':str(payload.job_id),'p_interviewer':str(payload.interviewer_id),'p_start':payload.starts_at.isoformat(),'p_end':payload.ends_at.isoformat(),'p_timezone':payload.timezone,'p_mode':payload.mode,'p_location':payload.location})}
@router.post('/proposals')
def propose(payload:Proposal,user:Principal=Depends(require_write)):
 staff(user);return gateway.rpc('m8_book',token=user.token,payload={'p_app':str(payload.application_id),'p_slot':str(payload.slot_id),'p_reason':payload.reason})
@router.post('/bookings/{booking_id}/changes')
def change(booking_id:UUID,payload:Change,user:Principal=Depends(require_write)):
 return gateway.rpc('m8_change',token=user.token,payload={'p_booking':str(booking_id),'p_version':payload.expected_revision,'p_action':payload.action,'p_slot':str(payload.slot_id) if payload.slot_id else None,'p_reason':payload.reason})
@router.post('/bookings/{booking_id}/scorecard')
def score(booking_id:UUID,payload:Scorecard,user:Principal=Depends(require_write)):
 staff(user);gateway.rpc('m8_score',token=user.token,payload={'p_booking':str(booking_id),'p_version':payload.expected_revision,'p_scores':payload.scores.model_dump(),'p_notes':payload.notes});return {'human_scorecard':True}
@router.post('/applications/{application_id}/outcome')
def outcome(application_id:UUID,payload:Outcome,user:Principal=Depends(require_write)):
 staff(user);return gateway.rpc('m8_outcome',token=user.token,payload={'p_app':str(application_id),'p_version':payload.expected_version,'p_outcome':payload.outcome,'p_reason':payload.reason,'p_attested':payload.human_attested})
@router.post('/applications/{application_id}/accept-offer')
def accept(application_id:UUID,payload:Accept,user:Principal=Depends(require_write)):
 gateway.rpc('m8_accept_offer',token=user.token,payload={'p_app':str(application_id),'p_version':payload.expected_version});return {'accepted':True,'hired':False}
@router.post('/slots/{slot_id}/cancel')
def cancel(slot_id:UUID,payload:CancelSlot,user:Principal=Depends(require_write)):
 staff(user);gateway.rpc('m8_cancel_slot',token=user.token,payload={'p_slot':str(slot_id),'p_reason':payload.reason});return {'cancelled':True}
def escape(value):return str(value).replace('\\','\\\\').replace('\r','').replace('\n','\\n').replace(';','\\;').replace(',','\\,')
def fold(line):
 output=[];part='';size=0
 for c in line:
  n=len(c.encode('utf-8'))
  if size+n>75:output.append(part);part=' ';size=1
  part+=c;size+=n
 output.append(part);return '\r\n'.join(output)
def calendar(row):
 def utc(value):return datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 slot=row['slot'];cancelled=row['state']=='cancelled';lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//KerjaOS//Human Interview//EN','CALSCALE:GREGORIAN','METHOD:'+('CANCEL' if cancelled else 'PUBLISH'),'BEGIN:VEVENT','UID:'+row['id']+'@kerjaos.local','SEQUENCE:'+str(row['revision']),'DTSTAMP:'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'),'DTSTART:'+utc(slot['starts_at']),'DTEND:'+utc(slot['ends_at']),'SUMMARY:'+escape('KerjaOS human interview — '+row['title']),'LOCATION:'+escape(slot['location']),'X-KERJAOS-TIMEZONE:'+escape(slot['timezone']),'STATUS:'+('CANCELLED' if cancelled else 'CONFIRMED' if row['state'] in ('confirmed','completed') else 'TENTATIVE'),'END:VEVENT','END:VCALENDAR']
 return '\r\n'.join(fold(line) for line in lines)+'\r\n'
@router.get('/bookings/{booking_id}/calendar.ics')
def ics(booking_id:UUID,user:Principal=Depends(require_user)):
 row=gateway.rpc('m8_booking',token=user.token,payload={'p_booking':str(booking_id)})
 if row['state'] in ('proposed','confirmed') and not row.get('gates_current',True):raise HTTPException(409,'Current evidence requires human review before calendar export')
 return Response(calendar(row),media_type='text/calendar',headers={'Content-Disposition':'attachment; filename="kerjaos-interview.ics"'})
class DisabledInterviewSender:
 def send(self,*args,**kwargs):return {'state':'disabled','sent':False,'reason':'verified_sender_not_configured'}
