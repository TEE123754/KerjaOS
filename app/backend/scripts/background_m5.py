"""Bounded local worker. Operator schedules this; never prints report/PII/keys."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.foundation.background_worker import process_once,cleanup_once
if __name__=='__main__':
 try:
  if '--cleanup' in sys.argv:print(f'Background reports deleted: {cleanup_once()}')
  else:print('Background item processed' if process_once() else 'No item available')
 except Exception:raise SystemExit('Background operation unavailable; retry after lease expiry.') from None
