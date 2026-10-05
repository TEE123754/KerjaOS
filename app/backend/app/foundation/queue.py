"""Bounded local-worker queue; transactional leases and sanitized failures."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4


def claim(connection, kind, lease_seconds=60):
    # Caller has a restricted operator worker connection; no browser credentials.
    with connection.transaction():
        connection.execute("""update kerja_private.work_items set state='dead_letter',
            lease_until=null,lease_token=null,last_error_code='processing_failed'
            where state='running' and lease_until<now() and attempts>=5""")
        row = connection.execute("""
            select id,reference_id,attempts from kerja_private.work_items
            where kind=%s and attempts<5 and due_at<=now()
              and (state='pending' or (state='running' and lease_until<now()))
            order by due_at for update skip locked limit 1
        """, (kind,)).fetchone()
        if not row:
            return None
        lease_token = str(uuid4())
        connection.execute("""update kerja_private.work_items set state='running',
            attempts=attempts+1,lease_until=now()+make_interval(secs=>%s),lease_token=%s where id=%s""",
            (lease_seconds,lease_token,row[0]))
        return {"id": row[0], "reference_id": row[1], "attempts": row[2]+1, "lease_token": lease_token}


def complete(connection, item):
    connection.execute("""update kerja_private.work_items set state='done',lease_until=null,
        lease_token=null where id=%s and state='running' and lease_token=%s and lease_until>now()""",
        (item["id"],item["lease_token"]))


def fail(connection, item, error_code="processing_failed"):
    # Never store exception/provider bodies or raw document data in the queue.
    if error_code not in {"processing_failed","storage_unavailable","consent_revoked"}:
        error_code = "processing_failed"
    connection.execute("""update kerja_private.work_items set state=case when attempts>=5 then 'dead_letter' else 'pending' end,
        due_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),lease_until=null,lease_token=null,
        last_error_code=%s where id=%s and state='running' and lease_token=%s and lease_until>now()""",
        (error_code,item["id"],item["lease_token"]))
