import base64
import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from .config import get_settings
from .gateway import gateway
from .privacy import cipher, decrypt

router = APIRouter(prefix="/auth", tags=["Authentication"])


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def utcnow():
    return datetime.now(timezone.utc)


def token_claims(token):
    # Used only for AAL after Supabase /user validates this very token.
    try:
        part = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
    except (IndexError, ValueError):
        return {}


@dataclass
class Principal:
    id: str
    email: str
    token: str
    aal: str
    session_hash: str
    csrf: str
    recovery: bool = False


def session_rows(session_hash):
    return gateway.request("GET", "/rest/v1/rpc/m1_session_read", admin=True,
                           params={"p_hash": session_hash})


def persist_session(session_hash, data):
    gateway.request("POST", "/rest/v1/rpc/m1_session_write", admin=True,
                    json={"p_hash": session_hash, "p_data": data})


def token_bundle(tokens):
    return {key: tokens[key] for key in ("access_token", "refresh_token")}


def create_session(response, tokens, *, recovery=False):
    cfg = get_settings()
    user = gateway.request("GET", "/auth/v1/user", token=tokens["access_token"])
    if not user.get("email_confirmed_at") or not user.get("email"):
        raise HTTPException(403, "Verify your email before continuing")
    opaque, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    persist_session(digest(opaque), {
        "user_id": user["id"], "csrf": csrf,
        "encrypted_tokens": cipher(cfg.SESSION_ENCRYPTION_KEY).encrypt(json.dumps(token_bundle(tokens)).encode()).decode(),
        "token_expires_at": (utcnow() + timedelta(seconds=tokens.get("expires_in", 3600))).isoformat(),
        "expires_at": (utcnow() + timedelta(seconds=cfg.SESSION_TTL_SECONDS)).isoformat(),
        "recovery_until": (utcnow() + timedelta(minutes=10)).isoformat() if recovery else None,
    })
    response.set_cookie(cfg.cookie_name, opaque, httponly=True, secure=cfg.COOKIE_SECURE,
                        samesite="lax", max_age=cfg.SESSION_TTL_SECONDS, path="/")
    # Bootstrap only the Auth UUID; email linkage is an operator-reviewed migration.
    gateway.rpc("m1_bootstrap_profile", token=tokens["access_token"])
    return {"id": user["id"], "email": user["email"], "csrf_token": csrf}


def require_user(request: Request) -> Principal:
    cfg = get_settings()
    opaque = request.cookies.get(cfg.cookie_name)
    if not opaque:
        raise HTTPException(401, "Sign in to continue")
    rows = session_rows(digest(opaque)) or []
    if not rows:
        raise HTTPException(401, "Session expired")
    row = rows[0]
    if row.get("revoked_at") or datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00")) <= utcnow():
        raise HTTPException(401, "Session expired")
    tokens = json.loads(decrypt(cfg.SESSION_ENCRYPTION_KEY, row["encrypted_tokens"]))
    if datetime.fromisoformat(row["token_expires_at"].replace("Z", "+00:00")) <= utcnow() + timedelta(seconds=60):
        # Serialised DB lease avoids refresh-token races between requests/workers.
        leased = gateway.request("POST", "/rest/v1/rpc/m1_session_refresh_claim", admin=True,
                                 json={"p_hash": digest(opaque)})
        if not leased:
            raise HTTPException(409, "Session refresh in progress; retry")
        try:
            refreshed = gateway.request("POST", "/auth/v1/token", params={"grant_type": "refresh_token"},
                                        json={"refresh_token": tokens["refresh_token"]})
            persist_session(digest(opaque), {**row,
                "encrypted_tokens": cipher(cfg.SESSION_ENCRYPTION_KEY).encrypt(json.dumps(token_bundle(refreshed)).encode()).decode(),
                "token_expires_at": (utcnow() + timedelta(seconds=refreshed.get("expires_in", 3600))).isoformat()})
            tokens = refreshed
        finally:
            gateway.request("POST", "/rest/v1/rpc/m1_session_refresh_release", admin=True, json={"p_hash": digest(opaque)})
    user = gateway.request("GET", "/auth/v1/user", token=tokens["access_token"])
    claims = token_claims(tokens["access_token"])
    if user.get("id") != row["user_id"] or not user.get("email_confirmed_at"):
        raise HTTPException(401, "Session is no longer valid")
    # DB checks Auth session existence on every request, including revoked JWTs.
    if not gateway.rpc("m1_auth_session_active", token=tokens["access_token"]):
        raise HTTPException(401, "Session revoked")
    recovery = bool(row.get("recovery_until") and datetime.fromisoformat(row["recovery_until"].replace("Z", "+00:00")) > utcnow())
    return Principal(user["id"], user["email"], tokens["access_token"], claims.get("aal", "aal1"), digest(opaque), row["csrf"], recovery)


