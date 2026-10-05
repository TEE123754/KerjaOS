"""Local backup/staging. No live pg_restore or object upload is executed."""
import argparse,json,os,subprocess,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.foundation.recovery import seal,stage

def main():
 p=argparse.ArgumentParser();p.add_argument('action',choices=['backup','stage']);p.add_argument('archive',type=Path);p.add_argument('--objects',type=Path);p.add_argument('--target',type=Path);a=p.parse_args()
 key=os.environ['M1_BACKUP_KEY'].encode()
 if a.action=='stage':
  if not a.target:p.error('--target is required')
  count=stage(a.archive.read_bytes(),key,a.target);print(f'Verified files staged: {count}. Live restore and latest deletion replay remain required.');return
 if not a.objects or not a.objects.is_dir():p.error('Complete private bucket export --objects required')
 import psycopg
 with psycopg.connect(os.environ['DATABASE_URL']) as db:
  keys=[r[0] for r in db.execute('select object_key from kerja_private.documents where deleted_at is null union all select object_key from kerja_private.resume_versions where deleted_at is null')]
  objects={}
  for name in keys:
   from app.foundation.recovery import safe_name
   safe_name(name);source=a.objects.joinpath(*name.split('/'))
   if source.is_symlink() or not source.resolve().is_relative_to(a.objects.resolve()):raise ValueError('Unsafe exported object')
   objects[name]=source.read_bytes() # Fail if any required object is absent.
  erasures=[dict(zip(('request_id','owner_id','cutoff','scope'),map(str,row))) for row in db.execute('select request_id,owner_id,cutoff,scope from kerja_private.privacy_erasure_ledger')]
  tracker_rows=[dict(zip(('kind','record_id','owner_id','deleted_at'),map(str,row))) for row in db.execute('select kind,record_id,owner_id,deleted_at from kerja_private.tracker_deletion_ledger')]
  reminder_rows=[dict(zip(('reminder_id','owner_id','deleted_at'),map(str,row))) for row in db.execute('select reminder_id,owner_id,deleted_at from kerja_private.reminder_deletion_ledger')]
  reminder_optouts=[dict(zip(('owner_id','revoked_at'),map(str,row))) for row in db.execute('select owner_id,revoked_at from kerja_private.reminder_optout_ledger')]
  reminder_dispatches=[dict(zip(('delivery_id','reminder_id','owner_id','revision','dispatched_at','outcome'),map(str,row))) for row in db.execute('select delivery_id,reminder_id,owner_id,revision,dispatched_at,outcome from kerja_private.reminder_dispatch_ledger')]
  deleted=[dict(zip(('document_id','object_key','deleted_at'),map(str,row))) for row in db.execute('select document_id,object_key,deleted_at from kerja_private.document_deletion_ledger')]
 task_env=dict(os.environ,PGDATABASE=os.environ['DATABASE_URL'])
 dump=subprocess.run(['pg_dump','--format=custom','--no-owner','--no-acl'],env=task_env,capture_output=True)
 if dump.returncode:raise ValueError('Database backup failed')
 payload=seal(dump.stdout,objects,{'private_erasures':erasures,'documents':deleted,'tracker_rows':tracker_rows,'reminder_rows':reminder_rows,'reminder_optouts':reminder_optouts,'reminder_dispatches':reminder_dispatches},key)
 with a.archive.open('xb') as f:f.write(payload)
 print('Encrypted backup created. Freeze writes during inventory/export/dump; latest ledgers must also be preserved separately.')
if __name__=='__main__':
 try:main()
 except Exception:raise SystemExit('Recovery operation failed; no sensitive diagnostics printed. Review inputs locally.') from None
