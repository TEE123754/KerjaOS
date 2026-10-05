# M11 gate — 5 October 2026

Local affected gate **PASSED**. Whole hosted release remains IN_PROGRESS / DEFERRED. Construction completed before testing. No new dependencies, remote migration/deployment, real candidate data, external analytics/model, email or scheduler activation.

## Evidence and commands

- Backend: **23 passed**, `.venv/Scripts/python.exe -m pytest backend/tests/foundation/test_analytics.py backend/tests/foundation/test_boundary.py backend/tests/foundation/test_release.py -q` (1.82 s). Candidate JWT forwarding without service credentials, unauthenticated denial, staff/export permission failures, IANA/range/schema guards, no-store, disabled reads/exports and CSV formula neutralization/JSON scopes. SQL supplies actual database authorization evidence; facade network responses are fixtures.
- PostgreSQL/PGlite: **58 assertions passed**, `node tests/m11-sql.mjs`, actual M1–M11 migrations. A/X A/Y B/X isolation; assigned-X MFA HM excluding Y/private data; DST/IANA boundaries and explicit manual dates; unknown dates/archived/manual/source/company separation; known vs unknown ages; repeated observed stage entries deduplicated; closure distinct from rejection; canonical accepted offer counted as offer with zero hires; actual synthetic confirmed booking counted as interview; direct private observation write/read, anonymous, invalid dates/zone/job scope, revoked session denial; 20,001 observed entries rejected; private observation portability with existing export sections preserved.
- Browser: **4 distinct scenarios passed**, `M1_BROWSER_CHANNEL=msedge npx.cmd playwright test tests/browser/analytics.spec.ts tests/browser/foundation.spec.ts tests/browser/release.spec.ts tests/browser/tracker.spec.ts` (21.3 s). New scenario contains A/B/aal2 HM, no candidate staff option, provenance/unknown dates/empty data, export filters preserved during unsaved edits, EN/BM and 390 px width. Four new loaded-analytics axe scans (candidate and HM × Classic/Luna) had zero WCAG violations; existing privacy/tracker scans also passed. Table-backed bars retain visible counts and keyboard-focusable scrolling tables. Browser API fixtures do not prove hosted services.
- Foundation TypeScript no-emit check passed. Vite production build passed: 53 modules in 1.11 s; JS **325.91 kB / gzip 99.52 kB**, CSS **113.78 kB / gzip 19.03 kB**. JS gzip increases 2.60 kB over M10. No dependency change, so earlier production audit and unrelated model evals were not repeated.
- Modified analytics/server/release Python syntax compiled successfully.
- Five bounded small synthetic B/X queries measured **16.81, 15.82, 15.53, 15.56, 15.59 ms** in PGlite. This is a small local WASM fixture, not hosted latency/capacity proof. Larger hosted query/index/timeout/response limits remain deferred. Record budget is capped at 10,000 matching records; observation cap at 20,000; company chart top 50 with omission count; no truncated totals accepted.

## Repairs and rerun scope

Initial SQL gate rejected the bare `day` alias; changed it to explicit quoted alias. Next SQL run rejected a booking fixture using HM's unassigned Y job through the existing M8 slot guard. Changed the fixture to assigned X/A-X. Two SQL-only reruns then passed; backend/browser/typecheck/build were already passing and were not repeated. Vite/Edge used approved existing command escalation for filesystem restrictions. No skipped checks reported as passing.

## Remaining hosted checks

- Owner-supplied Supabase/backend settings; backed-up additive migration and isolated restore.
- Actual Auth/PostgREST/RLS assigned-role/MFA/session revocation behavior and membership/assignment changes during reports.
- Real Postgres query/index/response limits, multi-connection changes, timeout behavior and free hosting budgets.
- Reviewed observation/application retention, privacy/legal contact and full account disposition before real data.

Setup/metric definitions/demo/rollback: [SETUP.md](SETUP.md). M12 reminders/optional email remains NOT_STARTED. Earlier phase hosted/legal gates remain deferred. No Git commit created; all changes are local workspace files.
