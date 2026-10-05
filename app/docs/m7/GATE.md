# M7 phase-end gate — 3 October 2026

**Local functional M7 gate PASSED. Approved real-source/live Greenhouse feed gate and hosted service integration DEFERRED.** Source ownership/terms/redistribution approval remains open; collection defaults off. The user was asked for owned/permitted employer boards. No approved Malaysian market coverage is claimed. All tests began after local construction/docs/fixtures were complete. No deployment, remote migration, model call, application submission or paid service.

| Check | Actual evidence |
| --- | --- |
| Scoped foundation backend | Initial **100 passed**. Three additional M7 deadline/robots checks were added at the gate; affected discovery module **22 passed**, fractional robots/static parser **2 passed**, final timer/DNS/body/robots subset **4 passed**. **103 distinct checks** pass across these runs, including 24 M7 checks. Full suite was not rerun |
| Actual PostgreSQL M1–M7 migrations/functions/grants | Initial fixture failed before SQL execution due to duplicate JS variable name; corrected only the fixture. **57 passed**, then broadened affected quota/dead-letter, global active-lease/review-expiry and serialized personal-save checks: final **63 passed** |
| TypeScript | Foundation typecheck passed, including DiscoverWorkspace |
| Production frontend | Initial build passed 282.91 kB JS / 88.26 kB gzip. Affected accessible-control fix built: final **283.08 kB JS / 88.27 kB gzip** |
| Browser | Initial **6 passed / 1 failed** (external-status control accessible name). Corrected explicit labels; affected Discover scenario passed. Added literal malicious title and actual source-link popup/visit fixture; affected Discover passed. **7 distinct browser scenarios pass** across these runs |
| Optional static parser | Actual Scrapling 0.4.15 Selector processed synthetic JobPosting JSON-LD; no fetcher/browser/stealth/proxy extras installed. Optional dependencies pinned; pip check passed |
| Syntax | Operator discovery/smoke scripts and updated legacy registry/graph compiled without loading the unsafe legacy graph |
| Greenhouse documentation-demo live smoke | One bounded request: **unavailable**, **0.83 s**, no persistence. Example board reachability did not pass; no repeat live fetch |
| Lever documentation-demo live smoke | One bounded request: **11 normalized metadata rows**, complete=True, **1.59 s**, no persistence. This proves demo-feed access only, not employer approval/market coverage |

Technical smoke commands used public official documentation examples, printed counts only, and did not store or show real job titles/descriptions. Greenhouse fixtures prove normalization locally, but a valid approved real employer board is still needed for its live gate. No real career-page smoke is claimed because none is approved.

Coverage includes metadata-only normalization/canonical URL dedupe, query/tag ranking, synthetic/real separation, prospects and truncation handling, no false missing-job removal on partial results, stable source/provider IDs, complete-board removal and freshness expiry; robots deny/fractional delay/redirect recheck, per-host throttle/cache, 401/403/429 and persisted backoff, bounded response size, exact-host HTTPS/outgoing links, credentials/ports/private/mixed DNS/redirect SSRF denial and actual pinned-IP TLS construction, header/body socket deadline and slow-byte stream; lease replay/recovery/exhaustion/global one-active guard, five/day budget and late kill quarantine; private table/API/CSRF/schema/session ownership, separate saved/tracker notes, visit never overwrites applied/note state, cross-candidate isolation and explicit forgetting; frontend malicious title stays literal text, source popup is safe and intercepted offline, and EN/BM external self-report wording. External tracking leaves internal applications count unchanged.

PGlite is serial WASM with synthetic Supabase schemas; browser API/network source routes are fixtures. Real Auth/PostgREST/proxy, multi-connection daily-budget/lease/personal-cap contention, source permission and robots review, scheduling/credit/CPU/DNS timing and backup/restore/DSAR release remain NOT_RUN. The network timer cannot interrupt the operating system's DNS resolver itself; it prevents a late DNS result from starting a connection. Treat this as a hosted operational measurement prerequisite, not an unlimited background daemon.

No frontend dependency changed in M7. M6's remaining development-only node-forge → jks-js → promptfoo advisory chain is still recorded in docs/m6/GATE.md; M7 did not repeat its unchanged audit or promptfoo suite. Existing Starlette/lxml and Node color warnings do not change recorded results. Optional embeddings, JobSpy and agent-reach runtime are not enabled.

Commands from app/ at construction completion; affected reruns only:

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests/foundation -q
node tests/m7-sql.mjs
npx.cmd tsc --noEmit --jsx react-jsx --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types vite/client src/app/foundation/api.ts src/app/foundation/ApplicationDashboard.tsx src/app/foundation/IdentityWorkspace.tsx src/app/foundation/QuizWorkspace.tsx src/app/foundation/BackgroundWorkspace.tsx src/app/foundation/ChatWorkspace.tsx src/app/foundation/DiscoverWorkspace.tsx src/app/foundation/Workspace.tsx
npm.cmd run build
$env:M1_BROWSER_CHANNEL='msedge'
npx.cmd playwright test
.\.venv\Scripts\python.exe backend/scripts/discovery_smoke_m7.py --adapter greenhouse
.\.venv\Scripts\python.exe backend/scripts/discovery_smoke_m7.py --adapter lever
.\.venv\Scripts\python.exe -m pip check
```

[Setup/demo/rollback](SETUP.md) · [Source review register](SOURCES.md). Full M7 remains IN_PROGRESS — local complete / source-live DEFERRED. M8 has not started.
