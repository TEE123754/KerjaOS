from collections import defaultdict, deque
import threading
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from .auth import router as auth_router
from .routes import router as foundation_router
from .config import get_settings
from .identity import router as identity_router
from .quiz import router as quiz_router
from .background import router as background_router
from .chat import router as chat_router
from .discovery import router as discovery_router
from .interviews import router as interview_router
from .release import router as release_router
from .tracker import router as tracker_router
from .analytics import router as analytics_router
from .reminders import router as reminder_router
from .recruiting import router as recruiting_router
from .recruiting import profile_router
from .hr import router as hr_router


def create_app():
    cfg = get_settings()
    app = FastAPI(title="KerjaOS secure foundation", version="2.0-m12", docs_url=None, redoc_url=None)
    @app.exception_handler(RequestValidationError)
    async def invalid_input(request, exc):
        return JSONResponse({'detail':'Invalid request fields'},422,headers={'Cache-Control':'no-store'})
    app.add_middleware(CORSMiddleware, allow_origins=cfg.origins, allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type", "X-CSRF-Token"])
    recent = defaultdict(deque)
    lock = threading.Lock()

    @app.middleware("http")
    async def security_boundary(request: Request, call_next):
        path = request.url.path
        if request.method in {"POST", "PATCH"}:
            upload = path.endswith('/resume') or path in ('/api/v1/tracker/resumes/upload','/api/v1/profile/resume-preview') or (path.startswith(('/api/v1/identity/cases/','/api/v1/background/cases/')) and path.endswith('/document'))
            limit = cfg.MAX_UPLOAD_BYTES + 1024 * 1024 if upload else 64 * 1024
            declared = request.headers.get("content-length")
            if declared and (not declared.isdigit() or int(declared) > limit):
                return JSONResponse({"detail": "Request too large"}, 413, headers={"Cache-Control": "no-store"})
            if upload and not declared:
                return JSONResponse({"detail": "Upload requires Content-Length"}, 411, headers={"Cache-Control": "no-store"})
            chunks, received = [], 0
            async for chunk in request.stream():
                received += len(chunk)
                if received > limit:
                    return JSONResponse({"detail": "Request too large"}, 413, headers={"Cache-Control": "no-store"})
                chunks.append(chunk)
            request._body = b"".join(chunks)
        key = (request.client.host if request.client else "unknown", path.startswith("/api/v1/auth"))
        now = time.monotonic()
        with lock:
            if len(recent) > 10000:
                recent.clear()
            bucket = recent[key]
            while bucket and bucket[0] < now - 60:
                bucket.popleft()
            denied = len(bucket) >= (10 if key[1] else 120)
            if not denied:
                bucket.append(now)
        if denied:
            response = JSONResponse({"detail": "Try again later"}, 429, headers={"Retry-After": "60"})
        else:
            try:
                response = await call_next(request)
            except Exception:
                response = JSONResponse({"detail": "Operation unavailable"}, 503)
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(foundation_router, prefix="/api/v1")
    app.include_router(identity_router, prefix='/api/v1')
    app.include_router(quiz_router, prefix='/api/v1')
    app.include_router(background_router, prefix='/api/v1')
    app.include_router(chat_router, prefix='/api/v1')
    app.include_router(discovery_router, prefix='/api/v1')
    app.include_router(interview_router, prefix='/api/v1')
    app.include_router(release_router, prefix='/api/v1')
    app.include_router(tracker_router, prefix='/api/v1')

    app.include_router(analytics_router, prefix="/api/v1")

    app.include_router(reminder_router, prefix="/api/v1")
    app.include_router(recruiting_router, prefix="/api/v1")
    app.include_router(profile_router, prefix="/api/v1")
    app.include_router(hr_router, prefix="/api/v1")

    @app.get("/healthz")
    def health():
        return {"status": "ok", "phase": "M12", "mode": cfg.APP_MODE,
                "auth_configured": cfg.configured, "external_ai": False, "legacy_api": False}

    # Deliberately no legacy routers or public uploads mount.
    return app
