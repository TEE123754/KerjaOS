"""Operator-approved replay from the newest authenticated encrypted ledger archive.
Use on isolated restored projects after reviewing post-backup consent/business events.
"""
import argparse,json,os,sys
from pathlib import Path
from uuid import UUID
from datetime import datetime
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.foundation.recovery import open_archive,safe_name
from app.foundation.gateway import gateway
from app.foundation.config import get_settings

def main():
 p=argparse.ArgumentParser();p.add_argument('latest_archive',type=Path);p.add_argument('--apply',action='store_true');a=p.parse_args()
 ledger=json.loads(open_archive(a.latest_archive.read_bytes(),os.environ['M1_BACKUP_KEY'].encode())['deletion-ledger.json'])
 erasures=ledger.get('private_erasures',[]);docs=ledger.get('documents',[]);tracker_rows=ledger.get('tracker_rows',[])
 reminder_rows=ledger.get('reminder_rows',[]);optouts=ledger.get('reminder_optouts',[]);dispatches=ledger.get('reminder_dispatches',[])
 if len(erasures)+len(docs)+len(tracker_rows)+len(reminder_rows)+len(optouts)+len(dispatches)>10000:raise ValueError('Replay exceeds review limit')
 for row in erasures:UUID(row['request_id']);UUID(row['owner_id']);datetime.fromisoformat(row['cutoff']);assert row['scope']=='private_workspace'
 for row in tracker_rows:
  UUID(row['record_id']);UUID(row['owner_id']);datetime.fromisoformat(row['deleted_at'])
  if row['kind'] not in ('manual','company','resume_library'):raise ValueError('Invalid tracker tombstone')
 for row in reminder_rows:UUID(row['reminder_id']);UUID(row['owner_id']);datetime.fromisoformat(row['deleted_at'])
 for row in optouts:UUID(row['owner_id']);datetime.fromisoformat(row['revoked_at'])
 for row in dispatches:
  UUID(row['delivery_id']);UUID(row['reminder_id']);UUID(row['owner_id']);datetime.fromisoformat(row['dispatched_at'])
  if int(row['revision'])<0 or row['outcome'] not in ('sending','sent','fixture','failed','unknown','disabled'):raise ValueError('Invalid reminder dispatch ledger')
 for row in docs:UUID(row['document_id']);safe_name(row['object_key']);datetime.fromisoformat(row['deleted_at'])
 print(f'Reminder replay due: {len(reminder_rows)} removals; {len(optouts)} opt-outs; {len(dispatches)} dispatch boundaries.')
 print(f'Replay due: {len(erasures)} private erasures; {len(docs)} object tombstones; {len(tracker_rows)} tracker removals.')
 if not a.apply:return
 import psycopg
 cfg=get_settings()
 with psycopg.connect(os.environ['DATABASE_URL']) as db:
  for row in erasures:
   db.execute('select public.m9_replay_private_erasure(%s,%s)',(row['owner_id'],row['cutoff']))
   db.execute("insert into kerja_private.privacy_erasure_ledger(request_id,owner_id,cutoff,scope) values(%s,%s,%s,'private_workspace') on conflict do nothing",(row['request_id'],row['owner_id'],row['cutoff']))
   db.execute("update kerja_private.privacy_requests set state='private_workspace_erased',reviewed_at=%s where id=%s and kind='erase_private_workspace'",(row['cutoff'],row['request_id']))
  for row in sorted(tracker_rows,key=lambda x:0 if x['kind']=='manual' else 1):
   db.execute('select public.m10_replay_forget(%s,%s,%s)',(row['kind'],row['record_id'],row['owner_id']))
   db.execute('insert into kerja_private.tracker_deletion_ledger(kind,record_id,owner_id,deleted_at) values(%s,%s,%s,%s) on conflict do nothing',(row['kind'],row['record_id'],row['owner_id'],row['deleted_at']))
  for row in reminder_rows:
   db.execute('select public.m12_replay_forget(%s,%s)',(row['owner_id'],row['reminder_id']))
   db.execute('insert into kerja_private.reminder_deletion_ledger(reminder_id,owner_id,deleted_at) values(%s,%s,%s) on conflict do nothing',(row['reminder_id'],row['owner_id'],row['deleted_at']))
  for row in optouts:
   db.execute('select public.m12_replay_optout(%s,%s)',(row['owner_id'],row['revoked_at']))
   db.execute('insert into kerja_private.reminder_optout_ledger(owner_id,revoked_at) values(%s,%s) on conflict(owner_id) do update set revoked_at=greatest(kerja_private.reminder_optout_ledger.revoked_at,excluded.revoked_at)',(row['owner_id'],row['revoked_at']))
  for row in dispatches:
   # Restored dispatches never become retryable, even if acknowledgement was lost.
   outcome='unknown' if row['outcome']=='sending' else row['outcome']
   db.execute('insert into kerja_private.reminder_dispatch_ledger(delivery_id,reminder_id,owner_id,revision,dispatched_at,outcome) values(%s,%s,%s,%s,%s,%s) on conflict(reminder_id,revision) do update set outcome=excluded.outcome',(row['delivery_id'],row['reminder_id'],row['owner_id'],int(row['revision']),row['dispatched_at'],outcome))
   db.execute("update kerja_private.reminder_deliveries set state=%s,lease_until=null,finished_at=coalesce(finished_at,now()) where reminder_id=%s and revision=%s",(outcome if outcome!='failed' else 'dead_letter',row['reminder_id'],int(row['revision'])))
  for row in docs:
   match=db.execute('select object_key from kerja_private.documents where id=%s union all select object_key from kerja_private.resume_versions where id=%s',(row['document_id'],row['document_id'])).fetchone()
   if match and match[0]!=row['object_key']:raise ValueError('Restored metadata mismatch')
   gateway.request('DELETE',f'/storage/v1/object/{cfg.DOCUMENT_BUCKET}',admin=True,json={'prefixes':[row['object_key']]})
   db.execute("update kerja_private.documents set state='deleted',deleted_at=coalesce(deleted_at,%s),deletion_lease=null,deletion_lease_until=null where id=%s",(row['deleted_at'],row['document_id']))
   db.execute("update kerja_private.resume_versions set state='deleted',deleted_at=coalesce(deleted_at,%s),deletion_lease=null,deletion_lease_until=null where id=%s",(row['deleted_at'],row['document_id']))
 print('Replay finished. Consent/revocation and business-event reconciliation still require reviewed records before traffic resumes.')
if __name__=='__main__':
 try:main()
 except Exception:raise SystemExit('Replay failed; keep restored project offline and retry after private review.') from None
