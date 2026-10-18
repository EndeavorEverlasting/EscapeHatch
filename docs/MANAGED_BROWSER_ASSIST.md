# EscapeHatch — Native managed application browser (operator-controlled)

## Why this exists
The cockpit previously told operators to visit chrome://extensions, enable developer mode, load
an unpacked MV3 extension, export/import data, and reopen the application. That is a setup
recipe, not an application launcher. The native managed-browser lane removes the extension
dependency for the ordinary supported workflow, without weakening the existing extension's
origin-scoped/final-submit safety contract.

## Operator flow
1. Start the **existing managed Windows EscapeHatch runtime** with Launch-EscapeHatch.cmd.
2. Open **Browser assist**. Its new **Apply from EscapeHatch** panel is the operator entrypoint.
3. Choose a saved opportunity or edit the application HTTPS URL. The current Mandiant
   example is prefilled; change it freely for other roles.
4. Click **Launch application**. EscapeHatch opens a separate managed Chrome window using
   its private user-local profile. On first use sign in manually; EscapeHatch does not copy
   cookies from personal Chrome or bypass login/CAPTCHA.
5. Click **Fill approved contact** on each applicable page. Only unique empty, visible,
   enabled and recognized identity/contact input fields may be filled; phone requires
   explicit user_confirmed_primary authority in the local profile.
6. Choose résumé PDF and cover-letter PDF in the cockpit, then click **Attach selected PDFs**.
   Attachment is attempted only for an unambiguous file input labelled resume/CV or cover
   letter. Check the employer website itself for successful acceptance.
7. Review questionnaire, employment eligibility, legal/EEO questions and all navigation
   personally. The system never presses Next, Apply or Submit. Stop before the final Submit
   button; final submission is an operator decision.

## Architecture
- Cockpit component: artifacts/escape-hatch/src/components/managed-browser-assist.tsx.
- Managed loopback Vite plugin: artifacts/escape-hatch/browser-assist-control.ts.
- Vite plugin registration: artifacts/escape-hatch/vite.config.ts.
- Only the Windows managed runtime permits POST actions, on the exact loopback Host/Origin.
  Custom header and JSON method are required to reject cross-origin form submissions.
- Launch uses Playwright's locally installed Chrome channel with a separate user-local
  profile at %LOCALAPPDATA%\EscapeHatch\managed-career-browser.
- No broad Chrome extension permission, Chrome developer mode, public API service, cloud
  upload, repository-tracked personal values, silent final submission, or static login secrets.
- File bytes are received only on explicit Attach action, checked for PDF signature/size,
  applied in-memory to the targeted file input, then released at request completion.
- POST requests may contain private contact information; do not write request bodies to logs.
- If the runtime is unavailable or Chrome cannot be launched, show a real error. Opening
  a URL or populating a file input is not proof of a successful application.
- Separate MV3 assistant remains usable. Its contract and dirty development branch stay intact.

## Tests / acceptance
From artifacts/escape-hatch on a clean, isolated checkout:
- npm install --no-audit --no-fund
- npm run typecheck
- npm run test:managed-assist
- npm run build
- npx playwright test tests/managed-browser-assist.spec.ts
- git diff --check

Test suites cover URL/contact/PDF policy and cockpit route-to-action integration
with **mocked** loopback results. These do not prove Chrome was launched.

LIVE WIN11 acceptance requires observing:
1. Launcher state OWNED_HEALTHY with explicit running process and port.
2. Browser assist page shows Launch Application and Mandiant/custom job URL.
3. Actual managed Chrome process/window and correct remote application page, with no extension loading.
4. Manual login if needed; bounded Fill action and evidence of accepted fields.
5. Operator-selected résumé/letter PDFs attached to the exact employer controls.
6. Employer review screen / explicit application blocker; no form submission attempted.

Chrome/Google may reject automation or may change ATS markup; never fabricate a success receipt.
The current user's existing checkout is dirty. Test and integrate in a new isolated worktree,
and never reset, clean or switch the dirty feature branch. If the existing managed runtime
is already occupying port 21031 with FOREIGN_CONFLICT due CIM commandline access, do not
kill that unproven PID. Test new branch on another managed port, e.g. PORT=21032 (configured
in the launch terminal) with its own worktree and installed dependencies.

## Reusable answers and local persistence

The managed assist page includes Save/Export/Import/Clear Preferences. Explicit choices use the existing `escapehatch-application-question-preferences/v1` schema and canonical question taxonomy. The local file adapter defaults to `private/application-question-preferences.json`; `ESCAPEHATCH_PREFERENCES_FILE` selects a shared private file across worktrees/ports. Never commit that file, exported answers, or raw employer forms. Invalid imports preserve saved data. Clearing removes the saved file; imported data is staged for review until Save.

Fill approved profile and answers reads the saved file on each action. Recognized text/native-select/radio fields use exact normalized question aliases and explicit option equivalents. Unknown/ambiguous fields, missing answers, unsupported controls, existing values, and changed origins are skipped. No agreement checkbox, signature, Submit, or Next is activated. Citizenship, current clearance and conditional clearance-detail prompts are registered in the taxonomy. No-clearance detail becomes N/A only from an explicit saved No. Sponsorship is an explicit reusable preference until changed; other per-application legal/current facts retain their confirmation gates. Race/ethnicity is never inferred from a name; an absent matching option remains unresolved.

The browser profile and this local-file adapter are separate from the legacy optional extension adapter. Saving on this page does not silently rewrite an independently owned extension installation. The managed fill reads disk preferences first and falls back to approved cockpit contact fields when missing.

Validation: `npm --prefix artifacts/escape-hatch run test:managed-assist` exercises atomic persistence, invalid-import preservation, Clear, actual Chrome DOM fill, repeated-fill preservation, reordered radio/select fields, missing options, and agreement/submission guards using synthetic data. It does not prove live employer acceptance of attachments or submission readiness.

The launch function can open an explicitly recognized application-entry button (exact accessible name, no enclosing form, no submit/reset type), then verifies Contact Details is visible. Unknown entry controls stay manual. React-style state widgets require choosing and verifying an actual option; typing search text is not reported as selection. Telephone values are normalized to international format only from an explicit international number or saved US/Canada country, and a failed text-retention check restores the prior input. Element handles remain tied to observed controls when the form inserts hidden inputs.

For upload widgets with anonymous portal inputs, the runtime uses the unique labelled Resume/Cover Letter widget and its filechooser event. It never picks an anonymous input by DOM position. The attachment API still reports staging; employer-side filename/status readback is required to claim acceptance.
