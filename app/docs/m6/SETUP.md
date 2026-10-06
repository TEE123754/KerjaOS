# M6 scoped progress assistant

Local deterministic EN/BM answers work without an AI key. Candidate scope lists only the authenticated person's applications, asks for a selection when ambiguous, and cites application UUID/update time. Staff scope requires verified role, MFA and assigned job access; only stage/status totals are returned. Both paths are read-only. The legacy agent graph and paid scoring/email tools remain unmounted.

## Setup and demo

After backed-up M1–M5 migrations, apply `supabase/migrations/20261002160000_m6_scoped_chat.sql` to the selected test Supabase project. Use the existing same-origin cookie/CSRF API facade. Start the API and Vite as documented in M1. The foundation workspace includes the assistant. With synthetic A/X, A/Y and B/X, ask A for progress, select A/Y, then ask about practice or privacy in EN/BM. Confirm B/X is inaccessible. With an MFA-verified assigned HM, select a role and request totals. Decisions/updates and arbitrary legacy tool names are unsupported.

Only typed safe tools are registered in TOOL_REGISTRY and deterministic TASK_TOOL_PLANS. Active APIs use their lightweight implementations without importing the old graph. The principal comes from verified server authentication, never request role/user fields. Direct RPCs independently verify ownership, session validity, role/MFA/assignment.

## Optional gateway (default off)

Backend-only variables: `EXTERNAL_LLM_ENABLED=false`, blank `OPENROUTER_API_KEY`, blank exact `M6_OPENROUTER_PROVIDER` and `M6_EXTERNAL_PRIVACY_APPROVED=false`. DB `kerja_private.chat_policy` also defaults external/privacy approval off, with at most 20 global external reservations/day. Do not enable until an operator verifies the intended exact provider's current zero prices and approved data policy, and separately configures DB approval. Keys alone do not activate it. No live route compatibility has been demonstrated.

Only a whitelisted public FAQ code and EN/MS locale reach the model. It selects variant 0/1 from approved local text; model text cannot become a tool, decision or answer. No message, application, resume, evidence, employer title or candidate data is transmitted. Progress is always deterministic.

The exact `typesafe/jev-router` route is preflighted for all reported prices equal to zero. Requests pin one provider, disable fallback, require parameters, deny data collection, require ZDR, cap prompt/completion price at zero, and cap output at 32 tokens. Returned model/provider/cost and strict variant JSON must match. A five-second deadline, bounded responses, one safe preflight timeout retry, one generation and three-failure/60-second process circuit bound work. Reservation is consumed even on failure; it is not refunded into a retry loop. Local approved wording plus a visible fallback_warning is returned on missing configuration, price/privacy/quota/route mismatch, timeout, 429, outage or invalid output. Jev 1.13 decisions are disabled.

See [OpenRouter provider controls](https://openrouter.ai/docs/guides/routing/provider-selection) and [Jev Router listing](https://openrouter.ai/typesafe/jev-router). Router listing alone does not establish a compatible zero-price underlying route.

## Metadata, retention and rollback

Database stores only actor UUID, scope, enumerated tool/warning, reservation, safe model/provider labels and timestamps. No raw chats, answer, prompt, resume, email or target application IDs are retained. UI replies stay in component memory. Records expire after seven days and expired rows are purged on the next chat reservation. For idle periods, schedule the operator script `backend/scripts/chat_retention_m6.py` using DATABASE_URL; `--dry-run` reports counts. Scheduled hosted purge remains deferred, so seven-day expiry is not a claim of physical deletion without that job. No decision or permission depends on user-scoped telemetry being an authoritative audit trail.

Rollback: disable environment EXTERNAL_LLM_ENABLED and DB chat_policy.external_enabled; offline FAQ/progress still work. A revoked session immediately loses RPC access. Keep metadata purge active. This does not require model hosting, Redis or paid inference.

## Completion gate and remaining live work

Tests run only after M6 construction: affected foundation pytest, actual PostgreSQL migration/permissions/quota fixtures, frontend build/typecheck, six browser scenarios and one local promptfoo malicious-input evaluation. promptfoo is a pinned development-only tool; its Python provider exercises the actual deterministic handler, never an external model. See [Python provider docs](https://www.promptfoo.dev/docs/providers/python/). Turn telemetry off and select the project .venv interpreter.

Live Auth/PostgREST/RLS/proxy/MFA, multi-connection budget contention, scheduled metadata purge, restore/replay and actual free/privacy-compatible route checks remain pending keys/configuration. Browser API fixtures and serial PGlite do not establish those hosted properties. No deployment or real candidate data is part of this phase.


## 5 October 2026 — optional Morpheus adapter

The owner supplied Morpheus credentials and authorized choosing inexpensive inference. The new pinned gpt-oss-120b public-FAQ selector preserves all personal-data/tool boundaries and M6 database quotas. Existing Jev defaults are unchanged in the example env. See [L1 setup](../l1/SETUP.md) for the rate, caps, configuration gate, provider metadata migration and remaining SQL/Auth integration. Morpheus is credit-funded; it is not advertised as free.
