"""Pure reconciliation planner; writes nothing to a database.

Candidate payload arrays are the recovery source for legacy position-only IDs.
Conflicting versions are retained in an encrypted operator report, never merged
using last-row-wins. Linking email to an Auth account requires reviewed mapping.
"""
import hashlib
import json
from uuid import UUID, uuid5

NAMESPACE = UUID("418e919b-8c8f-421a-82d4-2d2f2f1b9aa3")


def application_uuid(candidate_id: str, job_id: str, cycle=1):
    return str(uuid5(NAMESPACE, f"{UUID(candidate_id)}:{UUID(job_id)}:{cycle}"))


def reconcile(candidate_rows, application_rows, user_mapping, job_mapping):
    proposals, conflicts, unmatched = {}, [], []
    sources = []
    for row in candidate_rows:
        email = str(row.get("email", "")).strip().lower()
        candidate = row.get("payload") or {}
        apps = candidate.get("applications") or []
        if not apps and candidate.get("position_id"):
            apps = [{k: v for k, v in candidate.items() if k in
                ("position_id", "status", "applied_at", "match_results", "custom_questions", "answers", "evaluation")}]
        sources.extend((email, app, "candidate_payload") for app in apps)
    sources.extend((str(row.get("candidate_email", "")).strip().lower(),
                    {**(row.get("payload") or {}), "position_id": row.get("position_id")}, "application_row") for row in application_rows)
    for email, app, source in sources:
        uid = user_mapping.get(email)
        job = job_mapping.get(str(app.get("position_id")))
        if not uid or not job:
            unmatched.append({"email": email, "position_id": app.get("position_id"), "source": source})
            continue
        app_id = application_uuid(uid, job["id"], job.get("cycle", 1))
        snapshot = {k: v for k, v in app.items() if k not in ("application_id", "progress")}
        fingerprint = hashlib.sha256(json.dumps(snapshot, sort_keys=True, default=str).encode()).hexdigest()
        record = {"id": app_id, "candidate_id": uid, "job_id": job["id"], "employer_id": job["employer_id"],
                  "cycle": job.get("cycle", 1), "legacy_snapshot": snapshot,
                  "source_fingerprint": hashlib.sha256(f"{app_id}:{fingerprint}".encode()).hexdigest(), "source": source}
        if app_id in proposals and proposals[app_id]["legacy_snapshot"] != snapshot:
            conflicts.append({"id": app_id, "versions": [proposals[app_id], record]})
        else:
            proposals[app_id] = record
    return {"proposals": list(proposals.values()), "conflicts": conflicts, "unmatched": unmatched,
            "counts": {"candidate_rows": len(candidate_rows), "application_rows": len(application_rows),
                       "reconstructed": len(proposals), "conflicts": len(conflicts), "unmatched": len(unmatched)}}
