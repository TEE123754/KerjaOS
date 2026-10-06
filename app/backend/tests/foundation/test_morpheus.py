import json
import httpx
import pytest
from pydantic import ValidationError
from app.foundation.config import FoundationSettings
from app.foundation import morpheus_provider as module, chat
from app.foundation.morpheus_provider import MorpheusProvider
from app.foundation.chat_providers import Wording
from chat_fixture import ChatFixture, principal


def settings(**overrides):
    values = dict(_env_file=None, EXTERNAL_LLM_ENABLED=True, ALLOW_PAID_PROVIDERS=True,
                  MORPHEUS_API_KEY='fixture', M6_EXTERNAL_PRIVACY_APPROVED=True,
                  LLM_PROVIDER='morpheus')
    values.update(overrides)
    return FoundationSettings(**values)


def result(**overrides):
    value = {'model':'gpt-oss-120b','choices':[{'finish_reason':'stop','message':{'content':'{"variant":1}'}}]}
    value.update(overrides)
    return value


def provider(monkeypatch, cfg=None, status=200, output=None):
    monkeypatch.setattr(module, 'get_settings', lambda: cfg or settings())
    calls = []
    def respond(request):
        calls.append(request)
        assert request.url == 'https://api.mor.org/api/v1/chat/completions'
        body = json.loads(request.content)
        assert json.loads(body['messages'][1]['content']) == {'faq_code':'privacy','locale':'ms'}
        assert body['max_tokens'] <= 256 and body['model'] == 'gpt-oss-120b'
        assert 'tools' not in body and body['stream'] is False
        return httpx.Response(status, json=output if output is not None else result())
    return MorpheusProvider(httpx.MockTransport(respond)), calls


def test_pinned_morpheus_public_boundary(monkeypatch):
    p, calls = provider(monkeypatch)
    r = p.choose_wording('privacy','ms')
    assert r == Wording(1,'gpt-oss-120b','morpheus') and len(calls) == 1
    for code in ('resume raw text','candidate@example.test','application progress'):
        with pytest.raises(ValueError): p.choose_wording(code,'ms')
    assert len(calls) == 1


def test_gateway_publisher_qualified_pinned_alias(monkeypatch):
    p,calls=provider(monkeypatch,output=result(model='openai/gpt-oss-120b'))
    r=p.choose_wording('privacy','ms')
    assert r == Wording(1,'openai/gpt-oss-120b','morpheus') and len(calls)==1


@pytest.mark.parametrize('flags,warning', [
    ({'EXTERNAL_LLM_ENABLED':False},'external_disabled'),
    ({'MORPHEUS_API_KEY':''},'not_configured'),
    ({'ALLOW_PAID_PROVIDERS':False},'nonzero_price'),
    ({'M6_EXTERNAL_PRIVACY_APPROVED':False},'privacy_unapproved')])
def test_morpheus_switches_make_no_request(monkeypatch, flags, warning):
    p, calls = provider(monkeypatch, cfg=settings(**flags))
    assert p.choose_wording('privacy','ms').fallback_warning == warning and calls == []


@pytest.mark.parametrize('status,output,warning', [
    (429,None,'rate_limited'), (500,None,'provider_outage'),
    (200,result(model='unapproved-model'),'unapproved_model'),
    (200,result(choices=[{'finish_reason':'length','message':{'content':'{"variant":1}'}}]),'invalid_response'),
    (200,result(choices=[{'finish_reason':'stop','message':{'content':'{"variant":1,"tool":"reject"}'}}]),'invalid_response'),
    (200,result(choices=[{'finish_reason':'stop','message':{'content':'{"variant":true}'}}]),'invalid_response'),
    (200,{},'unapproved_model')])
def test_morpheus_no_retry_and_visible_fallback(monkeypatch,status,output,warning):
    p,calls=provider(monkeypatch,status=status,output=output)
    for _ in range(3): assert p.choose_wording('privacy','ms').fallback_warning == warning
    assert p.choose_wording('privacy','ms').fallback_warning == 'circuit_open'
    assert len(calls) == 3


def test_timeout_and_oversized_reply(monkeypatch):
    monkeypatch.setattr(module,'get_settings',settings)
    def timeout(request): raise httpx.ReadTimeout('provider-secret')
    p=MorpheusProvider(httpx.MockTransport(timeout))
    assert p.choose_wording('privacy','en').fallback_warning == 'timeout'
    p=MorpheusProvider(httpx.MockTransport(lambda r:httpx.Response(200,content=b'x'*65537)))
    assert p.choose_wording('privacy','en').fallback_warning == 'invalid_response'


def test_server_secret_alias_and_endpoint_restrictions():
    cfg=settings(SUPABASE_SECRET_KEY='sb_secret_fixture',SUPABASE_SERVICE_ROLE_KEY='')
    assert cfg.SUPABASE_SERVICE_ROLE_KEY == 'sb_secret_fixture'
    for values in ({'MORPHEUS_BASE_URL':'https://untrusted.example/api/v1'},
                   {'MORPHEUS_MODEL':'expensive-model'},{'MORPHEUS_MAX_TOKENS':10000}):
        with pytest.raises(ValidationError): settings(**values)


def test_chat_records_selected_model_but_only_sends_code(monkeypatch):
    monkeypatch.setattr(chat,'get_settings',settings)
    class Store(ChatFixture):
        def rpc(self,name,*,token,payload):
            if name=='m6_begin_provider':
                self.calls.append((name,payload));return {'id':self.rows[0]['id'],'external_reserved':True}
            return super().rpc(name,token=token,payload=payload)
    class Selector:
        def choose_wording(self,code,locale):
            assert (code,locale)==('privacy','en')
            return Wording(1,'gpt-oss-120b','morpheus')
    store=Store()
    r=chat.answer(chat.ChatRequest(message='privacy'),principal(),store,Selector())
    assert r['read_only'] and r['provenance']['requested_model']=='gpt-oss-120b'
    assert store.calls[0][1]['p_requested_model']=='gpt-oss-120b'
    assert store.calls[-1][1]['p_actual']=='gpt-oss-120b'
