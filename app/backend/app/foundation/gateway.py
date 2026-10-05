"""Small REST adapter: ordinary data requests use the verified user's token/RLS.

The admin key is used only for non-exposed session/document storage metadata.
It is never accepted from a browser and never used for application list/write APIs.
"""
import httpx
from fastapi import HTTPException
from .config import get_settings


class SupabaseGateway:
    def request(self, method, path, *, token=None, admin=False, schema=None, json=None, params=None, content=None, headers=None):
        cfg = get_settings()
        if not cfg.configured:
            raise HTTPException(503, "Configure Supabase and session encryption before signing in")
        key = cfg.SUPABASE_SERVICE_ROLE_KEY if admin else cfg.SUPABASE_PUBLISHABLE_KEY
        request_headers = {"apikey": key}
        if token:
            request_headers["Authorization"] = f"Bearer {token}"
        elif key.startswith("eyJ"):
            # Legacy anon/service-role JWT keys; modern API keys use apikey only.
            request_headers["Authorization"] = f"Bearer {key}"
        if schema:
            request_headers["Accept-Profile"] = schema
            request_headers["Content-Profile"] = schema
        request_headers.update(headers or {})
        try:
            with httpx.Client(timeout=15, follow_redirects=False) as client:
                response = client.request(method, cfg.SUPABASE_URL + path, headers=request_headers,
                                          json=json, params=params, content=content)
        except httpx.HTTPError:
            raise HTTPException(503, "Service temporarily unavailable") from None
        if response.is_error:
            status = response.status_code
            if status == 429:
                raise HTTPException(429, "Try again later", headers={"Retry-After": "60"})
            if status in (401, 403):
                raise HTTPException(401 if path.startswith("/auth/") else 403, "Access denied")
            # SQL errors are mapped without exposing database/provider messages.
            code = ""
            try:
                code = response.json().get("code", "")
            except ValueError:
                pass
            if code == '23514':
                raise HTTPException(409, 'Required evidence or pipeline prerequisites are missing; refresh and review')
            if status == 409 or code in ("23505", "40001", "23P01"):
                raise HTTPException(409, "Application exists or changed; reload before retrying")
            if code == "42501":
                raise HTTPException(403, "Access denied")
            if code == "P0002":
                raise HTTPException(404, "Record not found")
            raise HTTPException(503, "Operation unavailable; contact the operator")
        if not response.content:
            return None
        if "json" in response.headers.get("content-type", ""):
            return response.json()
        return response.content

    def table(self, name, *, token, params=None):
        return self.request("GET", f"/rest/v1/{name}", token=token, params=params)

    def rpc(self, name, *, token, payload=None):
        return self.request("POST", f"/rest/v1/rpc/{name}", token=token, json=payload or {})


gateway = SupabaseGateway()
