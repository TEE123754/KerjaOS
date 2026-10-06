# U5 visual reference and original assets

Primary user-selected reference: [Dd7AalkTZPY](https://www.instagram.com/reel/Dd7AalkTZPY/). Directly viewed the reel and creator-linked [public Coterie preview](https://demo.codeandchill.store/coterie/) Overview, People and Payroll surfaces. Cream `#f4f2ec`, mustard yellow, black pill navigation; rounded bento panels; Outfit headings and Inter controls. No template purchased, source copied or remote media downloaded.

| Reference element | KerjaOS implementation |
| --- | --- |
| Capsule brand / 3-tab header / settings / notifications / profile | KerjaOS Overview/People/Payroll nav, company/theme/sign-out settings, incomplete-task notifications and career switch |
| Segmented hiring rail / large counts | Loaded company onboarding/active-team/approved-time/leave summaries, team/invitation/task counts |
| Portrait / salary chip | Original fictional portrait in demo; real profile initials; authorized current-month net ledger amount only |
| Seven thin bars / active yellow tooltip / report arrow | Rolling 7-day tracked time; selectable bar; opens timesheets |
| Circular timer / pause-reset / break control | Personal timer, pause/reset/break reminder; active employees save completed minutes as a draft |
| Onboarding phases / dark scrolling tasks | Completion-derived group summaries, assigned task checkboxes and task editor |
| Accordion card | Company/role, onboarding documents, compensation and leave entry points; full device/pension/benefit records are H2 |
| Six-column weekly calendar | Kuala Lumpur time, week paging/today, clickable events and HR event creation |
| People search/filter/selected yellow row/profile | Scoped directory, department chips, selection and employee details |
| Payroll roster / month grid / profile details | Person/month selection, recorded hours/approved leave, three profile meters for approved hours/onboarding/leave requests, integer-cent ledger, review/issue/export/issued payslip |

Original fictional demo portrait generated via **built-in imagegen** and copied unchanged to `app/public/kerjaos-demo-portrait.png`. CSS controls its card crop; no image editing or real-person matching. Exact prompt:

> Use case: photorealistic-natural. Asset type: original fictional demo profile portrait for a recruitment dashboard card. One smiling Malaysian woman in her late twenties with shoulder-length dark wavy hair, wearing a simple oatmeal knit sweater. Natural editorial head-and-shoulders portrait in a warm cream studio near a softly lit window, subtle beige interior blurred behind. Square composition, face centered upper half, chest visible, subtle natural texture, warm afternoon light. Reserve bottom quarter as darker sweater area for white UI name overlay added separately by code. No text, logos, watermark or other people. This is a fictional demo person, not based on any reference photo.

Local fonts copied from the official Google Fonts repository: [Outfit](https://github.com/google/fonts/tree/main/ofl/outfit), [Inter](https://github.com/google/fonts/tree/main/ofl/inter). Both OFL license texts are retained next to the TTF files in `app/public/fonts/`. No runtime external font request or new UI package. Original brand, person, HR record values and product labels differ from the reference; element arrangement, palette and typography follow it. Preserve mobile/keyboard/dark mode and reduced motion.
