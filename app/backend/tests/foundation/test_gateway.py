import httpx
import pytest
from fastapi import HTTPException
from app.foundation import gateway
from app.foundation.config import FoundationSettings


def test_modern_api_keys_stay_in_apikey_and_user_jwt_is_separate(monkeypatch):
    cfg = FoundationSettings(_env_file=None, SUPABASE_URL='https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture', SUPABASE_SERVICE_ROLE_KEY='sb_secret_fixture', SESSION_ENCRYPTION_KEY='fixture')
    monkeypatch.setattr(gateway, 'get_settings', lambda: cfg)
    requests = []
    original_client = httpx.Client
    def respond(request):
        requests.append(request)
        return httpx.Response(200, json=[])
    monkeypatch.setattr(gateway.httpx, 'Client', lambda **kwargs: original_client(transport=httpx.MockTransport(respond), **kwargs))
    api = gateway.SupabaseGateway()
    api.request('GET', '/rest/v1/m1_jobs')
    api.request('GET', '/rest/v1/m1_applications', token='verified-user-jwt')
    api.request('GET', '/rest/v1/rpc/m1_session_read', admin=True)
    assert 'authorization' not in requests[0].headers
    assert requests[1].headers['authorization'] == 'Bearer verified-user-jwt'
    assert requests[2].headers['apikey'] == 'sb_secret_fixture'
    assert 'authorization' not in requests[2].headers


def test_upstream_database_error_does_not_expose_candidate_details(monkeypatch):
    cfg = FoundationSettings(_env_file=None, SUPABASE_URL='https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture', SUPABASE_SERVICE_ROLE_KEY='sb_secret_fixture', SESSION_ENCRYPTION_KEY='fixture')
    monkeypatch.setattr(gateway, 'get_settings', lambda: cfg)
    original_client = httpx.Client
    monkeypatch.setattr(gateway.httpx, 'Client', lambda **kwargs: original_client(transport=httpx.MockTransport(
        lambda request: httpx.Response(400, json={'code': '42501', 'message': 'sensitive@example.test'})), **kwargs))
    with pytest.raises(HTTPException) as error:
        gateway.SupabaseGateway().request('GET', '/rest/v1/m1_applications', token='verified-user-jwt')
    assert error.value.status_code == 403 and error.value.detail == 'Access denied'
