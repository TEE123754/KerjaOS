# KerjaOS — Living Progress Checklist

Last updated: **5 October 2026 (Asia/Kuala_Lumpur)**.

Current phase: **L1 IN_PROGRESS — local credentials and bounded Morpheus adapter built; SQL access/migrations and full Supabase journeys pending. Deployment remains final D1.**
Implementation progress: **12 of 12 planned local implementations/composite functional gates complete; 0 of 12 fully validated release phases complete**. M1–M12 local work is complete. Remaining L1 integration, L2 readiness and D1 final deployment are tracked separately below.
M1–M12 local functional gates passed (M9 composite scope; M10–M12 affected scope; hosted continuous journey remains pending). Hosted Auth/Storage/proxy, backup/restore/backfill, worker scheduling/contention and real-data legal approval remain deferred until configured.

Documents: [PRD](PRD.md) · [Implementation plan](IMPLEMENTATION_PLAN.md) · [Original input](Kerja.md).
Reviewed source baseline: `main` at `be3bf1de3451d266d923089785c9479ce6e4add3`; this SHA is a planning reference, not an implemented-release SHA.

## How to keep this file current

1. Read this file and the active phase in IMPLEMENTATION_PLAN at each coding-session start.
2. Use statuses `NOT_STARTED`, `IN_PROGRESS`, `READY_FOR_GATE`, `DONE`, `BLOCKED`, `DEFERRED`. Do not substitute “mostly done” for a passed gate.
3. Check a task only after its deliverable exists. Add commit/path/decision evidence to its phase note. Building a test is different from running it.
4. Update after a meaningful task, a blocker, a scope change, and phase completion; no update or full test run is needed after every tiny edit.
5. **Run tests when the active phase is implementation-complete.** Repair gate failures and rerun only affected checks. Save one integrated release run for M9. Do not rerun all tests on every change.
6. Record actual gate result and evidence. `NOT_RUN`, `SKIPPED` and provider mocks are not passing live integrations.
7. `DONE` requires all mandatory tasks and the gate to pass, docs/env updates and a runnable demo. Explicit deferred integrations stay in the deferred section and never become checked “live” features.
8. Add dated log entries below; retain previous evidence rather than overwriting a failure with “passed.” Update PRD/plan alongside a material decision change.

Progress percentage, if needed: completed implementation phases / 12. Preserve historical M1–M9 baseline evidence; newly planned phases are not completed product features. Avoid counting planning checkboxes as completed product features.

## Phase overview

| Phase | Status | Gate | Evidence / result |
| --- | --- | --- | --- |
| M0 Planning | DONE | Document review | Local PRD, plan and this checklist created; repository/service sources reviewed |
| M1 Security + canonical applications | IN_PROGRESS | Local PASSED / live NOT_RUN | 20 distinct backend tests, 27 SQL/RLS assertions, 1 browser scenario and build passed; app/docs/m1/GATE.md; external configuration-dependent gates pending |
| M2 State machine + dashboard | IN_PROGRESS — local complete | Local PASSED / live DEFERRED | 33 backend tests, 60 SQL assertions, 2 distinct browser scenarios, build/typecheck; app/docs/m2/GATE.md. User will supply keys later |
| M3 Identity review | IN_PROGRESS — local complete | Local PASSED / live/legal DEFERRED | 41 backend tests, 54 SQL assertions, 3 browser scenarios, build/typecheck; app/docs/m3/GATE.md. No real identity capture or remote migration |
| M4 Quiz + readiness practice | IN_PROGRESS — local complete | Local PASSED / live DEFERRED | 51 backend tests, 88 SQL assertions, 4 browser scenarios, build/typecheck; app/docs/m4/GATE.md |
| M5 Background evidence/mocks | IN_PROGRESS — local complete | Local PASSED / live/legal DEFERRED | 59 backend tests, 95 SQL assertions, 5 browser scenarios, build/typecheck; app/docs/m5/GATE.md |
| M6 Gateway + chatbot | IN_PROGRESS — local complete | Local PASSED / live DEFERRED | 79 distinct backend tests, 40 SQL assertions, 6 browser scenarios, 11 offline prompt fixtures, build/typecheck; app/docs/m6/GATE.md; dev-only advisory recorded |
| M7 Job discovery | IN_PROGRESS — local complete | Local PASSED / source-live DEFERRED | 103 distinct backend tests, 63 SQL assertions, 7 browser scenarios, build/typecheck; Lever demo 11 rows, Greenhouse demo unavailable; app/docs/m7/GATE.md |
| M8 Brand + retro UI + scheduling | IN_PROGRESS — local complete | Local PASSED / hosted/public brand/sender DEFERRED | 38 affected backend tests, 44 PostgreSQL assertions, 8 browser scenarios including four axe scans, build/typecheck and production audit 0; app/docs/m8/GATE.md |
| M9 Integrated release | IN_PROGRESS — local complete | Local composite PASSED / hosted release DEFERRED | 140 distinct backend tests across completed scope, 533 SQL assertions across M1–M9, 9 browser scenarios, 11 offline prompts, paired resume/quiz checks, clean npm install, build/typecheck and artifact audit; app/docs/m9/GATE.md |
| M10 Unified tracker + resumes/companies | IN_PROGRESS — local complete | Local affected PASSED / hosted DEFERRED | 38 backend tests, 67 PostgreSQL assertions, 6 browser journeys, typecheck/build and script syntax; app/docs/m10/GATE.md |
| M11 Scoped analytics dashboard | IN_PROGRESS — local complete | Local affected PASSED / hosted DEFERRED | 23 backend tests, 58 SQL assertions, 4 browser journeys/four new analytics axe scans, typecheck/build/syntax; query/bundle evidence in app/docs/m11/GATE.md |
| M12 Follow-up reminders + optional email | IN_PROGRESS — local complete | Local affected PASSED / hosted SMTP/scheduler DEFERRED | 28 backend tests, 87 SQL assertions, 5 browser journeys including focused analytics timeout diagnosis, typecheck/build/syntax; app/docs/m12/GATE.md. No live email |

## Remaining work order — local first

User decision: frontend/backend remain on localhost. Supabase may serve development Auth/database/private Storage. Deployment to Vercel/Railway and hosted scheduler activation are reserved for final D1. API keys do not by themselves configure SQL migration/backup access, verified accounts/OAuth or external providers.

Detailed done/left/gate tasks: IMPLEMENTATION_PLAN.md section 16. Each phase builds first, tests at its completion gate, then only affected reruns.

| Stage | Status | Next / remaining work |
| --- | --- | --- |
| L1 Supabase-connected local integration | IN_PROGRESS — configuration slice PASSED | Keys/encryption configured, bounded Morpheus live smoke valid and local processes/proxy running. Missing Supabase schema/private bucket; next project/SQL route, backup/restore/ordered migrations, synthetic accounts and full Auth/RLS/Storage journeys |
| L2 Local hardening/readiness | NOT_STARTED | Original feature parity, real DB concurrency, deletion/dispatch replay/retention/account procedure, performance/advisory/licenses, UX/calendar/source/policy/demo and final local gate |
| D1 Deployment — final phase | DEFERRED — held until L1/L2 pass | Free hosting eligibility, hosted secrets/target migration if needed, Vercel/Railway publish and HTTPS/proxy smoke, approved worker schedules, monitoring/free-budget/restore/rollback gate |

- [x] L1-01 Supplied development keys saved in ignored backend/.env; browser secrets excluded; Auth/JWKS/Data API/Storage credential probes HTTP 200; app schema/private bucket still absent.
- [ ] L1-02 Select/inspect project and SQL/backup connection access.
- [x] L1-03 Independent local encryption/origins/cookies configured; selected low-cost public-FAQ Morpheus adapter prepared; other integrations/DB dispatch off.
- [ ] L1-04 Backup/isolated restore and ordered additive migration/backfill.
- [ ] L1-05 Synthetic accounts/MFA/jobs/quiz/Auth redirects.
- [ ] L1-06 Real localhost candidate/staff journeys.
- [ ] L1-GATE Completed-integration affected Auth/RLS/Storage/RPC/proxy checks.
- [ ] L2-01 Original feature parity audit and confirmed-gap fixes.
- [ ] L2-02 Real multiple-connection races/revisions/leases/quotas.
- [ ] L2-03 Backup/newest-ledger replay/cleanup/full account-erasure procedure.
- [ ] L2-04 Performance/rate controls/advisory/licenses/secret review.
- [ ] L2-05 Usability/EN-BM/accessibility/mobile/calendar/brand fixes.
- [ ] L2-06 Approved discovery sources and bounded smoke, or keep collection off.
- [ ] L2-07 Privacy/retention/review roles/incident/free-budget/demo readiness.
- [ ] L2-GATE Final local readiness gate after phase construction.
- [ ] D1-01 Current free hosting eligibility/quotas and environment selection.
- [ ] D1-02 Hosted secrets/HTTPS/proxy/target backup/migration if needed.
- [ ] D1-03 Vercel/Railway deployment and deployed smoke.
- [ ] D1-04 Approved hosted worker/scheduler activation; optional senders stay gated.
- [ ] D1-05 Hosted monitoring/budgets/rotation/restore/rollback evidence.
- [ ] D1-GATE Deployed acceptance with optional/legal exclusions explicit.

Current L1 evidence: configuration/adapter gate passed (app/docs/l1/GATE.md); keys stay ignored, read-only service probes and two bounded public FAQ generations performed; local app/proxy starts. No remote SQL/deployment/email/scheduler action. Feature milestone count remains 12/12 local; integration/release stages are not silently counted complete.

