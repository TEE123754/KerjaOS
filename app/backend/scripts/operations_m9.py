"""Read-only one-shot aggregate monitoring; no identifiers/provider bodies logged."""
import os,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

def main():
 import psycopg
 with psycopg.connect(os.environ['DATABASE_URL']) as db:
  with db.transaction():
   db.execute('set transaction read only')
   expired=db.execute("select (select count(*) from kerja_private.documents where deleted_at is null and expires_at<now())+(select count(*) from kerja_private.resume_versions where deleted_at is null and expires_at<now())").fetchone()[0]
   dead=db.execute("select count(*) from kerja_private.work_items where state='dead_letter'").fetchone()[0]
   pending=db.execute("select count(*) from kerja_private.privacy_requests where state='pending_review'").fetchone()[0]
   reminder_attention=db.execute("select count(*) from kerja_private.reminder_deliveries where state in ('unknown','dead_letter')").fetchone()[0]
   reminder_due=db.execute("select count(*) from kerja_private.reminders where state='active' and due_at<=now()").fetchone()[0]
   print(json.dumps({'overdue_documents':expired,'dead_letters':dead,'privacy_requests_pending':pending,'reminder_attention':reminder_attention,'reminder_due':reminder_due,'attention_required':bool(expired or dead or pending or reminder_attention)}))
if __name__=='__main__':
 try:main()
 except Exception:raise SystemExit('Monitoring unavailable; inspect configuration privately.') from None
