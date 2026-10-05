"""Shared safe registry: legacy graph may register it but cannot forge a Principal."""
from uuid import UUID
from pydantic import BaseModel,ConfigDict
from fastapi import HTTPException
from .auth import Principal
from .gateway import gateway

class ToolArguments(BaseModel):
 model_config=ConfigDict(extra='forbid')
 application_id:UUID|None=None
 job_id:UUID|None=None

def invoke(name,arguments,user,store=gateway):
 if not isinstance(user,Principal):raise HTTPException(403,'Verified session required')
 args=ToolArguments.model_validate(arguments)
 if name not in SAFE_TOOL_REGISTRY:raise HTTPException(403,'Tool unavailable')
 if name.startswith('staff_') and user.aal!='aal2':raise HTTPException(403,'Staff MFA verification is required')
 if name=='candidate_progress':
  if args.application_id is None or args.job_id is not None:raise HTTPException(422,'Select an application')
  payload={'p_application':str(args.application_id)}
 elif name=='staff_summary':
  if args.job_id is None or args.application_id is not None:raise HTTPException(422,'Select an assigned role')
  payload={'p_job':str(args.job_id)}
 else:
  if args.application_id or args.job_id:raise HTTPException(422,'Invalid tool selection')
  payload={}
 if name=='my_interviews':
  return store.rpc('m8_context',token=user.token,payload={'p_staff':False})['bookings']
 return store.rpc('m6_'+name,token=user.token,payload=payload)

def registered(name):
 def tool(arguments,state=None):
  return invoke(name,arguments,(state or {}).get('_verified_principal'))
 return tool
SAFE_TASK_TOOL_PLANS={'candidate_progress':['candidate_applications','candidate_progress'],'staff_summary':['staff_jobs','staff_summary'],'scheduled_interviews':['my_interviews']}
SAFE_TOOL_REGISTRY={n:registered(n) for names in SAFE_TASK_TOOL_PLANS.values() for n in names}
