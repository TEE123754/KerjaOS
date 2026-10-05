ROLE
You are a senior full-stack engineer and product architect. Upgrade the existing
repo "404-Brain-Not-Found-Recruiter" (404Hire) to v2. Plan first, then work in
small milestones, each with migrations, tests, README updates and a demo script.
Ask before destructive changes. Never put secrets in the repo. Do not make legal
claims: where the law is uncertain, add a [TBC-LEGAL] note and a config switch.

EXISTING SYSTEM (reuse, do not rewrite)
- Frontend: React 18, Vite, TypeScript, Tailwind 4, Radix, MUI.
- Backend: FastAPI + Supabase Postgres. Deploy: Vercel + Railway.
- Agents: RecruitingAgentGraph with Supervisor node, Guardrail node, TOOL_REGISTRY
  (Requirement, Resume, Bias, Matching, Interview A/B, Report, Email Planning,
  Action Policy), deterministic fallbacks with fallback_warning, SSE streaming,
  bias/fairness controls, interview calendar, SMTP.
- New capabilities = new tools/adapters registered in the graph + new pipeline states.

FIX FIRST (M1)
- Candidates currently have a single application. Create an `applications` table
  (candidate 1→N, per-application state, history, scores) and migrate existing data.
- SHA-256 passwords → Argon2id (or Supabase Auth). Open CORS → allow-list.
  Demo HM credentials in README → remove. Browser-storage sessions → httpOnly cookies.
  Public /uploads → private bucket + signed URLs.
  li_at-cookie LinkedIn fallback → remove, or admin-flag it with a documented ToS risk.
- Resume text is untrusted input: strip hidden/invisible text, pass it as delimited
  data, schema-validate all outputs, run the injection check (§9).

1. BRAND
Rename "404Hire" to [NEW_NAME] (shortlist: 200 OK Hire / Kerja.exe / HireOS 95;
check domain + MyIPO first). Update logo, copy, README, metadata, email templates.
Keep the 404→200 story. No Microsoft trademarks/assets (no "Windows"/"XP" in the
name, no Start logo, Bliss wallpaper or Clippy). Languages: English + Bahasa
Malaysia (i18n, mixed-language resumes).

2. PIPELINE (per application; enforced state machine; every transition logged with
actor, timestamp, reason; AI recommends, only a human can reject/accept)
P0 Apply / Approach (inbound apply, or sourced → invited)
P1 Resume Filter (Resume → Bias → Matching; threshold + HM override)
P2 Identity Verification (all P1 passers)
P3 Quiz Interview (role-specific, timed; Interview Agent A/B)
P4 Background Check (finalists only; per-job `background_check_stage`, default
   "after quiz pass"; per-job flag + justification per check type)
P5 Accept / Reject (human sign-off, reasons, candidate notification)
P6 Human interview scheduling (online/physical, real interviewer, calendar +
   meeting link + reminders, interviewer scorecard)
Checks run async (job queue + vendor webhooks + SLA reminders).

3. IDENTITY VERIFICATION
MyKad front/back + selfie liveness. Validate MyKad number format (DOB, place code,
gender digit), OCR fields (reuse RapidOCR), face match (DeepFace/InsightFace),
name consistency with resume. Low confidence → manual review queue.
`IdentityProvider` interface: open-source default + commercial eKYC stub.
Explicit biometric consent. Delete images after the decision (retention timer).
"Verified once, reusable" profile, shared per employer with consent.

4. CREDIT (CTOS/CCRIS) + CRIMINAL RECORD
`CreditCheckProvider` / `CriminalCheckProvider` interfaces. MockProvider is default;
real adapters stay stubs until legal confirms the permitted purpose [TBC-LEGAL].
Require explicit, purpose-specific, versioned written consent BEFORE any request.
Store a minimal result flag; raw report encrypted with expiry. Criminal: candidate-
supplied police clearance (OCR + reference check) or a vendor adapter.
Never auto-reject: HM review + candidate right to explain + adverse-decision notice.
Poor credit alone is not a disqualifier unless tied to job duties.

5. CANDIDATE MOCK QUIZ
Separate practice bank (never real questions). Output a "readiness estimate"
(band + %), weak pillars and a study roadmap (reuse Report Agent). Heuristic now
(matching + quiz score); calibrated model (scikit-learn) once outcome data exists.
Label it "estimate, not a decision". Exclude protected attributes; audit with Fairlearn.
Quiz integrity: randomized bank, time limits, tab-switch as a soft flag only.

