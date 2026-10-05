"""One public documentation demo feed per adapter, no persistence/market publication."""
import argparse
import sys
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.foundation.job_fetch import SafeFetcher,FetchFailure
from app.foundation.job_sources import ADAPTERS

def main():
 p=argparse.ArgumentParser();p.add_argument('--adapter',choices=['greenhouse','lever'],required=True);args=p.parse_args()
 kind=args.adapter;board='vaulttec' if kind=='greenhouse' else 'leverdemo'
 s={'adapter':kind,'board':board,'name':'Official documentation demo only','endpoint':f'https://boards-api.greenhouse.io/v1/boards/{board}/jobs' if kind=='greenhouse' else f'https://api.lever.co/v0/postings/{board}?mode=json&limit=50','allowed_hosts':['boards-api.greenhouse.io','boards.greenhouse.io','job-boards.greenhouse.io'] if kind=='greenhouse' else ['api.lever.co','jobs.lever.co']}
 start=time.monotonic();fetcher=SafeFetcher(s['allowed_hosts'])
 try:
  b=ADAPTERS[kind].load(s,fetcher);print(f'{kind}: rows={len(b.listings)} complete={b.complete} requests={fetcher.calls} seconds={time.monotonic()-start:.2f}; documentation demo only, no approved market coverage')
 except FetchFailure as e:print(f'{kind}: {e.code} requests={fetcher.calls} seconds={time.monotonic()-start:.2f}; no persistence');raise SystemExit(2) from None
if __name__=='__main__':main()