def require_write(request: Request, user: Principal = Depends(require_user)):
    if request.headers.get("origin", "").rstrip("/") not in get_settings().origins:
        raise HTTPException(403, "Origin not allowed")
    if not secrets.compare_digest(request.headers.get("x-csrf-token", ""), user.csrf):
        raise HTTPException(403, "CSRF token required")
    return user


class Login(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=256)


@router.post("/login")
def login(payload: Login, request: Request, response: Response):
    if request.headers.get("origin", "").rstrip("/") not in get_settings().origins:
        raise HTTPException(403, "Origin not allowed")
    tokens = gateway.request("POST", "/auth/v1/token", params={"grant_type": "password"},
                             json={"email": payload.email, "password": payload.password})
    return create_session(response, tokens)


@router.post("/logout")
def logout(response: Response, user: Principal = Depends(require_write)):
    # Local invalidation occurs first, so upstream outages cannot preserve access.
    gateway.request("POST", "/rest/v1/rpc/m1_session_revoke", admin=True, json={"p_hash": user.session_hash})
    response.delete_cookie(get_settings().cookie_name, path="/", secure=get_settings().COOKIE_SECURE, httponly=True, samesite="lax")
    try:
        gateway.request("POST", "/auth/v1/logout", token=user.token, params={"scope": "local"})
    except HTTPException:
        pass
    return {"signed_out": True}


@router.get("/google")
def google_login():
    cfg = get_settings()
    if not cfg.configured:
        raise HTTPException(503, "Authentication is not configured")
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    response = RedirectResponse(cfg.SUPABASE_URL + "/auth/v1/authorize?" + urlencode({
        "provider": "google", "redirect_to": cfg.PUBLIC_APP_URL + "/api/v1/auth/callback",
        "code_challenge": challenge, "code_challenge_method": "s256"}))
    sealed = cipher(cfg.SESSION_ENCRYPTION_KEY).encrypt(json.dumps({"verifier": verifier, "flow": "login"}).encode()).decode()
    response.set_cookie("kerja-pkce", sealed, secure=cfg.COOKIE_SECURE, httponly=True, samesite="lax", max_age=600, path="/")
    return response


@router.get("/callback")
def callback(code: str, request: Request):
    cfg = get_settings()
    sealed = request.cookies.get("kerja-pkce")
    if not sealed:
        raise HTTPException(403, "Login request expired")
    try:
        flow = json.loads(cipher(cfg.SESSION_ENCRYPTION_KEY).decrypt(sealed.encode(), ttl=600))
        verifier = flow["verifier"]
    except Exception:
        raise HTTPException(403, "Login request expired") from None
    tokens = gateway.request("POST", "/auth/v1/token", params={"grant_type": "pkce"},
                             json={"auth_code": code, "code_verifier": verifier})
    response = RedirectResponse(cfg.PUBLIC_APP_URL + "/foundation", status_code=303)
    create_session(response, tokens, recovery=flow.get("flow") == "recovery")
    response.delete_cookie("kerja-pkce", path="/")
    return response


class MfaCode(BaseModel):
    factor_id: UUID
    code: str = Field(pattern=r"^\d{6}$")


@router.post("/mfa/enroll")
def enroll_mfa(user: Principal = Depends(require_write)):
    return gateway.request("POST", "/auth/v1/factors", token=user.token,
                           json={"factor_type": "totp", "friendly_name": "KerjaOS staff"})