## M0 — Planning

- [x] M0-01 Read Kerja.md and retain it as the original input.
- [x] M0-02 Inspect existing source and record the baseline SHA; distinguish partial existing multi-apply from missing hardening.
- [x] M0-03 Research hosting, Jev products, background-check access and relevant repository/model options.
- [x] M0-04 Recommend a name containing Kerja: KerjaOS, subject to clearance.
- [x] M0-05 Write the PRD with all eleven requested areas, stack, free limitations and acceptance criteria.
- [x] M0-06 Write M1–M9 implementation, migrations, phase-end gates, demo and rollback expectations.
- [x] M0-07 Create an updatable checklist; leave implementation and application test results unchecked.

Evidence: PRD.md, IMPLEMENTATION_PLAN.md, PROGRESS.md. No repository modifications/deployment/live checks on candidates.

## M1 — Security and canonical applications

- [x] M1-01 Obtain source checkout, read repository instructions and record the implementation base SHA.
- [x] M1-02 Inventory authorization, passwords, sessions, uploads, graph/email paths and source/provider defaults.
- [ ] M1-03 Create encrypted DB/object backup, data-shape inventory, application conflict report and restore recipe. Tooling/recipe and synthetic collision evidence exist; actual backup/report/restore pending.
- [x] M1-04 Implement Supabase Auth facade, verified account linking/reset, cookie sessions, logout/revocation and staff MFA.
- [x] M1-05 Add proxy-before-SPA routing, CSRF, exact CORS, no-store private responses, abuse limits and safe errors.
- [x] M1-06 Add employer/job memberships, endpoint ownership and scoped repositories/RLS/grants; narrow service-key use.
- [ ] M1-07 Backfill UUID applications from candidate payloads and rows with mapping/reconciliation; stop job-only IDs and latest-job shadow writes. Canonical API and reviewed import tooling built; live backfill/count reconciliation pending.
- [x] M1-08 Replace public uploads with private encrypted/quarantined evidence and signed access; remove browser-stored candidate/session data.
- [ ] M1-09 Remove/rotate active demo credentials, remove authenticated LinkedIn cookie route, disable paid defaults and isolate synthetic sourcing. Active demo login/cookie route/paid calls disabled locally; deployed rotation confirmation pending.
- [x] M1-10 Disable autonomous adverse messages/decision mutations; add human-approval checks to old paths.
- [x] M1-11 Add safe existing-model data boundary, deterministic mode, audit/queue/outbox/retention foundation, theme/i18n scaffold and pinned dependencies.
- [x] M1-12 Write affected auth/data/storage/migration tests, README/env/migration/demo/secure-rollback docs without running intermediate suites.
- [ ] M1-GATE Run and record the completed phase's scoped suite, build and proxy/storage/migration smoke; measure free hosting budget. Local gate PASSED; mandatory live checks NOT_RUN. Full evidence: app/docs/m1/GATE.md.

Evidence note: [M1 gate](app/docs/m1/GATE.md), [setup](app/docs/m1/SETUP.md), app/backend/app/foundation and app/supabase/migrations. Checked tasks record local code deliverables; hosted validation remains separate.
Open blockers: no configured Supabase/hosting access or live-data backup. Migration is additive and has NOT been applied. Cookie/proxy, live RLS, restore and credit measurements remain unverified. Local construction and scoped gate are complete: 20 distinct backend tests, 27 SQL/RLS assertions, 1 browser scenario and build passed; npm audit reports 0. See app/docs/m1/GATE.md. M1-03/07 need live backup/backfill evidence; M1-09 needs deployed credential rotation confirmation.

## M2 — State machine and multi-apply dashboard

- [x] M2-01 Add transition service, policy snapshots, allowed prerequisites/skips, optimistic version and idempotent event/outbox transaction.
- [x] M2-02 Add canonical list/details/apply/withdraw/reopen/job-close endpoints and immutable submission snapshots.
- [x] M2-03 Build independent application cards/table/history/next action/deadlines in EN/BM.
- [x] M2-04 Build assigned-job HM queues and human shortlist/reject dialog with evidence/reason; separate shortlist from final hire.
- [x] M2-05 Bind graph/tools to application UUID and actor; retire unsafe candidate-wide writes/private-note leakage.
- [x] M2-06 Add fetch-on-focus/actions and bounded updates; scheduling only for human-shortlisted applications.
- [x] M2-07 Write race/transition/ownership/multi-apply tests plus migration/README/demo/rollback updates.
- [x] M2-GATE Run affected backend tests and one A/X, A/Y, B/X candidate/HM Playwright scenario; record build and results. Local gate passed; hosted integration and M1 live prerequisites remain explicitly deferred.

Evidence note: [M2 gate](app/docs/m2/GATE.md), [setup](app/docs/m2/SETUP.md), app/backend/app/foundation/pipeline.py, app/supabase/migrations/20261002103658_m2_application_pipeline.sql and app/src/app/foundation/ApplicationDashboard.tsx. Local gate passed after construction: 33 backend tests, 60 PostgreSQL assertions, 2 distinct browser scenarios, build/typecheck. Only affected checks were rerun for gate issues.
Open blockers: live M1 gates remain deferred by user; local M1 gate passed. M2 proceeds locally with synthetic fixtures, no real migrations/deployment.

## M3 — Identity verification

- [x] M3-01 Add versioned identity consent, sharing grants and reviewer assignment.
- [x] M3-02 Implement secure capture/quarantine and necessary MyKad or alternative/manual route.
- [x] M3-03 Reuse local OCR/format consistency; distinguish evidence assistance from official identity verification.
- [x] M3-04 Add manual/mock IdentityProvider and unconfigured commercial stub; truthful method/provenance/status.
- [x] M3-05 Add reusable minimal assertion, employer consent, expiry/revocation and correction/manual-review UX.
- [x] M3-06 Implement actual object/temporary-data deletion jobs and overdue cleanup capture block.
- [x] M3-07 Keep biometric/face/liveness capture off; record legal, weight-license, evaluation and compute gates for optional extension.
- [x] M3-08 Write consent/ownership/expiry/deletion/provider tests; update migrations, privacy docs and demo.
- [x] M3-GATE Run affected tests and one consent/document/reviewer flow; verify raw evidence stays outside logs and external models. Local gate passed; actual hosted deletion/worker availability and real-data activation remain deferred.

Evidence note: [M3 gate](app/docs/m3/GATE.md), [setup](app/docs/m3/SETUP.md), app/backend/app/foundation/identity.py, identity_providers.py, identity_retention.py, app/src/app/foundation/IdentityWorkspace.tsx and app/supabase/migrations/20261002110620_m3_identity_review.sql. Local gate passed after construction; only affected checks reran for fixes.
Open blockers: live M1/M2/M3 service checks, real-data legal/privacy approval, qualified reviewer setup and actual cleanup scheduling remain deferred. Optional OCR model/license/evaluation and biometrics are not installed/enabled. Local Storage fixtures prove deletion/retry only in their isolated fixture; no live Supabase deletion is claimed.

## M4 — Real quiz and private practice

- [x] M4-01 Separate practice vs production bank/attempt/answer permissions and endpoints; replace shared sandbox mutations.
- [x] M4-02 Publish authored role competencies/questions/rubric versions.
- [x] M4-03 Add server timer, randomization, autosave/reconnect, submit idempotency, retakes and accommodations.
- [x] M4-04 Implement deterministic objective grading and human subjective review; optional pinned free-model recommendation only after evaluation.
- [x] M4-05 Implement readiness index/band, component breakdown, missing-data state and study roadmap.
- [x] M4-06 Hide practice from employers by default; no screening side effects, real-question leakage or unsupported acceptance probability.
- [x] M4-07 Add safe report generation and EN/BM wording; document future calibrated-probability prerequisites.
- [x] M4-08 Write timer/isolation/rubric/injection tests; update migrations, README/env and demo.
- [x] M4-GATE Run affected tests plus focused practice/real-quiz E2E and bilingual golden fixtures; record results. Local gate passed; hosted/concurrency gates deferred.

Evidence note: [M4 gate](app/docs/m4/GATE.md), [setup/demo/rollback](app/docs/m4/SETUP.md), private M4 SQL migration, backend/app/foundation/quiz.py, QuizWorkspace.tsx and m4-sql/test_quiz/quiz.spec fixtures. Local gate: 51 backend tests, 88 SQL assertions, 4 distinct browser scenarios, build/typecheck. Only affected reruns for SQL fixes/abandoned timeout control. No keys/models/new dependencies.
Open blockers: hosted M1–M4 Auth/PostgREST/proxy/migration/restore/real concurrency remain deferred until keys/configuration. Optional evaluated model scoring/future hiring-probability calibration remain deferred; deterministic/manual path is complete.

## M5 — Background evidence workflow

- [x] M5-01 Add separate credit/criminal contracts, labelled mocks/manual providers and unconfigured vendor stubs.
- [x] M5-02 Add check-specific job necessity/justification/stage/policy and production activation gate.
- [x] M5-03 Require employer/purpose/version consent before queueing; prohibit provider portal credentials and LLM report ingestion.
- [x] M5-04 Implement scoped cases, encrypted evidence/provenance/coverage, manual reviewer, dispute/explanation and hold.
- [x] M5-05 Handle retry/idempotency, withdrawal/revocation/late results and actual report deletion.
- [x] M5-06 Require human adverse decision approval; distinguish unavailable, unverified and reviewed results; no generic debt/offence score.
- [x] M5-07 Write case/consent/mock/dispute tests and conditional webhook tests; update migration/docs/demo.
- [x] M5-GATE Run mock/manual workflow gate and one finalist/reviewer scenario; record official providers as deferred. Local gate passed; hosted/legal/official activation deferred.

