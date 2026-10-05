# M8 phase-end gate

3 October 2026. Local implementation and functional gate PASSED. Public brand/hosted/sender/legal release checks remain DEFERRED. No deployment or remote migration was performed.

Construction completed before the following checks. Only the affected SQL check was rerun after its failure; earlier provider/model evals were not rerun.

| Check | Command / result |
| --- | --- |
| Affected backend | `.venv/Scripts/python.exe -m pytest backend/tests/foundation/test_interviews.py backend/tests/foundation/test_chat.py backend/tests/foundation/test_pipeline.py backend/tests/foundation/test_gateway.py -q` — 38 passed. Existing Starlette TestClient deprecation warning only |
| Actual PostgreSQL | `node tests/m8-sql.mjs` — 44 assertions passed, applying M1–M8 migrations in PGlite with synthetic Auth/Storage |
| Browser regression + M8 | `M1_BROWSER_CHANNEL=msedge npx playwright test` — all 8 distinct scenarios passed in installed Edge. M8 includes four candidate/HM × Classic/Luna WCAG axe scans, keyboard move/reset, minimize/taskbar draft preservation, 390px viewport, 200% CSS zoom, calendar link, confirmation and human scorecard/offer/acceptance/hire flow |
| TypeScript | `npx tsc --noEmit --jsx react-jsx --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types vite/client` with all foundation TSX files and api.ts — passed |
| Production build | `npm run build` — passed after unused MUI/Emotion removal |
| Production dependency audit | `npm audit --omit=dev` — 0 vulnerabilities |

Initial failures: SQL exposed an ambiguous PL/pgSQL application variable/table alias in booking change and scorecard lookup. Both aliases were corrected; SQL gate then passed. PowerShell passed a literal TSX wildcard to tsc; expanded explicit paths passed. The first audit could not reach its endpoint in the sandbox; the approved network retry passed. No backend/browser test failures occurred.

SQL covers staff MFA/assignment and candidate ownership, pre-interview gates, interviewer overlap and candidate overlap across jobs, reserved slots, stale revisions, candidate confirmation, rescheduling/reminder dedupe, cancellation/withdrawal, early/unauthorized scorecards, scorecard confidentiality, offer attestation, candidate acceptance and separate final human hire, revoked sessions and anonymous denial. Backend covers authenticated/CSRF DTO boundaries, aware timestamps, safe meeting links, private scoped ICS UTF-8 folding/escaping/revisions/cancellation and disabled sender, plus minimal scheduled-chat answers. Browser uses synthetic network fixtures; its scorecard time transition is mocked. The SQL test separately rejects scorecards before the slot ends.

Limits: serial PGlite assertions establish constraints and stale replay behavior, not multi-connection hosted concurrency proof. Axe is automated evidence, not complete accessibility certification. Hosted Auth/PostgREST/proxy, actual calendar imports/time-zone clients, concurrent slot/booking/withdrawal/offer races, scheduled retention and verified SMTP remain untested. The optional sender is explicitly disabled; no outbound delivery is claimed. KerjaOS remains provisional pending name/handle/legal clearance. Existing dev-only promptfoo/node-forge advisory remains recorded in M6; this production audit does not clear development dependencies.

See [setup and rollback](SETUP.md), [brand evidence](BRAND.md), and root progress/implementation plan for outstanding work. M9 integrated release is not started.
