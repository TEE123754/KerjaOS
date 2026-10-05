# M2 gate — construction record

2 October 2026 (Asia/Kuala_Lumpur). User authorized local M2 while providing Supabase/Railway/Vercel keys later. M1 local checks passed; its hosted gates remain deferred.

Implementation: pipeline transition RPC with actor/version/idempotency/evidence guards; immutable policy/profile/resume snapshots; candidate-owned lists and UUID history; assigned staff queues/private notes/resume review; withdrawal/reopen/job closure; P6 interview entry; EN/BM dashboard, filtering/pagination/deadlines and bounded refresh. Unsafe legacy graph mutations remain retired; read-only future graph context is bound to the canonical UUID and user token.

**Local M2 gate: PASSED. Live integration: DEFERRED by user until service configuration is supplied.** Tests ran only after local construction finished; subsequent checks were limited to affected failures or guards. Fixtures are not real identity/background verification.

| Check | Actual result |
| --- | --- |
| Scoped backend suite (foundation + pipeline) | **33 passed**, one Starlette TestClient deprecation warning. Includes 20 existing foundation tests and 13 M2 cases |
| Actual migration/functions/RLS in synthetic PostgreSQL | Initial **52 assertions passed**; affected SQL rerun after pause/action restoration and interview-entry/consent/background hardening: **60 passed** |
| Frontend production build | **Passed**, Vite 6.4.3; final JS 234.31 kB / gzip 75.37 kB |
| Foundation TypeScript check | Initial invocation lacked CSS declarations (TS2882). Corrected invocation with `--types vite/client` **passed**; no production-code change was needed |
| Browser scenarios on installed Edge | Existing M1 scenario passed. M2 scenario initially failed because its bilingual selector matched both card and history; exact selector corrected, then **only M2 scenario rerun: 1 passed**. Both distinct scenarios have passing evidence |

The browser scenario demonstrates A/X, A/Y, B/X, assigned HM advancement/hold, independent candidate reload/history, EN/BM stage labels and guessed UUID denial. SQL additionally checks candidate/staff permissions, missing/expired/revoked requirements, mock/non-demo separation, policy snapshots, resume freeze, allowed skips, explicit admin exceptions/current consent versions, replay/key conflict/stale versions, private-note separation, withdrawal/reopen, job closure, shortlist outbox/history and terminal scheduling denial.

Planned gate commands from app/:

```text
.venv/Scripts/python.exe -m pytest backend/tests/foundation -q
node tests/m2-sql.mjs
npm run build
npx tsc --noEmit --jsx react-jsx --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types vite/client src/app/foundation/api.ts src/app/foundation/ApplicationDashboard.tsx src/app/foundation/Workspace.tsx
M1_BROWSER_CHANNEL=msedge npx playwright test
```

PostgreSQL fixtures use PGlite and apply M1 then M2. It executes actual policies/functions with synthetic Auth/Storage schema and skips only pgcrypto extension installation. Burst/stale-version checks use PGlite's serialized engine; real multi-connection lock contention and deployed provider behaviour remain live checks. Browser API interception tests UI/client isolation; backend and SQL tests separately validate server boundaries and database permissions.

See SETUP.md for demo and rollback. Real service keys must remain in private local/server env settings. No external migration or deployment has been run. Keys/configuration, M1 backup/restore/backfill, live Auth/RLS/Storage/proxy smoke, real multi-connection contention and free hosting measurements remain pending. M3 has not started. No dependency changes were made in M2; M1's audited lockfiles were retained.
