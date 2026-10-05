import base64
import io
import json
from datetime import timedelta
from uuid import uuid4
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from app.foundation import auth, routes
from app.foundation.config import get_settings
from app.foundation.server import create_app
from app.foundation.migration import reconcile, application_uuid
from app.foundation.privacy import normalize_document_text, redact_text

A, B, X, Y, EMPLOYER = [str(uuid4()) for _ in range(5)]
APP = str(uuid4())


class FakeGateway:
    """Network fixtures only. Actual PostgreSQL RLS is checked by m1-sql.mjs."""
    def __init__(self):
        self.sessions, self.documents, self.objects = {}, {}, {}
        self.confirmed, self.active, self.lease = True, True, True
        self.password_changed = False
        self.token = 'header.' + base64.urlsafe_b64encode(json.dumps({'aal': 'aal1'}).encode()).decode().rstrip('=') + '.signature'

    def request(self, method, path, **kw):
        body = kw.get('json') or {}
        if path == '/auth/v1/token':
            return {'access_token': self.token, 'refresh_token': 'never-in-browser', 'expires_in': 3600, 'user': {'id': A}}
        if path == '/auth/v1/user':
            if method == 'PUT': self.password_changed = True
            return {'id': A, 'email': 'a@example.test', 'email_confirmed_at': 'confirmed' if self.confirmed else None,
                    'user_metadata': {'role': 'admin'}}
        name = path.split('/')[-1]
        if name == 'm1_session_write':
            self.sessions[body['p_hash']] = body['p_data']; return None
        if name == 'm1_session_read':
            row = self.sessions.get(kw['params']['p_hash'])
            return [row] if row else []
        if name == 'm1_session_revoke':
            self.sessions[body['p_hash']]['revoked_at'] = auth.utcnow().isoformat(); return None
        if name == 'm1_session_refresh_claim': return self.lease
        if name == 'm1_session_refresh_release': return None
        if name == 'm1_sessions_revoke_user':
            for row in self.sessions.values(): row['revoked_at'] = auth.utcnow().isoformat()
            return None
        if path == '/auth/v1/recover': return None
        if path == '/auth/v1/factors': return {'id': str(uuid4()), 'totp': {'qr_code': '<svg/>'}}
        if path.endswith('/challenge'): return {'id': 'fixture-challenge'}
        if path.endswith('/verify'):
            self.token = 'header.' + base64.urlsafe_b64encode(json.dumps({'aal': 'aal2'}).encode()).decode().rstrip('=') + '.signature'
            return {'access_token': self.token, 'refresh_token': 'never-in-browser', 'expires_in': 3600}
        if name == 'm1_document_register':
            self.documents[body['p_id']] = {'id': body['p_id'], 'owner_id': body['p_user'], 'object_key': body['p_key'], 'expires_at': body['p_expiry']}; return None
        if name == 'm1_document_ready': return None
        if name == 'm1_document_for_owner':
            row = self.documents.get(body['p_id'])
            return [row] if row and row['owner_id'] == body['p_user'] else []
        if '/storage/v1/object/' in path:
            if method == 'POST': self.objects[path] = kw['content']; return None
            return self.objects[path]
        if path == '/auth/v1/logout': return None
        raise AssertionError('Unexpected fixture call: ' + path)

    def table(self, name, **kw):
        if name == 'm1_memberships': return []
        if name == 'm1_profiles': return [{'id': A, 'display_name': 'A', 'locale': 'en'}]
        if name == 'm1_jobs': return [{'id': X, 'title': 'Test job', 'department': 'Test'}]
        if name == 'm1_applications':
            query = kw.get('params') or {}
            if query.get('id') and query['id'] != 'eq.' + APP: return []
            return [{'id': APP, 'candidate_id': A, 'job_id': X, 'stage': 'P0', 'status': 'applied', 'version': 0}]
        if name == 'm1_application_events': return []
        raise AssertionError(name)

    def rpc(self, name, **kw):
        if name == 'm1_auth_session_active': return self.active
        if name == 'm1_bootstrap_profile': return None
        raise AssertionError(name)