Evidence note: [M5 gate](app/docs/m5/GATE.md), [setup/demo/worker/rollback](app/docs/m5/SETUP.md), M5 private SQL migration, background.py/background_providers.py/background_worker.py, BackgroundWorkspace.tsx, background_m5.py/retention_m1.py and SQL/API/browser fixtures. Local gate: 59 backend tests, 95 SQL assertions, 5 distinct browser scenarios, build/typecheck/script syntax. Tests after construction; only affected reruns for branch/outbox/header safeguards.
Open blockers: hosted M1–M5 Auth/PostgREST/Storage/proxy/backup/restore/concurrency/cleanup remain deferred until configuration; real manual processing needs legal/operational approval and approved release. Official automated providers and vendor/webhooks remain deferred under free-only. Actual deletion verified only in isolated fixture, not live bucket. No new dependency/model/provider key.

## M6 — Gateway and progress chatbot

- [x] M6-01 Add common LLM/DecisionProvider interfaces, RuleDecisionProvider and safe derived-data boundary.
- [x] M6-02 Add optional Jev Router zero-price allowlist, budget/circuit breaker/privacy route controls and no paid fallback.
- [x] M6-03 Keep paid Jev 1.13 decisions disabled; preserve deterministic TASK_TOOL_PLANS/tool gating.
- [x] M6-04 Implement session-scoped read-only candidate tools, separate HM aggregates and ambiguity handling.
- [x] M6-05 Add factual progress/FAQ templates in EN/BM, application/update citations and optional low-stakes model wording.
- [x] M6-06 Record actual available model/provider provenance and fallback_warning without raw prompts/PII.
- [x] M6-07 Write malicious prompt/tool/tenant/outage/quota fixtures and local/cached promptfoo configuration; update docs/env/demo.
- [x] M6-GATE Run authorization/injection/fallback gate and one chatbot E2E; no paid live evaluations.

Evidence note: M6 SQL authorized views/quota/metadata, lean chat/tools/provider boundary and ChatWorkspace built. Legacy registry/plans register secure read-only adapters without reactivating old routes. Fixtures, local promptfoo, setup/env/demo and operator metadata purge built. Local gate passed: 79 distinct backend tests, 40 SQL assertions, 6 browser scenarios, 11 offline prompt fixtures, build/typecheck/syntax. Affected reruns fixed mutation routing and eval assertion syntax; no full-suite rerun. app/docs/m6/GATE.md.
Open blockers: hosted integration, scheduled idle metadata purge and actual free/privacy route remain deferred. Dev-only node-forge advisory chain has no patched registry version; production audit 0.

## M7 — Job discovery

- [ ] M7-01 Approve a small real source list with access/terms/redistribution evidence and kill switches. Curated documentation candidate register exists, but actual employer approval is pending; sources disabled.
- [x] M7-02 Build Greenhouse/Lever adapters, feed normalization, dedupe, expiry and provenance.
- [x] M7-03 Add allowed career-page Scrapling with robots/throttle/cache/backoff; no blocked-content bypass.
- [x] M7-04 Implement safe fetch/redirect/DNS allowlists and safe rendered metadata/outgoing links.
- [x] M7-05 Implement text/tag search and ranking; optional offline E5-small/pgvector with version and local compute budget.
- [x] M7-06 Build Discover/filter/save/source/freshness views and distinct self-reported external tracker.
- [x] M7-07 Add bounded local worker runs, resume behaviour and scheduler/capacity checks; keep JobSpy/cookie routes off.
- [x] M7-08 Write replay fixtures, dedupe/robots/SSRF/stale/provider tests; document source permissions, migrations and demo.
- [ ] M7-GATE Run replay tests, bounded permitted live feed smoke and focused Discover E2E; record measured budget and source coverage. Local functional gate PASSED; approved real-source/Greenhouse/hosted gate DEFERRED.

Evidence note: M7 private source registry, normalized metadata, own saved/tracker RPCs, source review/kill/quota/lease functions, pinned-public-IP fetcher, Greenhouse/Lever/static Scrapling adapters, local worker and EN/BM Discover built. Replay fixtures, optional parser lock, source register, setup/demo/rollback and docs complete. Local functional gate PASSED: 103 distinct backend tests, 63 SQL assertions, 7 browser scenarios, build/typecheck/syntax and pip check. Lever documentation smoke returned 11 rows in one request; Greenhouse example unavailable in one request. No persistence or approved market coverage. Affected reruns only; app/docs/m7/GATE.md. Optional embeddings deferred; text/tag ranking is the baseline.
Open blockers: actual employer terms/redistribution and career-page robots approval, valid approved Greenhouse live feed and hosted configuration/concurrency/budget/DSAR release pending; curated documentation examples stay disabled.

## M8 — KerjaOS, retro UI and interview scheduling

- [ ] M8-01 Record brand/name/handle clearance; create original permitted logo/mascot/icons/wallpaper. Original SVGs/grid created and preliminary official search entry points researched; complete public clearance remains DEFERRED.
- [x] M8-02 Update product copy, metadata, README, favicon and configured templates to KerjaOS.
- [x] M8-03 Complete Classic/Luna-inspired themes and taskbar/window state; replace MUI usages before dependency removal.
- [x] M8-04 Add optional dragging/resizing with keyboard/maximize/reset/mobile/reduced-motion alternatives and safe unsaved-state behaviour.
- [x] M8-05 Complete interviewer assignment/slots/conflict protection, UTC/IANA timezone, confirm/reschedule and online/physical details.
- [x] M8-06 Add in-app reminders, ICS versions and disabled optional sender contract with truthful delivery status; handle cancellation/withdrawal. Real verified SMTP is DEFERRED.
- [x] M8-07 Add interviewer scorecard and separate human final outcome/offer/hire action.
- [x] M8-08 Complete EN/BM wording/accessibility review; write affected tests and migrations/docs/demo.
- [x] M8-GATE Run targeted Playwright/axe, keyboard/mobile/both-theme checks, scheduling tests and one post-MUI build. Local gate PASSED; hosted concurrency/calendar validation remains deferred.

Evidence note: local M8 migration/API/UI, guarded schedules/reminders/calendar/scorecard/final action, original SVGs/themes/window state, MUI removal, new scoped scheduled-chat tool and fixtures/docs built. Local phase-end gate PASSED: 38 affected backend tests, 44 real PostgreSQL assertions, all 8 distinct browser scenarios (four candidate/HM theme axe scans), keyboard/draft/mobile/zoom checks, typecheck, build and production npm audit 0. Initial SQL alias ambiguity repaired and affected SQL gate rerun only; Windows wildcard typecheck invocation corrected. Optional real SMTP remains disabled/deferred. See app/docs/m8/GATE.md.
Open blockers: public brand/handle and legal clearance; hosted authorization/concurrency/calendar/sender/configuration/retention gates remain deferred.

## M9 — Integrated release gate

- [x] M9-01 Review all feature switches/free limits and synthetic/live display separation. demo_free-only mode guard and EN/BM synthetic notice; docs/m9/RELEASE.md.
- [ ] M9-02 Finish privacy/contact/AI notices, purpose approvals, retention/DSAR/cross-border/DPO/breach review for the intended release mode. EN/BM versioned synthetic notice, scoped exports, review requests/private erasure delivered; monitored contact, full account disposition and legal/transfer/retention approvals pending.
- [x] M9-03 Complete encrypted DB/object backup/restore/deletion-ledger, queue-failure, retention and secure-rollback runbooks. Verified archive/replay/aggregate tools and local encrypted snapshot/object restore exist; actual hosted recovery and post-backup consent/business reconciliation remain separate release gates.
- [ ] M9-04 Record hosting eligibility, free budget measurements, pause/offline behaviour and dependency/model-weight license inventory. Official terms rechecked, operator pause thresholds/offline runbook and production inventory/local bundle measurements recorded; hosted costs and unknown/legacy/model license review pending.
- [x] M9-05 Complete synthetic paired fairness/golden review and any lawful consented audit; document uncertainty. Three tiny paired resumes and three quiz pairs plus 11 golden prompt cases passed; no real audit/data or blanket fairness/probability claim.
- [x] M9-06 Finish README/env examples and repeatable two-candidate/two-job synthetic demo script. app/docs/m9/DEMO.md and RELEASE.md; local-only pinned legacy regression dependency file.
- [ ] M9-GATE Run one integrated release suite/E2E/restore/fallback/privacy rehearsal; target reruns only to material fixes. Local composite PASSED; continuous hosted journey, concurrency, real Auth/Storage/pg_dump restore/consent replay and usage checks DEFERRED. See app/docs/m9/GATE.md; no repeated full-suite loop.
- [ ] M9-07 Deploy the eligible demo/pilot to Vercel/Railway/Supabase and record final cookie/proxy/source/storage gate evidence.
- [x] M9-08 Mark actual release mode and deferred functionality; commercial release remains blocked under incompatible free hosting terms. local_synthetic_demo/demo_free only, APP_MODE rejects unapproved pilot modes; no deployment/public release claim.

