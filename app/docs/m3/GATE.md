# M3 gate — 2 October 2026

**Local M3 gate PASSED. Live service configuration and real-data legal/privacy approval remain DEFERRED.** Tests ran after construction; gate fixes received affected reruns. No real candidates, external migration, paid provider or biometric model was used.

| Check | Actual evidence |
| --- | --- |
| Scoped backend suite | Initial 39 passed / 1 failed: the blank-image hint was affected by edge-filter borders. Fixed by excluding border pixels; targeted identity module rerun: 7 passed. Additional identity-link expiry/session-replay check passed. **41 distinct backend tests have passing evidence** |
| PostgreSQL migrations/functions/permissions | Initial 50 assertions passed; affected SQL rerun after consent/attestation null guards and saved/minimal sharing improvements: **54 passed** |
| Frontend build | Passed; affected rebuild passed after reviewer/sharing UI changes. Final JS 244.12 kB, gzip 77.79 kB |
| TypeScript | Passed, including affected recheck of the M3 UI |
| Browser | Initial existing foundation/pipeline scenarios passed; M3 timed out on a label locator whose select options changed its matching text. Corrected to role/name locator; only M3 scenario rerun passed. Affected M3 sharing-controls rerun also passed. **3 distinct scenarios have passing evidence** |
| Script/module syntax | Identity API/providers/retention/local OCR scripts compiled successfully |

The backend emits one Starlette httpx TestClient deprecation warning. Browser tooling emits the existing NO_COLOR/FORCE_COLOR warning. Neither changes test results. No repeated full-suite run was used after gate fixes.

Planned scoped gate from app/:

```text
.venv/Scripts/python.exe -m pytest backend/tests/foundation -q
node tests/m3-sql.mjs
npm run build
npx tsc --noEmit --jsx react-jsx --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types vite/client src/app/foundation/api.ts src/app/foundation/ApplicationDashboard.tsx src/app/foundation/IdentityWorkspace.tsx src/app/foundation/Workspace.tsx
M1_BROWSER_CHANNEL=msedge npx playwright test
```

PostgreSQL fixtures apply the actual M1–M3 migrations in PGlite with synthetic Auth/Storage schemas. Browser API fixtures exercise the consent/upload/correction/manual-review/revocation UI. Python checks validate private encrypted uploads, raw-input non-reflection, malformed/low-detail images, disabled real capture, truthful providers/OCR flags and actual removal of encrypted objects in an isolated in-memory Storage fixture with crash/retry. These do not prove deletion in a live Supabase bucket or reviewer accreditation. Optional RapidOCR/model weights are not installed or evaluated.

Keep hosted Auth/grants/Storage/retention scheduling/restore, genuine multi-worker contention, real-data approval and optional OCR activation pending until configured. Tests prove actual removal in the isolated Storage fixture, not a live Supabase bucket. Qualified-reviewer configuration and operator availability must be demonstrated before real use. No eKYC/biometric/certified/malware-scanning claim is made. Pillow 12.3.0 is pinned in production requirements/lock; OCR/biometric model dependencies remain absent from the lean hosted API. See SETUP.md for operation and rollback. M4 has not started.
