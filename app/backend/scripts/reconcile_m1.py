"""Offline encrypted input/report; importing requires an explicit reviewed plan.

Usage: python scripts/reconcile_m1.py input.enc report.enc [--apply]
M1_BACKUP_KEY is a Fernet key; DATABASE_URL must be the operator's DB connection.
Input: {candidates: [...], applications: [...], user_mapping: {}, job_mapping: {}}.
"""
import argparse
import json
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cryptography.fernet import Fernet
from app.foundation.migration import reconcile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("report", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    key = Fernet(os.environ["M1_BACKUP_KEY"].encode())
    data = json.loads(key.decrypt(args.input.read_bytes()))
    report = reconcile(data["candidates"], data["applications"], data["user_mapping"], data["job_mapping"])
    # Exclusive output creation prevents accidentally replacing the evidence report.
    with args.report.open("xb") as output:
        output.write(key.encrypt(json.dumps(report, default=str).encode()))
    print(json.dumps(report["counts"]))  # Counts only, never candidate identities.
    if not args.apply:
        return
    if report["conflicts"] or report["unmatched"]:
        raise SystemExit("Resolve the encrypted report before import; no data changed")
    import psycopg
    from psycopg.types.json import Jsonb
    with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
        for row in report["proposals"]:
            # Mapping must reference a confirmed Auth account with the exact legacy email.
            # No account is claimed or linked from a browser-supplied address.
            expected_email = next(email for email, uid in data["user_mapping"].items() if uid == row["candidate_id"])
            verified = connection.execute("select 1 from auth.users where id=%s and lower(email)=%s and email_confirmed_at is not null",
                                           (row["candidate_id"], expected_email.lower())).fetchone()
            if not verified:
                raise SystemExit("Reviewed Auth mapping no longer matches; transaction rolled back")
            existing = connection.execute("select candidate_id,job_id,employer_id,cycle,submission_snapshot from public.m1_applications where id=%s for update", (row["id"],)).fetchone()
            if existing and (tuple(map(str, existing[:3])) != (row["candidate_id"], row["job_id"], row["employer_id"]) or existing[3] != row["cycle"] or existing[4] != row["legacy_snapshot"]):
                raise SystemExit("Existing canonical record differs from reviewed evidence; transaction rolled back")
            connection.execute("insert into public.m1_profiles(id) values(%s) on conflict do nothing", (row["candidate_id"],))
            # Retain original outcomes in the snapshot; do not fabricate historical approvals.
            result = connection.execute("insert into public.m1_applications(id,candidate_id,job_id,employer_id,cycle,status,submission_snapshot) values(%s,%s,%s,%s,%s,'on_hold',%s) on conflict(id) do nothing returning id",
                (row["id"],row["candidate_id"],row["job_id"],row["employer_id"],row["cycle"],Jsonb(row["legacy_snapshot"]))).fetchone()
            if result:
                connection.execute("insert into public.m1_application_events(application_id,actor_type,event_type,reason) values(%s,'migration','imported','Legacy evidence retained; human reconciliation required')", (row["id"],))
            connection.execute("insert into kerja_private.legacy_mapping(source_fingerprint,application_id) values(%s,%s) on conflict do nothing", (row["source_fingerprint"],row["id"]))
    print("Reviewed import committed; original rows retained")


if __name__ == "__main__":
    main()