Evidence note: M9 privacy centre and 14 scoped paginated exports, reviewable requests and service-only private workspace erasure/replay built; full account disposition remains manual. Encrypted verified restore staging, tombstone replay, aggregate monitoring, license/public-bundle review tool and release/privacy/budget/demo/incident/rollback runbooks built. Local composite gate PASSED: 140 distinct backend tests across completed scope, 533 SQL assertions across all phases, 9 browser scenarios, 11 offline prompts, six axe scans, paired quiz/resume checks, clean install/build/typecheck, pip check and production npm audit 0. Six public artifacts scanned with no secret-pattern suspects; actual logs/history/unknown licenses still need private review. app/docs/m9/GATE.md.
Open blockers: service configuration, public brand clearance, legal/hosting/retention/account disposition and real hosted restore/concurrency/continuous journey/usage checks. Passing a demo suite does not approve a real-data or commercial release.

## M10 — Unified tracker, resume versions and company workspace

- [x] M10-01 Define owned internal/external tracker DTOs, provenance and manual-entry/duplicate/archive semantics.
- [x] M10-02 Build manual external applications and unified filters/history without changing internal human pipeline writes.
- [x] M10-03 Add private company records/notes and role-safe links to employers/tracked jobs.
- [x] M10-04 Add encrypted immutable resume versions and explicit per-submission snapshot linkage/reuse.
- [x] M10-05 Build accessible EN/BM tracker/company/resume panels with draft preservation.
- [x] M10-06 Extend privacy export/erasure, retention/deletion/replay and setup/demo/rollback docs.
- [x] M10-07 Write affected ownership/snapshot/manual-entry/privacy fixtures during construction.
- [x] M10-GATE Completed-construction local gate passed: 38 affected backend tests, 67 SQL assertions, 6 browser journeys, build/typecheck and script syntax. Hosted checks remain DEFERRED; see app/docs/m10/GATE.md.

Evidence: M10 additive private tables/RPCs, candidate-token API, safe normalized links, internal/manual/discovery projection and filters, company notes, immutable encrypted PDF library/clone/signed access/retirement, EN/BM Tracker panel and draft preservation built. Privacy/export/erasure, library lease cleanup/tombstones, archive/replay monitoring, fixtures and setup/demo/rollback complete. No tests/builds run during construction.
Gate PASSED locally after construction; only failed/affected checks were rerun for repairs. M11 is now built locally; all planned local phases are now complete; next is configured hosted release validation. Remaining M10: backed-up hosted migration/restore, real Auth/Storage/session/proxy, multi-connection race/worker checks, scheduled retention and reviewed real-data policy. No deployment or live service activation.

## M11 — Scoped descriptive analytics dashboard

- [x] M11-01 Define cohorts/dates, event vs application counting, internal/self-reported separation, metric denominators and unknown states.
- [x] M11-02 Implement candidate-owned and assigned-employer aggregates with narrow user-JWT authorization and query caps.
- [x] M11-03 Build EN/BM cards/table-backed charts and date/company/source filters.
- [x] M11-04 Add scoped safe export and privacy/query-budget/demo/rollback documentation.
- [x] M11-05 Write synthetic expected totals/date/duplicate/ownership/accessibility fixtures during construction.
- [x] M11-GATE Completed-construction affected gate PASSED: 23 backend tests, 58 SQL assertions, 4 browser journeys, build/typecheck/syntax and measured local query/bundle evidence. Hosted validation remains DEFERRED.

Evidence: M11 construction complete — additive stage observations/private portability, bounded candidate/assigned-job MFA aggregates, cohort/unknown-date/current-outcome semantics, EN/BM table-backed charts/date/company/source filters, safe scoped CSV/JSON exports, notices/setup/demo/rollback and SQL/backend/browser fixtures. No tests during construction. Local affected gate PASSED; app/docs/m11/GATE.md records commands/repairs/counts/query and bundle measurements. Remaining: backed-up hosted migration/restore, actual Auth/RLS/MFA/assignment revocation and multi-connection updates, real query/free-capacity/timeout limits and reviewed retention/legal release. M12 is now locally complete; configured hosted release validation is next.

## M12 — Follow-up reminders and optional verified email

- [x] M12-01 Define owned reminders, UTC/IANA due times, origin/reference, lifecycle and M8 interview deduplication.
- [x] M12-02 Build due/upcoming/history UI with snooze/complete/cancel and opt-in preferences.
- [x] M12-03 Implement revision/idempotent outbox/leases, bounded local worker, quota/backoff/dead-letter and stale/ambiguous delivery handling.
- [x] M12-04 Add Disabled/Fixture/optional verified SMTP sender and truthful receipts; no arbitrary recipients, employer sends or paid fallback.
- [x] M12-05 Add withdrawal/forget/erasure/preferences cancellation and privacy/delivery retention/replay coverage.
- [x] M12-06 Write setup/free-capacity/sender/demo/rollback docs and affected fixtures during construction.
- [x] M12-GATE Completed-construction affected gate PASSED: 28 backend tests, 87 SQL assertions, 5 browser journeys, build/typecheck/syntax. Failed/affected reruns only; unconfigured live sender/scheduler/hosted release DEFERRED.

Evidence: M12 construction complete — private reminders/history/versioned preferences, due/snooze/complete/cancel/forget, closed-outcome and M8 dedupe triggers, CSRF/token-only APIs, persistent EN/BM UI, disabled/fixture/verified SMTP adapter and bounded lease/quota/unknown-safe worker, scoped exports/erasure/90-day cleanup and newest dispatch/opt-out/removal ledger recovery. Docs/demo/rollback and backend/SQL/browser fixtures built. No tests during construction. Local affected gate PASSED: 28 backend tests, 87 SQL assertions, 5 browser journeys, typecheck/build/syntax; evidence/repairs in app/docs/m12/GATE.md. Remaining: hosted migration/restore/Auth/RLS, multi-connection dispatch races/quotas, configured bounded scheduling/retention, free verified SMTP and reviewed privacy/legal/account gates. No email sent, remote migration or scheduler created.

## Deferred integrations and explicit gates

These items are intentionally unbuilt or disabled in the free baseline. They do not become “done” through mock testing.

| ID | Item | State | Condition for reconsideration |
| --- | --- | --- | --- |
| D01 | Live CTOS Score/API | DEFERRED | Lawful role/purpose, provider authorization and a genuinely free eligible offering; no paid access assumed |
| D02 | Direct official recruiter CCRIS access | DEFERRED | Verified lawful authorized access route; candidate self-report is a different method |
| D03 | Direct police/vendor criminal search | DEFERRED | Verified lawful provider access and free eligible terms; a declaration/document is not a comprehensive search |
| D04 | New CGC procurement | DEFERRED | Current official issuance charges conflict with free-only; existing evidence can be reviewed where permitted |
| D05 | Biometric liveness/face matching | DEFERRED | Consent/privacy review, licensed weights, demonstrated spoof/fairness performance, local hardware budget |
| D06 | Jev 1.13 live decisions | DEFERRED | Current price is nonzero; free-only constraint must remain satisfied |
| D07 | Validated acceptance probability | DEFERRED | Defined outcome and enough lawful representative labels, temporal calibration/fairness/uncertainty evidence |
| D08 | BGE-M3/large local models | DEFERRED | Local resources and evidence of improvement over simple search/E5-small |
| D09 | Persistent hosted workers/tracing/Realtime | DEFERRED | Measured free capacity and service terms; local/short operation path works without them |
| D10 | Commercial release on Vercel | BLOCKED | Hobby terms restrict use; eligible hosting permission/free offer or changed budget constraint required |

## Decision and blocker register

| ID | Decision / uncertainty | Owner role | Current disposition |
| --- | --- | --- | --- |
| A01 | Brand is KerjaOS | Product owner | Recommended working name; clearance not performed |
| A02 | P0 resume → identity → quiz → finalist background → human shortlist → human interview | Product owner/HM | Adopt Kerja.md default; legal/justified per-job ordering snapshot can differ |
| A03 | Pre-interview “Accept” means shortlist, not hire | Product owner/HM | Adopt; final hire is a separate human outcome |
| A04 | Supabase Auth facade and same-origin cookies | Engineering | Planned; cookie/proxy behaviour must pass M1 gate |
| A05 | Existing application UUID collision/data history | Engineering | Code-derived risk; live data integrity unverified; M1 reconciles candidate payloads |
| A06 | Human approval for adverse decisions | Engineering/HM | Mandatory from M1, including existing email/tool paths |
| A07 | Real evidence legal/retention/transfer rules | Privacy/legal reviewer | `[TBC-LEGAL]`; synthetic workflow can proceed |
| A08 | Recurring free Railway affordability | Engineering/operator | `$1/month` allowance verified; actual workload not measured |
| A09 | Public auth email sender | Operator | Optional sender; Google OAuth demo/in-app notices baseline, no unlimited default SMTP claim |
| A10 | Jev Router data-policy compatibility | Engineering/privacy reviewer | Optional and off until verified against intended data/provider route |
| A11 | Per-phase test cadence | Engineering | Adopt: gate only when phase built; affected reruns after fixes; one M9 integration gate |

## Phase gate record template

Copy this block for each gate; keep actual commands/results and evidence only.

```text
Phase:
Date/time (Asia/Kuala_Lumpur):
Commit / working revision:
Release mode / feature flags:
Implementation complete: yes/no
Migration/backfill and reconciliation evidence:
Tests/checks run at phase completion:
Results (passed/failed/skipped counts, no invented values):
Demo / screenshots / logs / report paths:
Known limitations / deferred dependencies:
Fixes and targeted rerun scope:
Final gate: PASSED / FAILED / NOT_RUN
Docs/env/demo updated:
Reviewer / next task:
```

