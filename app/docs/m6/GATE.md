# M6 phase-end gate — 2 October 2026

**Local functional M6 gate PASSED; hosted integration and actual zero-price/privacy-compatible inference DEFERRED.** Construction was complete before tests. No remote migration, real data, model call or paid service was used. Working revision is uncommitted; M1–M5 work is preserved.

| Check | Evidence |
| --- | --- |
| Foundation backend | Initial 78 passed / 1 failed (79 distinct). Fixed mutation-intent routing; affected M6 module 20 passed. All 79 distinct checks now pass across these runs; no full-suite rerun |
| Actual PostgreSQL migrations M1–M6 | 40 M6 assertions passed against synthetic Auth/Storage and serial PGlite |
| Frontend | Typecheck passed; production build 275.78 kB JS / 86.16 kB gzip |
| Browser | Six distinct Edge scenarios passed, including candidate ambiguity/ownership, EN/BM FAQ fallback and assigned staff aggregates |
| Offline promptfoo | Initial 11 failures from JavaScript assertion syntax, with handler outputs present; fixed expression wrapper, affected local evaluation 11/11 passed. No external inference; 0 model tokens |
| Syntax | Chat retention script and legacy registry/graph compiled without loading legacy graph dependencies |
| Dependencies | Production npm audit 0. Patched basic-ftp to 6.2.1. Full dev audit retains 3 high package entries in one node-forge → jks-js → promptfoo chain |

The node-forge advisory GHSA-86w9-cpqp-85rv affects versions through the current registry latest 1.4.0; no patched version was available at this gate. The pinned promptfoo tool is used only with local synthetic Python fixtures, not JKS/certificate inputs, and is absent from the production frontend and Python backend. This limitation remains open for dependency maintenance; do not claim a clean full development audit. Install skipped the unnecessary bundled Chromium download after it stalled; browser checks used installed Edge.

Coverage: explicit owner BOLA/IDOR including staff in candidate scope, verified MFA/role/assignment, arbitrary/forged tools and schema rejection, prompt/role injection with inert stored titles, unauthorized email/UUID selectors, ambiguous targets, read-only changes denied, EN/BM approved FAQs, factual UUID/timestamp citations, data-service failures without fabricated progress, unknown model/provider and invalid JSON/cost, nonzero prices before generation, timeout/429/outage/circuit, missing key/privacy approval without HTTP, global DB reservation quota, private metadata/table denial, completion replay and expired purge/session revocation. Request content is absent from metadata and gateway payloads.

PGlite is serial WASM and browser APIs are fixtures. Live Auth/PostgREST/RLS/Storage/proxy, actual provider compatibility, multi-connection quota contention, scheduled idle-period metadata purge and restore remain NOT_RUN. Circuit state is per API process; global call budget is in PostgreSQL. User-scoped trace labels are operational metadata, not authoritative decision auditing. Existing Starlette and Node color/decompression warnings do not alter the recorded results.

Commands from app/, after construction; affected reruns only after fixes:

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests/foundation -q
node tests/m6-sql.mjs
npm.cmd run build
npx.cmd tsc --noEmit --jsx react-jsx --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types vite/client src/app/foundation/api.ts src/app/foundation/ApplicationDashboard.tsx src/app/foundation/IdentityWorkspace.tsx src/app/foundation/QuizWorkspace.tsx src/app/foundation/BackgroundWorkspace.tsx src/app/foundation/ChatWorkspace.tsx src/app/foundation/Workspace.tsx
$env:M1_BROWSER_CHANNEL='msedge'
npx.cmd playwright test
$env:PROMPTFOO_DISABLE_TELEMETRY='1'
$env:PROMPTFOO_PYTHON=(Resolve-Path '.venv/Scripts/python.exe').Path
$env:PROMPTFOO_CONFIG_DIR=Join-Path (Get-Location) 'test-results/promptfoo'
$env:EXTERNAL_LLM_ENABLED='false'
.\node_modules\.bin\promptfoo.cmd eval -c tests/promptfoo/m6/promptfooconfig.json --no-table -o test-results/m6-promptfoo.json
npm.cmd audit --omit=dev --json
```

Ignored local reports: test-results/m6-promptfoo.json and test-results/m6-audit.json. Fixture configuration and provider are committed-source candidates under tests/promptfoo/m6. See [setup/demo/rollback](SETUP.md). M7 has not started.
