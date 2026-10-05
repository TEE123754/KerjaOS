# M1 gate evidence — 2 October 2026

Base checkout: `be3bf1de3451d266d923089785c9479ce6e4add3`. Results refer to the local working tree, not a deployed release. Mode: `demo_free`; external AI, legacy API, paid checks and outbound recruitment email are disabled.

**Local gate: PASSED for the checks below. Overall M1: IN_PROGRESS; mandatory live gates remain NOT_RUN.** No migration, backfill, backup, deployment or credential rotation was performed against an external project. No real candidate data was used.

## Executed checks

| Check | Command / evidence | Actual result |
| --- | --- | --- |
| Backend boundary suite | `.venv/Scripts/python.exe -m pytest backend/tests/foundation -q` | Initial 14 tests passed; no failures |
| Targeted gate hardening | Same suite with `-k 'resume_encrypted or expired_document or mfa_rotates or verified_recovery or chunked or modern_api or upstream_database'` | 7 passed, 13 deselected; includes 6 new checks and 1 affected original test. **20 distinct backend tests passed across the gate** |
| SQL/RLS | `node tests/m1-sql.mjs` | Initial 24 assertions passed; affected rerun after direct-read revocation hardening: **27 passed** |
| Frontend production build | `npm run build` | Passed with Vite 6.4.3 after security patches and affected UI fixes; final JS 224.16 kB, gzip 72.05 kB |
| Browser | `M1_BROWSER_CHANNEL=msedge npx playwright test` (set env using your shell) | **1 passed**; final affected rerun 1 passed, no retries |
| Dependency audit | `npm audit --json`, compatible patches, explicit Vite 6.4.3 / React Router 7.18.4 updates | Initial 9 findings (1 critical, 5 high, 2 moderate, 1 low); final install audit reports **0 known vulnerabilities** |
| Python dependency consistency | `.venv/Scripts/python.exe -m pip check` | No broken requirements |
| Operator/foundation syntax | `.venv/Scripts/python.exe -m compileall -q backend/app/foundation backend/scripts` | Passed |
| Active source/build scan | Reviewed credential-pattern scan over foundation Python, main.py and final JS | 11 files, 0 credential-pattern hits; this is a scoped heuristic, not a certified secret audit |

The first sandboxed build could not read the Vite configuration because esbuild traversed a denied parent directory. The permitted outside-sandbox retry passed. Downloading Playwright Chromium failed with network timeouts; installed Edge ran the browser gate successfully. Neither infrastructure issue was recorded as an application pass.

Starlette reports a deprecation warning for its httpx TestClient integration; the fixture tests pass. Browser tooling emits a harmless NO_COLOR/FORCE_COLOR warning.

## Coverage and limits

Python checks use a fake Supabase network adapter. They cover verified-account denial, server cookie/no browser tokens, CSRF/exact CORS, logout/upstream session revocation, refresh contention/expiry, guessed UUID denial, staff AAL1 denial and AAL2 session rotation, proof-of-inbox recovery and own-password replacement, encrypted PDF upload, owner/session-bound links and expiry, payload limits, bounded SSE, legacy collision reconciliation and local EN/BM text redaction. Gateway tests cover modern API-key headers and safe upstream error mapping.

PGlite executes the actual migration/RLS/functions in a PostgreSQL WASM engine with synthetic auth/storage schemas. It omits only the unavailable pgcrypto extension installation; UUID generation is built into PostgreSQL. Checks cover three distinct A/X, A/Y, B/X applications, idempotency, conflicting keys/duplicates, candidate isolation, no direct mutations/private sessions/legacy-table access, AAL2/assignment/membership guards, unavailable shortlist prerequisites, human rejection with atomic event/outbox, and revoked-session denial of private reads/writes. It is not a hosted Supabase integration test or a concurrency benchmark.

The browser intercepts API responses with labelled fixtures. It proves root/old-link routing, legacy localStorage cleanup, login/apply/logout rendering, CSRF forwarding, duplicate button prevention and EN/BM scaffold. It does not prove real OAuth, cookie proxying, MFA delivery, private Storage or cross-employer browser isolation on deployed services.

Operator backup/import/retention scripts and queue code are present and syntax-checked. Live backup integrity, restore, data-count reconciliation, object deletion and concurrent/crashed worker behaviour have not been exercised. Do not treat the scripts as evidence those operations succeeded.

## Required remaining M1 work

- Select and privately configure the test Supabase, Railway and Vercel projects. Replace the Railway placeholder in vercel.json; configure exact origins, secure cookies, callback URLs and optional email sender.
- Obtain encrypted complete DB/object backup and demonstrate isolated restore. pg_dump/pg_restore and a PostgreSQL connection are not available in this session.
- Run the reviewed encrypted reconciliation dry run, resolve every conflict/unmatched record, apply the additive migration/backfill and reconcile counts/history. Original rows must remain intact.
- Validate actual Auth/password recovery/Google PKCE/MFA/refresh revocation, current Data API grants/RLS and private Storage denial/expiry. Rotate deployed demo credentials/keys where applicable.
- Execute the real A/X, A/Y, B/X isolation demo and Vercel-to-Railway cookie/CSRF/SSE smoke. Check platform log redaction and configured trusted-proxy rate limits.
- Exercise leased queue crash/retry/dead-letter handling and actual retention deletion on synthetic objects. Confirm that cleanup runs within the promised window.
- Measure idle/warm memory, recurring Railway credit usage and Vercel free-use eligibility. No hosting affordability measurement or commercial eligibility is claimed.

See [SETUP.md](SETUP.md) for configuration, demo and secure rollback. Root IMPLEMENTATION_PLAN.md and PROGRESS.md remain unchecked for overall M1 completion. M2 has not started.