## Change log

| Date | Entry | Evidence |
| --- | --- | --- |
| 2026-10-02 | Read original Kerja.md; researched existing source and requested services; created PRD, phased plan and checklist. No application code, tests or deployment performed. | PRD.md, IMPLEMENTATION_PLAN.md |
| 2026-10-02 | Corrected baseline: multi-apply/table already present; plan repairs canonical IDs, shadow state, scope and security. | Reviewed main SHA recorded above |
| 2026-10-02 | Adopted KerjaOS as provisional recommendation; clarified shortlist vs hire and readiness vs probability. | PRD sections 1, 6 and F06 |
| 2026-10-02 | Recorded free constraints: Vercel use eligibility, Railway recurring allowance, Jev Router vs paid decisions, official checks vs manual/demo evidence. | PRD section 4 |
| 2026-10-02 | M1 started. Cloned app/ at the planned SHA; no AGENTS.md found. Added server-owned Supabase sessions, UUID APIs, private encrypted resumes, additive SQL/RLS, offline recovery tooling and provisional secure UI. Legacy source retained but unsafe routes are not mounted. No tests run during construction. | app/backend/app/foundation, app/supabase/migrations, app/docs/m1 |
| 2026-10-02 | M1 local gate passed. Ran tests only at phase-end, then affected checks for fixes. Patched inherited dependency advisories; hardened direct-data revocation, chunked body bounds, recovery/MFA and session-bound document links. Full M1 remains IN_PROGRESS: live backup/backfill/restore, Auth/Storage/proxy, deployed rotation and free hosting measurements pending project configuration. | app/docs/m1/GATE.md; synchronized IMPLEMENTATION_PLAN.md |
| 2026-10-02 | User authorized local M2 while keys will be supplied later. Built independent pipeline/dashboard, policy/evidence/consent guards and human actions. Local gate passed after construction: 33 backend tests, 60 SQL assertions, build/typecheck and 2 distinct browser scenarios. Fixed only affected gate issues. No remote migration/deployment. | app/docs/m2/GATE.md; synchronized IMPLEMENTATION_PLAN.md |
| 2026-10-02 | M3 local consent/manual identity/assertion-sharing/deletion workflow built. Gate after construction: 41 distinct backend tests, 54 SQL assertions, 3 distinct browser scenarios, build/typecheck. Fixed blank-image border handling, browser locator, nullable consent/attestation guards and sharing review/revocation controls with affected checks only. No real capture, live migration, OCR weights or biometrics. | app/docs/m3/GATE.md; synchronized IMPLEMENTATION_PLAN.md |
| 2026-10-02 | M4 local real quiz/private practice built: authored immutable versions, persisted random sets, autosave/server clocks, human rubric review, accommodations/retakes and bounded offline readiness reports. Completion gate: 51 backend tests, 88 SQL assertions, 4 browser scenarios, build/typecheck. Corrected SQL references/identifier formatting/lock order; added abandoned timeout finalization; affected reruns only. | app/docs/m4/GATE.md; synchronized IMPLEMENTATION_PLAN.md |
| 2026-10-02 | M5 local typed background policy/consent/mock/manual/stub workflow built, with encrypted expiring reports, leased processing, revocation/withdrawal/late-result quarantine, disputes/hold/human review/exception and guarded adverse decisions. Phase-end gate: 59 backend tests, 95 SQL assertions, 5 browser scenarios, build/typecheck/script syntax; affected reruns for retry/cancellation outbox and raw-header guard only. No paid/official/real capture activated. | app/docs/m5/GATE.md; synchronized IMPLEMENTATION_PLAN.md |

| 2026-10-02 | M6 local read-only EN/BM scoped assistant/free-safe optional wording gateway completed. Phase-end gate: 79 distinct backend tests, 40 SQL assertions, 6 browser scenarios, 11 offline prompt fixtures, build/typecheck/syntax. Affected fixes only. Production audit 0; dev certificate-parser advisory chain recorded. No live AI/migration/deployment. | app/docs/m6/GATE.md; IMPLEMENTATION_PLAN.md synchronized |

| 2026-10-03 | M7 local discovery implementation/gate complete: private approved-source registry, safe Greenhouse/Lever/static Scrapling, bounded leased worker and EN/BM Discover/saved/self-reported private tracker. 103 distinct backend checks, 63 SQL assertions, 7 browser scenarios, build/typecheck/syntax/pip check. One Lever demo smoke 11 rows, one Greenhouse demo unavailable; no persistence. Source approval/live hosted gate remains deferred and collection off. | app/docs/m7/GATE.md; IMPLEMENTATION_PLAN.md synchronized |

## Next implementation action

M7 local implementation and functional gate are complete; do not repeat the full suite. Actual employer source URLs/terms/redistribution approvals remain pending and all collection stays off. A valid approved Greenhouse board needs its single bounded live smoke; no further refetch of the unavailable documentation example is needed. When service keys arrive, apply backed-up M1–M7 migrations/restore and verify real Auth/PostgREST/RLS/Storage/proxy, multi-connection pipeline/queue/review/retention plus discovery budget/lease/kill/personal-cap checks, and scheduled specialized evidence/metadata deletion. Real evidence/official providers remain off until release/legal approval; optional AI remains off pending exact price/privacy proof. No complete market coverage, hosted operation or DSAR release is claimed. M8 has not started; the next authorized phase would be branding, retro polish and human interview scheduling.

### 3 October 2026 — M8 local gate

Completed provisional KerjaOS assets/metadata, Classic/Luna themes and persistent accessible desktop panels, scoped human scheduling/ICS/reminders/scorecards and separate offer → candidate acceptance → human hire, plus scheduled-interview chatbot intent. Removed four unused MUI/Emotion dependencies. Phase construction completed before testing. Local gate passed after one SQL alias repair and affected SQL rerun; 38 scoped backend tests, 44 PostgreSQL assertions and 8 browser scenarios passed; typecheck/build and production dependency audit passed. No remote migrations, deployment, real sender, public brand clearance or live data operation. M9 has not started. Remaining M8 public/hosted/SMTP/operational checks stay deferred.

### 3 October 2026 — M9 construction complete

READY_FOR_GATE: release/privacy centre, scoped export/request/erasure migration, encrypted archive staging and replay scripts, monitoring/license/bundle review, synthetic fairness fixtures and operational/demo docs built. No tests run during construction. Next: clean dependency install, one integrated backend/SQL/browser/offline-prompt gate, build and artifact audit; record failures and rerun only affected checks. Full account erasure, hosted deployment/capacity/continuous journey and reviewed legal records remain deferred.

### 3 October 2026 — M9 local composite gate passed

All local M1–M9 implementations have a passed functional/composite gate. M9 adds EN/BM synthetic release/privacy centre, 14 paginated owned-data exports, reviewable requests, operator-approved private workspace erasure with cutoff replay, document tombstone ledger and encrypted backup/staging/restore rehearsal, count-only monitoring and release/retention/incident/rollback/free-budget/license/demo runbooks. Gate: 140 distinct backend tests (109 foundation + 28 preserved legacy + 3 paired resumes), 533 SQL assertions, 9 browser scenarios/six axe scans, 11 offline golden prompts, three quiz pairs, typecheck/build/clean npm install/pip check/production audit and public artifact review passed. Initial collection/three outdated legacy expectations/npm install overlap/prompt sandbox failure recorded; affected reruns only. No live migrations/deployment/provider send, complete account erasure, public brand clearance or representative fairness claim. Next action when owner supplies selected service configuration: isolated backup/migration/restore, post-backup revocation/deletion replay, hosted continuous journey/concurrency/proxy/Auth/Storage and quota/eligibility/legal checks; keep real data/providers disabled meanwhile.

### 5 October 2026 — Job Application Tracker image audit and planning

Compared attached feature list with active foundation code/routes: authentication, canonical pipeline/history and role access built locally; basic staff counts and resume/company/external tracker foundations partial; general follow-up email and dedicated active analytics missing. Legacy CandidateDashboard charts are preserved but not routed into App.tsx and do not establish active delivery. Added M10–M12 milestones/tasks, acceptance/demo/rollback/phase-end gate requirements and PRD F11–F13. Existing stack/free-only/hosting choices retained; screenshot stack is a reference, not a required rewrite. Updated plan's stale pre-implementation introduction. Planning only: no application code, deployment, tests, email or recurring automation. M1–M9 recorded gates unchanged; live release/legal/source/sender requirements persist.

### 5 October 2026 — M10 construction complete

Tracker/company/manual history and immutable encrypted resume library/copy provenance built with narrow candidate-token RPCs, safe links/revisions/private previews, 90-day demo expiry and cleanup leases. Extended M9 privacy/export/private erasure, backup/replay/monitoring for library objects. EN/BM panel/draft protection, synthetic backend/SQL/browser fixtures and setup/demo/rollback docs built. Tests NOT_RUN until this completed-construction gate. Next: affected gate; hosted migrations/deployment/retention/concurrency remain deferred.

### 5 October 2026 — M10 local affected gate passed