6. MULTI-APPLY DASHBOARD
Apply to many jobs. One card per application: P0–P6 stepper, status, next action,
deadline, notifications, realtime updates (Supabase Realtime).

7. CHATBOT
Tool-calling agent with READ-ONLY, auth-scoped tools (my_applications, stage,
next_steps, scheduled_interviews). Candidate ID comes from the session, never the
prompt. Refuses other candidates' data, scoring internals and bias settings.
Intent routing + tool-call gating via the DecisionProvider (§9). HM variant:
pipeline summaries.

8. JOB DISCOVERY (candidate "Discover" window)
`JobSourceAdapter` interface → normalizer → dedupe → classify → match.
Adapters, in priority order:
 a) official APIs / RSS / public ATS job feeds
 b) Scrapling spiders for allow-listed career pages (robots_txt_obey=True,
    per-domain throttle, response cache, pause/resume)
 c) JobSpy for Indeed Malaysia: demo only, behind a feature flag
 d) agent-reach: dev-time research only, never in runtime
Run as a separate worker service (cron). Table `job_sources` (name, tos_reviewed,
robots_ok, enabled) with a per-source kill switch. Store minimal metadata + deep
link ("Apply on source"); do not copy full descriptions. No LinkedIn cookie or
burner-account scraping. Classify each listing (scam-like? category, seniority,
Malaysia-based?) via the DecisionProvider; low confidence → hide or flag.
Rank with multilingual embeddings (bge-m3 + pgvector). Stream crawl progress over SSE.

9. LLM GATEWAY + DECISION LAYER
`LLMProvider`: OpenRouter (OpenAI-compatible).
 - typesafe/jev-router for low-stakes agents (chatbot, profile assistant, emails, reports)
 - a PINNED model for scoring agents (Matching, Interview Phase B), so scores are
   comparable across candidates
 - log the actual model used per call in agent_events
`DecisionProvider`: Jev (typesafe/jev-1.13, alpha endpoint) behind an adapter with a
rule-based fallback and a visible fallback_warning. Uses:
 - Supervisor routing (Choice), keeping TASK_TOOL_PLANS as fallback
 - injection check on resume/answer text (Noul; above threshold → quarantine + human review)
 - Action Policy gating of emails/status changes (ambiguous → human)
 - chatbot intent routing + tool-call gating
 - job-listing classification
Jev never makes final accept/reject decisions and never explains. A chat model writes
explanations, and adverse outcomes need human sign-off.
Mask PII (Presidio) before ANY external LLM call. Verify the provider's data policy.
Keep a switch to route everything to a pinned/local provider. Never send raw IC,
credit or criminal data to any LLM or decision provider, only minimal derived flags.

10. PRIVACY & SECURITY (PDPA)
RBAC (candidate, HM, recruiter, admin, auditor), MFA for HM, rate limits, RLS,
field-level encryption for IC number, private storage + signed URLs, consent ledger
(versioned, per purpose, revocable), DSAR export/delete, retention timers (config),
immutable audit log, breach-notification runbook [TBC-LEGAL: timelines],
DPO contact page, privacy notice disclosing AI use and automated decision-making,
cross-border transfer notice. Biometric data = sensitive: explicit consent.

11. RETRO UI
Theme switch Win95 / XP via CSS tokens (98.css / XP.css + Radix/Tailwind; remove MUI
to avoid clashing design systems). Draggable windows (react-rnd), taskbar, progress
bars, wizard dialogs, own mascot. Keep keyboard access and readable contrast.

12. QUALITY
pytest + Playwright e2e; golden resumes + injection test set + promptfoo evals;
Langfuse tracing; fairness audit extended to all phases; funnel analytics
(drop-off per phase, time-to-hire); i18n (EN/BM); accessibility checks.

DELIVERY ORDER
M1 security fixes + applications schema + theme tokens
M2 state machine + multi-apply dashboard
M3 identity verification
M4 quiz + readiness estimate
M5 background checks (mock providers)
M6 LLM gateway + decision layer + chatbot
M7 job discovery
M8 rebrand + retro polish
M9 tests, evals, docs, demo script

DEFINITION OF DONE
Every phase transition is audited. No reject/accept without a human. No PII in
logs or LLM calls. Every external provider has a mock + fallback. Every
migration is reversible. README and .env.example are updated.