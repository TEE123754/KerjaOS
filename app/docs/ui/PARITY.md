# Active workspace feature parity

U3 supersedes the U1/U2 desktop visuals: the active UI now uses an original modern light/dark dashboard informed by five user-provided reels. Shared CSS, Lucide icons, pastel metrics, rounded panels and responsive navigation cover demo and authenticated workflows. Previous U1 third-party notices remain in THIRD_PARTY/ as implementation history; no template code/media, remote fonts or new dependency were added.

## Ready demo accounts

Candidate: candidate@demo.kerjaos.test. Recruiter: recruiter@demo.kerjaos.test. Public sample password: KerjaDemo2026! Both are prefilled on the sign-in screen. Demo records stay in memory and reset on exit/reload; these are not Supabase accounts. My account uses normal server authentication. Local agent preview is disabled by default, enabled only in the ignored localhost configuration; it requires demo_free mode, loopback client and an allowed local Origin. No demo session can call private account routes.

## Feature audit against the original feature baseline

Source existence alone is not completion. Active implementations below were inspected, with integration limitations separated from construction.

| Feature | Active implementation | Status / remaining work |
| --- | --- | --- |
| Sign-in, registration, recovery, OAuth, roles, MFA | Workspace + foundation Auth | Real authentication retained; email sender/provider setup and synthetic staff accounts pending L1. Ready isolated candidate/recruiter demos added. |
| Candidate profile and resume parsing | ProfileWorkspace; own PDF preview; M10 resume library | Name/locale editing, resume extraction, encrypted resume library retained. Profile photo/avatar upload remains unimplemented. |
| Job creation/editing, publication and application windows | RecruiterWorkspace; m14_job_save; public_jobs and intake trigger | Active staff-scoped UI/RPC added; additive migration pending remote application. |
| Requirement intake and Boolean query | Recruiter agent review / sample job builder | Original deterministic intake/normalization exposed. Read-only preview; job fields saved explicitly by recruiter. |
| Resume, bias review, neutralization and role matching | Recruiting preview using existing agents | Offline algorithms integrated; institutional reference is informational and does not affect merit score. Human validation required. |
| Multiple applications, status stages, history, decisions | ApplicationDashboard; M2 pipeline | Retained; demo has sample stages. Canonical real transitions remain evidence/role guarded. |
| Interview A/B, question generation and answer evaluation | M4 QuizWorkspace + recruiter review | Published quizzes/timeouts/scoring retained; generated preview questions/evaluation restored. Preview does not publish a quiz bank or mutate hiring stages. |
| Mock practice/readiness | M4 practice and demo quiz | Readiness retained; not a calibrated acceptance probability. |
| Reports, recommendations and three-week roadmap | AgentResults / original report fallback | Preview/report restored. Text is explicitly a recommendation; does not claim a perfect fit or automatic hiring. |
| Sourcing and outreach | Recruiter manual source staging + invitation drafts; M7 discovery | Encrypted scoped manual source cards and drafts added. Automated LinkedIn/cookie scraping and live email delivery stay disabled. Source TTL blocks access after seven days; operator cleanup remains required. |
| Email planning/action policy | Draft-only report + M12 reminders/dispatch guards | In-app reminders retained. Actual email sends require separately configured/authorized sender; no legacy unrestricted email tools mounted. |
| Agent graph, guardrails and streaming activity | /recruiting/stream and agentStream UI | Read-only deterministic agent progress/result streaming added. Legacy graph's uncontrolled status/email side effects are not enabled. |
| Calendar, human interview, offer/accept/reject/hire | M8 InterviewWorkspace + canonical pipeline | Retained with reviewer scope, manual feedback and ICS export. Sample demo rehearsal included. |
| Candidate account overview | Scoped m14_candidate_accounts + recruiter UI | Active read-only account list added. Password viewing/reset and account impersonation are intentionally unavailable. |
| Identity/background, progress assistant, job discovery | Existing M3/M5/M6/M7 panels | Retained. Official CTOS/CCRIS/criminal/liveness integrations remain gated/unavailable; manual/mock checks are labelled. |
| Tracking/company/resume library, analytics, reminders/privacy | Existing M9–M12 panels | Retained, with isolated sample counterparts and CSV/JSON exports. Full account erasure is still separate from private-workspace erasure. |

## Integration and cleanup

Apply the ordered migrations (including 20261005140000_l2_recruiter_parity.sql) only through the previously planned backed-up L1 process. No remote SQL was executed in U1. Configure verified synthetic identities, MFA memberships, jobs and quiz banks before claiming real-account parity.

Expired manual-source records are excluded from reads immediately; physical deletion needs the service-only public.m14_source_cleanup() operator call. Reuse the bounded retention operator procedure and record affected counts. No scheduler was activated. Keep demo preview disabled on public hosting.

