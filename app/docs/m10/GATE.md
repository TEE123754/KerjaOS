# M10 gate — 5 October 2026

Local affected gate **PASSED**. M10 whole release remains IN_PROGRESS; hosted checks are DEFERRED. Construction completed before tests. No deployment, remote migration, new dependency, real candidate upload, paid provider, email or scheduler activation.

## Passed evidence

- Backend: 38 tests, `backend/tests/foundation/test_tracker.py`, `test_boundary.py`, `test_pipeline.py`, `test_release.py` (`python -m pytest ... -q`). Includes candidate-token/CSRF/extra-field boundaries, normalized unsafe links, real synthetic PDF encryption/owner-session preview expiry, independent encrypted cloning/race handling and object-delete-before-complete cleanup.
- PostgreSQL/PGlite: 67 assertions, `node tests/m10-sql.mjs`, applies actual M1–M10 migrations. A/X A/Y B/X/foreign staff scopes, manual revisions/duplicate/archive/date/history, library service-only readiness, operation-key retry, frozen snapshot/withdrawal race, export/private erasure/leases/tombstones and isolated M10 snapshot restore/replay. This is not a hosted concurrency test.
- Browser: six distinct Edge scenarios: tracker, foundation, pipeline, discovery, interviews and release. Five affected existing journeys passed together; repaired tracker passed in its focused rerun. New journey covers owned company/manual/resume links, unchanged internal outcomes, B isolation, mounted drafts, signed-preview UI, retirement retaining copies, forget, EN/BM, 390px mobile width and Classic/Luna WCAG axe scans (zero violations). Fixture API responses do not prove hosted services.
- TypeScript foundation no-emit check passed. Vite production build passed: 52 modules; JS 316.91 kB / gzip 96.92 kB, CSS 113.43 kB / gzip 18.94 kB. Modified Python module/script syntax passed. No new packages; unchanged M9 production audit/offline model evidence was not rerun.

## Gate repairs and affected reruns

Initial gate found a missing SQL resume object-key value and two extra JSX parentheses; fixed and reran failed SQL/frontend checks. New browser fixture spread overwrote generated company UUID with null; fixed fixture ordering. Reset native resume file picker after successful upload to match React file state and asserted the reset. Reran tracker browser and frontend typecheck/build only; did not repeat passing backend/SQL/five other browser checks. Filesystem-restricted Vite/Edge startup failed before execution; approved existing build/Playwright command escalation completed the affected checks.

## Remaining release checks

- Owner-provided Supabase/backend configuration, backed-up remote migration and isolated hosted restore/backfill.
- Real Auth/PostgREST/RLS/Storage/private object and session/proxy behavior.
- Multiple database connections for clone-vs-screen/withdrawal/revision and worker lease races.
- Configured bounded cleanup scheduling, archive inventory and newest-ledger/consent/business reconciliation rehearsal.
- Reviewed retention/metadata/tombstone/legal policy before real files; whole account disposition remains manual.

Setup/demo/rollback: [SETUP.md](SETUP.md). M11 analytics and M12 general follow-up reminders/email are NOT_STARTED. Earlier M1–M9 hosted/legal/source/provider gates remain deferred.
