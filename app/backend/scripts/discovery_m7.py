"""Operator-only bounded run; service credentials are backend-only. Counts/codes only."""
import argparse
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.foundation.discovery_worker import process_once,enqueue

def main():
 p=argparse.ArgumentParser();p.add_argument('--enqueue',action='store_true');p.add_argument('--limit',type=int,default=1);args=p.parse_args()
 try:
  if args.enqueue:print(f'Source runs queued: {enqueue()}')
  for _ in range(min(max(args.limit,1),5)):
   result=process_once();print(f"Discovery {result['state']}: {result['count']} listings")
   if result['state'] in ('idle','disabled'):break
 except Exception:raise SystemExit('Discovery unavailable; retry after lease expiry.') from None
if __name__=='__main__':main()
