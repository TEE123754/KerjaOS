from typing import Literal
from uuid import UUID
from fastapi import APIRouter,Depends,Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel,ConfigDict,Field
from .auth import Principal,require_user,require_write
from .gateway import gateway
from .job_fetch import safe_url,FetchFailure
router=APIRouter(prefix='/discover',tags=['External job discovery'])
class Save(BaseModel):
 model_config=ConfigDict(extra='forbid')
 listing_id:UUID
 saved:bool
class Track(BaseModel):
 model_config=ConfigDict(extra='forbid')
 listing_id:UUID
 status:Literal['considering','applied','interview','offer','rejected','withdrawn']='considering'
 note:str=Field(default='',max_length=500)
 click:bool=False
class Forget(BaseModel):
 model_config=ConfigDict(extra='forbid')
 listing_id:UUID

def list_jobs(args,user,store=gateway):
 rows=store.rpc('m7_list',token=user.token,payload=args)
 result=[]
 for row in rows:
  # Defense at presentation boundary; DB worker approval controls exact hosts.
  try:
   from urllib.parse import urlsplit
   safe_url(row['url'],[urlsplit(row['url']).hostname])
  except (FetchFailure,ValueError,KeyError):continue
  result.append(row)
 return result
@router.get('/listings')
def listings(q:str=Query('',max_length=120),region:Literal['all','malaysia','remote','unknown','other']='all',category:Literal['all','technology','business','other']='all',saved:bool=False,stale:bool=False,synthetic:bool=False,user:Principal=Depends(require_user)):
 return list_jobs({'p_query':q,'p_region':region,'p_category':category,'p_saved':saved,'p_stale':stale,'p_synthetic':synthetic},user,gateway)
@router.post('/saved')
def save(payload:Save,user:Principal=Depends(require_write)):
 gateway.rpc('m7_save',token=user.token,payload={'p_listing':str(payload.listing_id),'p_saved':payload.saved});return {'saved':payload.saved}
@router.post('/tracker')
def track(payload:Track,user:Principal=Depends(require_write)):
 gateway.rpc('m7_track',token=user.token,payload={'p_listing':str(payload.listing_id),'p_status':payload.status,'p_note':payload.note,'p_click':payload.click});return {'self_reported':True,'submitted_to_employer':False}
@router.post('/forget')
def forget(payload:Forget,user:Principal=Depends(require_write)):
 gateway.rpc('m7_forget',token=user.token,payload={'p_listing':str(payload.listing_id)});return {'forgotten':True}
@router.get('/progress')
def progress(user:Principal=Depends(require_user)):
 return gateway.rpc('m7_progress',token=user.token)
@router.get('/events')
def events(user:Principal=Depends(require_user)):
 # A single authenticated snapshot and closed event stream: no idle hosted loop.
 import json
 data=gateway.rpc('m7_progress',token=user.token)
 return StreamingResponse(iter(['event: discovery\ndata: '+json.dumps(data)+'\n\n']),media_type='text/event-stream')
DISCOVERY_TASK_TOOL_PLANS={'job_discovery_search':['discover_jobs']}
def discovery_tool(arguments,state=None):
 from fastapi import HTTPException
 user=(state or {}).get('_verified_principal')
 if not isinstance(user,Principal):raise HTTPException(403,'Verified session required')
 class Search(BaseModel):
  model_config=ConfigDict(extra='forbid')
  query:str=Field(default='',max_length=120)
  synthetic:bool=False
 payload=Search.model_validate(arguments)
 return list_jobs({'p_query':payload.query,'p_region':'all','p_category':'all','p_saved':False,'p_stale':False,'p_synthetic':payload.synthetic},user)
DISCOVERY_TOOL_REGISTRY={'discover_jobs':discovery_tool}
