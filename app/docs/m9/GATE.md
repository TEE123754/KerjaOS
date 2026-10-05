# M9 local composite release gate

3 October 2026 (Asia/Kuala_Lumpur). Local synthetic implementation and composite functional gate PASSED. Full M9 release remains IN_PROGRESS: no hosted deployment, remote migration, real-data/account legal approval or measured hosting budget.

All local construction was completed before the gate. One integrated gate was attempted; failure fixes used affected checks only. The backend scope was completed in subsets after initial legacy collection failure, not repeatedly rerun in full.

| Check | Actual result |
| --- | --- |
| Clean frontend install | `PUPPETEER_SKIP_DOWNLOAD=true npm ci --no-audit --no-fund` — 1071 packages installed; no browser download |
| Backend regression | Initial `python -m pytest backend/tests -q` could not collect 10 legacy modules due missing openai. Installed local-only pinned regression dependencies. Foundation suite 109 passed; retained legacy 28 tests had 25 passed/3 outdated expectations, then affected three files passed all 13 tests after alignment. Three additional paired-resume acceptance checks passed. **140 distinct backend tests passed across the completed scope**, not a claim of a final single 140-test invocation |
| PostgreSQL gates | M1 27, M2 60, M3 54, M4 88, M5 95, M6 40, M7 63, M8 44, M9 62: **533 assertions passed** using actual offline PostgreSQL and synthetic Auth/Storage. M9 includes 14 scoped export sections, request idempotency/BOLA/session guards, service-only erasure, document tombstone capture, actual database snapshot encrypted with a synthetic encrypted object, reopen/restoration and post-backup private-data erasure replay |
| Browser integrated invocation | `M1_BROWSER_CHANNEL=msedge npx playwright test` — **9 scenarios passed**, 43.0 seconds, including A/X A/Y B/X isolation, private practice, identity correction/manual review, background dispute/review, chat authorization, discovery, human interview/offer/acceptance/hire and privacy request/export links. Six axe scans: candidate/HM × two themes and privacy × two themes; keyboard/mobile/zoom/draft checks passed |
| Offline golden prompts | 11/11 promptfoo EN/BM/read-only/injection/authorization cases passed; no external model, telemetry disabled, concurrency one |
| Synthetic paired checks | Three quiz pairs: equal objective scores, subjective human review remains pending. Three retained deterministic matching resume pairs: equal qualifications yield equal scores/breakdown. Tiny fixtures only; no representative fairness, calibrated acceptance probability or human-bias claim. FAIRNESS.json and RESUME_FAIRNESS.json |
| TypeScript/build | All foundation TSX + api.ts explicit-path typecheck passed; production Vite build passed (51 modules, 3.02 seconds). JS 300.76 kB / gzip 92.95 kB, CSS 113.43 kB / gzip 18.94 kB |
| Dependencies/artifacts | pip check passed; compileall foundation/scripts passed; production npm audit 0. Production lock/license inventory generated. Six public files scanned for private-key/Supabase-secret/OpenRouter-key/JWT patterns; zero suspect files. Pattern scan does not prove no secrets in all history/runtime logs |

Failure history:

- Initial full pytest collection lacked retained legacy SDK/email-validation dependencies. Added backend/requirements-m9-regression.txt for local test tooling; lean production/Docker dependency set unchanged. Dependency installation allowed foundation/legacy scope completion.
- Three legacy failures expected autonomous email sending/old schedule-policy message or mocked is_smtp_configured while code uses smtp_status. Revised tests to assert blocked side effects/no sender call and truthful disabled status; no security guard was weakened. Affected files only rerun.
- Clean npm ci was mistakenly started concurrently with SQL checks, so removal of node_modules interrupted M5 dependency lookup. M1–M4 passed beforehand. After clean install completed, M5–M9 resumed and passed; M1–M4 were not rerun.
- Promptfoo's sandbox OS user-profile lookup failed (uv_os_get_passwd ENOMEM). Approved local tooling retry outside sandbox passed all 11 fixtures; external AI and telemetry stayed off.
- Added paired-resume acceptance coverage after checking that the initial fairness fixture covered quiz answers only. Ran only those three new checks; no product code changes or broad gate reruns.

Limits: browser network fixtures are multiple focused journeys, not a continuous hosted real-service journey. Serial PostgreSQL is not multi-connection contention proof. The encrypted PGlite snapshot/object rehearsal does not replace hosted pg_dump/Auth/Storage recovery or automatically reconcile all post-backup consent/business history. Live signed files/cookie/OAuth/proxy, source approvals/collection, scheduler availability, complete account erasure/manual access review, public contact/brand/legal/transfer/retention and hosting cost/eligibility remain pending. Unknown/legacy/model licenses and the previously recorded development promptfoo/node-forge advisory are not cleared by production audit. No paid fallback or outbound email was invoked.

See RELEASE.md, PRIVACY.md, OPERATIONS.md, BUDGET.md and DEMO.md for exact setup, limits, remaining gates and secure rollback. Root plan/checklist remain synchronized; 9 local implementations/composite gates are complete, 0 fully hosted/release-validated phases.
