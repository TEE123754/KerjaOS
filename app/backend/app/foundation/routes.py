from datetime import timedelta
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ConfigDict
from .auth import Principal, require_user, require_write, utcnow
from .config import get_settings
from .gateway import gateway
from .privacy import cipher, decrypt
from .pipeline import pipeline, Transition, application_dto

router = APIRouter(tags=["Secure foundation"])


@router.get("/me")
def me(user: Principal = Depends(require_user)):
    memberships = gateway.table("m1_memberships", token=user.token, params={"select": "employer_id,role", "active": "eq.true"})
    profile = gateway.table("m1_profiles", token=user.token, params={"id": f"eq.{user.id}", "select": "id,display_name,locale"})
    return {"id": user.id, "email": user.email, "aal": user.aal, "password_recovery": user.recovery, "csrf_token": user.csrf,
            "memberships": memberships, "profile": profile[0] if profile else None}


@router.get("/jobs")
def jobs():
    return gateway.rpc("m14_public_jobs", token=None)


@router.get("/applications")
def applications(offset: int = Query(0, ge=0, le=10000), user: Principal = Depends(require_user)):
    rows = gateway.table("m1_applications", token=user.token, params={
        "candidate_id": f"eq.{user.id}", "select": "id,job_id,stage,status,version,created_at,next_action,deadline_at,resume_snapshot_id,submission_snapshot,policy_snapshot,final_outcome,offer_accepted_at", "order": "created_at.desc,id", "limit": 50, "offset": offset})
    return [application_dto(row) for row in rows]


@router.get("/applications/{application_id}")
def application(application_id: UUID, user: Principal = Depends(require_user)):
    rows = gateway.table("m1_applications", token=user.token, params={"id": f"eq.{application_id}", "select": "id,job_id,stage,status,version,created_at,next_action,deadline_at,resume_snapshot_id,submission_snapshot,policy_snapshot,final_outcome,offer_accepted_at"})
    if not rows:
        raise HTTPException(404, "Application not found")
    events = gateway.table("m1_application_events", token=user.token,
        params={"application_id": f"eq.{application_id}", "select": "id,event_type,reason,created_at", "order": "created_at.desc", "limit": 100})
    return {**application_dto(rows[0]), "events": events}


class Apply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job_id: UUID
    idempotency_key: UUID


@router.post("/applications", status_code=201)
def apply(payload: Apply, user: Principal = Depends(require_write)):
    return gateway.rpc("m1_submit_application", token=user.token,
                       payload={"p_job": str(payload.job_id), "p_key": str(payload.idempotency_key)})


class Profile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: str = Field(min_length=1, max_length=120)
    locale: str = Field(pattern="^(en|ms)$")


@router.patch("/profile")
def update_profile(payload: Profile, user: Principal = Depends(require_write)):
    gateway.request("PATCH", "/rest/v1/m1_profiles", token=user.token, json=payload.model_dump(), params={"id": f"eq.{user.id}"})
    return {"updated": True}


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: str = Field(pattern="^(shortlisted|rejected)$")
    reason: str = Field(min_length=5, max_length=1000)
    expected_version: int = Field(ge=0)
    idempotency_key: UUID


@router.post("/applications/{application_id}/decisions")
def human_decision(application_id: UUID, payload: Decision, user: Principal = Depends(require_write)):
    if user.aal != "aal2":
        raise HTTPException(403, "Staff MFA verification is required")
    return pipeline.transition(application_id, Transition(action='shortlist' if payload.decision=='shortlisted' else 'reject',
        reason=payload.reason,expected_version=payload.expected_version,idempotency_key=payload.idempotency_key,
        evidence_ids=[application_id]),user)


@router.post('/applications/{application_id}/transitions')
def transition_application(application_id: UUID, payload: Transition, user: Principal = Depends(require_write)):
    return pipeline.transition(application_id, payload, user)


def require_staff(user):
    if user.aal != 'aal2': raise HTTPException(403, 'Staff MFA verification is required')


@router.get('/staff/queue')
def staff_queue(offset: int = Query(0, ge=0, le=10000), user: Principal = Depends(require_user)):
    require_staff(user)
    rows = gateway.rpc('m2_staff_queue', token=user.token, payload={'p_offset': offset})
    return [application_dto(row) for row in rows]


@router.get('/staff/applications/{application_id}/notes')
def staff_notes(application_id: UUID, user: Principal = Depends(require_user)):
    require_staff(user)
    return gateway.rpc('m2_staff_notes', token=user.token, payload={'p_id': str(application_id)})


class CloseJob(BaseModel):
    model_config = ConfigDict(extra='forbid')
    idempotency_key: UUID
    reason: str = Field(min_length=5,max_length=1000)


@router.post('/staff/jobs/{job_id}/close')
def close_job(job_id: UUID, payload: CloseJob, user: Principal = Depends(require_write)):
    require_staff(user)
    return gateway.rpc('m2_close_job',token=user.token,payload={'p_job':str(job_id),'p_key':str(payload.idempotency_key),'p_reason':payload.reason})