Completed unified internal/manual/discovery tracker, private company notes, revisioned external history, immutable encrypted resume library and independent application-copy provenance, with scoped export/erasure/cleanup/tombstone recovery extensions. Gate: 38 affected backend tests, 67 PostgreSQL assertions, six distinct browser journeys and typecheck/build/script syntax passed. Tracker browser includes Classic/Luna axe scans, mobile width, A/B isolation and draft preservation. Repaired SQL registration value/JSX syntax at gate, then fixture company-ID ordering and file-picker reset; reran only failed/affected checks. Vite/Edge filesystem restrictions required approved existing command escalation. No new dependencies, remote migrations/deployment, real files/emails or services activated. M10 whole release remains IN_PROGRESS; M11/M12 NOT_STARTED.

### 5 October 2026 — M11 construction complete

READY_FOR_GATE. Built scoped metadata aggregates, new future stage observations (no fabricated historical entry times), unknown-date accounting and separate internal/self-reported outcomes, assigned-job MFA report access, safe CSV/JSON export and observation portability, EN/BM keyboard/mobile table-backed charts, definitions/rollback/demo and affected fixtures. No tests/builds during construction. Next: one affected phase-end gate and targeted repairs only.

### 5 October 2026 — M11 local affected gate passed

Candidate and assigned-job MFA analytics, truthful future stage observations/current stage ages, separately labelled internal/manual/unknown-date data and safe scoped exports built. Added candidate observation portability and EN/BM notice. Local gate: 23 affected backend tests, 58 PostgreSQL assertions, 4 browser journeys/four new analytics axe scans, typecheck/build/syntax. Fixed reserved SQL alias and invalid unassigned interview fixture; SQL-only reruns. Small synthetic queries 15–17 ms; JS gzip 99.52 kB (+2.60 kB). All M1–M11 local gates passed; whole hosted phases remain IN_PROGRESS. No remote migration/deployment/sender or live services activated. M12 NOT_STARTED.

### 5 October 2026 — M12 construction complete

READY_FOR_GATE. Owned reminders, revision/idempotency, UTC/IANA offsets, closed-outcome/personal/M8 deduplication, EN/BM UI/preferences/preview, bounded leased SMTP/fixture/disabled dispatch and durable occurrence/opt-out/deletion replay, privacy/retention/monitoring and fixtures/docs constructed. Tests/builds NOT_RUN during construction. Next: one affected gate, targeted repairs only. Live emails/scheduler/remote migration remain deferred.

### 5 October 2026 — M12 local affected gate passed

Owned in-app due/upcoming reminders, lifecycle/history/private preferences, UTC/IANA offsets, outcome cancellation/personal retention/M8 notice dedupe, generic account-only preview, bounded Disabled/Fixture/reviewed SMTP worker with revision/lease/quota/unknown-safe durable dispatch, privacy export/erasure/cleanup and newest-ledger restore protection built. Tests only after construction: 28 backend tests, 87 SQL assertions, 5 browser journeys, typecheck/build/syntax. Corrected nonexistent test path; targeted reminder/SQL refinements and analytics cold-dev-navigation timeout diagnosis only. Four browser journeys passed initially; analytics passed all assertions at 60s budget with ~29s local asset/navigation delay. JS gzip 101.71 kB. All 12 planned local implementations passed; whole release phases remain IN_PROGRESS. Worker/sender/service policy off, no emails/scheduler/remote migrations/deployment. Next: when configured, isolated hosted release/restore/concurrency/free-budget/privacy gates; no additional phase inferred or started.

### 5 October 2026 — Remaining work separated; deployment reserved for last

Owner requested local-only app operation with forthcoming Supabase development keys and deployment last. Added L1 localhost/Supabase integration, L2 local hardening/readiness and D1 final Vercel/Railway deployment checklists with done/left gates in implementation plan §16. Retained passed M1–M12 evidence; optional official/biometric/AI/probability/sender/source gates remain separate. No tests or external actions performed. Next: configure ignored backend/.env when owner is ready, inspect development project/SQL access and follow L1 without deploying the frontend/backend.

### 5 October 2026 — Private GitHub handoff prepared

User authorized publishing the current workspace to https://github.com/TEE123754/KerjaOS. Destination verified private and empty; signed-in GitHub account matches owner. Prepared a root repository snapshot containing app/ plus root PRD/plan/checklist/original input, preserving upstream Git metadata locally outside publication. Source scan found no high-confidence secret-pattern matches across candidate text files; dependencies/builds/test outputs/private data/env excluded. AI/Supabase keys will be supplied later. This is source publication only; L1/L2 integration and final D1 deployment remain pending. Published main at commit 1bea68f5213576ec87e6d9d0bc6428fb12ee1e18; GitHub API confirmed the matching remote commit, main as default branch and repository privacy. Original upstream history is preserved locally in ignored .source-history/app.git. No functional tests rerun for this handoff.


### 5 October 2026 — L1 configuration slice constructed

READY_FOR_GATE. Saved supplied keys only in ignored local backend/.env; generated missing independent encryption keys, preserved existing values, configured local cookies/origins and modern server-secret alias. Morpheus authenticated active catalog includes pinned gpt-oss-120b; official listed input/output rates $0.07/$0.28 per million tokens. Built bounded public-FAQ-only adapter, strict output/circuit/no-retry guards and additive requested-model metadata wrapper. Prepared ignored ordered SQL Editor bundle. Next: one affected provider/chat/gateway/SQL gate and one public FAQ/live read-only service smoke. Full L1 remains IN_PROGRESS: project/SQL access, backup/restore/migrations, synthetic accounts/MFA/redirects and continuous journeys pending. No remote SQL/deployment/email/scheduler performed. Latest owner instruction authorizes inexpensive Morpheus use; no purchase or other paid activation.


### 5 October 2026 — L1 configuration/adapter gate passed; schema pending

Saved ignored backend credentials and independent encryption keys; modern secret compatibility confirmed by HTTP 200 Auth/JWKS/schema/Storage reads. Selected model valid live response: openai/gpt-oss-120b, strict approved FAQ variant, no fallback. Initial provider-label mismatch fixed by exact pinned alias; 37 initial affected backend tests and 16 targeted provider tests (38 distinct cases), 44 actual PostgreSQL assertions passed. Corrected venv command path and Vite sandbox config-loader access only. Backend/frontend running locally on 127.0.0.1:8000/5173; direct/proxied health and foundation HTML HTTP 200. No frontend change, unrelated regression suite or production build rerun. Git ignore confirmed for credentials/generated bundle.

Full L1 IN_PROGRESS: required M1 schema, M12/provider RPCs and private bucket missing; DATABASE_URL unavailable, owner confirmation of fresh development project/SQL Editor route pending. Next: project/SQL selection, backup/isolated restore then ordered migrations, synthetic accounts/MFA/redirects/jobs/quiz and full real Supabase journeys. L2/D1 unchanged; no remote SQL writes, account creation, email/scheduler/scraping/official checks/deployment. See app/docs/l1/GATE.md.


### 5 October 2026 — U1 UI/demo/recruiter parity construction

IN_PROGRESS. User requested React95 + Themesberg reference styling, KerjaOS-only product copy, ready demo accounts and active original-feature parity. Building isolated sample-data candidate/recruiter desktop (no Supabase authentication bypass), responsive retro shell, active scoped job setup/accounts/requirements/resume/bias/matching/Interview A/B/report/email-draft and read-only agent activity adapters. Retaining original offline algorithms; external inference/email/status mutations are not delegated to old graph. New additive L2 recruiter RPC migration is prepared locally; remote execution stays pending SQL access. Tests NOT_RUN during construction. Next: finish UI/demo/parity mapping, then one completed-phase affected gate and visual review.

### 5 October 2026 — U1 local UI/demo/parity gate passed

LOCAL_GATE_PASSED. React95/Windows 95 UI Kit references adapted with MIT notices; active KerjaOS UI has no old brand copy. Ready candidate/recruiter sample credentials are prefilled; isolated demos cannot write private account routes. Added active profile/PDF preview, scoped job builder/application windows/accounts/encrypted manual sources and deterministic requirement/resume/bias/matching/Interview A/B/report/roadmap/email-draft with read-only SSE. Preserved canonical M1–M12 controls. Original-feature audit now in app/docs/ui/PARITY.md with explicit limits.

32 backend tests, 26 actual SQL assertions, four browser journeys, foundation typecheck and production build passed; zero axe violations on sampled login/candidate views and narrow-screen fit. Repaired one JSX closing tag, used normal approved Vite filesystem invocation after sandbox config lookup failure, and corrected job UTC/local editing conversion; targeted typecheck rerun only. Visual screenshot retained locally. No remote SQL, deployment, scraping, delivered email or external model calls this phase.

Remaining: L1 migrations/private bucket/synthetic accounts/MFA/live flows; avatar upload; optional provider/OAuth/sender/source activation; L2 concurrency/restore/retention/readiness and D1 deployment last. Seven-day source expiry is enforced on reads; physical deletion requires documented service cleanup. UI sample English/BM support is partial in new demo modules, so complete EN/BM review remains L2-05. This is local implementation parity, not a claim that every original capability is live. Changes remain uncommitted locally.

### 5 October 2026 — U2 original portal parity correction built

READY_FOR_GATE. Direct upstream main check equals preserved be3bf1de baseline. Restored explicit Overview/position dashboards/KPIs, actual trajectory scores and scatter/detail interactions, fair hiring visibility controls and audit comparison, sample paired candidates, candidate pipeline/search/filter/sort, horizontal role navigation and dedicated workflows. Real assigned dashboard/current encrypted resume review use scoped RPCs; decision/note forms use canonical guarded transitions. Rank bonus found in legacy trajectory helper; active scoring strips institution/rank regardless of display controls. No fake default scores. Tests NOT_RUN during construction; one affected phase gate next.

