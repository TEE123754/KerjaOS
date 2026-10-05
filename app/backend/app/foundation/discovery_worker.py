"""One leased source per invocation. No browser endpoint can schedule network work."""
from uuid import uuid4
from .gateway import gateway
from .config import get_settings
from .job_fetch import SafeFetcher,FetchFailure
from .job_sources import ADAPTERS

def process_once(store=gateway,fetch_factory=SafeFetcher):
 if not get_settings().JOB_DISCOVERY_ENABLED:return {'state':'disabled','count':0}
 claim=store.request('POST','/rest/v1/rpc/m7_claim',admin=True,json={'p_lease':str(uuid4())})
 if not claim:return {'state':'idle','count':0}
 args={'p_work':claim['work_id'],'p_lease':claim['lease'],'p_listings':[],'p_complete':False,'p_code':None,'p_retry':3600}
 try:
  if not all(claim.get(k) for k in ('enabled','tos_reviewed','robots_ok','redistribution_approved')):raise FetchFailure('blocked')
  if claim['adapter']=='scrapling' and not get_settings().SCRAPLING_ENABLED:raise FetchFailure('optional_unavailable')
  batch=ADAPTERS[claim['adapter']].load(claim,fetch_factory(claim['allowed_hosts']))
  args.update(p_listings=batch.listings,p_complete=batch.complete)
 except FetchFailure as e:args.update(p_code=e.code,p_retry=e.retry)
 except (KeyError,ValueError,TypeError):args.update(p_code='invalid_feed')
 count=store.request('POST','/rest/v1/rpc/m7_finish',admin=True,json=args)
 return {'state':args['p_code'] or 'done','count':count}

def enqueue(store=gateway):
 if not get_settings().JOB_DISCOVERY_ENABLED:return 0
 return store.request('POST','/rest/v1/rpc/m7_enqueue',admin=True,json={})