@pytest.fixture
def boundary(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL', 'https://example.supabase.co')
    monkeypatch.setenv('SUPABASE_PUBLISHABLE_KEY', 'publishable-fixture')
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', 'server-only-fixture')
    monkeypatch.setenv('SESSION_ENCRYPTION_KEY', Fernet.generate_key().decode())
    monkeypatch.setenv('DOCUMENT_ENCRYPTION_KEY', Fernet.generate_key().decode())
    monkeypatch.setenv('COOKIE_SECURE', 'false')
    get_settings.cache_clear()
    fake = FakeGateway()
    monkeypatch.setattr(auth, 'gateway', fake)
    monkeypatch.setattr(routes, 'gateway', fake)
    with TestClient(create_app()) as client:
        yield client, fake
    get_settings.cache_clear()


def login(client):
    return client.post('/api/v1/auth/login', headers={'Origin': 'http://localhost:5173'},
                       json={'email': 'a@example.test', 'password': 'fixture-password'})


def write_headers(client):
    return {'Origin': 'http://localhost:5173', 'X-CSRF-Token': client.get('/api/v1/me').json()['csrf_token']}


def test_legacy_and_public_uploads_are_not_mounted(boundary):
    client, _ = boundary
    for path in ('/uploads/resume.pdf', '/api/v1/candidates/lookup?email=a@example.test', '/api/v1/settings', '/api/v1/agents/events'):
        assert client.get(path).status_code == 404
    assert client.get('/api/v1/applications').status_code == 401


def test_login_cookie_has_no_browser_tokens_and_no_metadata_role(boundary):
    client, _ = boundary
    response = login(client)
    assert response.status_code == 200
    assert 'HttpOnly' in response.headers['set-cookie'] and 'SameSite=lax' in response.headers['set-cookie']
    assert 'access_token' not in response.text and 'refresh_token' not in response.text
    identity = client.get('/api/v1/me')
    assert identity.json()['memberships'] == []
    assert identity.headers['cache-control'] == 'no-store'


def test_unconfirmed_login_and_cross_origin_denied(boundary):
    client, fake = boundary
    fake.confirmed = False
    assert login(client).status_code == 403
    assert not fake.sessions
    assert client.post('/api/v1/auth/login', headers={'Origin': 'https://attacker.test'},
        json={'email': 'a@example.test', 'password': 'fixture-password'}).status_code == 403


def test_csrf_and_staff_mfa_guard(boundary):
    client, _ = boundary
    login(client)
    payload = {'decision': 'rejected', 'reason': 'Human reviewed evidence', 'expected_version': 0, 'idempotency_key': str(uuid4())}
    endpoint = '/api/v1/applications/' + APP + '/decisions'
    assert client.post(endpoint, json=payload).status_code == 403
    assert client.post(endpoint, headers=write_headers(client), json=payload).status_code == 403


def test_logout_and_upstream_revocation_take_effect(boundary):
    client, fake = boundary
    login(client)
    cookie = client.cookies.get('kerja-local')
    assert client.post('/api/v1/auth/logout', headers=write_headers(client)).status_code == 200
    client.cookies.set('kerja-local', cookie)
    assert client.get('/api/v1/me').status_code == 401


def test_auth_session_removal_denies_unexpired_token(boundary):
    client, fake = boundary
    login(client); fake.active = False
    assert client.get('/api/v1/me').status_code == 401


def test_expiry_and_refresh_race(boundary):
    client, fake = boundary
    login(client)
    row = next(iter(fake.sessions.values()))
    row['token_expires_at'] = (auth.utcnow() - timedelta(seconds=1)).isoformat()
    fake.lease = False
    assert client.get('/api/v1/me').status_code == 409
    row['expires_at'] = (auth.utcnow() - timedelta(seconds=1)).isoformat()
    assert client.get('/api/v1/me').status_code == 401


def test_guessed_application_and_recovery_are_denied(boundary):
    client, _ = boundary
    login(client)
    assert client.get('/api/v1/applications/' + str(uuid4())).status_code == 404
    assert client.post('/api/v1/auth/recovery-password', headers=write_headers(client),
                       json={'new_password': 'a-new-long-password'}).status_code == 403


def test_resume_encrypted_ticket_bound_to_session(boundary):
    client, fake = boundary
    login(client)
    writer = PdfWriter(); writer.add_blank_page(width=100, height=100)
    buffer = io.BytesIO(); writer.write(buffer); pdf = buffer.getvalue()
    response = client.post('/api/v1/applications/' + APP + '/resume', headers=write_headers(client),
        files={'file': ('synthetic.pdf', pdf, 'application/pdf')})
    assert response.status_code == 201
    stored = next(iter(fake.objects.values()))
    assert not stored.startswith(b'%PDF') and stored != pdf
    ticket = client.post('/api/v1/documents/access', headers=write_headers(client), json={'document_id': response.json()['id']})
    viewed = client.get(ticket.json()['url'])
    assert viewed.status_code == 200 and viewed.content == pdf
    assert viewed.headers['cache-control'] == 'no-store'
    with TestClient(create_app()) as stranger:
        assert stranger.get(ticket.json()['url']).status_code == 401
        login(stranger)
        assert stranger.get(ticket.json()['url']).status_code == 404


def test_expired_document_link_denied(boundary, monkeypatch):
    from itsdangerous import URLSafeTimedSerializer, TimestampSigner
    client, _ = boundary
    login(client)
    row = next(iter(boundary[1].sessions))
    with monkeypatch.context() as timestamp_patch:
        timestamp_patch.setattr(TimestampSigner, 'get_timestamp', lambda self: 1)
        ticket = URLSafeTimedSerializer(get_settings().SESSION_ENCRYPTION_KEY, salt='document-access').dumps({'id': str(uuid4()), 'user': A, 'session': row})
    assert client.get('/api/v1/documents/view', params={'ticket': ticket}).status_code == 403


def test_mfa_rotates_session_and_never_returns_provider_tokens(boundary):
    client, _ = boundary
    login(client)
    old_cookie = client.cookies.get('kerja-local')
    factor = client.post('/api/v1/auth/mfa/enroll', headers=write_headers(client)).json()
    result = client.post('/api/v1/auth/mfa/verify', headers=write_headers(client), json={'factor_id': factor['id'], 'code': '123456'})
    assert result.status_code == 200 and 'refresh_token' not in result.text
    assert client.cookies.get('kerja-local') != old_cookie
    assert client.get('/api/v1/me').json()['aal'] == 'aal2'
    client.cookies.set('kerja-local', old_cookie)
    assert client.get('/api/v1/me').status_code == 401


def test_verified_recovery_callback_changes_only_own_password_and_revokes_sessions(boundary, monkeypatch):
    client, fake = boundary
    monkeypatch.setenv('EMAIL_AUTH_ENABLED', 'true'); get_settings.cache_clear()
    assert client.get('/api/v1/auth/callback?code=fixture').status_code == 403
    result = client.post('/api/v1/auth/recover', headers={'Origin': 'http://localhost:5173'}, json={'email': 'a@example.test'})
    assert result.status_code == 200 and not fake.password_changed and not fake.sessions
    result = client.get('/api/v1/auth/callback?code=fixture', follow_redirects=False)
    assert result.status_code == 303
    assert client.get('/api/v1/me').json()['password_recovery'] is True
    result = client.post('/api/v1/auth/recovery-password', headers=write_headers(client), json={'new_password': 'new-fixture-password'})
    assert result.status_code == 200 and fake.password_changed
    assert all(row.get('revoked_at') for row in fake.sessions.values())
    assert client.get('/api/v1/me').status_code == 401


def test_chunked_json_limit_and_exact_cors(boundary):
    client, _ = boundary
    result = client.post('/api/v1/auth/login', content=iter([b' ' * 65537]), headers={'Origin': 'http://localhost:5173', 'Content-Type': 'application/json'})
    assert result.status_code == 413
    result = client.options('/api/v1/applications', headers={'Origin': 'https://attacker.test', 'Access-Control-Request-Method': 'POST'})
    assert result.status_code == 400 and 'access-control-allow-origin' not in result.headers


def test_invalid_pdf_and_oversize_denied(boundary):
    client, _ = boundary
    login(client)
    endpoint = '/api/v1/applications/' + APP + '/resume'
    assert client.post(endpoint, headers=write_headers(client), files={'file': ('fake.pdf', b'not-pdf', 'application/pdf')}).status_code == 422
    assert client.post(endpoint, headers={'content-length': '999999999'}, content=b'').status_code == 413


def test_sse_is_bounded_authorized_and_not_cacheable(boundary):
    client, _ = boundary
    login(client)
    response = client.get('/api/v1/applications/' + APP + '/events/stream')
    assert response.status_code == 200 and 'event: complete' in response.text
    assert response.headers['cache-control'] == 'no-store'


def test_reconciliation_recovers_same_job_collision_and_is_stable():
    jobs = {'1': {'id': X, 'employer_id': EMPLOYER}, '2': {'id': Y, 'employer_id': EMPLOYER}}
    rows = [ {'email': 'a@example.test', 'payload': {'applications': [{'application_id': 'position-1', 'position_id': 1}, {'application_id': 'position-2', 'position_id': 2}]}},
             {'email': 'b@example.test', 'payload': {'applications': [{'application_id': 'position-1', 'position_id': 1}]}} ]
    report = reconcile(rows, [], {'a@example.test': A, 'b@example.test': B}, jobs)
    assert report['counts']['reconstructed'] == 3
    assert len({r['id'] for r in report['proposals']}) == 3
    assert report == reconcile(rows, [], {'a@example.test': A, 'b@example.test': B}, jobs)


def test_reconciliation_keeps_conflicts_and_unmatched_evidence():
    jobs = {'1': {'id': X, 'employer_id': EMPLOYER}}
    rows = [{'email': 'a@example.test', 'payload': {'applications': [{'position_id': 1, 'status': 'applied'}]}}]
    report = reconcile(rows, [{'candidate_email': 'a@example.test', 'position_id': 1, 'payload': {'status': 'rejected'}}], {'a@example.test': A}, jobs)
    assert report['counts']['conflicts'] == 1
    assert len(report['conflicts'][0]['versions']) == 2
    assert reconcile(rows, [], {}, jobs)['counts']['unmatched'] == 1


def test_local_normalization_preserves_bahasa_and_redacts_ids():
    assert normalize_document_text('Pengalaman\u200b kerja\nBahasa Melayu') == 'Pengalaman kerja\nBahasa Melayu'
    text = redact_text('ID 900101-14-1234, contact a@example.test or +60123456789')
    assert '900101' not in text and 'a@example.test' not in text and '+60123456789' not in text
