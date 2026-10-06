# KerjaOS — Phase-by-phase Implementation Plan

Version 1.1 · Updated 5 October 2026 (Asia/Kuala_Lumpur).

Read [PRD.md](PRD.md) for product requirements and verified service limits. Update [PROGRESS.md](PROGRESS.md) throughout implementation. `Kerja.md` remains the original input. Application source is now in app/. M1–M12 local implementation/composite or affected gates have passed; all planned local milestones are complete. Next: L1 Supabase-connected localhost integration, then L2 local readiness; D1 deployment is the final phase. Real-data/legal and optional sender/provider activation remain gated.

## 1. Delivery rules

1. Reuse React/Vite, FastAPI/Supabase, RecruitingAgentGraph and useful tests. Build new capabilities as application services, tools and provider adapters. No whole-app rewrite or silent change of hosting.
2. Work in order M1–M9 for the baseline, then M10–M12 for the tracker extension. Complete a usable vertical slice and its migrations, docs and demo for each milestone. Internal subtasks do not become separate test runs.
3. **Run tests only when one implementation phase is ready for its completion gate.** Do not run pytest, Playwright, promptfoo, browser verification, dependency scans or full builds after every edit. Develop the relevant tests during that phase; run the affected suite, one build/type/lint check and the necessary smoke/E2E scenarios at its gate.
4. If a gate fails, repair the phase, then rerun only failed/affected checks. Broaden a rerun only if the failure or new changes justify it. Do not rerun every earlier phase routinely. M9 runs one complete release rehearsal because integrated behaviour has changed since earlier gates.
5. CI should run expensive test jobs through a manual `workflow_dispatch` or an explicit milestone-ready label/condition. Do not use a recurring model-evaluation job or run the entire suite on every small push. Deployment healthchecks are runtime checks, not repeated test suites.
6. Use synthetic fixtures, mocked providers and cached model responses. No live checks on real candidates, paid inference, purchased credits, or test scraping loops. A one-time permitted source smoke fetch is part of M7's gate.
7. Gate results, affected commit, commands, counts, failures and artifact locations must be recorded. An unchecked box or “built” is not evidence that the phase passed. No skipped tests presented as passing.
8. Never commit secrets. Ask before destructive data changes. Prefer additive migrations, shadow data and restore plans; a deployment rollback must not restore weak authentication/public uploads.
9. Every newly touched endpoint needs server authorization; each application mutation needs the common transition/service boundary. Every decision and candidate-facing adverse message needs a human approval reference.
10. Legal, hosting and provider gates can leave only those dependent features disabled. Continue useful free work. Do not mark a mock provider as live functionality or a commercial release as eligible.
11. **During and after each phase, update the phase checklist in this implementation plan and the detailed tasks in PROGRESS.md with what has been done and what remains. Save these updates before reaching the usage limit or ending the working session.** Record partial work honestly, blockers, test status and the exact next task so implementation can resume without losing progress. Do not wait until the entire phase is complete to save its status.

12. **Local-first order (user decision, 5 October 2026):** keep frontend/backend on localhost. Supabase may be connected as the development Auth/database/private Storage service. Complete L1 integration and L2 local readiness before D1, the final Vercel/Railway deployment phase. Supplying Supabase credentials does not activate hosting, email, scraping, external AI or official checks. Do not deploy during L1/L2.

## 2. Milestones, dependencies and effort

Estimates assume one experienced developer, reuse of existing code, prompt access to accounts and no paid official-check integration. They are planning ranges, not calendar commitments. Original M1–M9 implementation estimate: **36–55 developer days**, roughly 8–11 working weeks plus external review delays. The newly planned M10–M12 extension adds approximately **9–13 developer days**; this is not a hosted release date. M0 is completed planning, outside that estimate.

| Phase | Result | Dependencies | Estimate | Product mapping |
| --- | --- | --- | --- | --- |
| M0 | PRD, research and living checklist | None | Complete in this task | All requirements scoped |
| M1 | Security, canonical applications and free-mode foundation | M0 | 6–9 days | F01/F02, privacy, core architecture |
| M2 | Enforced stages and multi-job candidate/HM views | M1 gate | 4–6 days | F01, workflow, human controls |
| M3 | Consent-aware identity review | M2 gate | 4–6 days | F03 |
| M4 | Separate real quiz and practice readiness | M3 gate | 5–7 days | F06 |
| M5 | Background evidence workflows and mocks | M4 gate | 3–5 days | F04/F05 |
| M6 | Free-safe gateway and scoped progress chatbot | M5 gate | 4–6 days | F07, AI/tool layer |
| M7 | Permitted job feeds/discovery and external tracker | M6 gate | 4–6 days | F08 |
| M8 | KerjaOS branding, retro polish and complete scheduling | M7 gate | 3–5 days | F09/F10, rebrand |
| M9 | One integrated release gate, runbooks and demo | M8 gate | 3–5 days | Quality, operations and release |
| M10 | Unified tracker, resume library and company workspace | M9 local gate; existing ownership/private-storage boundaries | 4–6 days | F11; extend F01/F02/F08 |
| M11 | Candidate analytics and assigned-employer dashboard | M10 local gate and defined reporting dates/events | 2–3 days | F12 |
| M12 | Follow-up reminders with optional verified email delivery | M10/M11 local gates; configured free sender only for email activation | 3–4 days | F13; extend F09 |

No need to wait until M6 to secure existing external model calls: M1 disables paid defaults, applies minimal-data rules to existing calls, and makes deterministic mode usable. No need to wait until M8 to support a basic interview endpoint: M2 wires its human-only entry condition; M8 completes conflict handling, confirmations and UX.

## 3. Repository seams and proposed additions

Existing paths below are now present under app/. Preserved legacy components do not establish active feature availability: app/src/app/App.tsx routes to the secured foundation workspace. Recheck source and active routes before adding or migrating features.

| Existing seam | Upgrade |
| --- | --- |
| `backend/app/database.py` | Introduce scoped repositories; migrate away from loading/mutating all candidates |
| `backend/supabase_schema.sql` | Preserve as baseline; add versioned Supabase migrations, mapping and reconciliation reports |
| `backend/app/routes/candidates.py` | Split auth/profile/application/document/quiz responsibilities incrementally; retire unsafe email-based writes |
| `backend/app/services/agents/graph.py` and `tools.py` | Inject application/actor/policy context; gate registered tools; append safe provenance |
| `backend/app/services/agents/guardrails.py` | Bind injection/input/output controls to permissions rather than text-only rules |
| `backend/app/services/linkedin_profiles.py` | Remove authenticated-cookie route; restrict any permitted source path and label synthetic fixtures |
| `src/app/components/CandidatePortal.tsx`, `HiringManagerPortal.tsx` | Replace localStorage sessions and latest-job shadow state with `/me` and application UUIDs |
| `candidate/CandidateHome.tsx`, `CandidateSandbox.tsx` | Application list/details and explicitly separate practice vs production assessment screens |
| `hiring-manager/CandidateDashboard.tsx`, `InterviewCalendar.tsx` | Job-scoped review, approvals and real interviewer scheduling |
| `src/styles/*`, `BrandLogo.tsx`, metadata and emails | Theme tokens first; final branding and MUI removal at M8 |
| `vercel.json`, backend Dockerfile/railway configuration | Proxy before SPA fallback, healthcheck, pinned lean dependencies and budget-aware mode |

Proposed modules, to adapt to the current repository conventions:

```text
backend/app/auth/                  # session facade, identity, CSRF, RBAC
backend/app/repositories/          # profiles, jobs, applications, scoped transactions
backend/app/services/pipeline.py   # allowed transitions and human decision boundary
backend/app/services/privacy/      # consent, PII filtering, retention and DSAR
backend/app/providers/             # identity, credit, criminal, llm, decisions, job sources
backend/app/workers/               # queue leases, retries, expiry and discovery runners
backend/app/routes/applications.py # UUID-based application endpoints
backend/app/routes/practice.py     # independent practice API
backend/app/routes/chat.py         # read-only authorized tools
supabase/migrations/               # additive migrations and reproducible backfills
tests/e2e/                        # synthetic milestone scenarios
evals/                            # versioned golden inputs and cached provider outputs
docs/demo/                        # a short scenario for each milestone
docs/runbooks/                    # rollback, restore, budget, retention, incident response
```

Avoid installing everything at once. Existing frontend versions can stay initially; pin any new dependencies and add a Python lock/constraints strategy in M1. Security/version updates are deliberate changes with their own gate scope, not opportunistic major rewrites.

## 4. M1 — Security, applications and free-mode foundation

**Outcome:** authenticated users can safely access their own canonical applications; legacy data is recoverable; no paid or sensitive providers are required.

Build:

