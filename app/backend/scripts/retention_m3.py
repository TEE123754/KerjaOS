"""Run locally with server secrets configured. Never log identifiers or object keys."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.foundation.identity_retention import cleanup_once

if __name__=='__main__':
 try:print(f'Identity documents deleted: {cleanup_once()}')
 except Exception:raise SystemExit('Cleanup unavailable; retry after lease expiry. Capture remains blocked when overdue.') from None
