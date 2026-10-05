"""One-shot deletion: token-checked completion only after idempotent Storage delete."""
from uuid import uuid4
from .config import get_settings
from .gateway import gateway


def cleanup_once(adapter=gateway,limit=100):
 count=0
 for _ in range(min(100,max(0,limit))):
  lease=str(uuid4())
  row=adapter.request('POST','/rest/v1/rpc/m3_cleanup_claim',admin=True,json={'p_lease':lease})
  if not row:break
  # A crash before or after this operation leaves an expiring lease for retry.
  adapter.request('DELETE',f'/storage/v1/object/{get_settings().DOCUMENT_BUCKET}',admin=True,json={'prefixes':[row['object_key']]})
  done=adapter.request('POST','/rest/v1/rpc/m3_cleanup_complete',admin=True,json={'p_doc':row['id'],'p_lease':lease})
  if done:count+=1
 return count
