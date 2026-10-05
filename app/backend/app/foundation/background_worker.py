from uuid import uuid4
from .gateway import gateway
from .background_providers import provider

def process_claim(claim,store=gateway):
 if not claim:return None
 result=provider(claim['provider'],claim['kind']).request(claim['kind'],claim['scenario'])
 # Narrow admin RPC accepts only normalized codes, and checks DB lease/provider.
 return store.request('POST','/rest/v1/rpc/m5_finish',admin=True,json={'p_case':claim['id'],'p_lease':claim['lease'],'p_code':result.state})

def process_once(store=gateway):
 claim=store.request('POST','/rest/v1/rpc/m5_claim_next',admin=True,json={'p_lease':str(uuid4())})
 return process_claim(claim,store)

def cleanup_once(store=gateway,limit=100):
 deleted=0
 from .config import get_settings
 for _ in range(min(max(limit,0),100)):
  lease=str(uuid4());row=store.request('POST','/rest/v1/rpc/m5_cleanup_claim',admin=True,json={'p_lease':lease})
  if not row:break
  store.request('DELETE',f"/storage/v1/object/{get_settings().DOCUMENT_BUCKET}/{row['object_key']}",admin=True)
  complete=store.request('POST','/rest/v1/rpc/m5_cleanup_complete',admin=True,json={'p_doc':row['id'],'p_lease':lease})
  if complete:deleted+=1
 return deleted
