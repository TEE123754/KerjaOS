# KerjaOS

Private development workspace for the KerjaOS recruitment product. React/Vite frontend, FastAPI backend, Supabase Postgres/Auth/private Storage. All **M1–M12 local feature gates passed**; real Supabase integration and release readiness remain pending. Frontend/backend stay on localhost, with **Vercel/Railway deployment reserved for the final phase**.

## Project layout

- [app/README.md](app/README.md): application implementation, setup and per-phase evidence.
- [PRD.md](PRD.md): product scope, features, acceptance criteria and service constraints.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): M1–M12 evidence and remaining L1 → L2 → D1 work.
- [PROGRESS.md](PROGRESS.md): living done/left checklist and gate results.
- [Kerja.md](Kerja.md): original input, preserved.
- app/supabase/migrations/: ordered additive migrations M1–M12.

The product includes independent application pipelines, human-reviewed identity/background workflows, quiz/private practice, scoped progress assistant, approved-source discovery adapters, retro EN/BM workspace and human interviews, private tracker/resume library, scoped analytics and owner reminders. Official checks, biometrics and validated acceptance probability are not activated by these local implementations. Original source and attribution from [404-Brain-Not-Found-Recruiter](https://github.com/Xiaoming0313883/404-Brain-Not-Found-Recruiter) remain in app/; active secured routes and intentionally disabled legacy capabilities are documented there.

## Local setup

Use app/backend/.env.example as the template for ignored app/backend/.env. AI and Supabase credentials will be provided later; none are included. Generate independent encryption keys locally, preserve keys for existing encrypted data, and use a selected synthetic development Supabase project with backed-up migrations. A database connection is additionally needed for operator SQL/backup/concurrency tooling. See [local integration checklist](IMPLEMENTATION_PLAN.md#16-remaining-work--local-first-deployment-last).

From app/, install frontend packages with `npm ci`, then `npm run dev`. Create a Python virtual environment and install backend/requirements-m1-dev.txt for local development (the production dependency lock is documented in app/). From app/backend/, start main.py using that environment. The Vite proxy points to localhost:8000; frontend uses localhost:5173. Without configured verified Supabase accounts, live login is unavailable; synthetic browser test fixtures are not a production login.

APP_MODE stays demo_free. External AI, official providers, discovery collection, reminder SMTP and hosted scheduling stay disabled pending their own activation checks. There is no paid fallback. Free hosting eligibility and actual account quotas are reviewed in final deployment, not assumed from a successful local build.

## Remaining work and test cadence

1. L1: connect development Supabase while keeping app processes local; migrate/restore/bootstrap synthetic accounts and verify real Auth/RLS/Storage workflows.
2. L2: original-feature parity, concurrency, recovery/retention, security/license/performance and local usability/readiness checks.
3. D1: deploy to Vercel/Railway last, then hosted HTTPS/proxy, free-budget, monitoring/worker and rollback validation.

Run tests only at the completion gate of each built phase, then rerun failed/affected checks for repairs. Update the implementation plan and progress checklist during/after each phase and before usage limits. Existing per-phase gate counts/evidence are recorded; local success does not claim hosted, legal or commercial release approval.
