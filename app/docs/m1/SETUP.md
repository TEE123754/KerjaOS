# M1 secure foundation — setup, demo and remaining gates

Implementation base: `be3bf1de3451d266d923089785c9479ce6e4add3`.
No AGENTS.md was present in the checkout. Original feature code remains in place.

## Scope and current behaviour

The active `backend/main.py` mounts only the secure foundation APIs. Original candidate/HM portals, graph, job builder, calendar and evaluation source are preserved, but old unauthenticated routes and browser-only logins are not active. Old candidate/staff links route to `/foundation`. M2 and later phases migrate those features into scoped services. This is an explicit temporary freeze, not a claim that every original feature is usable in M1.

M1 provides Supabase-owned verified login/Google PKCE, encrypted server sessions, CSRF, staff MFA, profile, public job metadata, canonical application submission/list/detail, human-only rejection, encrypted private resume access, bounded SSE and local migration/backup/retention tooling. Shortlisting waits for M2 prerequisites. There are no paid provider calls, outbound recruitment email or social-cookie scraping. Do not deploy against real data before the outstanding gates below pass.

## Local configuration

1. Use Python 3.12+ and Node 20+. Create an isolated environment and install `backend/requirements-m1-dev.txt`; frontend uses `npm ci` and the existing lockfile. For production use `requirements-m1.lock` after generating the gate lock; development extends the lean requirements file. No OCR, Torch, Chromium or graph model needs to run inside the M1 API container.
2. Copy backend/.env.example to backend/.env. Set Supabase URL, publishable key and server-only secret/service key. Use separate Fernet keys for `SESSION_ENCRYPTION_KEY` and `DOCUMENT_ENCRYPTION_KEY`; generate them locally using `Fernet.generate_key()` and never paste them in chat or commit them. Keep backup keys separate. Local cookies use `COOKIE_SECURE=false`; hosted cookies must use true.
3. Supabase account access must be explicitly selected. Configure email confirmation, Google provider minimal scopes, exact callback allowlist (`PUBLIC_APP_URL/api/v1/auth/callback`), and TOTP. Keep email signup/recovery off until a suitable sender exists. OAuth still requires provider setup; it is not a fake local login.
4. Before touching data, export the DB plus every legacy/private upload to an operator-only directory and run `scripts/backup_m1.py encrypted-backup.enc --objects <export-directory>` with `DATABASE_URL` and `M1_BACKUP_KEY` supplied privately. `pg_dump` is required. No backup is claimed merely because this script exists.
5. Review and apply the CLI-generated additive migration in `supabase/migrations/20261002060758_m1_secure_foundation.sql` to a fresh test project first. It creates shadow `m1_*` tables/private schema and a private bucket; legacy rows are retained, but client grants to legacy tables are revoked. Inspect all current Data API grants and custom routines as part of the live gate. Do not expose `kerja_private` in Supabase Data API settings.
6. Operator creates employer, jobs, memberships and assignments using reviewed SQL/console access. Publish only real authorized roles or explicitly labelled synthetic demo roles. Staff membership cannot be created from user_metadata or a browser request. Confirm user accounts before mapping legacy emails.
7. Run the backend from backend/ with `python main.py`, and frontend from app/ with `npm run dev`. Vite forwards `/api/v1` to the local backend. No app database is seeded on startup and no development credentials are built into the UI.

## Deployment

Vercel's `vercel.json` contains an explicit `YOUR-BACKEND` placeholder. Replace it with the selected Railway HTTPS service origin before deploying; API rewrites must precede the SPA fallback. Set the matching `PUBLIC_APP_URL` and `ALLOWED_ORIGINS` in Railway and `COOKIE_SECURE=true`. Backend env vars remain server-only. Railway runs Python on its provided PORT with `/healthz` healthcheck; request access logs are disabled to avoid recording signed URLs/OAuth codes. Platform proxy logs must also be reviewed.

The healthcheck confirms process availability, not migration/auth readiness. With no credentials, it reports `auth_configured=false` and sign-in returns 503; no mock login is substituted. Vercel Hobby use eligibility and Railway recurring-credit usage must be measured/reviewed before declaring a release. Do not purchase paid services.

## Legacy recovery and application migration

The source has candidate arrays plus an applications table keyed by `position-{job}`. A table row may have been overwritten across candidates. Offline `foundation.migration.reconcile` rebuilds from both sources, uses stable candidate/job/cycle UUIDs and lists conflicting snapshots/unmatched mappings. Full evidence stays encrypted; stdout contains counts only.

