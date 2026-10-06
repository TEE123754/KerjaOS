# U1 phase-end gate — 5 October 2026

Local gate PASSED. Construction completed before tests; only failed/changed checks were repeated. No remote migrations, deployment, email, scraping or external-model inference ran during this UI phase.

## Evidence

- 32 affected backend tests passed: foundation/test_recruiting.py, foundation/test_boundary.py, test_resume_agent.py, test_interview_agent.py and test_candidate_neutralization.py. Includes offline agent artifacts, inert injection, strict DTO bounds, staff MFA/server membership, demo default-off/local-origin restriction, stream results, job write separation and existing authentication/upload boundaries. One pre-existing legacy Pydantic deprecation warning.
- 26 PostgreSQL/PGlite assertions passed via tests/ui-parity-sql.mjs using actual prerequisite migrations plus the additive recruiter migration. Covers assigned-job scope, MFA/candidate denial, account isolation, idempotency/revision/window guards, anonymous public metadata, encrypted source bounds/expiry and service-only cleanup. Does not prove real multiple-connection Supabase behavior.
- Four browser journeys passed (29.4s, Edge, retries zero): three desktop-demo cases plus existing foundation.spec.ts. Candidate prefilled demo, multi-job apply, practice readiness, reminders/logout with zero private writes; recruiter local agent pipeline and sample job publication; no old brand text, zero axe violations on login/candidate desktop, Classic/Luna and 390px horizontal fit; existing authenticated application flow and legacy sensitive browser-storage removal.
- Foundation TypeScript no-emit passed. Production build passed: 1628 modules; JS 381.89 kB / gzip 114.60 kB; CSS 123.65 kB / gzip 21.16 kB. Existing lucide imports increased transformed modules; no dependency packages added.
- Visual review of localhost sign-in and candidate desktop completed in the in-app browser. Screenshot: ignored app/.local/kerjaos-desktop.png. Teal desktop/navy window bars/beveled controls, ready demo and application pipeline visibly verified.

## Repairs and scope

Initial typecheck found an unclosed sourcing-list JSX element; fixed and typecheck rerun. Vite's sandbox parent-directory config lookup failed; approved normal build/browser invocation passed. Passing backend/SQL suites were not repeated. Final static review corrected UTC job windows to local datetime fields so editing preserves the same instant; focused typecheck and final production build passed. Actual staff UI/live data integration still requires L1.

## Remaining

See PARITY.md: Supabase migrations/private bucket and synthetic account/MFA setup; full real-account journeys; profile photo/avatar upload; optional OAuth/sender/approved scraping and official identity/background providers. Agent review is deterministic, read-only recommendation and draft output, not final decisions or delivered invitations. Source expiry blocks reads, physical cleanup remains an operator task. Demo preview must be disabled on public hosting. Deployment stays D1, last. These limitations are not disguised as completed live feature parity.
