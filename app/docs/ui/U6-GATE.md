# U6 — Management / Recruitment header

Local gate passed, 6 October 2026.

One shared header switches between separate company Management and Recruitment surfaces. The active mode has a yellow pill and an accessible current-page marker. Native buttons support keyboard access; the header has English/BM labels and wraps at narrow widths. Recruiter and employee demos start in Management. Candidate demos gain the switch through the accepted-hire rehearsal. Normal accounts can open company Management subject to existing server permissions.

Both surfaces remain mounted across mode changes. Selected HR/recruitment pages, people search/selection, unsaved payroll and recruitment drafts survive switching during the session. Career return preserves the employee's choice through account refresh. Hidden controls leave the keyboard/accessibility tree. Signing out ends the session; this change does not persist sensitive drafts in browser storage.

## Phase-end evidence

| Check | Result |
| --- | --- |
| Foundation TypeScript | Passed with Vite client types |
| Final production build | Passed; JS 448.03 kB / gzip 131.14 kB, CSS 163.05 kB / gzip 28.49 kB |
| Affected browser gate | 12 distinct journeys passed: workspace-modes (1), hr-workspace (4), desktop-demo (3), talent-overview (2), foundation (1), interviews (1) |
| New mode coverage | Keyboard switch; separate dashboard visibility; retained people selection/search, payroll and recruitment drafts; no private demo writes |
| Account coverage | Invitation/join with CSRF, career refresh and retained timesheet draft on Management return |
| Accessibility | Sampled axe checks returned zero violations in both modes/light/dark; 390px fit, existing reduced-motion and 200% zoom/human interview journey passed |
| Visual review | Local desktop Management and Recruitment confirmed through browser preview |

No tests ran during construction. Eight journeys passed initially; four caught active-button contrast. Corrected the fill to dashboard yellow and reran those four. Three completed; the interview journey then exposed header overflow at 200% zoom. Allowed mode buttons to wrap, reran only the interview and mode-header mobile journeys, and confirmed the final CSS build. Passed unrelated backend/SQL suites were not repeated.

Invented-data screenshots: [Management header](../../../docs/images/kerjaos-workspace-modes.jpg), [Recruitment header](../../../docs/images/kerjaos-recruitment-mode.jpg).

No backend, migration, grant, external-service or deployment changes. H1-LIVE/H2/L1/L2 remain open; D1 deployment stays last.
