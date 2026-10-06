# Local credentials and Morpheus setup

Frontend/backend stay local. Supabase supplies development Auth, PostgreSQL and private Storage. Credentials live only in ignored `app/backend/.env`; browser env contains `VITE_API_URL=/api/v1`. The modern `SUPABASE_SECRET_KEY` is accepted as the server-only service-key alias. `SUPABASE_JWKS_URL` is recorded; existing authentication still validates `/auth/v1/user` and database session revocation, rather than trusting unverified JWT claims. Independent session/document/backup encryption keys are generated only when missing.

## Selected AI model

`LLM_PROVIDER=morpheus`, `MORPHEUS_MODEL=gpt-oss-120b`, fixed base URL `https://api.mor.org/api/v1`. The authenticated active-model catalog included the model on 5 October 2026. Official pricing lists **$0.07 input / $0.28 output per million tokens**; pricing can change. This is paid/credit-funded inference, not a free model. The owner's latest instruction authorizes inexpensive Morpheus use; other paid integrations remain deferred. No credit purchase or subscription is performed.

Sources: [Morpheus pricing](https://github.com/MorpheusAIs/api-gateway-docs/blob/main/documentation/models/pricing.mdx), [API/privacy description](https://mor.org/inference-api), [chat API](https://github.com/MorpheusAIs/api-gateway-docs/blob/main/api-reference/chat/completions.mdx).

The adapter selects one approved FAQ variant from a fixed code and locale only. It sends no candidate message, application, résumé, identity, credit or criminal evidence. Returned text is parsed as strict JSON and never displayed or executed directly. Progress stays read-only and deterministic; this change does not activate AI scoring or the legacy graph. Morpheus advertises no prompt/response logging; personal-data transfer approval is not inferred from that claim.

At most 256 output tokens, 15-second timeout, one generation with no retry/alternate model, 64 KiB response bound, three-failure circuit and visible rules fallback. Existing database quota remains at most 20 global reservations/day, including failed requests. At listed prices, a call with 200 input and 256 output tokens is approximately **$0.000086**; 20 such calls are approximately **$0.0018/day**. These are token-rate estimates, not guaranteed provider charges. Disable overages/auto top-up and set a small account spending limit in the provider dashboard when available; this adapter does not modify billing settings.

Local env enables the selected adapter and public-code-only privacy boundary. The database policy remains OFF until migrations and synthetic Auth tests are complete. Supplying a key does not bypass the database reservation. After M1–M12, apply `20261005130000_l1_llm_provider_metadata.sql` for accurate requested/actual-model metadata. Enable the database external/privacy policy only for the chosen synthetic development project after integration; never expose `kerja_private` through the Data API.

## Supabase migration handoff

API keys cannot run arbitrary SQL or `pg_dump`. Confirm fresh synthetic development use and supply `DATABASE_URL`, or use the owner's SQL Editor. Preserve existing data/grants and rehearse backup/restore before touching an existing project. Migrations are ordered additive scripts, not idempotent reset scripts; do not blindly rerun previously applied files.

A secret-free ordered SQL Editor bundle is prepared locally at ignored `app/.local/MIGRATIONS.sql`, built from `app/supabase/migrations/`. Do not run against an unreviewed existing project. After execution, refresh the Data API schema cache and inspect public RPC grants/private Storage. Then configure localhost Auth redirects and bootstrap synthetic candidates/HM with MFA/jobs/quiz policies as described in the phase setup documents. Never create real candidate records for this gate.

## Start and verify

From `app/backend`: `..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000`. From `app`: `npm run dev -- --port 5173`. Open `http://localhost:5173/foundation`. Health reports process/configuration availability, not database migration or login readiness.

After construction only: `python scripts/check_local_services.py` performs sanitized read-only Auth/JWKS/schema/Storage probes; `--ai-smoke` additionally makes one bounded public FAQ request using credits. It outputs only statuses, model labels and readiness booleans, never keys, user records or provider error bodies. This partial setup gate does not substitute for the full L1 Auth/MFA/RLS/private Storage/proxy journeys.

Rollback: set local `EXTERNAL_LLM_ENABLED=false` and database `chat_policy.external_enabled=false`. For metadata-wrapper rollback, drop public then private `m6_begin_provider(text,boolean,text)` only after disabling Morpheus requests; existing M6 functions remain intact. Keep encryption keys to preserve readability of existing data. Deployment, email, scraping, biometrics and official checks remain deferred.