Remaining original-feature gaps explicitly tracked: avatar upload, persisted assessment history/fair-control policy, optional email/OAuth/approved sourcing and L1 actual migration/accounts/live journeys. New migration prepared only; no remote SQL/deploy/email/external model calls. D1 remains last.

### 5 October 2026 — U2 overview/trajectory/fair-control gate passed

LOCAL_GATE_PASSED. 46 distinct affected backend cases, 40 actual PostgreSQL assertions, six distinct browser journeys, foundation typecheck and production build passed. Initial repairs: qualification-only institution neutralization, calendar Promise callback, deny-expectation correction and explicit selector labels. Reran affected recruiting/SQL/overview checks only; unchanged passed journeys were retained. Read-only review decrypts/parses only the authorized current unexpired PDF; no fabricated default score or private account bypass. Fairness controls hide identity/institution across returned artifacts; generation guard discards stale review responses.

Original-like horizontal recruiter/candidate navigation now integrates Windows 95 panels; overview includes position/KPI strip, fit/trajectory scatter, candidate profiles/contributors/roadmaps, fair controls, sample paired comparison, filters and canonical human action form. Visual evidence saved locally in app/.local/kerjaos-overview.png. Gate details: app/docs/ui/U2-GATE.md.

Remaining explicitly: avatar/photo, persisted assessments/employer control policy, L1 migrations/private bucket/synthetic MFA accounts/live journeys, optional OAuth/email/approved sourcing and full new EN/BM review. Source existence still does not count as live parity. No remote SQL, email, scraper, external inference or deployment. D1 last. Local changes remain uncommitted.

### 5 October 2026 — U3 modern dashboard redesign constructed

READY_FOR_GATE. Viewed all five user-supplied reels in browser. User superseded Windows 95 direction. Implemented shared light/dark sage/cream dashboard design with pastel metrics, rounded bento panels, sidebar/mobile strip, modern sign-in and original branding mark. Removed faux windows/taskbar/clock/drag controls; real collapsible panels remain mounted to preserve drafts. Demo credentials now public synthetic KerjaDemo2026!; normal account authentication unchanged. Theme mapping supports existing Classic/Luna preferences and persists demo changes.

Original modules and real privacy/CSRF/auth gates retained. PRD F10 and IMPLEMENTATION_PLAN U3 updated. Construction performed without tests. Next is one affected frontend gate and browser visual review; no backend/SQL changes in this phase. L1/live parity gaps and full EN/BM remain explicit; D1 deployment last. Local only.

U3 gate initial result: TypeScript and production build passed. Eight affected browser journeys ran once after construction: five passed, three need repair. Entrance opacity caused temporary axe contrast failures; empty pipeline scrolling needed a keyboard-focusable region; an encoding conversion affected talent captions. Repaired these. Rerun only affected desktop accessibility, overview and human-interview journeys, plus final build/typecheck for the changed output. No backend/SQL retesting required.

### 6 October 2026 — U3 modern dashboard gate passed

LOCAL_GATE_PASSED. Foundation TypeScript and production build passed. All eight distinct affected browser journeys passed after targeted repairs. Verified prefilled isolated demos, every candidate tool on mobile, actual recruiter trajectory/fair controls and details, normal-account scoping fixture, draft retention across collapse/navigation, human interview outcome flow fixture, theme persistence, sampled axe accessibility, 390px/200% zoom and reduced motion. Fixed entrance fade contrast, empty scroll-region keyboard access, talent text encoding and theme-switch background transition. No unrelated passed suite repeated.

Desktop light/dark and mobile previews saved in app/.local/kerjaos-modern-*.png. Browser console review returned no error entries. Updated PRD F10, IMPLEMENTATION_PLAN U3, README and active parity documentation; details in app/docs/ui/U3-GATE.md. React component review confirmed mounted draft retention/stable IDs, native dialog focus and non-sensitive appearance storage. No new dependencies.

Remaining: L1 hosted schema/private bucket/synthetic MFA/live integration, avatar, persisted assessments/fair policy, optional provider/sender/OAuth/approved sources and complete EN/BM copy review. No backend/SQL changes, deployment, real mail, scraper or external inference in this UI phase. D1 remains last. Local changes uncommitted.

### 6 October 2026 — U4 blue/violet palette constructed

READY_FOR_GATE. Replaced green/sage primary palette with royal blue #4254D6, indigo navigation and blue/violet accents in shared light/dark CSS and the original K mark. Updated login hero, metric cards, focus/selection, checkboxes, progress and trajectory points across active demo/account views. Layout and workflow code unchanged. PRD/README palette descriptions and U4 checklist updated. No tests during construction; targeted phase-end UI gate next. Existing integration/feature gaps remain open; local only, D1 last.

### 6 October 2026 — U4 palette gate passed

LOCAL_GATE_PASSED. Royal blue/violet palette applied across shared light/dark UI and brand mark. Production build and three existing targeted browser journeys passed; zero sampled axe violations, mobile fit and overview/trajectory/fair-control behaviour retained. Visual login/light/dark review saved in app/.local/kerjaos-blue-*.png. U4 checklist and current PRD/README descriptions updated; gate details in app/docs/ui/U4-GATE.md. No new test cases, backend/SQL changes or unrelated suite runs. Existing live integration/features remain open; deployment stays D1 last. Local only.

### 6 October 2026 — DOC1 product README refresh

DOC_REVIEW_PASSED. Read both requested reference READMEs and rewrote the root KerjaOS README around the current product: branded introduction, problem/feature tables, candidate/recruiter capabilities, demo credentials, blue/violet screenshots, hiring workflow, review/scoring explanation, architecture, stack, PowerShell setup, environment/API map, privacy, validation, roadmap, troubleshooting and documentation links. App README now points to the current root overview while retaining historical notes/source attribution. Three existing invented-data screenshots copied into portable docs/images/ assets.

Reviewed feature claims against active routes, scoring code, configuration, package requirements and existing parity/gate evidence. Verified 44 local file/image references and 25 anchors; all three PowerShell setup blocks parse with zero syntax errors; demo environment settings match the secret-free template. Image validation found JPEG bytes under historical .png filenames; portable copies and README links now use .jpg, with all three JPEGs verified at 1405x790. Git whitespace review passed. No installation, application suite/build, live Supabase query/migration, inference, email, scraper or deployment was needed for this documentation-only task.

README task complete. Remaining product work is unchanged: L1 schema/private bucket/synthetic accounts/MFA/full integration; L2 avatar, persisted assessments/fair policy, concurrency/recovery/retention and full EN/BM/readiness review; optional services retain their activation gates; D1 deployment last. IMPLEMENTATION_PLAN.md DOC1 checklist updated. Local files remain uncommitted.

### 6 October 2026 — U5 exact reel dashboard construction

IN_PROGRESS. Directly viewed Dd7AalkTZPY and the creator-linked public Coterie preview, including Overview, People and Payroll surfaces. Building the selected cream/yellow layout with all visible dashboard element types, using existing recruitment workflows and original assets/code. Original fictional demo portrait generated with the built-in image tool. Payroll/timesheet scope question pending; no financial processing authorized by reference content. Tests NOT_RUN during construction. Next: complete shared elements and demo/real adapters, then one affected phase-end gate. L1/live integration remains open; D1 deployment last.

### 6 October 2026 — Owner-confirmed HR expansion U5/H1

IN_PROGRESS. Owner requested full recruitment + HR management including payroll/timesheets and candidate → company joining → employee dashboard, resolving the earlier question. Constructed cream/yellow bento UI/original portrait/OFL local fonts; recruiter management, employee demo and accepted hire rehearsal; private HR migration and scoped FastAPI adapters. Tasks/time/leave review/manual payroll/CSV/payslip/calendar/directory/offboarding are built with independent HR/payroll MFA grants. React review applied: request/interval cleanup, scope-derived records and appearance-only persisted preferences. Tests NOT_RUN during construction.

Plan separates H1 local gate, hosted activation and H2 statutory/profile/device/benefits/scaling/retention work. No remote SQL, inference, mail, scraping, bank transfer or deployment. Production HR is not yet claimed; D1 last. Next: finish tests/docs then one phase-end gate.

### 6 October 2026 — U5/H1 construction complete

READY_FOR_GATE. Added strict API validation, actual offline PostgreSQL security/transition tests and four browser journeys (joining, employee self service, management/payroll/calendar, normal-account CSRF). Completed setup and original asset/reference mapping docs. Replays recheck current grants/session/employment before returning cached payroll; duplicate UI writes are locked and failed live commands retain an in-memory retry key. Malaysia date boundaries and time/leave/payroll constraints are enforced in DB. No tests were run during construction. Next: one affected phase-end gate, targeted repair only if failures.

U5/H1 gate first results: 12 API cases passed; four exposed a nested datetime import damaged by an edit and are repaired. SQL reached the offboarding checks; an assertion incorrectly expected a payroll grant at aal1, corrected to verify both aal1 denial and aal2 independent staff access. Foundation tsc needs the existing Vite CSS types in the invocation; no TypeScript source errors reported. Only failed/affected checks will rerun. Browser gate follows.

U5/H1 gate: all 12 distinct browser journeys passed after targeted repairs (8 initially, 4 repaired reruns). Fixed export hover contrast, new HR fixture responses and malformed empty-policy fixtures, plus visible punctuation encoding. Visual comparison confirmed cream/yellow layout and reference elements; added gauge ticks, dotted graph guides and horizontal settings. A career preference now survives refresh after joining so polling cannot pull an employee away from other applications. Only this affected career/accessibility journey and final build/typecheck need confirmation. API 16 cases and PostgreSQL 59 assertions remain passed; no SQL/backend changes since those gates.

