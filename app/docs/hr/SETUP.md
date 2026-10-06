# H1 local HR baseline

Owner authorized the HR expansion on 6 October 2026. Current phase constructs a recruitment + management product locally. No hosted SQL or deployment was performed. D1 deployment remains last.

## Try it locally

Run the root README's frontend/backend startup. At `/foundation`, choose **Employee demo** and sign in with the prefilled public synthetic credentials. **Recruiter demo** opens the management bento dashboard and retains recruitment overview/trajectory/fair controls below it. Use the HR pill tabs to open People/Payroll; use the dashboard actions for Timesheets/Leave/Onboarding/Calendar. Settings opens theme, company selector and sign out.

Candidate demo → **Rehearse accepted hire → employee journey** → **Join company** demonstrates the employee transition independently from the sample applications. All HR demo writes are in memory and disappear when the demo unmounts; no emails, payments or private API writes occur. This explicitly labelled rehearsal does not fabricate a real finalized application.

## Real account activation (L1, pending)

The CLI-generated additive migration is `supabase/migrations/20261006062058_h1_hr_workspace.sql`. It requires M1/M8 and the existing ordered migration chain. First complete the backed-up migration inventory/synthetic Auth/MFA/private Storage work in `../l1/SETUP.md`. Inspect existing hosted migration history before applying; a local SQL gate is not permission to overwrite hosted state. The H1 migration has not been applied remotely.

Existing M8 human outcome checks remain canonical: candidate accepts an offered application and an assigned human finalizes **hired** after the required interview/scorecard/evidence gates. The H1 trigger creates an invited employment, with a conservative backfill limited to accepted finalized hires. Shortlisting, an AI score or offer acceptance alone never creates employment. The candidate confirms **Join company**. Foundation sign-in/reload then defaults to the employee workspace; career tools and other applications remain accessible. Returning to career tools does not terminate employment.

An authorized database operator must provision `kerja_private.hr_grants` with the verified Auth user/company UUIDs and role `hr` and/or `payroll`, after confirming company ownership and permissions. There is no client grant-writing endpoint. Do not grant roles based on submitted JSON or a demo account. Existing recruiter/admin memberships do not imply payroll access. Both grant roles require current `aal2` and a live Auth session. Staff without employment may use **Company HR** in the normal account navigation; employee sign-in defaults to HR automatically.

## Data and permissions

| Actor | Read / write |
| --- | --- |
| Employee | Own employment, tasks/events, time/leave and issued payroll. Join own invitation; complete own tasks; draft/submit own time; request/withdraw own leave. |
| HR + MFA | Scoped company directory/tasks/time/leave/events; assign tasks, review other people's time/leave, create events, offboard another employee with reason. No other employees' salaries. |
| Payroll + MFA | Scoped directory, approved time/leave for the monthly calendar and company payroll ledger. Draft/review/issue payroll; no employee self approval/issuance. Leave reasons are never returned by context. |
| Recruiter | Existing assigned-job recruiting permissions only. An HR/payroll grant is separate. |
| Anonymous / revoked session | HR RPCs denied. All HR tables deny direct client access. |

Checked private functions have fixed empty search paths; public invoker wrappers expose only the two authenticated RPCs. They derive company/owner/grants from live records, apply current permissions to idempotent replays, lock the employment/record, check revisions and atomically append an audit + idempotency record. MFA/grant revocation stops staff operations. Employment end blocks employee writes/access; independent staff grants must also be revoked by an operator if staff access is to end. Offboarding is not an Auth account deletion. Audit contains action/actor/record IDs and the bounded offboarding reason, not a copied salary/document payload.

Date-only work/leave uses Malaysia calendar dates. Events require a UTC offset and are displayed in Kuala Lumpur time. Work days cannot be future or before employment start; non-rejected daily total is at most 1,440 minutes. Leave is 1–31 inclusive calendar days per request and cannot overlap pending/approved requests. HR cannot approve their own time/leave.

Payroll stores integer MYR cents (up to 99,999,999 per input), nonnegative calculated net, one person/month record and optimistic revision. Approved/issued records cannot be edited by H1. Payslip is a plain text ledger document; issued means a published record, not money sent. CSV uses quoted fields with formula-prefix neutralization. No statutory payroll engine, bank rails, tax identifiers or entitlement balances are implemented. These are H2 tasks in the root implementation plan.

Context is deliberately bounded: 50 companies, 100 directory rows, 200 tasks/time/leave rows, 100 payroll/events. Time respects the selected month; events are loaded from 31 days ago through the next 90 days. Charts and counts describe loaded records; they are not validated organization-wide reports. Pagination and full reports are H2 work.

## Release boundaries

The schema is new and must pass hosted RLS/Auth/session/MFA/grant-revocation rehearsals before real employees. Country/company statutory deductions, entitlements/holidays, overtime, salary corrections, documents/signatures, device/benefit/pension records and scalable reporting remain H2. Financial/employment retention, privacy export/erasure and access after departure require a separately reviewed policy: existing M9 recruitment erasure is not that implementation. Do not pilot real HR records until those gates are resolved.

Phase-end tests: `tests/hr-sql.mjs`, `backend/tests/foundation/test_hr.py`, `tests/browser/hr-workspace.spec.ts`; see `GATE.md` after completion. No external model calls or bank/email operations are needed.