- Obtain a working checkout; read applicable repository instructions; record base SHA. Inventory routes, jobs, settings and agent/email dispatch paths. Inspect account configuration privately and do not reproduce credentials in planning or logs.
- Make a redacted data-shape inventory plus encrypted DB/object backup; write a restore recipe. Measure Railway memory/startup and confirm Vercel use eligibility. Default to `demo_free`.
- Introduce employer/membership/job-assignment scope and candidate Auth UUID mapping. Existing users prove email ownership through a verified flow before account linking; never trust an email string provided by a client.
- Use Supabase Auth with FastAPI-owned login/PKCE callback/refresh/logout and opaque session cookies. Add Google OAuth as a free demo login route with minimal scopes; email signup/reset requires a suitable configured sender. Supabase supports Google login but requires app/provider setup. [Supabase Google guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
- Replace legacy SHA-256 authentication. Preferred migration: verified account linking/reset through Supabase Auth; do not import SHA-256 hashes as though they were compatible credentials. Disable old password/reset endpoints after cutover; no unauthenticated resets. Document manual recovery for users without an eligible OAuth/sender route. If temporary custom authentication is unavoidable, use Argon2id behind the same facade and explicitly track removal; this is a contingency, not a second permanent auth system.
- Add exact origin CORS, CSRF, host-only Secure/HttpOnly cookie, private-response `no-store`, rate limits, safe errors and server authorization. Add MFA/AAL2 enforcement to HM/admin/reviewer decisions. Proxy `/api/v1/*` to Railway before SPA fallback; local Vite proxy matches that shape.
- Enable RLS and explicit grants for the actual ownership model; private schemas for sessions/evidence. Do not rely on broad service-role policies for candidate isolation. Supabase's service key can bypass RLS, so ordinary repository operations must use verified request scope and a restricted role. [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Repair applications using new UUIDs. Use an additive shadow table/mapping during migration: collect candidate payload arrays plus normalized rows, reconcile candidate+job+cycle, and preserve records with conflicting history for manual review. Backfill events with actor `migration` and source provenance; do not invent historic transitions.
- Switch reads/writes to scoped repositories and a canonical application row. Keep latest-application fields only as a short-lived compatibility view; stop writing them as business truth. Avoid deduplicating by job-only IDs.
- Disable autonomous rejection messages and final-decision writes unless a valid human approval exists. Freeze affected unsafe routes until secured. Remove cookie-based LinkedIn scraping, disable paid Apify defaults and isolate synthetic sourcing.
- Move existing uploads into a private quarantine/storage route; remove public access after migration. Signed access checks ownership/purpose; encrypt sensitive evidence before retention features arrive.
- Add local PII filtering and input delimiters/schema validation to existing agent calls. Disable default paid model paths in free mode. Preserve deterministic behaviour and explicit `fallback_warning`.
- Add durable `work_items`, `outbox_events`, retention metadata, audit events and safe provider configuration. Add minimal theme tokens and i18n scaffold without an interface rewrite.

Migrations: UUID application shadow/mapping, employer scope, Auth/profile linkage, baseline consent/document/queue/audit/session tables and indexes/policies. Use expand/backfill/reconcile/switch stages. A CLI-generated migration and an idempotent backfill script must be versioned; a shared SQL-editor-only change is insufficient.

**Phase completion test gate:** pytest auth/ownership and application repository tests; synthetic A/X, A/Y, B/X migration including conflicting legacy IDs; API denial for guessed emails/UUIDs and wrong employers; password recovery ownership; logout/revocation/MFA/CSRF; private storage access/expiry; human rejection guard; scan source/build artifacts for credentials; one frontend build and one deployed-proxy cookie/SSE smoke scenario. Reconcile pre/post row counts and preserved histories. Measure idle/warm memory and credit consumption without running OCR/models in the API container.

Demo: A logs in and sees X/Y; B applies to X; B cannot access A; private resume opens only through authorized access; automatic rejection draft remains undispatched.

Exit: no public candidate uploads, weak password auth, broad unscoped mutation or job-only IDs in canonical writes. Auth linking and source data reconciliation have evidence. Unsafe optional integrations are disabled. Migration/README/env docs and test evidence are linked in PROGRESS.

Rollback: return to the compatible secure API while retaining new IDs and mapping. Restore encrypted snapshot only after review and deletion-ledger replay. Never re-enable public uploads or SHA-256 auth to make a rollback easier.

## 5. M2 — State machine and multi-apply dashboard

**Outcome:** each application has an independent P0–P6 history and next action, with human decision control.

Build:

- Implement `PipelineService` and a job-policy snapshot: prerequisites, skips, approvals, expected version and idempotent event/outbox write in one transaction.
- Add canonical application endpoints, candidate list/details, UUID-based links, resume snapshot, duplicate prevention, withdraw/reopen/job-close handling and history.
- Candidate dashboard shows stage/status, action/deadline, updates and filter/sort. Fetch on focus/actions; bounded pending-work polling in free mode. Use safe placeholders while a cold backend wakes.
- HM dashboard shows job-scoped application queues and decision dialog requiring a human actor, reason and evidence references. Shortlist is explicitly different from hired. Candidate-visible and private notes use separate DTOs.
- Route existing graph results to the selected application, not candidate-wide state. Adapt legacy APIs to canonical IDs or retire them; do not maintain parallel truth stores.
- Add stage entry for real interviewer scheduling; enforce shortlisted status. Required unavailable checks block shortlist until an authorized, documented exception is reviewed.
- EN/BM stage and action copy; no opaque completion percentage or fabricated prediction.

Migrations: stages/statuses/version/policy snapshots, application event ledger, notification/outbox indexes, role-level decision guard and scheduling-entry fields.

**Phase completion test gate:** allowed/forbidden transitions; replay/optimistic-lock races; duplicate application/decision submission; human-vs-agent permission; withdraw and job closure; A/X, A/Y, B/X dashboard reload; private note exclusion; EN/BM labels; one focused Playwright candidate/HM scenario and affected backend suite. Run the relevant build/type checks once.

Demo: A submits two roles; HM advances one, pauses the other; candidate dashboard and read-only history show different next actions; an agent cannot reject or shortlist.

Exit: every new stage change uses the common audited service; no rejected/withdrawn application can be scheduled. Docs and the checklist reflect the policy ordering.

Rollback: disable new progression UI and preserve canonical events/IDs; compatibility DTOs must remain scoped and secure.

## 6. M3 — Identity review and consent

**Outcome:** P2 has a real, private, human-reviewable workflow with truthful verification labels.

Build:

- Versioned identity consent and per-employer sharing grants; identity case UI, alternative document/manual route and reviewer assignment.
- Private encrypted document upload, quarantine, OCR-assisted MyKad field comparison using existing RapidOCR where resources/licenses allow. Format consistency does not become official NRD validation.
- ManualEvidenceProvider + mock + unconfigured eKYC stub with normalized result states. Existing code must never map a mock/format pass to `verified_official`.
- Minimal reusable verification assertion with reviewer/method/date/expiry; fresh employer-specific consent before reuse. Revoke assertion sharing separately from the profile.
- Durable retention jobs for documents/temporary extracts and deletion evidence. Block new capture if the promised cleanup window is missed.
- Keep face/liveness off. A separate experimental branch/flag can benchmark only synthetic/explicitly consented research fixtures on local hardware; approval of model-weight licenses and evaluation is necessary before enabling that route. Manual document verification remains the free default.

Migrations: identity cases, consent scope/version/evidence, document expiry/quarantine, sharing grants and reviewer ACLs.

**Phase completion test gate:** missing/revoked/wrong-employer consent; malformed/blurred document; alternative route; raw ID exclusion from logs/LLM calls; signed URL ownership/expiry; worker crash/retry and actual object deletion; reused assertion expiration. Run affected pytest and one Playwright consent/upload/reviewer/next-action flow. Optional face experiment tests belong only to a completed explicitly enabled extension.

Demo: blurred document requests correction, manual reviewer records method, candidate consents to share the minimal assertion for a second employer, and revocation prevents reuse.

Exit: P2 works without a paid eKYC vendor or hosted biometric model; no biometric/certified claim is made. Legal gates for real document processing are recorded rather than inferred from test success.

Rollback: disable new capture; preserve review status and securely expire evidence. Do not revert private storage.

## 7. M4 — Real quiz, practice and readiness

**Outcome:** candidates can practise without exposing or affecting the actual screening process.

Build:

- Separate real/practice banks, versions, access rules and attempt tables. Review existing CandidateSandbox and job-scoped draft-answer flows; remove the shared mutation path.
- HM publishes role competency/rubric/question versions. Real attempts use server deadlines, randomized question sets, autosave, reconnect and explicit retake/accommodation workflow.
- Objective grading is deterministic. Subjective grading defaults to human assessment, with optional pinned free-model recommendations after evaluated setup. Never give a router-generated score the appearance of a stable rubric.
- Readiness index/band with transparent components, missing-input handling, weak pillars and a roadmap. No “hire probability” claim. Candidate practice is private and cannot unlock P3/P5.
- Extend Report Agent with only permitted practice data; templates must work offline. Record audit data needed for a later calibrated model, only where lawful/consented; do not train the future predictor in this phase.

Migrations: bank/version/attempt/answer schema, server deadline, submission revision, practice result separation and minimal evaluation provenance.

**Phase completion test gate:** practice-to-real isolation, answer/key permissions, autosave/timeout/reconnect/clock manipulation, double submit, authored quiz rubric, accommodation, readiness bounds/missing inputs, no practice-driven transition, bilingual golden resumes/answers and injection fixtures. A focused Playwright practice and real attempt; affected backend suite and one frontend gate build.

Demo: candidate practises, receives a study roadmap, then starts an independent real quiz; HM reviews the real assessment and decides whether to advance.

Exit: readiness is clearly an estimate; no question leakage, screening side effects or automatic rejection. Optional calibrated probability remains deferred.

Rollback: pause new quizzes while preserving submitted attempts and versioned answers; practice can remain enabled if its isolation gate passed.

## 8. M5 — Credit and criminal evidence workflows

**Outcome:** background-check workflow is complete for demo/manual review, without pretending there is a free official API.

Build:

- `CreditCheckProvider` and `CriminalCheckProvider` contracts: `request`, `status`, `cancel`, normalized provenance/coverage/expiry; mocks and manual evidence provider. Vendor stubs return “not configured,” never a successful clear result.
- Per-job check type, necessity/justification, stage default `after_quiz`, approved exception and legal activation flag. Separate CTOS Basic, CCRIS and criminal evidence labels.
- Current versioned purpose-specific consent required for dispatch. No credit/police account credentials, personal-cookie scraping or LLM report parsing.
- Queue cases asynchronously, manual reviewer UI, dispute/explanation and hold state, encrypted expiring reports, late-result/revocation handling and notification outbox.
- Candidate can supply an existing report where legally approved. The free baseline does not require a new paid CGC or MyCTOS Score purchase.
- Human shortlist/reject requires review and an appropriate reason; poor credit does not become a generic ranking penalty. A provider being offline is not adverse evidence.

Migrations: typed check policy, consent links, background cases, disputes, report references and exception approval.

**Phase completion test gate:** no-consent/wrong-purpose dispatch denied, mock display labels, fake “clear” result denied, same request replay, revoked/withdrawn case cancellation, late result quarantine, report deletion, candidate explanation and human decision guard. Mock webhook signature/replay tests are required if a webhook handler is implemented; otherwise real webhook activation stays deferred. One Playwright finalist consent/dispute/reviewer scenario plus affected pytest.

Demo: a finalist consents to a permitted demo check; a simulated ambiguous result goes on hold; candidate explains; HM records a review. A disabled official provider says unavailable.

Exit: workflow can be marked complete; official automated CTOS/CCRIS/criminal integration remains deferred under free-only. Real manual evidence processing still requires its `[TBC-LEGAL]` gate.

Rollback: disable dispatch/capture and preserve consent/dispute history; purge temporary reports according to policy.

## 9. M6 — LLM gateway, decisions and progress assistant

**Outcome:** useful authenticated progress answers with deterministic fallback and zero paid dependencies.

Build:

- `LLMProvider`, `DecisionProvider` and a common minimal-data/redaction boundary. Default RuleDecisionProvider uses explicit plans and typed decisions.
- Optional Jev Router adapter for low-stakes wording; exact zero-price allowlist, route privacy compatibility, call/time/token budgets, retries and circuit breaker. No generic `auto` route or paid fallback. Log requested and actual returned model/provider when exposed; if unavailable, label provenance unknown rather than inventing it.
- Keep `typesafe/jev-1.13` alpha-decisions adapter stub disabled. Pricing is nonzero, so implementing live calls is outside this scope. Confidence/semantic output never overrides server permissions or human hiring authority.
- Chat tools use session identity and approved views only. Deterministic progress templates work without keys; ambiguous job reference asks for an application selection. An HM assistant uses separate assigned-job aggregate tools.
- Approved EN/BM FAQ and factual answer citations to application timestamp/ID; no decision explanations generated from inaccessible notes.
- Register safe tools in existing TOOL_REGISTRY and maintain `TASK_TOOL_PLANS`; schema validate, propagate `fallback_warning`, and strip prompts/PII from trace events.

Migrations: minimal model-provenance/budget/fallback fields, bounded chat metadata and authorized chat views; avoid storing raw chat content by default.

**Phase completion test gate:** BOLA/IDOR through prompts and direct tool requests, unapproved tool names, injected resumes/listings/answers, role confusion, invalid JSON, timeout/429/outage, no key, no privacy-compatible provider, no paid fallback and safe logs. Run promptfoo once with golden/cache fixtures and local providers; one chatbot Playwright flow plus affected pytest. No paid live eval calls.

Demo: candidate asks “Where am I for role X?” and gets the live authorized state; another candidate query is denied; turning off external AI preserves factual progress answers.

Exit: API/tool authorization controls data access; router is optional; autonomous decisions remain impossible. Adapter/provenance and quotas are documented.

Rollback: set external AI off and serve deterministic templates; keep human review queues and safe provenance.

## 10. M7 — Job discovery and external applications

**Outcome:** a small, trustworthy job-discovery view from permitted sources, with honest external tracking.

Build:

- Curated source registry and kill switches; source terms/access/redistribution evidence before enablement. Greenhouse and Lever are first adapters; add RSS/JSON as appropriate. Record actual employer boards instead of inventing Malaysian market coverage.
- Implement JobSourceAdapter, safe fetching, normalization, canonical/source IDs, dedupe, freshness/expiry and safe metadata. Sanitize displayed text and allow only safe outgoing URLs.
- Add allowlisted Scrapling career-page adapter after feeds work: robots obey, per-domain cap/throttle/cache, backoff/Retry-After and stop on blocking. No login, CAPTCHA or paid proxy bypass. All redirects/DNS targets pass public-address checks.
- Start with text search/tags. Optional E5-small embeddings are computed by a local worker and versioned in pgvector; manual/rule search remains useful without a model. BGE-M3 is a deferred local benchmark.
- Discover filters, saved listings, fetched date/source, “Apply on source,” stale-state UI and optional external_application_notes with self-reported status.
- Queue source runs through the same work_items mechanism. Operator runs a local worker by default. Use database scheduling for enqueuing/row expiry only if supported by the selected free configuration; do not assume Railway Free cron or an always-on service. Crawl progress can use bounded SSE at the gate.
- Agent-reach remains optional dev-time research; JobSpy off by default. No synthetic jobs mixed with real listings.

Migrations: sources/policy evidence, normalized listings with source identity unique index, saved jobs, external notes, optional vector field/model revision.

**Phase completion test gate:** two adapter fixtures plus one bounded live feed smoke per approved adapter, repeat dedupe, expiry/removed listings, robots deny/source kill switch, 403/429 backoff, XSS/SSRF/redirect/private DNS, queue resume and external click vs confirmed apply distinction. Focused Playwright Discover/save/source/external-note flow; affected pytest. Replay cached responses for debugging rather than refetching.

Demo: candidate finds a role on a permitted feed, saves it, follows the source link, and separately records a self-reported external application. No internal P0–P6 steps are fabricated for it.

Exit: real feed provenance and permission reviews are recorded; the worker budget/fallback is explicit. External employers' actual progress is not claimed.

Rollback: disable crawl sources, retain saved links/notes and show freshness; stop pending source work.

## 11. M8 — Rebrand, retro polish and human scheduling

**Outcome:** KerjaOS presents a coherent, accessible retro workspace and a complete real interviewer flow.

Build:

- Brand clearance evidence for name/handles; original logo/mascot/icons/wallpaper. No mandatory domain purchase. Update portal copy, browser title/favicon, README, package display metadata and configured email templates.
- Classic/Luna-inspired token themes, taskbar and window state; use scoped CSS to avoid collisions. Replace actual MUI usages before removing MUI/Emotion packages. Preserve useful Radix components.
- Optional react-rnd with keyboard move/resize/reset/maximize, touch layout and reduced motion; never make dragging mandatory or lose unsaved quiz/forms.
- Complete InterviewCalendar with real interviewer assignments, UTC/IANA timezone, conflict constraint, shortlist precondition, proposed slots, candidate confirmation/reschedule, physical details or supplied meeting URL, in-app reminders and ICS versions.
- Optional existing SMTP sender with delivery statuses and quota; no provider-required feature in the baseline. No automatic creation of paid meeting accounts.
- Interviewer scorecard and separate final human outcome; cancellation/withdrawal prevents future reminders. EN/BM decision and consent text review.

Migrations: interviewer slots/bookings and overlap prevention, invitation revision/confirmation, final scorecard/outcome and notification-delivery state. Harmless theme/window preferences can stay client-side.

**Phase completion test gate:** one targeted Playwright/axe pass across candidate/HM core screens in both themes; keyboard/zoom/mobile layout and unsaved-state handling; double booking/reschedule/withdraw race; UTC/timezone and ICS validity; human final outcome/offer/hire guard; optional sender mocked. Run one production frontend build after MUI removal and affected backend scheduling tests. Do not rerun every M1–M7 eval for style changes.

Demo: candidate sees KerjaOS in either theme, confirms a real interviewer slot and downloads an ICS; interviewer submits a scorecard, then HM records the final outcome.

Exit: name remains marked provisional if clearance is unresolved; an accessible demo can still be complete. Public branding release requires clearance. Shortlisted is never mistaken for hired.

Rollback: retain core accessible single-panel UI and scheduling data; disable draggable/theme experiments if necessary without rolling back auth/data policies.

## 12. M9 — Integrated release and operations gate

**Outcome:** one reproducible, quota-aware demo or eligible controlled pilot, with complete evidence and an honest release status.

Build/finalize:

- Review all feature defaults: live official providers off, Jev decisions off, external AI optional, no paid fallback, biometric capture off, only approved sources on, synthetic/live modes visibly different.
- Complete EN/BM privacy/contact/AI disclosures, DSAR and retention runbooks, verified role-purpose decisions and cross-border/hosting review. Do not publish “PDPA compliant” based on engineering tests.
- Create encrypted exports, restore/reconciliation recipe, deletion-ledger replay, evidence-purge monitoring, queue-failure/dead-letter and consent-revocation procedures.
- Add operational budget measurements and pause thresholds, dependency/license inventory, safe logging/alerting and incident runbook. DPO/breach/legal deadlines must have reviewed values before a real-data release.
- README/env examples describe exact frontend/backend/DB locations, free limitations, local worker/offline behaviour, login setup and all disabled provider stubs. Demo script uses synthetic documents and two candidates/two jobs.
- Evaluate fairness with synthetic paired resumes/answers and existing golden sets, then consented lawful data if available. Record small-sample uncertainty; no blanket fairness claim or inference of protected traits from faces/IDs.

**One integrated completion gate:** clean install/build; full pytest regression once; one end-to-end Playwright journey covering A/X, A/Y, B/X, practice isolation, identity correction/consent/revocation, simulated background dispute, human shortlist, scheduling and human final result; chatbot authorization; permitted discovery; privacy export/delete; restart/worker retry; DB + encrypted storage restore; final public-bundle/log secret review. Replay prompt/fairness fixtures once where scoring/provider behaviour changed. Failure fixes get targeted reruns; record new scope if a full rerun is justified.

Demo release deployment uses Vercel frontend, Railway API and Supabase within the approved free limits. Check OAuth callbacks/cookies/proxy/signed files after deployment as part of this gate, not another always-running test loop. Do not silently promote a commercial service on Hobby or buy provider access to pass.

Exit: evidence-backed `demo_free` release or eligible `controlled_pilot`; unresolved legal/provider/hosting items remain clearly deferred. A commercial launch is not complete while its hosting/free constraints conflict. No tasks are checked solely to make the milestone look finished.

Rollback: documented secure previous release and feature switches; preserve histories and cancellation/deletion obligations. Restore data only with explicit approval and post-backup deletion replay.

## 13. Free-mode configuration contract

Illustrative variable names to standardize during implementation; these are specifications, not existing env names or actual secrets. Persist job policy/legal switches server-side with audit and access controls. Environment variables define deployment defaults, not per-user permissions.

```dotenv
APP_MODE=demo_free
VITE_API_URL=/api/v1
EXTERNAL_LLM_ENABLED=false
LLM_PROVIDER=rules
LLM_LOW_STAKES_MODEL=typesafe/jev-router
LLM_SCORING_MODEL=
ALLOW_PAID_PROVIDERS=false
DECISION_PROVIDER=rules
JEV_DECISIONS_ENABLED=false
IDENTITY_PROVIDER=manual
BIOMETRIC_CAPTURE_ENABLED=false
BACKGROUND_PROVIDER=mock
REAL_CREDIT_CHECKS_ENABLED=false
REAL_CRIMINAL_CHECKS_ENABLED=false
LINKEDIN_COOKIE_SCRAPING_ENABLED=false
JOBSPY_ENABLED=false
JOB_DISCOVERY_ENABLED=false
REALTIME_RELAY_ENABLED=false
WORKER_MODE=local
OUTBOUND_EMAIL_ENABLED=false
```

Secrets are backend-only: Supabase secret/admin key for narrowly privileged paths, restricted DB credentials, session/evidence encryption keys with versions, OAuth secret, optional OpenRouter key and optional SMTP credentials. Do not expose them with `VITE_` variables. A publishable Supabase key is not a substitute for RLS/ownership checks. Reuse existing env names where appropriate and document renames; examples must contain placeholders only.

Proposed operational caps: 20 candidate accounts/five internal roles in pilot; at most two foreground requests per user in parallel; one queued heavy task at a time on the local worker; at most 20 optional external AI requests/day globally initially, then tune below the actual allowance; 50 listings/source/run across up to five approved sources; stop before measured Railway credits are exhausted. Caps are tunable pilot choices, not provider entitlements. Leave safety margin and show queued/unavailable status when caps are reached.

Hard affordability rule: do not add a persistent hosted Redis, model server, Langfuse service or crawler browser fleet to make the free budget work. No monthly spend is authorized by this plan. If a free quota or zero-price route disappears, disable the optional workload and retain the deterministic/manual path.

## 14. Progress updates and handoff

At phase start, set its status to `IN_PROGRESS` and identify the next unchecked task. After a meaningful completed task, update its checkbox and evidence path without running tests. At a blocker, mark only affected tasks `BLOCKED` and give the resolution needed; continue independent tasks. At implementation completion, set `READY_FOR_GATE`. After the gate, record `PASSED`, `FAILED` or `NOT_RUN`, affected commit and evidence; only then mark the phase `DONE`.

Use the stable task IDs in [PROGRESS.md](PROGRESS.md). Append dated change notes when assumptions/order/scope change. Each new coding session reads the current phase, last completed task and unresolved blockers. No scheduled automation is created by this planning task; the checklist is updated by the implementer during active work.

### Mandatory phase checklist and usage-limit handoff

Update the relevant row during and after phase work, and **before hitting the usage limit**. Keep the detailed task checkboxes in PROGRESS.md synchronized. In the Done and Left columns, name completed tasks and outstanding tasks rather than only reporting a percentage. If work is interrupted, include partially implemented tasks and the exact next action.

| Phase | Complete | What has been done | What is left / next action | Tests |
| --- | --- | --- | --- | --- |
| M1 | [ ] | Local foundation built in app/: verified auth/recovery/MFA, encrypted sessions/resumes, UUID/RLS schema, human decision guard, reconciliation/backup/retention/queue tooling, provisional EN/BM UI, pinned security patches and setup/gate docs | Configure selected test projects; encrypted backup/restore; reviewed live backfill/count reconciliation; real Auth/Storage/proxy isolation smoke, queue/retention checks, deployed credential rotation and free hosting measurements. See app/docs/m1/GATE.md. M2–M4 local work is recorded below | Local gate PASSED: 20 distinct backend tests, 27 SQL/RLS assertions, 1 browser scenario, production build; npm audit 0. Mandatory live gate NOT_RUN; M1 remains IN_PROGRESS |
| M2 | [ ] | Local implementation and gate complete: pipeline/snapshots, UUID history, candidate/staff dashboards, notes/resume review, withdrawal/reopen/job closure, P6 entry, evidence/consent/version guards, EN/BM and bounded refresh; docs in app/docs/m2 | User deferred live configuration. Apply migrations after backup/restore; verify real Auth/RLS/Storage/proxy and multi-connection contention with M1 live gates. M3–M4 local work is recorded below | Local PASSED: 33 backend tests, 60 SQL assertions, 2 distinct browser scenarios, build and typecheck. Overall live validation remains DEFERRED |
| M3 | [ ] | Local implementation and gate complete: application/employer consent, encrypted quarantine, qualified manual/alternative review, truthful provider/OCR hints, minimal assertions and fresh-consent sharing/revocation, deletion leases/ledger/overdue block, EN/BM UI and docs | Configure live Auth/Storage and qualified reviewers; demonstrate scheduled deletion/restore and worker contention. Real-data legal approval and optional OCR/model evaluation remain deferred; face/liveness/eKYC off. See app/docs/m3/GATE.md | Local PASSED: 41 distinct backend tests, 54 SQL assertions, 3 distinct browser scenarios, build/typecheck. Live/legal gates DEFERRED |
| M4 | [ ] | Local implementation/gate complete: separate published banks/attempts, human rubric review, server clocks/autosave/reconnect/timeout, retakes/accommodations, private readiness/EN-BM report, UI/docs and rollback switches; app/docs/m4 | Configure backed-up migrations/restore and real Auth/PostgREST/proxy/concurrency gate when keys arrive; optional scoring model/calibrated prediction remain deferred | Local PASSED: 51 backend tests, 88 SQL assertions, 4 distinct browser scenarios, build/typecheck. Live gate DEFERRED |
| M5 | [ ] | Local implementation/gate complete: separate CTOS Basic/CCRIS/criminal policy/consent, mock/manual/stubs, encrypted report/lease/retention ledger, cancellation/late quarantine, disputes/holds and human review/exception/adverse guard; UI/docs in app/docs/m5 | Configure backed-up migrations/restore, Auth/PostgREST/Storage/proxy and real queue/review/revocation/deletion concurrency. Real manual legal activation and official/vendor/webhooks remain deferred | Local PASSED: 59 backend tests, 95 SQL assertions, 5 distinct browser scenarios, build/typecheck/script syntax. Hosted/legal gate DEFERRED |
| M6 | [ ] | Local implementation/gate complete: scoped read-only candidate progress/assigned HM totals, EN/BM FAQ/citations, typed registry/plans, minimal metadata/quota/retention, optional free-safe Jev wording/circuit guards, UI/fixtures/docs in app/docs/m6 | Configure backed-up live migration, Auth/PostgREST/proxy/global quota contention and scheduled idle metadata purge. Verify exact zero-price/privacy-compatible provider before enabling. Dev-only node-forge advisory chain awaiting patch; production audit 0 | Local PASSED: 79 distinct backend tests, 40 SQL assertions, 6 browser scenarios, 11 offline prompt fixtures, build/typecheck/syntax. Live provider/hosted gate DEFERRED |
| M7 | [ ] | Local implementation/functional gate complete: reviewed disabled source registry, Greenhouse/Lever/static Scrapling metadata adapters, pinned-public-IP fetch/robots/deadlines, canonical dedupe/freshness/text-tag ranking, five/day global leased local worker, EN/BM Discover/saved/private self-reported external tracker, fixtures/docs in app/docs/m7 | Approve real employer boards and career-page robots/reuse evidence; valid approved Greenhouse live feed smoke; backed-up migration and real Auth/PostgREST/proxy/concurrency/scheduling/credit/DSAR gates. Collection remains off; optional embeddings/JobSpy remain deferred | Local PASSED: 103 distinct backend checks, 63 SQL assertions, 7 browser scenarios, build/typecheck/syntax/pip check. One-request Lever demo 11 rows; Greenhouse demo unavailable. Real-source/hosted gate DEFERRED |
| M8 | [ ] | Local implementation complete: original provisional assets, MUI removal, retro themes/persistent windows, guarded scheduling/ICS/reminders/scorecard/offer/acceptance/hire and scoped scheduled-chat | Public brand/handle clearance; configured hosted Auth/PostgREST/proxy and multi-connection scheduling/withdrawal races; real calendar clients and retention; optional verified SMTP activation; legal gates deferred. app/docs/m8/SETUP.md | Local gate PASSED: 38 affected backend tests, 44 PostgreSQL assertions, 8 browser scenarios including four theme/role axe scans, keyboard/mobile/zoom/draft checks, typecheck/build and production npm audit 0. app/docs/m8/GATE.md; phase IN_PROGRESS with live gates deferred |
| M9 | [ ] | Local synthetic implementation/composite gate complete: privacy centre/14 paginated scoped exports/requests/operator private erasure + tombstones, encrypted archive staging/replay, monitoring/license/bundle review and release/retention/incident/rollback/demo runbooks. demo_free guard; app/docs/m9/GATE.md | Selected service keys/configuration; hosted continuous journey/restore/consent-business replay/concurrency/Auth/Storage/proxy and budget measurements; monitored privacy contact/public brand/legal/transfer/full account disposition and unknown/legacy/model licenses; deployment remains deferred | Local composite PASSED: 140 distinct backend tests across scope, 533 PostgreSQL assertions M1–M9, 9 browser scenarios/six axe scans, 11 offline prompt fixtures, paired resume/quiz checks, clean npm install/build/typecheck/pip check/production audit 0 and six public artifacts without secret-pattern suspects. Full release IN_PROGRESS; hosted gate DEFERRED |
| M10 | [ ] | Local implementation and affected gate complete: unified owned projection/private companies/manual revision history, encrypted immutable resume versions/guarded independent application copies, EN/BM persistent panel and scoped API, privacy/export/private erasure, leased cleanup/tombstones/recovery. app/docs/m10/GATE.md | Backed-up hosted migration/restore; real Auth/Storage/session/proxy; multi-connection races/worker leases; scheduled retention and legal policy. Full release IN_PROGRESS | Local PASSED: 38 affected backend tests, 67 SQL assertions, 6 browser journeys including tracker two-theme axe/mobile/draft checks, typecheck/build/script syntax; only failed/affected gate reruns. No live deployment |
| M11 | [ ] | Local implementation/affected gate complete: bounded candidate/assigned-job MFA SQL reports, future stage observations/portability, EN/BM charts/date/company/source filters, safe CSV/JSON export, definitions/docs/demo. app/docs/m11/GATE.md | Backed-up hosted migration/restore; actual Auth/RLS/MFA/assignment revocation and multi-connection changes; hosted query/index/timeout/free-budget and retention/legal review. Whole release IN_PROGRESS | Local PASSED: 23 backend tests, 58 SQL assertions, 4 browser journeys/four new analytics axe scans, typecheck/build/syntax. Small queries 15–17 ms, JS gzip 99.52 kB. SQL-only gate repairs/reruns |
| M12 | [ ] | Local implementation/affected gate complete: owned reminders/history/preferences, UTC/IANA lifecycle/outcome/M8 guards, EN/BM UI, bounded disabled/fixture/reviewed SMTP worker and durable dispatch/replay, privacy/retention/docs. app/docs/m12/GATE.md | Backed-up hosted migration/restore/Auth/RLS/concurrency/quotas; configured bounded worker/retention scheduling; free verified SMTP/opt-in/unsubscribe/privacy/legal/account review and later-authorized test delivery. Whole release IN_PROGRESS | Local PASSED: 28 backend tests, 87 SQL assertions, 5 browser journeys, build/typecheck/syntax. Targeted gate repairs/analytics cold startup diagnosis; JS gzip 101.71 kB. No actual email |

**Testing rule:** run tests only after the phase is fully built and ready for its completion gate. Do not run tests after every edit or intermediate build. If that gate fails, fix the issues and rerun only failed/affected tests; do not repeatedly run the whole suite. Mark Complete as `[x]` only after the mandatory work and completion gate pass. A usage-limit handoff records tests as `NOT_RUN` if the phase is still being built; it is not a reason to run tests early.


## 15. Job Application Tracker feature audit and extension

Audited 5 October 2026 against the active code in app/, not screenshots or dormant legacy components. The attached image lists product capabilities and an example stack; it does not require a stack migration. Existing React 18/Vite/TypeScript/Tailwind/Radix, FastAPI and Supabase Postgres/Auth/private Storage remain. Deployment stays Vercel frontend/Railway backend/Supabase database. No new paid service is required. Next.js, Prisma, Redis and Resend from the image are not adopted as mandatory dependencies.

| Image feature | Current active implementation | Gap / planned work |
| --- | --- | --- |
| JWT + OAuth authentication | Built locally: Supabase Auth JWTs verified on the backend, Google PKCE OAuth, encrypted server sessions/httpOnly cookies, staff MFA. app/backend/app/foundation/auth.py. Hosted callbacks/cookies not validated yet | Reuse M1; no duplicate auth rebuild. Complete existing hosted auth gate when keys arrive |
| Application status pipeline | Built locally: independent application UUIDs, P0–P6 stages, rejection/withdrawal/history/next action and separate human final outcome. ApplicationDashboard.tsx, pipeline.py and M2/M8 migrations | M10 unifies viewing internal and external activity, without treating external self-reports as internal approvals |
| Follow-up email reminders | Missing: M8 only has upcoming confirmed-interview in-app notices and ICS; DisabledInterviewSender always reports sent=false | M12 adds general follow-up reminders and optional reviewed email-to-owner delivery |
| Analytics dashboard | Partial: M6 staff_summary returns assigned-job stage/status counts through chatbot. Legacy CandidateDashboard has charts but is not routed into the active workspace | M11 adds dedicated scoped candidate and staff reporting; do not count dormant charts as delivered |
| Resume & company tracking | Partial: encrypted per-application resume documents/submission snapshot references, employer IDs, discovery company metadata and saved-job external status/private notes exist | M10 adds reusable resume versions, which-version-submitted history, company workspace and manual external records independent of a scraped listing |
| Role-based access | Built locally: candidate ownership, active employer memberships/job assignments, qualified review permissions, staff MFA and DB/RPC boundaries | Carry scopes through M10–M12; finish hosted RLS/isolation validation. Private company notes/resumes must never become employer-visible by accident |

### M10 — Unified tracker, resume versions and company workspace

Status on 5 October 2026: local build and affected gate PASSED. Checklist M10-01 through M10-GATE is updated in PROGRESS.md. Evidence: app/docs/m10/GATE.md and SETUP.md. Remaining hosted Auth/Storage/migration/restore/concurrency/retention/legal checks are deferred. The feature audit above records the pre-M10 state; resume/company tracking and unified manual records are now built locally.

Outcome: candidate can track an internal KerjaOS application or a self-reported application found elsewhere, link the submitted resume version/company, and see its history in one workspace.

Build:

- Add an owned tracker projection/list with search, company/job/status/source/date filters, pagination and application history. Show origin explicitly: internal canonical application vs self-reported external record. Preserve M2 state machine and human approval boundaries. External status edits never mutate canonical applications or imply submission to an employer.
- Reuse M7 saved/tracker records where possible; add manual external entries for jobs absent from discovery. Required company/title, safe optional HTTPS source link, user-entered applied date/status/notes and archive/forget actions. Source visit alone is not an application. Distinguish unknown dates from inferred dates; normalize duplicate URLs and offer a human merge review rather than silently overwriting histories.
- Add a candidate-owned company workspace with employer/company identity, optional normalized domain, links to tracked jobs and private company notes. Reuse canonical employer IDs where known; a personal company record is not a verified employer or an ownership/role grant. Company links are not fetched automatically. Staff sees only employer/job-authorized data, never candidate private notes or unrelated companies.
- Add an encrypted resume library with labelled immutable versions, uploaded/updated dates, private preview/download and explicit selection per application. Store library objects independently of existing application-bound documents; do not weaken their application_id constraint. Clone a selected version into a per-application document/snapshot with fresh access scope. Track which version was submitted; later edits/replacement must not change previously submitted resumes or a resume already locked for screening.
- Reuse bounded PDF upload validation/private encryption/quarantine/signed access. Resume reuse does not reuse identity/credit consent. Apply explicit retention and user deletion rules; do not promise an indefinite library before policy review. No raw resume or notes in browser persistent storage, analytics, logs or external models.
- Extend M9 scoped portability, private-workspace/account review dispositions, retention, tombstone/restore replay and notices for companies/manual entries/library versions. Deleting a private library copy must not silently delete a legally retained immutable application snapshot; show retained-reference consequences for human review.
- EN/BM tracker/company/resume views in existing Classic/Luna panels; keyboard/mobile access and draft preservation. Preserve original screening/tools and all M1–M9 features.

Proposed additive data/API seams (names finalized at implementation): private companies, manual_external_applications, resume_versions and submission-version references; scoped /tracker, /companies and /resumes facades plus narrow user-JWT RPCs. Reuse discovery adapters, encrypted Storage and existing migration patterns. No scraping expansion or paid service required.

Completion gate once construction is complete: owned A/X A/Y B/X + manual external example; candidate B/foreign employer cannot access A's companies/notes/resume versions; clone/snapshot immutability, duplicate/manual archive semantics, expired signed access and privacy export/deletion replay; focused backend/SQL and one tracker browser journey plus build/typecheck. Reuse earlier checks only where changes affect them.

Demo: A adds a manual external role, links its company/resume version, sees it next to A/X and A/Y with clear provenance, updates external interview/rejection history, and observes that B/X/internal human decisions are unchanged.

Rollback: hide the new panels/endpoints via a reviewed feature switch while preserving snapshots/histories, privacy deletion obligations and existing auth/storage controls. No destructive migration rollback.

### M11 — Scoped application analytics dashboard

Status on 5 October 2026: local construction and affected gate PASSED; M11-01 through M11-GATE checked in PROGRESS.md. Evidence: app/docs/m11/GATE.md and SETUP.md. Cohort/source/date/unknown/offer/interview semantics, future-only stage observations, scoped exports and query/bundle evidence documented. The audit above records pre-M11 state; dedicated candidate and assigned-staff reporting is now built locally. Hosted/legal/performance release checks remain deferred.

Outcome: useful, reproducible activity summaries for a candidate's own search and assigned employers' recruitment workflow.

Build:

- Define reporting cohort/date semantics before aggregating: internal created/submitted timestamps, explicit external applied dates and event dates; timezone/range boundaries; unknown-date handling. Count application IDs, not repeated events. Keep internal confirmed outcomes and external self-reported outcomes separate, including chart legends/exports.
- Candidate metrics: application totals, current status/stage distribution, interview/offer/hire counts, rejections/withdrawals, activity over time, company/source breakdown and stage age where timestamp evidence exists. Include zero/empty/unknown states and displayed denominators. Closure is not rejection, shortlist is not offer/hire, and an accepted offer is not a completed hire.
- Staff metrics: counts/funnel/time-in-stage only for authorized jobs/employer scope; HM/admin MFA as appropriate. Never aggregate all employers using a service key for browser requests. Basic staff_summary remains reusable; route dashboard aggregates through narrow user-JWT authorization/RLS.
- Historical funnels use documented transition events; current-stage distribution is labelled as a snapshot. Imported/manual records without reliable history show unknown duration. A conversion rate is a historical descriptive ratio, not a candidate's acceptance probability. No protected-trait inference or resume/identity/report text in metrics.
- Accessible EN/BM number cards plus table-backed SVG/CSS charts in the existing theme. Prefer native SVG or the existing installed chart library only if it improves usability; no paid analytics SDK or tracking service. Date/company/source filters and scoped CSV/JSON export with spreadsheet formula escaping and existing private no-store controls.
- Bounded SQL aggregation/pagination; set query/range caps and record measured local execution/bundle impact at the gate. No Redis cache or persistent analytics service required; use Postgres indexes and bounded refresh first.

Completion gate after build: synthetic golden totals and date/timezone/range edges, repeated-event/duplicate/unknown-date handling, external/internal separation, foreign-scope denial, CSV escaping, empty states and accessible keyboard/theme charts; affected SQL/backend and one candidate/HM browser scenario, build/typecheck once. Do not rerun model evals for descriptive chart work.

Demo: A's dashboard counts A/X and A/Y plus separately labelled external activity; B/X appears only to B and authorized staff. No cross-employer totals or acceptance prediction is shown.

Rollback: disable analytics panel/export if query budget fails; preserve tracker and history data.

### M12 — Follow-up reminders and optional verified email

Status on 5 October 2026: local implementation/affected gate PASSED; M12-01 through M12-GATE checked in PROGRESS.md. Evidence/commands/repairs: app/docs/m12/GATE.md. Sender and worker remain disabled; hosted configuration, scheduler, multi-connection/recovery and free verified SMTP/privacy/retention gates remain deferred. The feature audit above records pre-M12 state; general owner follow-up/in-app reminders and guarded delivery adapters are now built locally, while live email is not activated.

Outcome: candidates can set, snooze and complete reminders for internal/external applications without needing a paid sender or always-on worker.

Build:

- Candidate-owned reminder title/type/due time, application origin/reference, UTC storage + IANA display, in-app due/upcoming list and reminder history. Support follow-up, interview preparation and personal task reminders. Snooze/complete/cancel actions are versioned/idempotent and do not change recruitment status. Never send a follow-up message to an employer/contact automatically.
- Link to M8 confirmed interview notices instead of creating duplicate interview reminders. Manual external interview dates remain explicitly self-reported and separate from official human-interviewer bookings. On withdrawal/rejection/hire/job closure, cancel relevant future automatic reminder rules; retain or ask about explicitly personal reminders under a documented policy. Forget/erasure cancels related scheduled deliveries.
- Default in-app-only, email disabled. Optional email goes to the verified account owner, with explicit opt-in, preference/unsubscribe controls and minimal metadata/deep link. No raw resume, identity/credit/criminal details, private notes or other candidate data in subjects/bodies. User cannot supply arbitrary recipient addresses or forged staff approval.
- Implement sender interface with Disabled/Fixture/verified existing SMTP adapter; evaluate any alternate free sender only at activation with verified eligibility, sender identity and quota. Resend is optional, not a required dependency or assumed unlimited free service. No new account purchase or paid fallback.
- Reuse Postgres work_items/outbox/lease patterns and one bounded local worker; no Redis. Persist occurrence/revision delivery keys, queued/sent/failed/disabled/unknown states, receipt and sanitized failure code; enforce per-user/global quotas, retry/backoff/dead-letter bounds. If send outcome is ambiguous, stop automatic retry unless provider idempotency/receipt evidence makes retry safe. Expired leases, preference changes/cancellation and duplicate worker runs must not send stale or repeated reminders.
- Offlining the worker/sender shows pending/unavailable/disabled truthfully; do not promise timely delivery without a configured scheduler and measured free capacity. Manual refresh/local worker is the baseline; approved recurring job activation is a separate hosted gate, not an automation created by this planning update.
- Extend privacy notice/export/erasure and delivery metadata retention; add email preview, opt-in, worker/sender setup, free budget/pause and secure rollback runbooks.

Completion gate after build: due/snooze/complete/cancel, A/B ownership, UTC/IANA/DST edges, withdrawal/forget/consent/preferences, revision/lease/restart/duplicate and ambiguous-send cases, quota/backoff/kill switch, disabled/fixture sender and one candidate reminder E2E with build/typecheck. No real emails or recurring scheduling during synthetic tests. One verified live delivery to the owner's test account only if later explicitly authorized and configured; otherwise record email activation as DEFERRED while the in-app baseline can pass.

Demo: A sets a follow-up for a self-reported external application, sees due state, snoozes/completes it; B cannot read it. Disabled email is labelled clearly and no employer receives a message.

Rollback: disable email/worker dispatch, cancel queued deliveries under revision checks, preserve reminders/history and ownership; in-app reminders remain available.

Extension tracking: M10 local implementation/affected gate passed on 5 October 2026; whole release remains IN_PROGRESS with hosted checks deferred. M11 and M12 local construction/affected gates also passed. All 12 planned local phases are complete; hosted releases remain IN_PROGRESS/DEFERRED. During/after each phase and before usage limits, update its done/left/tests columns and PROGRESS.md. Run tests only at that phase's completed-construction gate, then affected reruns for fixes; do not reopen or rerun passed M1–M9 gates merely because the plan changed.

## 16. Remaining work — local first, deployment last

User decision on 5 October 2026: keep the application local now; Supabase configuration will be supplied. M1–M12 feature implementation gates are complete. The remaining execution stages below are integration/readiness/release work, tracked separately from the 12 feature milestones. Earlier per-phase deferred evidence remains valid; this section determines the next work order. No tests, migrations or deployment were performed by this planning update.

### L1 — Supabase-connected localhost integration

Status: IN_PROGRESS — local credentials/encryption configured; selected Morpheus adapter built. Database access/project selection, migrations and full localhost journeys remain pending. See app/docs/l1/SETUP.md. Configuration slice gate PASSED (app/docs/l1/GATE.md); full L1 gate is NOT_RUN because schema/private bucket are missing. Frontend at localhost:5173, FastAPI at localhost:8000, existing Vite same-origin API proxy. A remote Supabase development project is a dependency, not deployment of the frontend/backend.

| Task | Done | Deliverable / what remains |
| --- | --- | --- |
| L1-01 | [x] | Supplied Supabase URL/publishable/modern server secret/JWKS and Morpheus credentials saved in ignored backend/.env; modern secret alias supported; frontend contains only same-origin API URL. Auth/JWKS accepted publishable key; schema/Storage accepted server secret (HTTP 200). M1 tables/M12 RPCs/private bucket absent; full login readiness pending. |
| L1-02 | [ ] | Read-only project inspection confirms required app schema/private bucket absent. Still need owner-selected development-project confirmation and DATABASE_URL or owner-operated SQL Editor. API keys alone do not provide SQL migration/pg_dump access. |
| L1-03 | [x] | Missing independent session/document/backup keys generated locally, existing keys preserved. Localhost/127.0.0.1 origins and non-secure local cookie configured; demo_free retained. Selected bounded public-FAQ Morpheus adapter locally enabled under latest low-cost authorization; DB external policy, other providers, senders/workers stay off. |
| L1-04 | [ ] | Back up any existing data/grants and rehearse restore on an isolated target; then apply actual M1–M12 migrations in order. Inspect schema/custom routines/private bucket/Data API grants. Review existing legacy backfill and count reconciliation if the selected project contains old data; no destructive reset. |
| L1-05 | [ ] | Bootstrap verified synthetic candidates A/B, assigned HM/interviewer with MFA, employer/jobs X/Y, published quiz bank and demo policies. Configure exact localhost Auth redirects. Optional Google OAuth needs separate provider configuration; signup/recovery email stays off until an eligible sender exists. |
| L1-06 | [ ] | Local frontend/backend started on 127.0.0.1:5173/8000; frontend HTML and direct/proxied health HTTP 200. Full journeys blocked until migrations/accounts are configured. Rehearse complete candidate/staff journeys: apply multiple jobs, resume/filter/history, manual identity/background consent/review, quiz/practice, progress chatbot, discovery metadata, human interview/offer/accept/hire, manual tracker/resume library, analytics and reminders. Distinguish live Supabase behavior from fixture tests. |
| L1-GATE | [ ] | At completed integration, one affected Supabase/localhost gate: Auth refresh/logout/revocation/MFA/CSRF, direct Data API RLS and private Storage denial, expiring previews, RPC permissions, real rows/snapshot/history/exports and local proxy/streaming. No repeat of every model evaluation or unrelated passed suite. Save evidence and remaining hosted-only issues. |

L1-AI configuration slice: gpt-oss-120b selected from authenticated active catalog; official rate $0.07/$0.28 per million input/output tokens. Adapter and provenance wrapper built, 256-token cap/no retries/rules fallback/public-code-only input; phase-end gate PASSED: 37 initial backend tests plus 16 targeted provider reruns (38 distinct cases), 44 SQL assertions, valid live public FAQ smoke with actual model openai/gpt-oss-120b. An initial model-label mismatch was corrected; no unrelated suite rerun. Ordered M1–M12 plus L1 metadata SQL bundle prepared locally; remote execution pending SQL access. Latest owner instruction permits this inexpensive inference exception; no paid purchases or other paid activation.

Synthetic accounts/documents only. Local recovery and direct database checks may need additional owner-selected account/database access beyond API keys. Do not create real candidates, scrape sources or send email through this stage.

### L2 — Local hardening and release readiness

Status: IN_PROGRESS — U1 local parity/UI slice complete; remaining live readiness work depends on L1. Work remains on local app processes and isolated development data.

| Task | Done | Deliverable / what remains |
| --- | --- | --- |
| L2-01 | [x] | Local audit and active-gap repairs complete (app/docs/ui/PARITY.md, GATE.md); full live integration still L1. Audit original product parity: map Requirement/Resume/Bias/Matching/Interview A/B/Report/Email Planning/Action Policy and graph/SSE/calendar features to active authorized routes/UI. Preserved source or passing legacy unit tests alone is not usable feature parity. Record intentionally disabled capabilities; repair confirmed functional gaps without reviving unsafe legacy endpoints. |
| L2-02 | [ ] | Use real Postgres multiple connections for transition/evidence/quiz timeout/scheduling/resume-clone races and reminder/worker lease/revision/preference/global quota ordering. Verify cancellation before dispatch and document in-flight limits. |
| L2-03 | [ ] | Rehearse encrypted object inventory/backup/restore with newest deletion, opt-out, dispatch and consent/business reconciliation. Run bounded cleanup locally; prove expired/removed access stays blocked and restored reminders cannot resend. Document an operator-reviewed full account-erasure procedure; private-workspace erasure is not complete account deletion. |
| L2-04 | [ ] | Measure local query/response/worker performance and metadata/retention backlog. Review rate-limit behavior and design proxy-aware/distributed controls needed for public hosting. Address recorded development dependency advisory and unknown/legacy/model license gaps; review secret exposure without printing values. |
| L2-05 | [ ] | Finish local usability/EN-BM/accessibility/mobile/empty/offline/error fixes revealed by integration; test actual ICS calendar import. Review provisional KerjaOS name, original attribution/assets and release copy. |
| L2-06 | [ ] | Approve actual discovery source URLs/terms/robots/reuse evidence and complete only the required bounded approved-source smoke. Without approval, discovery collection remains off; cached/synthetic discovery and manual tracker remain usable. |
| L2-07 | [ ] | Finalize privacy contact, retention/consent/transfer/account-disposition rules, reviewer roles and incident/rollback ownership. Prepare free-budget limits, env/setup guide and repeatable synthetic demo. Real-data activation remains gated on reviewed policy. |
| L2-GATE | [ ] | After this phase is built, run one final local integration/readiness gate with affected tests and representative real-Supabase journeys. Reuse prior evidence; fix/rerun only affected checks. Record which deployment checks cannot run locally. |

Optional sender rehearsal can stay disabled/fixture throughout L1/L2. Verified SMTP/free eligibility and an explicitly authorized test to the owner's account are separate activation requirements; no account purchase, paid fallback or unsolicited email.

### D1 — Final deployment phase (held until local phases pass)

Status: DEFERRED — deploy last. This is the only stage that publishes the app to Vercel/Railway or activates hosted schedules.

| Task | Done | Deliverable / what remains |
| --- | --- | --- |
| D1-01 | [ ] | Verify current account/free hosting eligibility and quotas for Vercel/Railway/Supabase. Confirm commercial-use permission if relevant; choose no paid fallback. Choose isolated preview/release environment and review local gate evidence. |
| D1-02 | [ ] | Configure hosted secrets, production HTTPS origins/redirects/cookies/private bucket/proxy/streaming and monitored health endpoints. Back up the target; migrate/backfill/reconcile only if this target differs from the development project. Never reapply/reset an already migrated project blindly. |
| D1-03 | [ ] | Deploy frontend to Vercel and backend to Railway, retaining Supabase. Run deployment-specific smoke for real HTTPS Auth/OAuth/MFA/session, CSRF/CORS/proxy/SSE, RLS/private Storage and complete candidate/staff journey. This does not require repeating every offline model fixture. |
| D1-04 | [ ] | Activate approved bounded hosted retention/workers only after measured free capacity, kill switches and alert ownership exist. Email/discovery/external AI remain off unless their own activation gates pass; a successful deployment does not require turning them on. |
| D1-05 | [ ] | Verify hosted monitoring, secret rotation/log hygiene, free usage budgets, backup/newest-ledger replay, incident and rollback rehearsal. Obtain real hosted usage evidence before claiming stable/always-on operation. |
| D1-GATE | [ ] | Record deployed acceptance evidence and outstanding optional/legal gates. No real-data/commercial release or APP_MODE bypass without the applicable reviewed approvals. |

### Optional / gated backlog — not prerequisites for the local baseline

Official CTOS/CCRIS/criminal provider access, biometric liveness/face matching, paid Jev decision models, calibrated acceptance probability, large-model embeddings and expanded scraping sources remain deferred under their existing free/privacy/license/evidence gates. Supabase keys do not unlock these. Evaluate only when separately authorized and genuinely eligible; manual/mock identity/background, deterministic chatbot, readiness practice and in-app reminders continue without them.

### Configuration handoff

Place values in ignored app/backend/.env, not chat or frontend VITE_ variables:

- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY (publishable/anon)
- SUPABASE_SERVICE_ROLE_KEY (server-only secret/service-role)
- DATABASE_URL for operator SQL/backup/concurrency work, if available; otherwise record the SQL Editor/manual-access route and defer unavailable tooling.

Engineering generates missing encryption keys locally. Keep private files out of Git; app/.gitignore already ignores backend/.env. Report only configured/missing status. L1 begins when the owner reports the development configuration ready; no keys are needed for this planning update.

### U1 — Windows desktop UI, demo sign-in and active feature parity

Status: LOCAL_GATE_PASSED — implementation and affected gate complete locally; see app/docs/ui/PARITY.md for the feature-by-feature mapping. This local slice advances L2-01 without claiming L1 remote integration is complete. Deployment remains D1, last.

| Task | Done | Deliverable / remaining |
| --- | --- | --- |
| U1-01 | [x] | React95 and Themesberg reference review; MIT notices retained; adapted retro CSS/React shell, Classic/Luna, mobile layout and KerjaOS-only product copy. |
| U1-02 | [x] | Prefilled public candidate/recruiter demo accounts and isolated sample applications/jobs/quiz/interviews/tracker/reports/reminders/privacy. Normal real authentication retained. |
| U1-03 | [x] | Active own profile/PDF parsing and MFA/employer/job-scoped job builder, accounts, encrypted manual sourcing; deterministic requirement/resume/bias/matching/interview/report/email-draft and read-only agent stream. Additive SQL migration prepared locally. |
| U1-04 | [x] | Original-feature audit mapped active routes and intentional restrictions; avatar upload remains a gap, automated sourcing/live email need activation, no unsupported all-live parity claim. |
| U1-GATE | [x] | 32 backend tests, 26 SQL assertions, four browser journeys, typecheck/build and visual review passed. Targeted repairs/reruns recorded in app/docs/ui/GATE.md. |
| U1-LIVE | [ ] | L1 migrations, synthetic candidate/staff/MFA setup and full real-account journeys. API credentials alone do not install schema. Source expiry physically cleaned by service-only operator RPC. |
| U1-REMAIN | [ ] | Avatar upload and separately configured OAuth/sender/approved-source operations as needed; deployment deferred to D1. |

Update this checklist and PROGRESS.md after each phase and before reaching the usage limit, including completed work, failures and remaining tasks. Run tests only once a phase is built, then rerun affected failed checks rather than unrelated passed suites.

### U2 — Original portal UX and missing visible features

Status: LOCAL_GATE_PASSED. Corrects U1's overly broad parity claim; original overview/trajectory/fair-controls were not usable even though their agent helpers existed.

| Task | Done | Deliverable / remaining |
| --- | --- | --- |
| U2-01 | [x] | Compare public main with preserved source (same be3bf1de commit); enumerate original route groups and subfeatures in app/docs/ui/PARITY.md. |
| U2-02 | [x] | Active position dashboards/KPIs/pipeline, trajectory chart/detail tabs, search/status/score filters/sorting and high-potential alerts. Missing scores remain unassessed. |
| U2-03 | [x] | Fair hiring panel, identity/institution display controls, paired synthetic candidates and reputation-weight audit comparison. Merit recommendations exclude institution rank, regardless of display preference. |
| U2-04 | [x] | Original-like horizontal portal tabs and separate recruiter workflows with Windows 95 panels. Candidate results entry restored; no old branding in product UI. |
| U2-05 | [x] | Read-only assigned-job dashboard RPC and authorized current encrypted resume review; human notes/shortlist/reject use existing guarded transitions. Additive SQL prepared locally. |
| U2-GATE | [x] | 46 backend cases, 40 SQL assertions, six browser journeys, typecheck/build and visual review passed. Repairs and targeted reruns: app/docs/ui/U2-GATE.md. |
| U2-LEFT | [ ] | L1 migration/accounts/live integration, avatar/photo upload, persisted assessment history/fair-control policy, optional sender/OAuth/approved sourcing; complete EN/BM review. No claim of fully live transfer until these are done. |
| U2-DEPLOY | [ ] | D1 remains last and deferred. |

Keep this checklist and PROGRESS.md current before usage limits. Remaining original feature gaps stay explicit until built and verified, not silently counted from preserved source.

### U3 — Modern dashboard redesign from five reel references

Status: LOCAL_GATE_PASSED (6 October 2026). The user explicitly replaced Windows 95/XP on 5 October 2026. This section supersedes U1/U2 retro visuals and the original M8/F10 styling; their functional work and recorded past gates remain valid history.

| Task | Done | Deliverable / remaining |
| --- | --- | --- |
| U3-01 | [x] | Viewed all five reels: sage/pastel dashboard, dark admin/smart-home layouts, green and cream bento animation. Reference links and decisions in PRD F10. No commercial template/media copied. |
| U3-02 | [x] | Shared modern light/dark tokens, rounded cards, pastel KPIs, responsive sidebar/strip, readable typography, gentle motion with reduced-motion support. No dependency added. |
| U3-03 | [x] | Redesigned sign-in with prefilled candidate/recruiter accounts, branding mark, account auth/recovery preserved, theme persistence and legacy appearance migration. |
| U3-04 | [x] | Removed window chrome/taskbar/artificial clock/drag controls; mounted collapsible real panels retain drafts. Kept application, assessment, verification, discovery, assistant, calendar, tracker, analytics, reminder and privacy modules. |
| U3-05 | [x] | Recruiter overview bento layout retains actual fit/trajectory, fair controls, paired audit, candidate details and pipeline filters; real auth/CSRF/scoping untouched. |
| U3-GATE | [x] | Foundation TypeScript check, production build and eight distinct affected browser journeys passed. Axe checks in sampled light/dark views, 390px layout, 200% zoom, retained interview drafts and visual desktop/mobile review passed. Initial failures and targeted repairs/reruns: app/docs/ui/U3-GATE.md. |
| U3-LEFT | [ ] | Existing L1 schema/private bucket/MFA/live journeys, avatar, persisted assessment/fair-policy, optional OAuth/sender/approved sources, full EN/BM review remain separate. |
| U3-DEPLOY | [ ] | Stay local. D1 hosted deployment remains the last phase. |

Update this checklist and PROGRESS.md after the gate and before usage limits. Run tests only once a phase is built; after repairs rerun affected failed checks, not unrelated passed suites.

### U4 — Blue/violet brand palette

Status: LOCAL_GATE_PASSED (6 October 2026). User requested a different main colour. The modern U3 layout remains; blue/violet supersedes its green/sage palette.

| Task | Done | Deliverable / remaining |
| --- | --- | --- |
| U4-01 | [x] | Royal blue #4254D6 primary actions/mark/chart/progress; indigo navigation, blue/violet sign-in hero, cool canvas and coordinated pastel metrics. |
| U4-02 | [x] | Updated light/dark surface, text, focus, controls and selection colours across demo and account screens; shared CSS only, no workflow changes. |
| U4-03 | [x] | PRD and current README palette descriptions updated; original reel references and layout retained. |
| U4-GATE | [x] | Production build and three existing affected browser journeys passed. Zero sampled axe violations in login/candidate light and recruiter light/dark views; mobile fit, trajectory/fair controls and unassessed fallback retained. Visual login and light/dark dashboard review complete. Details: app/docs/ui/U4-GATE.md. |
| U4-LEFT | [ ] | Existing L1/live integration, avatar, persisted assessments/fair policy, optional services and complete EN/BM copy review remain open. |
| U4-DEPLOY | [ ] | Local only; D1 deployment remains last. |

Update the checklist and PROGRESS.md after this phase and before usage limits. Run tests only after phase construction; rerun only failed affected checks.

### DOC1 — Product README refresh

Status: DOC_REVIEW_PASSED (6 October 2026). Documentation-only work requested using the two repository READMEs as presentation references. No application code or service configuration changed.

| Task | Done | Deliverable / remaining |
| --- | --- | --- |
| DOC1-01 | [x] | Read the 404-Brain-Not-Found-Recruiter and DraftWise READMEs; adapt their product overview, evidence tables, workflow/architecture, demo and setup structure to KerjaOS. |
| DOC1-02 | [x] | Replace the root README with current branding, candidate/recruiter features, overview/trajectory/fair controls, screenshots, demo accounts, scoring boundaries, stack, API map, privacy, troubleshooting and documentation index. |
| DOC1-03 | [x] | Add three portable blue/violet screenshots under docs/images/; preserve original attribution and phase history in app/README.md with a link to the current root entry point. |
| DOC1-04 | [x] | Document PowerShell local startup, non-overwriting environment template copy, exact localhost origins, backend-only credentials and L1 prerequisites. Separate L1/L2 local work from final D1 deployment and gated optional services. |
| DOC1-GATE | [x] | Verify 44 local file/image references, 25 anchor references, three JPEGs, three PowerShell blocks with zero syntax errors, demo setting names against .env.example, source/gate claims and Git whitespace. Correct screenshot extensions to match their actual JPEG encoding. No application tests/build run for docs-only changes. |

README work is complete. Existing L1 migration/private bucket/synthetic Auth/MFA/live journeys, L2 feature/readiness gaps and D1 final deployment remain open in their own checklists. Documentation does not mark them completed or activate optional services. Update this plan and PROGRESS.md during/after each phase and before usage limits; run application tests only when a built phase is ready for its completion gate.

### U5 / H1 — Selected reel UI and company HR baseline

Status: LOCAL_GATE_PASSED (6 October 2026). Owner explicitly expanded KerjaOS to recruitment AND employee management, including payroll/timesheets. Accepted human hire → company invitation → employee dashboard is in scope. Dd7AalkTZPY and its creator-linked public Coterie preview define the cream/yellow UI. Original implementation and assets; no paid template source copied.

| Task | Done | Deliverable / remaining |
| --- | --- | --- |
| U5-01 | [x] | View reel and public Overview/People/Payroll; inventory pill nav, segmented rail, portrait, graph, timer, tasks, accordions, weekly/monthly calendars, roster and directory. |
| U5-02 | [x] | Cream/yellow/black tokens, local OFL Outfit/Inter fonts, responsive bento layout, dark mode, reduced motion and original fictional demo portrait. |
| U5-03 | [x] | Connected graph/report, timer/draft timesheet, tasks/notifications, people search/filter/selection, event details/creation, monthly hours/payroll. |
| U5-04 | [x] | Recruiter management overview, ready employee demo and accepted hire rehearsal; existing recruitment, trajectory/fair controls and career tools retained. |
| H1-01 | [x] | Additive private SQL schema/FastAPI for employment, independent HR/payroll grants, tasks, time, leave, payroll ledger/events. No direct client table access. |
| H1-02 | [x] | Canonical accepted final human hire creates invitation. Candidate joins to open default employee dashboard; other applications remain available. |
| H1-03 | [x] | Task completion; own time/leave submission; separate HR review; offboarding reason; company/owner/session/grant/MFA/revision/idempotency/audit boundaries. |
| H1-04 | [x] | Integer-cent MYR payroll draft → approved → issued, month/person calendar, CSV and own issued payslip. No employee self approval or bank payment. |
| U5-H1-GATE | [x] | Foundation typecheck/build, 16 API cases, 64 actual offline PostgreSQL assertions and 12 distinct browser journeys passed; sampled axe/390px/light/dark/reduced-motion, normal-account CSRF/career refresh, human interview and visual review. Only failed/affected cases rerun after repairs. Evidence: app/docs/hr/GATE.md. |
| H1-LIVE | [ ] | L1 backed-up hosted schema/private bucket, synthetic Auth/MFA accounts, reviewed HR/payroll grant provisioning and real journeys. Migration prepared, NOT applied remotely. |
| H2-01 | [ ] | Statutory payroll/overtime/holiday/leave entitlement rules, payslip format and salary corrections/reversals. H1 uses manual reviewed figures/calendar-day leave. |
| H2-02 | [ ] | Contracts/signatures, employee profile editing, device inventory/benefits/pension records and salary history. H1 directory derives name/role from profile/hire. |
| H2-03 | [ ] | Cursor pagination, company reports, employment/financial audit-export-retention-erasure policy, offboarding access policy, approved notifications and full EN/BM review. H1 serves bounded local cohorts. |
| H2-04 | [ ] | Optional bank/payment integration only with later explicit authorization. No banking/tax identifiers collected in H1. |
| U5-LEFT | [ ] | L2 recruitment avatar, persisted assessments/fair policy and readiness remain tracked separately. |
| D1 | [ ] | Deployment LAST. Stay local until remaining live/legal/readiness gates pass. |

Update this checklist and PROGRESS.md during/after each phase and before usage limits. Tests only when a phase is built; rerun only failed/affected checks.

U5/H1 completion evidence: [HR gate](app/docs/hr/GATE.md), [activation/setup](app/docs/hr/SETUP.md), [reel mapping and original assets](app/docs/ui/U5-ASSETS.md). README/PRD/progress updated; current screenshots show invented data. H1-LIVE/H2/L1/L2 and D1 remain unchecked; no hosted migration or deployment.

### U6 — Management / Recruitment workspace header

Status: LOCAL_GATE_PASSED (6 October 2026). Added an explicit shared mode header, with separate dashboards and preserved in-session pages/drafts. Local only.

| Task | Done | Deliverable / remaining |
| --- | --- | --- |
| U6-01 | [x] | Shared native-button Management / Recruitment header; current mode indication, responsive cream/yellow styling and BM labels. |
| U6-02 | [x] | Separate demo and account management/recruitment surfaces; keep mounted mode state/drafts and employee career access. |
| U6-03 | [x] | Added keyboard round-trip coverage for people selection, payroll/recruitment drafts and mobile/light/dark accessibility; extended normal-account draft/refresh check and adapted recruiter journeys. |
| U6-GATE | [x] | Foundation typecheck/build and 12 distinct affected browser journeys passed; keyboard/state preservation, light/dark/390px/200% zoom and visual review. Only failed/affected journeys rerun after contrast/wrapping repairs. Evidence: app/docs/ui/U6-GATE.md. |
| U6-DOCS | [x] | README mode guide/current screenshot, gate evidence and progress updated. Local preview retained. |
| D1 | [ ] | Deployment remains LAST; H1-LIVE/H2/L1/L2 work stays open. |

Update this checklist and PROGRESS.md during/after the phase and before usage limits. Run tests only after construction; rerun only failed/affected checks.

### U7 — Combined Main Overview and floating assistant

Status: LOCAL_GATE_PASSED (6 October 2026). User requested a quick-glance overview combining recruitment and management plus a floating chatbox. Local only.

| Task | Done | Deliverable / remaining |
| --- | --- | --- |
| U7-01 | [x] | Main Overview header option and recruiter demo entry; current authorized recruitment/HR snapshots drive combined metrics, review queues, phase graph and upcoming company events. |
| U7-02 | [x] | HR review deep links and recruitment entry preserve mounted dashboard state; explicit loaded/total/company/month scope and unavailable states. |
| U7-03 | [x] | Floating launcher/chatbox in all signed-in demos/accounts; close/Escape/focus return, session-only demo conversation and existing live authorized progress service plus current HR summary. |
| U7-04 | [x] | Responsive bento overview/chat styling, EN/BM labels and four browser journeys for cross-dashboard updates, queue links, chatbot session/focus/read-only behavior, own/scoped live API/CSRF and unavailable data; mobile/light/dark/reduced-motion/zoom coverage added. |
| U7-GATE | [x] | Foundation typecheck/build and all 18 affected browser journeys passed first run; current statistics/queue links, chat scope/CSRF/read-only/focus, employee limits, unavailable data, light/dark/390px/reduced-motion/200% zoom and desktop visual review. No backend/SQL tests repeated. Evidence: app/docs/ui/U7-GATE.md. |
| U7-DOCS | [x] | Checklist/progress/README/PRD and U7 evidence updated; overview and opened-chat screenshots saved. Local preview retained. |
| D1 | [ ] | Deployment stays LAST; existing H1-LIVE/H2/L1/L2 gaps remain open. |