Prepare `input.enc` containing candidates, applications, a reviewed verified Auth UUID map, and a job/employer UUID map. Run `scripts/reconcile_m1.py input.enc report.enc` first. Inspect the encrypted report locally, resolve conflicts deliberately and produce a new reviewed input. `--apply` refuses unresolved conflicts/unmatched records and uses one DB transaction. Accounts are checked against confirmed Auth emails. Imported outcomes are `on_hold` with a migration event; old scores/statuses remain evidence in the snapshot, not fabricated human approvals. Original candidate/table records are not deleted. ID mappings and counts must be reconciled before switching traffic.

No SQL editor imports/production credentials were used in this local implementation. Existing SHA-256 passwords are not accepted by the new app and cannot be imported as Supabase-compatible hashes. Verified OAuth ownership or an operator-issued Supabase recovery flow is required to establish the new account. The optional `/auth/recover` endpoint starts proof-of-inbox access. Its PKCE callback creates a ten-minute recovery session; the recovery form changes the password only within that verified session and revokes application sessions. Current-password changes require reauthentication. Email recovery remains disabled until the sender and live callback gate are configured.

## Synthetic demo at the completed-phase gate

Use two confirmed test accounts A/B, two published test jobs X/Y and an assigned HM with AAL2. Login A, submit X/Y, login B in another browser context and submit X; check three distinct IDs. A cannot open B/X, another employer cannot review A/X, and a candidate cannot call a human decision. Upload a small synthetic PDF; only its owner can request/open the 60-second link, and an expired link is denied. A verified HM may reject with reason/version/idempotency key; notifications/events are atomic. Shortlist is intentionally unavailable until M2.

Exercise Google PKCE, cookie refresh race, CSRF rejection, logout/revocation, exact CORS, direct Data API RLS, Storage denial and proxied SSE on the actual deployed stack. Mocked API tests do not prove Supabase policies, cookies or hosting. Do not test live candidates or consume paid provider calls.

## Retention, queue and recovery

Run `scripts/retention_m1.py --dry-run` for counts, then a bounded cleanup locally. Expired resume objects and stranded upload intents are removed from Storage before metadata is marked deleted. Sessions expire independently. The queue module supports leased claims, token-checked completion, retry/backoff and dead letters for later asynchronous workloads. There is no always-on hosted worker; if the operator is offline, cleanup is delayed and must be monitored. M3 adds consent-driven identity capture and its stricter cleanup/overdue-block policy.

For restore, decrypt the backup locally into a temporary operator-only directory, restore `database.dump` with pg_restore into an isolated project, restore encrypted object keys, check checksums/references, replay post-backup deletion/revocation records and reconcile row counts. Never restore production blindly or re-enable legacy endpoints/weak passwords/public uploads. Delete temporary plaintext dumps after review; preserve keys separately from archives. A real restore rehearsal remains an external gate until pg_dump/Postgres access is configured.

## Known operational limits and outstanding gate items

- Live backup, migration, current RLS/grants, Auth/MFA/OAuth, object export/restore and deployment smoke need explicit project configuration. No active credentials were discovered or modified.
- M1 does not yet port all original legacy routes. They remain frozen; scope and original features are visible in source for M2 onward.
- Email delivery, Google/verified account setup and the recovery callback still need the live Auth gate; their network fixtures cannot prove provider delivery.
- Current request throttling is in-process, per direct peer; forwarded headers are untrusted. Behind a shared proxy it can rate-limit unrelated users. Configure a trusted-proxy-aware/global limiter before public load; never trust arbitrary X-Forwarded-For.
- Pending-work loops/Realtime, OCR models, provider webhooks and paid vendor checks are not deployed. Private resume parsing is bounded, but this is not a malware scanning/certified document verification service.
- Migration rollback is a secure traffic/config rollback with shadow tables retained. Do not drop tables or restore old client grants without a reviewed backup/recovery decision.

Tests run only at the completed M1 gate, not after edits. Update root IMPLEMENTATION_PLAN.md and PROGRESS.md before stopping work or nearing the usage limit. Actual results are recorded in GATE.md; pending/live checks cannot be marked passed.

API keys are used according to [Supabase's API key documentation](https://supabase.com/docs/guides/getting-started/api-keys): modern keys go in `apikey`, while the user's JWT goes in `Authorization`. The server-only env name `SUPABASE_SERVICE_ROLE_KEY` accepts a modern secret key as well as the legacy service-role JWT. No such key is bundled into the frontend.
