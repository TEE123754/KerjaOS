"""Optional public-FAQ variant selection only. No personal prompts or decisions."""
import json,re,threading,time
from decimal import Decimal,InvalidOperation
from dataclasses import dataclass
from typing import Protocol
import httpx
from pydantic import BaseModel,ConfigDict,StrictInt,Field
from .config import get_settings

FREE_MODEL='typesafe/jev-router'
FAQ_CODES={'privacy','practice','background','interview','help'}
@dataclass(frozen=True)
class Wording:
 variant:int=0
 actual_model:str='rules'
 provider:str='local'
 fallback_warning:str|None=None
class LLMProvider(Protocol):
 def choose_wording(self,code:str,locale:str)->Wording:...
class DecisionProvider(Protocol):
 def decide(self,message:str,scope:str):...
class DisabledJevDecisionProvider:
 def decide(self,*args,**kwargs):raise RuntimeError('Jev 1.13 decisions are disabled')
class Variant(BaseModel):
 model_config=ConfigDict(extra='forbid')
 variant:StrictInt=Field(ge=0,le=1)

def public_faq_boundary(code,locale):
 if code not in FAQ_CODES or locale not in ('en','ms'):raise ValueError('Only approved public FAQ codes may leave the boundary')
 return {'faq_code':code,'locale':locale}

class JevRouterProvider:
 def __init__(self,transport=None):
  self.transport=transport;self.failures=0;self.open_until=0;self.lock=threading.Lock()
 def fail(self,code,actual='rules',provider='local'):
  with self.lock:
   self.failures+=1
   if self.failures>=3:self.open_until=time.monotonic()+60
  model=actual if isinstance(actual,str) and re.fullmatch(r'[A-Za-z0-9_./:-]{1,120}',actual) else 'unknown'
  name=provider if isinstance(provider,str) and re.fullmatch(r'[A-Za-z0-9_/-]{1,80}',provider) else 'unknown'
  return Wording(actual_model=model,provider=name,fallback_warning=code)
 def choose_wording(self,code,locale):
  payload=public_faq_boundary(code,locale);cfg=get_settings()
  if not cfg.EXTERNAL_LLM_ENABLED:return Wording(fallback_warning='external_disabled')
  if not cfg.OPENROUTER_API_KEY or not cfg.M6_OPENROUTER_PROVIDER:return Wording(fallback_warning='not_configured')
  if not cfg.M6_EXTERNAL_PRIVACY_APPROVED:return Wording(fallback_warning='privacy_unapproved')
  slug=cfg.M6_OPENROUTER_PROVIDER
  if not re.fullmatch(r'[A-Za-z0-9_/-]{1,80}',slug):return Wording(fallback_warning='route_unavailable')
  with self.lock:
   if self.open_until>time.monotonic():return Wording(fallback_warning='circuit_open')
  observed='rules';observed_provider='local';deadline=time.monotonic()+5
  def fetch(client,method,url,**kwargs):
   remaining=deadline-time.monotonic()
   if remaining<=0:raise httpx.TimeoutException('Budget exhausted')
   with client.stream(method,url,timeout=min(1.5,remaining),**kwargs) as response:
    parts=[];size=0
    for chunk in response.iter_bytes():
     size+=len(chunk)
     if size>65536:raise ValueError('Response exceeds bound')
     if time.monotonic()>deadline:raise httpx.TimeoutException('Budget exhausted')
     parts.append(chunk)
    return httpx.Response(response.status_code,content=b''.join(parts))
  try:
   with httpx.Client(transport=self.transport,timeout=1.5,follow_redirects=False) as client:
    headers={'Authorization':'Bearer '+cfg.OPENROUTER_API_KEY}
    # Reverify exact endpoint price on each invocation. No cached price entitlement.
    response=None
    for attempt in range(2):
     try:
      response=fetch(client,'GET','https://openrouter.ai/api/v1/models/'+FREE_MODEL+'/endpoints',headers=headers);break
     except httpx.TimeoutException:
      if attempt:raise
    if response.status_code==429:return self.fail('rate_limited')
    if response.is_error:return self.fail('route_unavailable')
    if len(response.content)>65536:return self.fail('invalid_response')
    endpoints=response.json().get('data',{}).get('endpoints',[])
    route=next((e for e in endpoints if e.get('tag')==slug),None)
    if not route:return self.fail('route_unavailable')
    pricing=route.get('pricing',{})
    if not {'prompt','completion'}<=set(pricing) or any(Decimal(str(v))!=0 for v in pricing.values()):return self.fail('nonzero_price')
    body={'model':FREE_MODEL,'messages':[{'role':'system','content':'Select approved FAQ wording variant. Reply only with JSON {"variant":0} or {"variant":1}. No other output.'},{'role':'user','content':json.dumps(payload)}],
     'max_tokens':32,'temperature':0,'response_format':{'type':'json_object'},
     'provider':{'only':[slug],'allow_fallbacks':False,'require_parameters':True,'data_collection':'deny','zdr':True,'max_price':{'prompt':0,'completion':0}}}
    # One generation attempt per DB reservation. Never retry/fallback a generation.
    response=fetch(client,'POST','https://openrouter.ai/api/v1/chat/completions',headers=headers,json=body)
    if response.status_code==429:return self.fail('rate_limited')
    if response.is_error:return self.fail('provider_outage')
    if len(response.content)>65536:return self.fail('invalid_response')
    result=response.json();actual=result.get('model');actual_provider=result.get('provider')
    observed=actual;observed_provider=actual_provider
    if actual!=FREE_MODEL:return self.fail('unapproved_model',actual,actual_provider)
    if actual_provider!=slug:return self.fail('route_unavailable',actual,actual_provider)
    cost=result.get('usage',{}).get('cost')
    if cost is None or Decimal(str(cost))!=0:return self.fail('nonzero_price',actual,actual_provider)
    content=result['choices'][0]['message']['content']
    if not isinstance(content,str) or len(content)>200:return self.fail('invalid_response',actual,actual_provider)
    variant=Variant.model_validate(json.loads(content)).variant
    with self.lock:self.failures=0;self.open_until=0
    return Wording(variant,actual,actual_provider)
  except httpx.TimeoutException:return self.fail('timeout')
  except httpx.HTTPError:return self.fail('provider_outage')
  except (ValueError,TypeError,KeyError,IndexError,AttributeError,InvalidOperation):return self.fail('invalid_response',observed,observed_provider)

wording_provider=JevRouterProvider()
