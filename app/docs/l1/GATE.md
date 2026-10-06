# L1 configuration slice — 5 October 2026

Configuration/adapter gate **PASSED**. Full L1 Supabase integration remains **IN_PROGRESS**; database schema and private bucket are absent. Frontend/backend are local; nothing deployed.

- Initial affected gate: 37 backend tests across Morpheus, chat authorization/privacy and Supabase key/error boundaries passed; provider metadata PostgreSQL gate passed 44 assertions.
- Live read-only checks: supplied publishable key accepted by Auth settings and JWKS (HTTP 200); server secret accepted by Data API schema and Storage bucket listing (HTTP 200). M1 jobs returned missing-schema 404; M12/provider RPCs and expected private bucket are absent. No user rows or error bodies were printed.
- One initial public FAQ smoke reached the selected model but correctly fell back because the gateway returned `openai/gpt-oss-120b`. Added only this exact publisher-qualified alias to the pinned check. Targeted Morpheus rerun passed 16 tests, including the alias check (38 distinct backend cases across the initial/targeted gates). The second single-generation smoke returned valid strict variant JSON, actual model `openai/gpt-oss-120b`, provider `morpheus`, no warning. No personal inputs transmitted.
- Backend started at 127.0.0.1:8000, frontend at 127.0.0.1:5173; backend health, proxied health and `/foundation` HTML returned HTTP 200. `auth_configured=true` indicates keys/encryption configured, not migration/login readiness. Existing health `external_ai=false` does not certify optional provider database activation; that policy is still OFF.
- Git confirms backend/frontend `.env` and the generated SQL bundle are ignored; diff whitespace check passed. No frontend source/dependency change required a repeated production build or browser fixture suite.

Corrections during the gate: used the existing app-level virtual environment (`..\.venv` from backend) after the first command referenced a nonexistent backend venv; Vite config-loader parent access required an approved unsandboxed local startup. These were environment fixes. No full feature-suite rerun.

Remaining: confirm development-project selection; supply `DATABASE_URL` or select owner-operated SQL Editor; preserve existing data/grants and rehearse restore; apply ordered M1–M12 plus L1 provider metadata migration; verify RLS/grants/private bucket; synthetic verified accounts/MFA/jobs/quiz/localhost redirects; full L1 Auth/Storage/CSRF/proxy/journey gate. No remote migration, account creation, sender, worker, scraper, official check or deployment occurred.

Scope: the AI adapter selects approved FAQ text only. Progress queries and decisions retain their existing deterministic authenticated paths. Paid/credit-funded model smoke is not activation of live hiring scoring or personal-data transfer.
