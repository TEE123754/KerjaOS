# M5 phase-end gate — 2 October 2026

**Local M5 gate PASSED. Hosted service integration, real migrations/deployment/concurrency and real-data legal approval remain DEFERRED.** Tests began only after construction. No new dependency, external model, paid tool, portal credential or real candidate/report was used.

| Check | Actual evidence |
| --- | --- |
| Scoped backend foundation suite | **59 passed**, including eight M5 provider/API/encrypted report/deletion checks. Affected M5 module rerun after raw-header logging guard: **8 passed** |
| Actual PostgreSQL M1–M5 migration/functions/permissions | Initial **83 assertions passed**; affected M5 SQL checks broadened for retry exhaustion/outbox and separate adverse decision; final **95 passed** |
| Production frontend build | Passed: **272.49 kB JS / 85.20 kB gzip** |
| Foundation TypeScript | Passed, including BackgroundWorkspace and all earlier foundation components |
| Browser | **5 distinct scenarios passed**, including finalist consent → labelled mock ambiguity → explanation/hold → human consideration/review → consent revocation and typed policy authoring; original foundation/pipeline/identity/quiz scenarios passed |
| Script syntax | background_m5.py and updated retention_m1.py compiled successfully |

No failed initial checks. Only affected SQL/API checks were rerun when branch coverage and notification/header safeguards were completed; no repeated full backend/browser run. Existing Starlette httpx TestClient deprecation and browser NO_COLOR/FORCE_COLOR warnings do not alter results.

SQL covers verified role/MFA/assignment, purpose/version/employer/application consent, real capture activation, replay/request mismatch, private-table access denial, token leases, fabricated clear and official-success denial, candidate explanation/hold, mandatory attestation/consideration, separate CTOS Basic + CCRIS requirements, unavailable not adverse, explicit snapshotted admin exception, separate human advancement/shortlist/interview entry, post-shortlist dispute, consent/withdrawal cancellation and notifications, late-result quarantine replay, three-attempt exhaustion/dead-letter/unavailable notification, separately referenced human adverse decision, deletion leases/ledger, dispatch switch, revoked session and anon denial. Unbound legacy/background evidence cannot satisfy typed gates.

Backend fixtures verify providers never claim official clearance, no credential/real-capture/webhook input path, CSRF/MFA/validation, bounded PDF parsing/non-reflection/header logging, ciphertext stored instead of raw reports, session-bound downloads with scope/consent recheck, minimal normalized worker completion, and actual encrypted-object deletion in an isolated Storage fixture with crash/retry before metadata completion. No model parses reports. Browser API fixtures exercise actual React controls; they do not connect to Supabase.

PGlite runs the actual migrations and PostgreSQL permissions/functions against synthetic Auth/Storage schemas. It is serial WASM: real PostgREST wrapper grants, JWT/Auth/Storage, multi-connection concurrency, scheduled cleanup, hosted deletion/restore/proxy/cookies and quota measurement remain NOT_RUN. No live background report deletion or legal/provider access is claimed. Webhook signature/replay tests are not applicable because no webhook handler was implemented; vendor/webhook activation remains deferred. No blanket privacy compliance/fairness claim.

See [setup/demo/rollback](SETUP.md) for separate typed bank policy, synthetic reports, the worker, specialized retention and the remaining live gate. Official automatic CTOS/CCRIS/criminal integrations remain deferred under free-only. Real manual capture stays off pending approved release/legal/operational gates; service keys alone do not activate it.

Commands from app/ (once at phase completion; affected reruns for fixes):

```text
.venv/Scripts/python.exe -m pytest backend/tests/foundation -q
node tests/m5-sql.mjs
npm run build
npx tsc --noEmit --jsx react-jsx --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types vite/client src/app/foundation/api.ts src/app/foundation/ApplicationDashboard.tsx src/app/foundation/IdentityWorkspace.tsx src/app/foundation/QuizWorkspace.tsx src/app/foundation/BackgroundWorkspace.tsx src/app/foundation/Workspace.tsx
M1_BROWSER_CHANNEL=msedge npx playwright test
```
