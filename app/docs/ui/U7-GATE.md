# U7 — Main Overview and floating assistant

Local gate passed, 6 October 2026.

The workspace header now offers Main Overview, Management and Recruitment. Recruiter demos start on Main Overview; employee demos keep their Management home. All signed-in demos/accounts have a bottom-right chat icon that opens a nonmodal chatbox. Close/Escape restores focus to the launcher; reopening preserves the session conversation/draft.

The combined overview derives statistics from the same scoped records loaded by the two dashboards: roles, ongoing applications, active employees, company invitations, unfinished onboarding, upcoming company events, recruitment phases and review queues for resumes/decisions/time/leave/overdue tasks/payroll. Queue buttons open the corresponding workspace. HR commands and recruitment changes propagate to the overview without resetting dashboard drafts.

## Data and assistant boundaries

- Recruitment stage/queue counts cover the loaded page; the loaded/total label makes pagination visible. These are not a company-wide census. Role counts cover active/published loaded roles.
- HR uses the currently selected company's loaded records; payroll tasks use the loaded payroll month. Independent payroll permissions determine whether that queue exists. Employee views summarize their own scoped records; separate HR review queues exclude the reviewer's own time/leave.
- No salary amounts, raw reports, private leave reasons or candidate identities are displayed in the combined overview. Unavailable data uses an explicit unavailable state instead of invented zeroes.
- Demo chat answers current session summaries and approved help; its bounded conversation remains in memory, with no external requests or private writes. Sign-out resets it.
- Live progress questions reuse the existing authorized `/chat/options` and `/chat/messages` service with CSRF and candidate/assigned-role selections. HR/overview questions summarize the already authorized loaded workspace locally, without calling an external model. This is a read-only assistant; it cannot approve payroll, make hiring decisions or perform HR commands.
- No new realtime feed, hosted integration, payroll computation or model service was activated. Existing L1/H1-LIVE/H2/L2 and final D1 gaps stay open.

## Phase-end evidence

| Check | Result |
| --- | --- |
| Foundation TypeScript | Passed |
| Production build | Passed; JS 465.10 kB / gzip 136.30 kB, CSS 168.67 kB / gzip 29.45 kB |
| Browser gate | 18 distinct affected journeys passed on the first run |
| New overview-assistant journeys (4) | Task/payroll/job statistics propagation and queue links; cross-mode chat/focus/read-only behavior; employee ownership/mobile/light/dark/reduced-motion/200% zoom; live progress scope/CSRF and unavailable HR |
| Existing affected journeys (14) | Workspace modes (1), HR (4), desktop demo (3), talent overview (2), foundation (1), interviews (1), modern workspace (1), progress chat (1) |
| Accessibility | Sampled axe checks returned zero violations; new exact 390px layouts and 200% zoom passed |
| Visual | Local desktop overview, floating icon and opened chatbox/reply reviewed |

No tests ran during construction. One frontend phase-end gate passed; no repeated backend/SQL suites. Existing chat fixtures were updated for current mounted HR/recruiting modules and explicit assistant navigation before the gate.

Screenshots use invented demo data: [Main Overview](../../../docs/images/kerjaos-main-overview.jpg), [floating assistant](../../../docs/images/kerjaos-floating-assistant.jpg). Local preview remains open; no deployment.
