# M9 release status and configuration

Target: `demo_free`, synthetic invented candidates/documents only. Local runnable demo, not a deployed or legally approved pilot. `FoundationSettings` rejects other APP_MODE values pending reviewed live gates. The legacy implementation remains in the repository; the active server imports only the secured foundation, with no legacy routers/public uploads or autonomous decisions.

| Capability | Default / release scope |
| --- | --- |
| Authentication/private files | Requires configured Supabase, encrypted session/document keys and backed-up migrations; no fake public login |
| Identity | Manual/mock evidence, real capture off; no biometric capture or official identity claim |
| Quiz | Published objective/manual rubric review; private practice has no validated acceptance probability |
| Background | Labelled mocks/candidate documents; official CTOS/CCRIS/criminal adapters unavailable; no automatic adverse result |
| Chat / Jev | Rules by default; external wording off; price/privacy/DB allowance guard retained; no Jev decision model |
| Discovery | Registry and global switch off; only separately reviewed sources may run; fixtures are synthetic/documentation examples |
| Interviews | Human entry/assigned interviewer/MFA; offer → candidate acceptance → separate human hire; disabled email sender |
| Privacy | Candidate-token partial export, request queue and operator-reviewed private workspace erase; full account erasure/manual access review pending |
| Hosting | Vercel frontend, Railway backend, Supabase database; live integration and free budget measurement pending |

## Local demo setup

Frontend: app root, `npm ci`, `npm run dev`; `/foundation` is the active workspace. Backend: create a local venv, install `backend/requirements-m1-dev.txt` (or exact production `requirements-m1.lock`), start `backend/main.py` from backend. For the preserved legacy regression suite, use local-only pinned `backend/requirements-m9-regression.txt`; Docker keeps the lean production lock. The old broad `requirements.txt` supports retained legacy tools and is not the production install. Set VITE_API_URL=/api/v1 and the Vite backend proxy as documented in M1; never use VITE_ names for private keys.

Supply backend Supabase URL/publishable/server-only keys, independent session/document encryption keys, selected app URL/allowed origin and COOKIE_SECURE appropriate to localhost vs HTTPS. Set a monitored PRIVACY_CONTACT before public use. Apply M1–M12 migrations only after encrypted backup and isolated restore approval. Use verified synthetic Supabase accounts A/B plus qualified assigned HM/interviewer with MFA, synthetic jobs X/Y and published quiz banks; existing setup runbooks contain reviewer/consent bootstrap. Keys remain outside Git. No provider key is required for rules/manual mode. OAuth and email require actual callback/sender configuration; keys will be supplied later by the owner.

Local browser fixtures work without hosted accounts. They do not provide a production mock login. Empty/deferred/offline data is presented truthfully. Local workers are bounded one-shot scripts; an offline operator delays processing/cleanup. Never promise always-on operations within an unmeasured free allowance.

## Release switch procedure

Public/controlled pilot activation is gated on hosted Auth/MFA/PKCE/proxy/cookie/Storage/RLS evidence, backup/backfill/restore/count reconciliation, post-backup erasure/revocation replay, concurrent review/queue/booking races, consent/retention/privacy contact and transfer/legal review, approved discovery source coverage, incident ownership and measured free capacity. Brand is provisional. Do not simply edit APP_MODE to bypass these checks. No deployment, account creation, subscription upgrade or paid provider was performed.

All M1–M8 unresolved live gates carry forward. M9 local checks do not clear commercial use, model/legacy licenses or dev-only advisories.

## Updated execution order — 5 October 2026

Keep frontend/backend on localhost now. Supabase can be used as development Auth/database/private Storage without deploying the app to Vercel/Railway. Follow root IMPLEMENTATION_PLAN.md §16: L1 configured localhost integration, L2 local readiness, then D1 final deployment. All feature phases M1–M12 have local gate evidence; real integration/readiness and deployment evidence are still pending. Development keys belong in ignored backend/.env; DATABASE_URL or a selected SQL Editor route is additionally required for applying SQL, with direct database access needed for pg_dump/multiple-connection tooling. API keys alone do not satisfy those gates. Do not publish the frontend/backend, start a hosted scheduler, send email or activate optional providers during the planning/configuration handoff.
