"""Local, one-shot cleanup. Database URL is operator-only; never a browser API.

Use --dry-run for counts. Each object delete is retryable after a crash. Metadata
is marked deleted only after object deletion succeeds. Logs contain counts only.
"""
import argparse
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.foundation.config import get_settings
from app.foundation.gateway import gateway


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    import psycopg
    cfg = get_settings()
    with psycopg.connect(os.environ["DATABASE_URL"]) as db:
        rows = db.execute("select id,object_key from kerja_private.documents where purpose not in ('identity','background') and deleted_at is null and (expires_at<now() or (state='upload_pending' and created_at<now()-interval '1 hour')) order by expires_at limit 100").fetchall()
        print(f"Documents due: {len(rows)}")
        if args.dry_run:
            return
        for document_id, object_key in rows:
            gateway.request("DELETE", f"/storage/v1/object/{cfg.DOCUMENT_BUCKET}", admin=True, json={"prefixes": [object_key]})
            db.execute("update kerja_private.documents set state='deleted',deleted_at=now() where id=%s", (document_id,))
        db.execute("delete from kerja_private.sessions where expires_at<now() or revoked_at<now()-interval '1 day'")
    print("Completed object cleanup and session expiry")


if __name__ == "__main__":
    main()