### 6 October 2026 — U5/H1 local phase passed

LOCAL_GATE_PASSED. KerjaOS now has recruitment plus a local HR baseline: accepted final human hire creates company invitation, candidate joins and defaults to employee dashboard while keeping career/applications; company directory, task/onboarding notifications, timer/time draft/submit/review, leave/review, event calendar, offboarding and reviewed integer-cent MYR payroll draft/approve/issue/CSV/own payslip. Independent live HR/payroll MFA grants, scoped private SQL RPCs, current revocation on replay, optimistic revisions/idempotency/audit and bounded input checks. Payroll staff can read approved time/leave calendar data without leave reasons. Only own issued salary visible to employees; HR/recruiter roles do not inherit company salary access.

Selected cream/yellow/black reel interface now supplies pill navigation, rail/counts, original demo portrait, local OFL Outfit/Inter, dotted thin graph, timer gauge/ticks, dark tasks, accordions, weekly/monthly calendars, selectable/filterable people, roster/profile/three progress meters. Recruitment overview/trajectory/fair controls remain mounted/reachable; secondary HR tabs hide that overview to keep their own layout. Ready employee demo and isolated accepted hire rehearsal added. Career choice survives refresh after joining.

Phase-end evidence: Foundation TypeScript passed; final Vite output JS 446.97 kB / gzip 130.91 kB, CSS 161.90 kB / gzip 28.32 kB. 16 API cases (12 first + 4 repaired), 64 PostgreSQL assertions and 12 distinct browser journeys passed. Browser repairs reran only failures/affected flows; final navigation/meters checked in affected management/trajectory journeys. Added DB payload bounds and approved-time/leave privacy assertions, reran only that SQL gate. No unrelated old backend/SQL suites repeated. Sampled axe zero violations; exact 390px/reduced-motion in browser gate; CUA desktop/people/payroll/light/dark/mobile preview and local Outfit verified, no console error entries. README local references (51) and new gate references verified; screenshot JPEG signatures and Git whitespace passed. Secret env stays ignored.

Portable screenshots saved under docs/images/kerjaos-hr-*.jpg and updated signin image. README/PRD/IMPLEMENTATION_PLAN/PARITY/setup/asset mapping/gate updated. Original fictional portrait uses built-in image generation; exact prompt in U5-ASSETS.md, no commercial template source/media copied. CLI-generated H1 migration remains unapplied remotely. No real mail, scraper, inference, payments, purchase or deployment. Local frontend 5173/backend 8000 restarted with final code; files remain uncommitted.

Left: H1-LIVE + L1 hosted schema/private bucket/synthetic Auth/MFA/grant provisioning/real journeys; L2 avatar/persisted assessments/fair policy/readiness; H2 statutory payroll/entitlements/holidays/overtime, contracts/full profiles/device/benefits/pension, corrections/history, scalable reports/pagination and separately reviewed HR financial retention/export/erasure/offboarding access. Issued payroll is a ledger record, not money paid. D1 deployment remains LAST.

### 6 October 2026 — U6 workspace mode header

IN_PROGRESS. Added shared Management / Recruitment header and separated dashboards in demos/accounts. Both surfaces remain mounted across mode switches to preserve selected pages and drafts; candidate joining/employee career access retained. Accessible native buttons, current-mode marker, BM labels and mobile styling. Tests NOT_RUN during construction. Next: complete round-trip browser coverage and docs, then one frontend phase-end gate. No backend/SQL/deployment changes.

U6 READY_FOR_GATE. Construction and coverage complete; React review checked native keyboard controls, stable mounted trees and in-memory state. Separate recruitment heading avoids a duplicate heading; HR-only navigation is hidden in Recruitment. README mode guide updated. Next: Foundation typecheck/build and 12 affected browser journeys. No tests run during construction.

U6 first gate: typecheck/build passed, eight browser journeys passed. Four failed only the new active mode button contrast (2.12:1); switching, preserved drafts/selection, CSRF and recruitment rendering passed before the accessibility assertion. Corrected active fill to dashboard yellow #FACB3A with dark text. Rerun only those four affected journeys and final CSS build; no backend/SQL tests.

U6 targeted gate: active colour corrected and all four accessibility checks passed; three journeys completed. Human interview journey reached a newly exposed 200% zoom overflow in the mode header at 390px. Allowed the two mode buttons to wrap with bounded flexible widths. Next: only affected zoom/interview and mode-header mobile journeys plus final CSS build.

### 6 October 2026 — U6 local phase passed

LOCAL_GATE_PASSED. Added the shared Management / Recruitment header above both dashboards. Mode buttons are native, indicate the current mode and use dashboard yellow; English/BM labels, light/dark and narrow wrapping. Management and Recruitment are separate visible surfaces with stable mounted state: selected pages, people search/selection, unsaved payroll/recruitment/timesheet drafts survive switching. Employee/candidate career access, scoped live HR permissions and account career preference on refresh retained. Session sign-out still resets demo data; no sensitive storage added.

Phase-end TypeScript/build passed. Final output JS 448.03 kB / gzip 131.14 kB; CSS 163.05 kB / gzip 28.49 kB. 12 distinct affected browser journeys passed: workspace modes 1, HR 4, desktop demo 3, talent overview 2, foundation 1, interviews 1. Initial eight passed; four exposed active contrast, repaired and rerun. Three then passed; interview exposed 200% zoom header overflow, repaired wrapping and reran only interview/mode-header checks. Sampled axe zero violations, 390px/light/dark/reduced-motion and 200% zoom checks passed. No backend/SQL suites repeated.

Implementation checklist, README mode guide/current management image and app/docs/ui/U6-GATE.md updated. Browser visually confirmed both separate dashboards; invented-data screenshots saved as docs/images/kerjaos-workspace-modes.jpg and kerjaos-recruitment-mode.jpg. Local preview stays open. No backend/schema/grant/service/deployment changes. H1-LIVE/H2/L1/L2 remain open and D1 remains last; files remain uncommitted.

### 6 October 2026 — U7 overview / floating assistant

IN_PROGRESS. Added Main Overview mode with current scoped HR/recruitment snapshots, ongoing/phase metrics, review queues and upcoming company events; direct HR queue navigation and recruitment entry. Recruiter demo starts on Main Overview; employee default management remains. Added floating assistant launcher/nonmodal chatbox, Escape and focus return, isolated demo messages and existing authorized live progress API with read-only current workspace HR summaries. Snapshots clear on session end; no salary totals/private leave reasons included in combined overview. Construction continues for styles, coverage and docs. Tests NOT_RUN; no backend/SQL/service/deployment changes.

U7 READY_FOR_GATE. Construction complete: responsive cream/yellow bento overview, separate review queues, payroll period/loaded cohort labels, visible no-data states and floating session-only chat. Completed four browser journeys for propagated task/payroll/job statistics, direct queue navigation, cross-mode conversation, Escape/focus, demo read-only/no writes, own employee limits and live scoped progress with CSRF/unavailable HR. React review checked stable snapshot callbacks, mounted mode state, assistant option request cleanup/session clearing and current data replies. No tests during construction. Next: one frontend phase-end typecheck/build/affected browser gate; only failed/affected checks rerun after repairs.

### 6 October 2026 — U7 local phase passed

LOCAL_GATE_PASSED. Added Main Overview to the shared header and made it the recruiter demo entry. Combines scoped loaded recruitment/HR metrics, ongoing application phase bars, resume/decision/time/leave/overdue-onboarding/payroll queues and upcoming company events, with direct workspace links. Current tasks, payroll actions and job changes propagate through stable snapshot callbacks; mode/draft state remains mounted. Unavailable data is labelled, recruitment loaded/total and payroll month are explicit. Employee summaries are own-scope; payroll queue requires independent payroll permission; no salary amounts/leave reasons/raw reports/candidate names in combined statistics.

Floating bottom-right icon opens a nonmodal chatbox across signed-in modes. Demo bounded in-memory conversation and current session summaries; no private writes/external requests. Live assistant uses existing selected candidate/assigned-role progress endpoints and CSRF; local authorized HR summary avoids an external model. Close/Escape returns launcher focus; conversation/draft survives reopening and mode switches. Account sign-out clears snapshots and removes assistant. Native EN/BM controls, request cleanup and mobile/light/dark/zoom/reduced-motion layouts reviewed.

Phase-end gate passed first run: Foundation TypeScript, production build, 18 distinct affected browser journeys (new overview/assistant 4 plus modes 1, HR 4, desktop demo 3, talent 2, foundation 1, interviews 1, modern workspace 1, progress chat 1). Sampled axe zero violations; exact 390px and 200% zoom with opened assistant, plus existing human interview flow passed. Build JS 465.10 kB / gzip 136.30 kB; CSS 168.67 kB / gzip 29.45 kB. No tests during construction, no unrelated backend/SQL runs and no failed reruns needed.

CUA reviewed both new features at local 5173; screenshots saved as docs/images/kerjaos-main-overview.jpg and kerjaos-floating-assistant.jpg. Checklist, README/PRD and app/docs/ui/U7-GATE.md updated; local preview retained. No backend/schema/grant/service/model/deployment changes; files remain uncommitted. Overview is a loaded cohort snapshot, not realtime/full-company reporting. H1-LIVE/H2/L1/L2 remain open; D1 deployment stays LAST.
