# U5 / H1 local completion gate — 6 October 2026

**LOCAL_GATE_PASSED.** Owner expanded KerjaOS into recruitment and HR management. This gate covers the selected cream/yellow reel interface and additive local company HR baseline. It does not activate a hosted database, payroll payment or a real employee pilot.

## Built

Rebuilt the selected reel/public Coterie preview's pill header, segmented rail, portrait, thin weekly graph, circular timer/ticks, tall dark onboarding tasks, accordions, weekly event calendar, selectable directory and roster/month/profile payroll layout. Three payroll profile meters use actual loaded approved-hours/onboarding/leave-request counts; no fictional entitlement balance. Original portrait and locally bundled OFL fonts; no new UI dependency, paid template source or remote media. [Asset mapping and exact generation prompt](../ui/U5-ASSETS.md).

Canonical accepted human hire → company invitation → candidate joins → default employee dashboard. Other applications/career tools remain available; that choice survives refresh. Employee and management demos are isolated in memory. Recruitment overview/trajectory/fair controls and existing modules remain available. People/payroll secondary views keep the retained recruitment dashboard mounted but hidden to preserve draft/control state.

Private employment/grant/task/time/leave/payroll/event/audit tables; strict API input, opaque session/CSRF adapters and checked scoped SQL RPCs. Independent HR/payroll MFA grants, employee ownership, current session/grant checks including replay, locks, revisions, idempotency and audit. Time daily bounds, leave overlap/no self review, integer-cent nonnegative payroll, draft/approve/issue immutability/no employee self approval; issued own payslip and company payroll CSV. Offboarding removes employment access and records the reason. Independent staff grants are separate and require their own revocation.

## Evidence

| Gate | Result |
| --- | --- |
| Foundation TypeScript with Vite CSS types | Passed |
| Vite production build | Passed; final bundle size recorded in PROGRESS.md |
| `backend/tests/foundation/test_hr.py` | 16 cases passed (12 initially; four repaired cases rerun only) |
| `tests/hr-sql.mjs` | 64 assertions passed in actual offline PostgreSQL/PGlite with synthetic Auth schemas |
| `tests/browser/hr-workspace.spec.ts` | Four distinct HR journeys passed |
| Existing affected browser journeys | Eight distinct journeys passed: desktop-demo (3), talent-overview (2), modern-workspace, foundation and human interviews |
| Accessibility/mobile/visual | Sampled axe checks returned zero violations; browser gate verified 390px/light/dark/reduced motion. CUA reviewed desktop, directory/payroll, dark/mobile and local fonts; zero console error entries. |

HR browser journeys cover company joining, tasks, timer controls, draft/submit time, leave/withdraw, career return; scoped directory selection/search; payroll cent editing/approve/issue/download/CSV; event creation/detail/Escape/week paging; employee-only issued payroll, light/dark/mobile; and normal-account employee default/join CSRF plus career preference on refresh. Backend authorization is established by API/SQL checks, not route-mocked browser journeys.

SQL verifies invitation versus offer-only, join retry/mismatch, direct table/anon/cross-company denial, task stale revision, work dates/daily totals, separate HR review, leave overlaps, payroll grant versus recruitment/HR permissions, duplicate period/nonnegative amounts, immutable approved records, own issued-only reads, self approval denial, approved time/leave calendar access without leave reasons, revoked session/grant replay, bounded/control-character requests and offboarding. All eight HR tables have RLS enabled and no direct client grants.

## Repairs and test discipline

No tests during construction. The initial gate found a damaged nested Python datetime import, a test incorrectly expecting MFA staff access at aal1, and a tsc invocation missing Vite CSS types. Browser checks found export-hover contrast, missing new HR fixture routes and a malformed empty-policy fixture. Repaired these and reran only failed/affected checks. Visual review corrected punctuation encoding, settings/arrow alignment, gauge ticks/dotted graph guides and separation of secondary HR screens. Confirmed only the affected navigation/accessibility journeys and final output after those changes; unrelated passed backend/SQL suites were not repeated.

## Limits and remaining work

L1/H1 live migrations/private bucket/synthetic Auth/MFA/grants/real-RPC journeys are still pending. New CLI-generated H1 migration was tested locally and **not applied remotely**. PGlite does not prove hosted Supabase Auth/PostgREST/Storage integration.

H2 must implement/review statutory payroll/overtime/holiday/entitlement rules, payroll correction/reversal/history, contracts/full profiles/device/benefit/pension records, pagination/company reporting and HR/financial retention/export/erasure/offboarding-access policy. H1 serves bounded loaded cohorts and manually reviewed MYR figures. Issued is a ledger state, not bank payment. M9 recruitment erasure does not cover HR retention. No medical evidence, bank details or tax identifiers collected; no external inference, emails, scraping, payments or deployment in this phase. D1 stays last. See [setup](SETUP.md) and the root implementation checklist.

Portable invented-data JPEG screenshots: root `docs/images/kerjaos-hr-dashboard.jpg`, `kerjaos-hr-dashboard-dark.jpg`, `kerjaos-hr-people.jpg`, `kerjaos-hr-payroll.jpg`, `kerjaos-hr-mobile.jpg`, updated `kerjaos-signin.jpg`. They demonstrate UI only, not hosted integration.
