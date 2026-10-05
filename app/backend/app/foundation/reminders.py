"""Owner-only reminders; dates require explicit offset, not ambiguous browser local time."""
from datetime import datetime,timezone
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError
from uuid import UUID
from typing import Literal
from fastapi import APIRouter,Depends,Query
from pydantic import BaseModel,ConfigDict,Field,field_validator
from .auth import Principal,require_user,require_write
from .gateway import gateway
from .config import get_settings
router=APIRouter(prefix='/reminders',tags=['Owned reminders'])
class Edit(BaseModel):
 model_config=ConfigDict(extra='forbid')
 id:UUID|None=None
 expected_revision:int=Field(default=0,ge=0)
 idempotency_key:UUID
 action:Literal['create','snooze','complete','cancel','forget']
 origin:Literal['internal','manual','discovery','personal']='personal'
 reference_id:UUID|None=None
 kind:Literal['follow_up','preparation','personal']='personal'
 title:str=Field(default='',max_length=120)
 due_at:datetime|None=None
 timezone:str=Field(default='Asia/Kuala_Lumpur',max_length=80)
 @field_validator('due_at')
 @classmethod
 def aware(cls,v):
  if v is not None and v.tzinfo is None:raise ValueError('Explicit UTC offset required; include Z or +08:00')
  return v.astimezone(timezone.utc) if v else v
 @field_validator('timezone')
 @classmethod
 def zone(cls,v):
  try:ZoneInfo(v)
  except (ZoneInfoNotFoundError,ValueError):raise ValueError('IANA timezone required') from None
  if v!='UTC' and '/' not in v:raise ValueError('IANA timezone required')
  return v
 @field_validator('title')
 @classmethod
 def printable(cls,v):
  if any(ord(c)<32 for c in v):raise ValueError('Use a printable title')
  return v.strip()
class Preference(BaseModel):
 model_config=ConfigDict(extra='forbid')
 email_opt_in:bool=Field(strict=True)
 expected_revision:int=Field(ge=0)
 idempotency_key:UUID
@router.get('/context')
def context(offset:int=Query(0,ge=0,le=10000),user:Principal=Depends(require_user)):
 data=gateway.rpc('m12_context',token=user.token,payload={'p_offset':offset});cfg=get_settings()
 data['worker_configured']=cfg.REMINDER_WORKER_ENABLED
 from .reminder_worker import sender
 data['sender_configured']=cfg.REMINDER_SENDER!='disabled' and sender().preflight()
 return data
@router.post('/edit')
def edit(p:Edit,user:Principal=Depends(require_write)):
 return gateway.rpc('m12_edit',token=user.token,payload={'p_id':str(p.id) if p.id else None,'p_revision':p.expected_revision,'p_key':str(p.idempotency_key),'p_action':p.action,'p_origin':p.origin,'p_ref':str(p.reference_id) if p.reference_id else None,'p_kind':p.kind,'p_title':p.title,'p_due':p.due_at.isoformat() if p.due_at else None,'p_timezone':p.timezone})
@router.post('/preference')
def preference(p:Preference,user:Principal=Depends(require_write)):
 return gateway.rpc('m12_preference',token=user.token,payload={'p_opt_in':p.email_opt_in,'p_revision':p.expected_revision,'p_key':str(p.idempotency_key)})
@router.get('/history/{reminder_id}')
def history(reminder_id:UUID,user:Principal=Depends(require_user)):return gateway.rpc('m12_history',token=user.token,payload={'p_id':str(reminder_id)})
@router.get('/email-preview')
def preview(user:Principal=Depends(require_user)):
 return {'subject':'KerjaOS reminder','body':'A personal reminder is due. Sign in to KerjaOS to review your reminders. No employer has been contacted.','recipient':'Your verified account email only','delivery':'Disabled by default; opt-in plus reviewed sender/worker activation required'}
