"""Bounded local library cleanup. Never prints owner IDs/keys or document data."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.foundation.tracker import cleanup_once
if __name__=='__main__':
 try:print(f'Library objects deleted: {cleanup_once()}')
 except Exception:raise SystemExit('Library cleanup unavailable; retry after lease expiry. Access remains expired.') from None
