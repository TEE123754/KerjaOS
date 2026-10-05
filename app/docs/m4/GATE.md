# M4 phase-end gate — 2 October 2026

**Local M4 gate PASSED. Hosted services, migrations/deployment and actual multi-connection contention remain DEFERRED.** Construction completed before testing; only affected checks reran after gate fixes. Synthetic fixtures only; no keys, real candidates, external model or paid service used.

| Check | Actual evidence |
| --- | --- |
| Backend foundation regression | **51 passed** (includes ten M4 API/readiness fixtures). Affected M4 module rerun after timeout endpoint: **10 passed**. Existing TestClient httpx deprecation warning |
| Actual M1–M4 migrations/functions/RLS | Initial failure exposed ambiguous SQL variable/column references, then a quoted fragment in a generated identifier. Corrected references and explicit allowlisted mode formatting. Affected M4 SQL gate: 79, then 83, final **88 assertions passed** after consistent application→attempt lock ordering, extra isolation/revocation/feature switch checks and abandoned timeout action |
| Frontend build | Passed; affected final build after timeout button: **260.08 kB JS / 82.12 kB gzip** |
| TypeScript | Foundation files including QuizWorkspace passed; affected M4/Workspace recheck passed |
| Focused browser scenarios | **4 distinct scenarios passed** (foundation, multi-application pipeline, identity, quiz). Only affected quiz scenario reran after timeout control: **1 passed**. Existing NO_COLOR/FORCE_COLOR warning |

Coverage: distinct real/practice banks and attempts, published rubric/competency versions, answer-key stripping and direct-table denial, user-JWT/CSRF/MFA boundaries, private practice owner vs other candidate/assigned HM, random persisted selected set/reconnect answers, stale revisions, server-clock timeout ignoring late payload/manipulated revision, idempotent submission, bounded deterministic scores, EN/BM reports/golden prompts and resume/answer injection strings treated as inert inputs, subjective missing feedback/partial answers, human approval without automatic stage/rejection, real retake permission/consumption/superseded evidence, additional-time guard, abandoned timeout finalization, identity revocation composition and revoked reviewer assignment/session denial. No practice ID can supply real evidence; even legacy unbound quiz evidence cannot unlock P3.

PGlite runs actual PostgreSQL migration/functions with synthetic Supabase Auth/Storage schemas. It does not exercise real PostgREST schema/grants deployment, Supabase JWT/Storage or concurrent database connections. Browser API fixtures test real React controls and persistence/reconnect flow, not a live service. Backend tests check API forwarding/validation and deterministic reports, not model accuracy. M4 adds no dependency/model/service keys. Optional model grading remains absent/off.

Configured live gate still required: backed-up migrations/restore; real Auth/PostgREST cross-role isolation/keys, concurrency/deadline/retake/closure/withdrawal races, deployed proxy/cookie/reconnect/timeouts, operational limits. Preserve M1–M3 legal/identity-retention requirements. No fairness/calibration/official verification/production claim is made. See SETUP.md for demo, limitations and server-only rollback switches.

Commands (from app/, run once at phase completion; use affected reruns for fixes):

```text
.venv/Scripts/python.exe -m pytest backend/tests/foundation -q
node tests/m4-sql.mjs
npm run build
npx tsc --noEmit --jsx react-jsx --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types vite/client src/app/foundation/api.ts src/app/foundation/ApplicationDashboard.tsx src/app/foundation/IdentityWorkspace.tsx src/app/foundation/QuizWorkspace.tsx src/app/foundation/Workspace.tsx
M1_BROWSER_CHANNEL=msedge npx playwright test
```
