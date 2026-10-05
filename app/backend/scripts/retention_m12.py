"""One bounded terminal reminder/history/outbox cleanup; preserves tombstones."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.foundation.gateway import gateway
if __name__=='__main__':
 try:print('Expired reminders removed:',gateway.request('POST','/rest/v1/rpc/m12_cleanup',admin=True,json={}))
 except Exception:raise SystemExit('Reminder cleanup unavailable; retry after private configuration review.') from None