@router.post('/staff/applications/{application_id}/resume-access')
def staff_resume(application_id: UUID, user: Principal = Depends(require_write)):
    require_staff(user)
    rows = gateway.rpc('m2_staff_resume',token=user.token,payload={'p_id':str(application_id)})
    if not rows: raise HTTPException(404,'Resume not found')
    from itsdangerous import URLSafeTimedSerializer
    ticket=URLSafeTimedSerializer(get_settings().SESSION_ENCRYPTION_KEY,salt='document-access').dumps({
        'id':rows[0]['id'],'user':user.id,'session':user.session_hash,'application':str(application_id)})
    return {'url':'/api/v1/documents/view?ticket='+ticket,'expires_in':60}


def own_application(application_id, user):
    rows = gateway.table("m1_applications", token=user.token,
        params={"id": f"eq.{application_id}", "candidate_id": f"eq.{user.id}", "select": "id,status,stage"})
    if not rows:
        raise HTTPException(404, "Application not found")
    if rows[0]["status"] in ("withdrawn", "rejected", "hired", "job_closed"):
        raise HTTPException(409, "Application no longer accepts documents")
    if rows[0].get('stage') not in ('P0','P1'):
        raise HTTPException(409,'Resume snapshot is frozen after screening')


@router.post("/applications/{application_id}/resume", status_code=201)
async def upload_resume(application_id: UUID, file: UploadFile = File(...), user: Principal = Depends(require_write)):
    cfg = get_settings()
    own_application(application_id, user)
    contents = await file.read(cfg.MAX_UPLOAD_BYTES + 1)
    if len(contents) > cfg.MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Resume exceeds 10 MB")
    if file.content_type != "application/pdf" or not contents.startswith(b"%PDF-"):
        raise HTTPException(422, "Upload a PDF resume")
    from io import BytesIO
    from pypdf import PdfReader
    try:
        pdf = PdfReader(BytesIO(contents), strict=True)
        if pdf.is_encrypted or not 1 <= len(pdf.pages) <= 20:
            raise ValueError()
    except Exception:
        raise HTTPException(422, "Use an unencrypted PDF with at most 20 pages") from None
    document_id = str(uuid4())
    object_key = f"{user.id}/{document_id}.enc"
    encrypted = cipher(cfg.DOCUMENT_ENCRYPTION_KEY).encrypt(contents)
    gateway.request("POST", "/rest/v1/rpc/m1_document_register", admin=True, json={
        "p_id": document_id, "p_user": user.id, "p_application": str(application_id),
        "p_key": object_key, "p_expiry": (utcnow() + timedelta(days=90)).isoformat()})
    gateway.request("POST", f"/storage/v1/object/{cfg.DOCUMENT_BUCKET}/{object_key}", admin=True,
        content=encrypted, headers={"Content-Type": "application/octet-stream", "x-upsert": "false"})
    gateway.request("POST", "/rest/v1/rpc/m1_document_ready", admin=True, json={"p_id": document_id})
    return {"id": document_id, "state": "quarantined", "filename": "resume.pdf"}


class Ticket(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: UUID


@router.post("/documents/access")
def document_ticket(payload: Ticket, user: Principal = Depends(require_write)):
    rows = gateway.request("POST", "/rest/v1/rpc/m1_document_for_owner", admin=True,
        json={"p_id": str(payload.document_id), "p_user": user.id})
    if not rows:
        raise HTTPException(404, "Document not found")
    from itsdangerous import URLSafeTimedSerializer
    signed = URLSafeTimedSerializer(get_settings().SESSION_ENCRYPTION_KEY, salt="document-access").dumps({"id": str(payload.document_id), "user": user.id, "session": user.session_hash})
    return {"url": "/api/v1/documents/view?ticket=" + signed, "expires_in": 60}


@router.get("/documents/view")
def view_document(ticket: str, user: Principal = Depends(require_user)):
    from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
    cfg = get_settings()
    try:
        data = URLSafeTimedSerializer(cfg.SESSION_ENCRYPTION_KEY, salt="document-access").loads(ticket, max_age=60)
    except (BadSignature, SignatureExpired):
        raise HTTPException(403, "Document link expired") from None
    if data.get("user") != user.id or data.get("session") != user.session_hash:
        raise HTTPException(404, "Document not found")
    if data.get('application'):
        require_staff(user)
        rows = gateway.rpc('m2_staff_resume',token=user.token,payload={'p_id': data['application']})
        rows = [row for row in rows if row['id']==data['id']]
    else:
        rows = gateway.request("POST", "/rest/v1/rpc/m1_document_for_owner", admin=True,
            json={"p_id": data["id"], "p_user": user.id})
    if not rows:
        raise HTTPException(404, "Document not found")
    encrypted = gateway.request("GET", f"/storage/v1/object/{cfg.DOCUMENT_BUCKET}/{rows[0]['object_key']}", admin=True)
    return Response(decrypt(cfg.DOCUMENT_ENCRYPTION_KEY, encrypted), media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="resume.pdf"', "Cache-Control": "no-store"})


@router.get("/applications/{application_id}/events/stream")
def event_stream(application_id: UUID, user: Principal = Depends(require_user)):
    result = application(application_id, user)
    import json
    event = json.dumps({"id": result["id"], "stage": result["stage"], "status": result["status"], "version": result["version"]})
    return StreamingResponse(iter([f"event: snapshot\ndata: {event}\n\n", "event: complete\ndata: {}\n\n"]),
        media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
