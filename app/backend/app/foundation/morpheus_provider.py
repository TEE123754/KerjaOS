"""Bounded public FAQ selector. Personal data and model text never become answers."""
import json
import time

import httpx

from .config import get_settings
from .chat_providers import JevRouterProvider, Variant, Wording, public_faq_boundary


class MorpheusProvider(JevRouterProvider):
    def choose_wording(self, code, locale):
        payload = public_faq_boundary(code, locale)
        cfg = get_settings()
        if not cfg.EXTERNAL_LLM_ENABLED:
            return Wording(fallback_warning="external_disabled")
        if not cfg.MORPHEUS_API_KEY:
            return Wording(fallback_warning="not_configured")
        if not cfg.ALLOW_PAID_PROVIDERS:
            return Wording(fallback_warning="nonzero_price")
        if not cfg.M6_EXTERNAL_PRIVACY_APPROVED:
            return Wording(fallback_warning="privacy_unapproved")
        with self.lock:
            if self.open_until > time.monotonic():
                return Wording(fallback_warning="circuit_open")
        body = {
            "model": cfg.MORPHEUS_MODEL,
            "messages": [
                {"role": "system", "content": 'Select approved FAQ wording variant. Reply only with JSON {"variant":0} or {"variant":1}. No other output.'},
                {"role": "user", "content": json.dumps(payload)},
            ],
            "temperature": 0, "max_tokens": cfg.MORPHEUS_MAX_TOKENS,
            "reasoning_effort": "low", "stream": False,
            "response_format": {"type": "json_object"},
        }
        observed = "rules"
        deadline = time.monotonic() + cfg.MORPHEUS_TIMEOUT_SECONDS
        try:
            # One generation per DB reservation; no SDK retry or model fallback.
            with httpx.Client(transport=self.transport, timeout=cfg.MORPHEUS_TIMEOUT_SECONDS, follow_redirects=False) as client:
                with client.stream("POST", cfg.MORPHEUS_BASE_URL + "/chat/completions",
                                   headers={"Authorization": "Bearer " + cfg.MORPHEUS_API_KEY}, json=body) as response:
                    if response.status_code == 429:
                        return self.fail("rate_limited")
                    if response.is_error:
                        return self.fail("provider_outage")
                    chunks, size = [], 0
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > 65536:
                            return self.fail("invalid_response")
                        if time.monotonic() > deadline:
                            return self.fail("timeout")
                        chunks.append(chunk)
            result = json.loads(b"".join(chunks))
            observed = result.get("model")
            # The live gateway reports the publisher-qualified name for this
            # exact pinned request. Never accept a different model/size/router.
            if observed not in (cfg.MORPHEUS_MODEL, "openai/" + cfg.MORPHEUS_MODEL):
                return self.fail("unapproved_model", observed, "morpheus")
            choice = result["choices"][0]
            if choice.get("finish_reason") != "stop":
                return self.fail("invalid_response", observed, "morpheus")
            content = choice["message"]["content"]
            if not isinstance(content, str) or len(content) > 200:
                return self.fail("invalid_response", observed, "morpheus")
            variant = Variant.model_validate(json.loads(content)).variant
            with self.lock:
                self.failures = 0
                self.open_until = 0
            return Wording(variant, observed, "morpheus")
        except httpx.TimeoutException:
            return self.fail("timeout")
        except httpx.HTTPError:
            return self.fail("provider_outage")
        except (ValueError, TypeError, KeyError, IndexError, AttributeError):
            return self.fail("invalid_response", observed, "morpheus")


morpheus_provider = MorpheusProvider()


class ConfiguredWordingProvider:
    def choose_wording(self, code, locale):
        if get_settings().LLM_PROVIDER == "morpheus":
            return morpheus_provider.choose_wording(code, locale)
        from .chat_providers import wording_provider
        return wording_provider.choose_wording(code, locale)


configured_wording_provider = ConfiguredWordingProvider()
