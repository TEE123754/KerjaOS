# M7 job discovery and external tracker

Local build: Greenhouse/Lever JobSourceAdapter → safe metadata normalizer/canonical URL → dedupe → deterministic category/seniority/location/risk hints → text/tag search. No resume/profile is used for ranking; results are simple keyword matches, not inferred hiring suitability. Unknown location and unverified/risky wording remain visibly labelled; remote does not establish Malaysian eligibility. Optional E5/pgvector/BGE benchmark is deferred; no model is downloaded or needed.

## Database and configuration

After backed-up M1–M6 migrations, apply `supabase/migrations/20261002170000_m7_job_discovery.sql` to the selected test project. Private tables hold sources/policy, normalized listings, minimal seven-day run-budget reservations, own saved jobs and private external notes. Tables are inaccessible directly to users; authenticated facade RPCs verify active sessions/ownership. Ordinary API calls use the user's JWT, never service-role data access. Source runs/claim/finish are service-only. External records never create internal applications or change P0–P6.

Defaults are backend `JOB_DISCOVERY_ENABLED=false`, `SCRAPLING_ENABLED=false` and DB discovery_policy.enabled=false; seeded documentation source candidates are disabled/unapproved. No keys are required for public source GETs, but Supabase/session configuration and specific source approvals are required to collect/persist jobs. See [source register](SOURCES.md). Do not enable the two example candidates to imply real market coverage.

Operator inserts/updates an exact source after review with name (employer display name), adapter, board, endpoint, allowed_hosts, synthetic flag, reviewed_at/review_expires_at, evidence and explicit reviewed/robots/redistribution flags. Greenhouse endpoint must be `https://boards-api.greenhouse.io/v1/boards/<board>/jobs`, no full-description request. Lever endpoint must be `https://api.lever.co/v0/postings/<board>?mode=json&limit=50`. Outgoing ATS/custom company domains must be included explicitly. No browser endpoint accepts URLs/source configuration or can enqueue crawling. Enable source and DB policy only after the review; source expiry/kill/global pause prevents collection and late completion.

The optional local static career adapter reads JSON-LD JobPosting metadata using `Scrapling==0.4.15` Selector, without any Scrapling fetcher/spider/stealth/browser/proxy code. Install `backend/requirements-m7-optional.lock` in the local worker environment only if using it; the lean production API/Docker requirements remain unchanged. `SCRAPLING_ENABLED=true` still needs approved source and current robots permission. No login/CAPTCHA/block bypass, JobSpy, LinkedIn cookies or agent-reach runtime exists. Dynamic pages without static structured metadata return unavailable/incomplete rather than launching a browser.

## Bounded operator worker

Run from app/:

```powershell
.\.venv\Scripts\python.exe backend/scripts/discovery_m7.py --enqueue --limit 1
```

Uses configured backend Supabase service credentials. The script prints counts/state codes only. At most five source reservations per UTC day globally, one active discovery lease globally, one source/day normally, 50 normalized roles/source/run and six HTTP requests/source invocation including redirects/robots. One CLI invocation handles at most five sources; default one. Responses cap at 1 MiB, every hop is HTTPS/exact allowlisted host, DNS must contain only public addresses, connection is pinned to that address with hostname TLS validation. No environment proxy, cookies or auth headers are sent. A socket-shutdown timer plus read1 enforces the eight-second network/header/body deadline; DNS results arriving after it cannot start a connection. OS DNS resolver duration is platform-dependent and should be measured before hosted scheduling. Per-domain minimum one-second spacing and robots crawl delay/request rate are honored; required delays over ten seconds fail closed for separate operator review.

An in-memory response cache is bounded by a single run and five minutes, not a persistent archive of job descriptions. PostgreSQL scheduling/freshness avoids repeated daily collection. 429 honors numeric/date Retry-After (60 seconds–one day) without retrying in the same invocation; 401/403, unsafe targets and robots denial disable that source. Transient failures persist due/backoff and a two-minute lease; crashed work resumes after lease expiry, maximum three attempts then dead-letter. A source killed/review-expired while fetching cannot publish its late result.

Greenhouse complete metadata board and Lever page <50 may mark missing jobs removed. Truncated (50+), filtered/canonical duplicate and static career-page batches never claim an entire board is removed. Capped pages do not provide full-market pagination. Listings become stale after three days; normal search excludes expired/removed/paused sources, saved/tracker view keeps links and source/fetched/expiry state. Exact canonical URLs dedupe across sources without changing first provenance; per-source/provider IDs update in place.

Scheduling is operator/local by default. Neither Railway Free cron nor an always-on hosted worker is assumed. If an eligible free scheduler exists, it may invoke enqueue/expiry; actual deployment/credit/CPU/DNS/worker contention measurements remain pending. No persistent Redis/crawler fleet/model server is added. Raw source response exists transiently for parsing but only title/company/location/tags/deep link and freshness/provenance are persisted.

## Candidate demo

Sign in to foundation workspace; Discover defaults to the real catalog, empty until approved sources run. Choose search/location/category and refresh; explicitly select Synthetic demo only for replay data in an isolated test project. Synthetic and real catalogs never mix. Save a role; follow Apply on source (noopener/noreferrer, no app submission). The click is recorded only as a visit/considering status. Separately select Applied and save a self-reported external update with optional private note (500 chars, avoid sensitive documents). This never asserts the employer received it. Notes/status are visible only to the owner, not hiring managers or chatbot staff summaries.

Use My saved jobs and tracker to see stale/paused links. Include stale lets the candidate inspect old catalog metadata. Delete tracker and saved entry explicitly forgets both private records. They are retained until the candidate deletes them; listing freshness expiry does not silently erase personal notes. Include these private tables in M9 DSAR/account-deletion/export/restore procedures; full service-wide DSAR release remains deferred. No external reminders or automatic apply API is implemented. Source status can be read through `/discover/progress` or one bounded `/discover/events` SSE snapshot which closes immediately (no persistent polling loop).

## Rollback and live prerequisites

Disable JOB_DISCOVERY_ENABLED and DB discovery_policy.enabled; optionally disable individual source enabled flags. Existing saved links/notes and stale provenance remain; no migration drop/destructive rollback is needed. Pending/leased runs become cancelled on the next claim/late finish; no network work is browser-triggered. Apply/restore backup before migrations and independently demonstrate actual Auth/PostgREST/proxy, multi-connection global lease/quota/kill races and source policy review before a live release. [Gate](GATE.md) records local evidence separately.