@router.post("/mfa/verify")
def verify_mfa(payload: MfaCode, response: Response, user: Principal = Depends(require_write)):
    # Factor ID stays a path segment, never an arbitrary upstream path.
    factor = str(payload.factor_id)
    challenge = gateway.request("POST", f"/auth/v1/factors/{factor}/challenge", token=user.token, json={})
    tokens = gateway.request("POST", f"/auth/v1/factors/{factor}/verify", token=user.token,
                             json={"challenge_id": challenge["id"], "code": payload.code})
    gateway.request("POST", "/rest/v1/rpc/m1_session_revoke", admin=True, json={"p_hash": user.session_hash})
    return create_session(response, tokens)


class Recover(BaseModel):
    email: str = Field(min_length=3, max_length=254)


def email_pkce(response, flow):
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    cfg = get_settings()
    response.set_cookie("kerja-pkce", cipher(cfg.SESSION_ENCRYPTION_KEY).encrypt(json.dumps({"verifier": verifier, "flow": flow}).encode()).decode(),
                        httponly=True, secure=cfg.COOKIE_SECURE, samesite="lax", max_age=600, path="/")
    return challenge


@router.post("/signup")
def signup(payload: Login, request: Request, response: Response):
    cfg = get_settings()
    if request.headers.get("origin", "").rstrip("/") not in cfg.origins:
        raise HTTPException(403, "Origin not allowed")
    if not cfg.EMAIL_AUTH_ENABLED:
        raise HTTPException(409, "Use Google sign-in; email delivery is not configured")
    challenge = email_pkce(response, "signup")
    gateway.request("POST", "/auth/v1/signup", params={"redirect_to": cfg.PUBLIC_APP_URL + "/api/v1/auth/callback"},
        json={"email": payload.email, "password": payload.password, "code_challenge": challenge, "code_challenge_method": "s256"})
    return {"message": "Check your email if this address is eligible. No session is granted before verification."}


@router.post("/recover")
def recover(payload: Recover, request: Request, response: Response):
    cfg = get_settings()
    if request.headers.get("origin", "").rstrip("/") not in cfg.origins:
        raise HTTPException(403, "Origin not allowed")
    if not cfg.EMAIL_AUTH_ENABLED:
        raise HTTPException(409, "Email recovery requires an operator-configured sender")
    challenge = email_pkce(response, "recovery")
    gateway.request("POST", "/auth/v1/recover", params={"redirect_to": cfg.PUBLIC_APP_URL + "/api/v1/auth/callback"},
        json={"email": payload.email, "code_challenge": challenge, "code_challenge_method": "s256"})
    return {"message": "If the account is eligible, check its verified inbox. This does not change its password."}


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=8, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


@router.post("/password")
def change_password(payload: PasswordChange, response: Response, user: Principal = Depends(require_write)):
    # Reauthenticate before changing credentials; never accept a target email/UUID.
    verified = gateway.request("POST", "/auth/v1/token", params={"grant_type": "password"},
        json={"email": user.email, "password": payload.current_password})
    if verified.get("user", {}).get("id") != user.id:
        raise HTTPException(403, "Reauthentication required")
    gateway.request("PUT", "/auth/v1/user", token=verified["access_token"], json={"password": payload.new_password})
    gateway.request("POST", "/rest/v1/rpc/m1_sessions_revoke_user", admin=True, json={"p_user": user.id})
    gateway.request("POST", "/auth/v1/logout", token=verified["access_token"], params={"scope": "global"})
    response.delete_cookie(get_settings().cookie_name, path="/", secure=get_settings().COOKIE_SECURE, httponly=True, samesite="lax")
    return {"changed": True, "signed_out": True}


class RecoveryPassword(BaseModel):
    new_password: str = Field(min_length=12, max_length=256)


@router.post("/recovery-password")
def finish_recovery(payload: RecoveryPassword, response: Response, user: Principal = Depends(require_write)):
    if not user.recovery:
        raise HTTPException(403, "A recent verified recovery link is required")
    gateway.request("PUT", "/auth/v1/user", token=user.token, json={"password": payload.new_password})
    gateway.request("POST", "/rest/v1/rpc/m1_sessions_revoke_user", admin=True, json={"p_user": user.id})
    try:
        gateway.request("POST", "/auth/v1/logout", token=user.token, params={"scope": "global"})
    finally:
        response.delete_cookie(get_settings().cookie_name, path="/", secure=get_settings().COOKIE_SECURE, httponly=True, samesite="lax")
    return {"changed": True, "signed_out": True}
