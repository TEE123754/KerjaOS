# U2 phase-end gate — 5 October 2026

LOCAL_GATE_PASSED. This phase restores the missing visible overview/trajectory/fair-controls rather than counting inactive source or agent helpers as transferred UX. Tests ran after construction, with targeted reruns for gate repairs.

## Evidence

- Original upstream main was checked read-only with GitHub API and matches preserved source SHA be3bf1de3451d266d923089785c9479ce6e4add3.
- **46 distinct affected backend cases passed** across foundation/test_recruiting.py, foundation/test_boundary.py, foundation/test_pipeline.py and test_release_fairness.py. Initial gate: 45 passed, one school-visibility case failed. After repair, only the 12 recruiting cases were rerun and passed. The encrypted PDF test was subsequently extended to verify successful extraction/review as well as blank-PDF denial; its focused rerun passed (no other backend suite repeated). Coverage includes equal merit/trajectory scores across paired schools and visibility settings; hidden candidate identity across artifacts; default-off/local-origin demo; MFA/membership; strict inputs; unauthorized resume denial before Storage access; encrypted current PDF parsing; read-only review; canonical transition controls. Legacy Pydantic deprecation warning remains.
- **40 PostgreSQL/PGlite assertions passed** using actual prerequisite migrations, recruiter parity migration and U2 migration. Assigned-job dashboard pagination, MFA/candidate/anonymous denial, expired/private resume context isolation, existing source/job/window/idempotency/revision guards. New APIs use invoker facades over guarded private-schema functions; no new public table access. No remote database was modified and no hosted advisor/concurrency/performance claim is made.
- **Six distinct browser journeys passed**: existing secure foundation, three desktop-demo journeys, two talent-overview journeys. Initial run had five passes and a Position-selector timeout; focused two-case rerun passed in 14.0s. Actual local backend used for deterministic sample agent scores. Coverage: position filter/chart count, candidate modal/detail tabs/Escape, paired sample candidates, keyboard reputation slider and audit table, identity toggle, candidate search/trajectory sorting, narrow 390px fit, inaccessible-backend unassessed states. Zero axe violations on overview/Classic and missing-score/Luna checks, plus prior completed sign-in/candidate checks.
- **Foundation typecheck and production build passed**: 1629 modules, JS 403.01 kB / gzip 119.86 kB, CSS 129.10 kB / gzip 22.32 kB. No added dependencies. New chart uses scoped CSS and accessible buttons/native dialog.
- Visual review in the in-app browser verified recruiter Overview, horizontal original-like tabs, KPIs, trajectory chart, fair-control panel and candidate pipeline. Ignored screenshot: app/.local/kerjaos-overview.png. A stale preview tab timed out; a fresh local preview tab worked without changing app code.

## Repairs

1. A short resume's institution appeared only in qualification, outside existing bias indicators. Feed that local educational field into neutralization; paired-visibility check now passes. Institution and injected QS rank are removed from merit scoring inputs regardless of visible-name settings, so the original trajectory rank bonus cannot leak into the active recommendation.
2. Calendar reload callback returned undefined where a Promise was required; corrected to the real async loader.
3. The unassigned SQL test expected an empty result, while existing staff guard correctly denied access. Corrected the expectation; did not weaken the guard.
4. Added explicit accessible labels to Position/scoring/slider/sort controls. Browser selector failure fixed without extending timeout or removing assertions.
5. React review added a generation guard so an in-flight review cannot restore a prior identity-visibility result after controls change, both for candidate reviews and the streamed freeform review. Final affected typecheck/build passed after this guard.

## Limits and remaining work

Full original-feature transfer is still not claimed. app/docs/ui/PARITY.md and IMPLEMENTATION_PLAN.md track profile photo/avatar upload, persisted assessment history and employer fair-control policy, email/OAuth/approved sourcing activation, real Supabase migrations/accounts/private bucket/full journeys and complete new EN/BM copy. Scores and visibility preferences are currently session-local. Reputation comparison is audit-only and does not change a hiring recommendation. Real human actions still use canonical guarded transitions; the deterministic preview never becomes gate evidence. D1 deployment remains last.

Supabase/React skill review covered least-privilege facade grants, empty search paths, server-owned memberships/current sessions/MFA, private Storage scoping, typed inputs and native dialog accessibility. Current Supabase database-function documentation and changelog were inspected; no relevant breaking convention change for these read-only RPCs. Existing index/performance scaling remains the planned L2 performance task. The migration was constructed before these skills became available; no remote schema operations were used to generate or apply it.

Documentation references: [Supabase database functions](https://supabase.com/docs/guides/database/functions) and [current changelog](https://supabase.com/changelog.md).