## Phase checklist

- [x] Reference review and MIT notices.
- [x] Modern dashboard, responsive light/dark themes, KerjaOS product copy (U3 replaces the retro shell).
- [x] Ready candidate/recruiter sample sign-in.
- [x] Active recruiter/profile tools, scoped RPCs, deterministic agent results and stream.
- [x] Original-feature mapping with explicit gaps and operational limits.
- [x] Phase-end backend/SQL/type/build/browser gate and visual review (GATE.md).
- [ ] Real Supabase migrations/accounts/full integration (L1).
- [ ] Avatar upload, real sender/OAuth setup and approved sourcing activation where required.
- [ ] Deployment (D1, last).


## U2 correction — original portal overview and fairness

Baseline verified directly against the public repository: upstream main and preserved source both be3bf1de3451d266d923089785c9479ce6e4add3. The U1 audit was too coarse: underlying matching code was preserved, but the original visible overview, trajectory interaction and fair-control panel were absent. Those are now restored in active components rather than counted from inactive source.

| Original visible feature | U2 active equivalent | Scope |
| --- | --- | --- |
| Overview / position dashboards / five KPI strip | TalentDashboard + recruiter Overview | Scoped loaded cohort and position selection; real staff sees paginated assigned applications. No fabricated averages. |
| Fit-versus-trajectory scatter and profile modal | Trajectory Analysis + native keyboard dialog | Actual retained deterministic matching output. Missing/failed review stays unassessed; points open score/trajectory/interview/report details. |
| Trajectory score / contributor explanation / high-potential and undervalued signals | Candidate cards, sorting, thresholds and detail tabs | Real resume reviews authorized via current unexpired encrypted document; results are session-local, not persisted hiring evidence. |
| Fair Hiring Controls | School/company neutralization, identity hiding, scoring view and comparison weight | Applied across displayed agent artifacts. Reputation mode is explicitly audit-only; hiring recommendations stay merit-based. Controls are session-local, not a stored employer policy. |
| Bias comparison sample candidates / fairness calculation | Add Sample Candidates + paired comparison table | Demo-only invented paired resumes, same role evidence/different institutions. Descriptive score changes, no unsupported fairness index. |
| Candidate search/status/fit/trajectory sorting/filtering and pipeline columns | Candidates tab and shared TalentDashboard | Assigned scope; decision/note reason form uses existing canonical transitions, revisions, MFA and role checks. Sample decisions are isolated. |
| Recruiter horizontal navigation / dedicated jobs/sourcing/calendar/accounts | Original-like portal tabs with beveled controls/title bars | Overview, Jobs, Sourcing, Candidates, Calendar, Accounts. Existing M1–M12 supplementary panels retained. |
| Candidate dashboard/profile/application/results/jobs navigation | Horizontal candidate portal navigation; Interview Results entry | Existing application/quiz/private practice tools retained; dedicated results/preparation view. Published quiz results remain distinct from practice/review previews. |

The original trajectory helper contains a QS-rank bonus. Active merit review strips school/institution/qs_rank from scoring inputs regardless of visibility setting; paired-school and visibility regression checks must prove equal merit scores. Reputation reference remains available only for a labelled audit simulation.

Every original route group and main subfeature is mapped above or in the preceding table. This is not a claim that live operations are complete. Still outstanding: avatar/photo upload, persistent server-owned assessment history and fair-control policy, separately configured email/OAuth/approved automatic sourcing, real Supabase migrations/accounts/full journeys. Legacy password inspection/admin impersonation and unrestricted graph writes remain excluded. U2 does not deploy or apply remote SQL. New migration 20261006100000_u2_recruiter_dashboard.sql must be applied after all prerequisites, including M8.

U2 local gate passed: 46 backend cases, 40 SQL assertions, six browser journeys, typecheck/build and visual review. Evidence: [U2-GATE.md](U2-GATE.md). Remaining rows above are still open; this gate does not convert them to completed live features.

U3 UI gate: [U3-GATE.md](U3-GATE.md). Functional parity limits below remain unchanged; styling does not activate hosted schema, providers or missing avatar/persisted assessment features.

U5/H1 supersedes the retro/blue visual direction with the selected cream/yellow reel. Existing recruiter overview, trajectory, fair controls, candidate tools and human decision/interview flows remain available; management now adds company joining/employee tools, people, time/leave, onboarding/calendar and manual payroll ledger. This is additive local construction, not completion of the open legacy/live rows. [HR setup](../hr/SETUP.md), [gate](../hr/GATE.md), [reference/asset mapping](U5-ASSETS.md). H1 hosted activation and H2 statutory/device/benefits/retention work remain open in the root plan.
