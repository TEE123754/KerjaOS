"""Bounded local owner-reminder worker; counts only, no identifiers or SMTP bodies."""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.foundation.reminder_worker import run_once
if __name__=='__main__':
 try:print(json.dumps(run_once()))
 except Exception:raise SystemExit('Reminder worker unavailable; keep ambiguous deliveries unknown and inspect configuration privately.') from None
