# M8 retro desktop and human interviews

## Local interface

Classic/Luna-inspired themes use scoped CSS tokens, readable native controls, original SVGs and grid wallpaper. All existing candidate/HM windows remain; taskbar focus/minimize preserves mounted forms/quiz state. Move buttons and maximize/reset provide keyboard alternatives to optional bounded title-handle movement and native horizontal resizing. Mobile disables movement/resizing, wraps controls and supports zoom; reduced-motion disables animation. Only theme preference is persisted (`kerjaos-theme`); sessions/evidence/forms stay out of browser storage. Interview draft edits register a beforeunload warning; window changes never unmount drafts. Logout still unmounts session content.

No active src file imports MUI/Emotion; removed the four unused packages after checking imports. Radix remains. react-rnd and theme CSS libraries are not required. The new accessibility gate uses pinned @axe-core/playwright as a development-only tool. [Brand review](BRAND.md) remains provisional.

## Migration, roles and scheduling

After backed-up M1–M7 migrations, apply `supabase/migrations/20261003100000_m8_human_interviews.sql` to the selected test Supabase project. Existing identity/background/model/legal/provider defaults stay off. No new paid/provider key is needed. Human interviewers must be active employer HM/admin/reviewer/recruiter members assigned to the job by the existing staff setup. HM/admin with verified MFA and job permission creates a slot selecting a specific assigned interviewer. Only that interviewer (verified MFA, still active/assigned) submits its scorecard. Candidate scope never returns staff scorecard notes.

P6 + interview_ready requires a prior human shortlist and M2 interview_entry. Slot proposal, confirmation/reschedule, scorecard and final outcome recheck current identity/quiz/typed background evidence and job closure/holds. Slot overlap checks serialize with a private DB calendar lock and indexes; candidate overlap across independent jobs is checked too. Consistent job → application → calendar lock order matches existing transitions. A candidate cannot confirm another candidate's booking, and a staff member cannot confirm on the candidate's behalf. Invites have optimistic revisions; rescheduling returns to proposed and requires fresh candidate confirmation. Cancelling a booking releases its slot; cancelling an available slot disables it. Up to 50 future active slots/job, four hours/slot, 90-day planning horizon.

Slot creation inputs are explicitly UTC; choose IANA display timezone (e.g. Asia/Kuala_Lumpur) for localized display. API requires timezone-aware timestamps; PostgreSQL validates timezone names. Stored timestamptz and UTC ICS avoid ambiguous DST/local timestamps. Supply an HTTPS meeting link or physical venue; KerjaOS creates no provider account/link and does not fetch meeting URLs.

Interviewer scorecard after the slot ends records skills/communication/reasoning 0–5 plus private human notes. HM/admin then separately records offer, not selected or hire with reviewed rationale and explicit human attestation. Hire requires a completed scorecard, an offer, explicit candidate offer acceptance, fresh gates and a new human action. Shortlisted and offer accepted never automatically become hired. Candidate records acceptance through the UI; external contract terms remain the human employer's responsibility. Every scheduling/change/scorecard/outcome/acceptance action records an application event.

## Reminders, ICS and sender

Confirmed upcoming interviews within 24 hours produce deduplicated in-app reminders for an authorized session on refresh; proposed/cancelled/withdrawn/blocked/expired-gate interviews do not produce future reminders. Withdrawal/job closure/status hold cancels active bookings, increments invitation revisions and cancels reminders. Historical outbox events remain history, not queued future email. No persistent reminder daemon, SMTP provider or purchased calendar plan is required.

ICS export is authenticated/owner-or-authorized-staff scoped, no-store, UTC DTSTART/DTEND, stable booking UID, revision SEQUENCE, UTF-8 75-byte folding and escaped text. Cancelled booking exports a cancellation tombstone. Stale gates block active invitation export until human review/cancellation. Raw scorecards and email addresses never enter ICS. Downloaded files cannot be remotely erased: download/import the latest revision or cancellation to update an external calendar; automatic calendar synchronization and email delivery are not claimed.

The optional sender contract defaults DisabledInterviewSender (state disabled/sent false/verified sender not configured). Real verified SMTP/free quota/retries/delivery activation is DEFERRED; no outbound message or autonomous sending was performed. In-app notices use existing outbox. Keep the disabled sender on rollback. Reminder metadata cleanup/scheduler and service-wide retention/DSAR review are live M9 release tasks; business event/scorecard retention needs approved policy.

## Synthetic demo

Use two candidates/two jobs with synthetic M2 policies and valid test evidence. HM shortlists and explicitly enters P6 interviews; choose an assigned interviewer and create a future slot. Propose to A/X, then sign in as A to confirm. Reschedule to another available slot and confirm its new revision; download ICS. A/Y and B/X remain independent and cannot overlap A's time or take a reserved slot. After the interview ends, assigned interviewer submits a scorecard; HM offers, A records acceptance, HM records hire. A separate withdrawal cancels its active invitation/reminder. Browser network fixtures speed the demo; real production clients cannot move a slot into the past to unlock scorecards.

Switch themes, navigate taskbar, type an unsaved reason, minimize/restore/reset; the draft remains. Check keyboard, mobile and zoom. [Gate](GATE.md) records actual checks only at completed construction.

## Remaining live gate and rollback

Real migrations/Auth/PostgREST/proxy, concurrent slot/booking/reschedule/withdraw/closure/offer races, real time-zone/calendar clients, interviewer operational consent, scheduled reminder retention, SMTP and public brand/legal clearance remain pending configuration/review. Serial PGlite and browser fixtures are not hosted concurrency proof.

Rollback: choose Classic/all windows/reset (no experimental dragging required), keep guarded scheduling records/versions and cancellation history, and keep email off. No destructive migration drop or permission/data-policy rollback. Frontend Vercel/backend Railway/database Supabase remain selected; existing free-hosting eligibility/capacity blockers are unchanged.
