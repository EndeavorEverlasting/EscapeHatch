# EscapeHatch — Native managed application browser (operator-controlled)

## Confirmed submission and deterministic tracker synchronization

Before the operator submits, select the correct saved opportunity and use **Track existing application tab** to recover a unique exact managed tab without navigation or lost entries. The listener must report `ARMED` for that opportunity. Lever listing URLs may bind only to that exact job's `/apply` tab. A trusted click changes observation to pending; only an explicit provider confirmation after that attempt creates a receipt. Rejection, CAPTCHA, a changed URL, or a preexisting success message never proves submission. Unsupported employer confirmation layouts remain unproved.

The canonical receipt store is `%LOCALAPPDATA%\EscapeHatch\managed-submission-receipts.json` (or `ESCAPEHATCH_DATA_HOME` for isolated runs). Receipt persistence precedes synchronization. The same durable receipt automatically reconciles the existing private workspace's local application queue, even if the cockpit is closed. Its derived tracker outbox is `submission-tracker-outbox.v1.json` in the same data root. It pins the selected spreadsheet ID, sheet, and calendar timezone at enqueue; changing tracker bindings fails closed rather than moving pending writes to another tracker. Process restart replays receipts, and the background worker retries every 30 seconds. No LLM chooses cells or statuses.

Remote writes use the existing Google credential adapter. A cached tracker is not proof of Google write authorization, and ChatGPT connector authorization is not transferred into the app. `AUTH_REQUIRED` preserves the receipt until an existing authorized local credential is available. Do not create a new Cloud project or copy connector/browser secrets. `CONFLICT`, `RETRY_REQUIRED`, and unreadable-store recovery remain visible rather than being called synchronized. The cockpit exposes aggregate saved-receipt counters and **Retry tracker synchronization**; normal retry does not require a human or agent.

The writer reads current headers and a unique company/role/apply-URL row, writes only Status, Applied?, and an empty Date Applied, then verifies the planned cells. Unknown/downstream statuses are never downgraded, unrelated cells and existing dates are preserved, and a lost provider response is resolved by readback on retry. Date uses the timezone captured at enqueue (`ESCAPEHATCH_TIME_ZONE` when configured, otherwise the runtime account's calendar timezone). Blocked entries rotate so they cannot starve later receipts.

Google Sheets values writes have no row-level compare-and-swap. Immediate pre/post identity checks reject observed row changes but cannot make concurrent human sorting atomic; avoid reordering the tracker during an in-flight write. An ambiguous identity/readback remains a conflict, not a verified sync. Live employer receipt capture and live Google write/readback require separate proof; synthetic browser/provider tests do not certify them. Final Submit remains exclusively the operator's action.

## Submission listening status — observable operator contract (2026-10-27)

The cockpit's **Submission listener** readout is a runtime-derived state, not a remembered toggle:

| State | Meaning | Action |
| --- | --- | --- |
| `DISCONNECTED` | The current local service/status read failed or has not been verified | Use the existing installation's `Status-EscapeHatch.cmd`; relaunch through `Launch-EscapeHatch.cmd` if stopped |
| `BROWSER_CLOSED` | Managed Chrome tab is no longer open | Reopen the original application through its existing saved opportunity, never a duplicate submission |
| `NOT_BOUND` | Selected saved opportunity is not the listener's exact opportunity | Select the correct saved job and click **Track existing application tab** |
| `DISARMED` | Connection exists; final Submit observation is off | Click **Track existing application tab** while the actual form has a unique enabled final Submit control |
| `ARMED` | Exact-job bound live listener is ready to observe a user action | Review the existing employer form; operator alone chooses Submit |
| `PENDING` | Trusted user Submit was observed but employer acceptance is not proven | Keep the response visible; inspect employer validation/rejection rather than duplicating the click |
| `VALIDATION_FAILED` / `BLOCKED` | Validation rejection, drift, or unsafe event | Correct the actual employer form/rebind original job; no receipt is implied |
| `CONFIRMED` | Explicit employer receipt after the user's attempt observed | Check durable receipt and **Tracker synchronization** independently |

Do not equate **ARMED** with successful submission or **CONFIRMED** with remote Google write-back. On polling failure, the old ARMED state must disappear. A listener is not proven active merely because the runtime process is `OWNED_HEALTHY`; both runtime identity and the exact-job listener must be checked. Conversely `AUTH_REQUIRED` in the tracker panel means *Google writes* are pending despite a locally saved confirmation receipt, not that Chrome's listener is off.

When the installed runtime is unavailable, do not kill or restart the occupied port blindly: use `Status-EscapeHatch.cmd` to distinguish `OWNED_HEALTHY`, `OWNED_UNHEALTHY`, `STOPPED`, and `FOREIGN_CONFLICT` before acting. The existing company application tab and any uncommitted work must be preserved.

The first provider write to the canonical tracker is a separate acceptance gate: its `Applied?` column can be a validated `☐/☑` text dropdown rather than a boolean, `Date Applied` can be a date-validated numeric Sheets serial, and `Status` may initially read `Research`. The deterministic writer must preserve those native cell types, match a unique real opportunity, and read back all three changed values without downgrading later employer status. Synthetic boolean-only fixtures are insufficient. No automatic Google OAuth setup, credential inheritance from ChatGPT, or remote write is claimed merely by enabling the listener.

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
7. When a trusted adapter registry is loaded for the current ATS archetype, click
   **Prepare to final review**. EscapeHatch runs the deterministic `prepareToFinalReview`
   executor through the managed Playwright `PreparationDriver`: fill approved fields,
   activate only evidence-bound intermediate controls, and stop at `REVIEW_READY`,
   `REVIEW_REQUIRED`, or `BLOCKED`. A control labeled Submit may be intermediate or
   terminal; the label alone never grants authority. Final submission stays operator-only.
8. Without trusted adapter evidence, do not use Prepare on unknown employer sites. Fill and
   Attach remain available; navigate and submit personally. The MV3 extension session v1
   prohibition on automatic Next/Submit is unchanged.

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

Synthetic product proof (repository ATS only): start the managed runtime with
`ESCAPEHATCH_ALLOW_SYNTHETIC_ATS=1` on an unused port (for example `PORT=21032`), then run
`node --experimental-strip-types scripts/proof_managed_prepare_synthetic.mjs`. Expect
`REVIEW_READY`, two intermediate draft advances, and zero terminal commits. The opt-in flag
permits only `http://127.0.0.1:<port>` URLs; public HTTPS remains the default employer path.

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

The managed assist page includes Save/Export/Import/Clear Preferences. Explicit choices use the existing `escapehatch-application-question-preferences/v1` schema and canonical question taxonomy. The canonical OS-private store is `%LOCALAPPDATA%\EscapeHatch\application-question-preferences.json` (or `ESCAPEHATCH_DATA_HOME` / `ESCAPEHATCH_PREFERENCES_FILE`). Discover it with `python scripts/resolve_escapehatch_user_data.py` or `EscapeHatch-Runtime.ps1 -Action Status`. That one file is the shared owner across managed Chrome, the cockpit, native messaging, and the extension bridge for the signed-in OS user. Never commit that file, exported answers, or raw employer forms. Invalid imports preserve saved data. Clearing removes the saved file; imported data is staged for review until Save. Use `identity.website` for portfolio / LinkedIn-or-portfolio fields and `identity.linkedin` only for LinkedIn-specific fields.

Fill approved profile and answers reads the saved file on each action. Recognized text/native-select/radio fields use exact normalized question aliases and explicit option equivalents. Unknown/ambiguous fields, missing answers, unsupported controls, existing values, and changed origins are skipped. No agreement checkbox, signature, Submit, or Next is activated. Citizenship, current clearance and conditional clearance-detail prompts are registered in the taxonomy. No-clearance detail becomes N/A only from an explicit saved No. Sponsorship is an explicit reusable preference until changed; other per-application legal/current facts retain their confirmation gates. Race/ethnicity is never inferred from a name; an absent matching option remains unresolved.

The browser profile and this local-file adapter are separate from the legacy optional extension adapter. Saving on this page does not silently rewrite an independently owned extension installation. The managed fill reads disk preferences first and falls back to approved cockpit contact fields when missing.

Validation: `npm --prefix artifacts/escape-hatch run test:managed-assist` exercises atomic persistence, invalid-import preservation, Clear, actual Chrome DOM fill, repeated-fill preservation, reordered radio/select fields, missing options, and agreement/submission guards using synthetic data. It does not prove live employer acceptance of attachments or submission readiness.

The launch function can open an explicitly recognized application-entry button (exact accessible name, no enclosing form, no submit/reset type), then verifies Contact Details is visible. Unknown entry controls stay manual. React-style state widgets require choosing and verifying an actual option; typing search text is not reported as selection. Telephone values are normalized to international format only from an explicit international number or saved US/Canada country, and a failed text-retention check restores the prior input. Element handles remain tied to observed controls when the form inserts hidden inputs.

For upload widgets with anonymous portal inputs, the runtime uses the unique labelled Resume/Cover Letter widget and its filechooser event. It never picks an anonymous input by DOM position. The attachment API still reports staging; employer-side filename/status readback is required to claim acceptance.

## Reusable job titles, binary choices, and military-answer recording

On Browser assist, select a saved opportunity and choose **Add selected role to my job titles**.
Review the **job title** dropdown and choose **Save Preferences**. The optional `job_titles` list
and selected `identity.job_title` survive export/import and disk reads. **Salutation** remains
`identity.title`; a desired role never overwrites an honorific or an employment-history title.
Only exact recognized job-title prompts use the selected value; previous/current employment
history prompts stay unmapped. Changing opportunity does not silently select a new title.

Binary reusable questions, gender, and race/ethnicity use dropdowns with a blank **Not answered** choice. Existing custom
imported answers remain visible instead of being silently discarded. Military service
(`military.service_history`) and protected-veteran status (`eeo.veteran_status`) are separate
questions: neither fact is inferred from the other, disability, or any resume.

After launching the managed application, enable **Record my veteran/service answers from this
managed application** and select the answer on the employer form. While enabled and the cockpit
page remains open, EscapeHatch polls recognized native selects/radio groups every 1.5 seconds,
including a selection already present when recording starts. It stores only the selected option
text for these two explicit categories in the existing private preferences file. Blank, placeholder,
ambiguous, duplicate, unsupported custom widgets and other question categories are not captured.
Decorated optional/required prompts and U.S. punctuation are normalized, and option text inside a
label is excluded from question matching. The recording status reports saved or unresolved state;
it never establishes that an employer accepted or submitted an application.

Recording is opt-in, stops on cockpit departure/reload or relaunch, pauses on failed requests or
origin changes, and is disabled when editing/importing preferences to avoid replacing unsaved
edits. It never clicks an employer control or stores raw form contents. The optional MV3 metadata
listener is a different lane and is not silently upgraded by this managed-runtime change.

The preferences destination defaults to the OS-private EscapeHatch user-data root above;
`ESCAPEHATCH_PREFERENCES_FILE` overrides the exact file. Import Preferences stages a valid JSON export; Save
Preferences persists it. Resume source review and PDF attachment selection are separate workflows.

## Work, education, posting context, and operator professional titles

Browser assist now exposes **Reusable work and education**, backed by the existing canonical
`AssistProfile.experience` and `AssistProfile.education` collections. Import a text/PDF resume to
stage drafts, choose a source record, review/edit it, then use **Save reviewed work record** or
**Save reviewed education record**. New records append without replacing separately saved records.
The selected record IDs determine what Fill may reuse. Education includes institution, credential,
field of study, dates and details; work includes employer, actual employment title, dates, location
and responsibilities. TXT intake is bounded to 5 MB; PDF intake retains the bounded existing parser.
Imports do not approve facts or overwrite reviewed profile records.

The selected records and explicit review are stored in the cockpit browser under the existing
`escape-hatch-assist-profile` key. Existing reviewed-sync export/import carries these records and
selections. The managed Fill request projects only selected records through `career-preferences.ts`;
it does not persist a competing copy in the private preferences file. Repeated/ambiguous native
fields remain unresolved, and custom education search widgets and multi-record ATS layout mapping
are not claimed. The generic **Job title** prompt maps to the selected employment record; desired
job-title prompts map to the current opportunity; **Professional title** maps to the selected
operator title. No professional identity substitutes for an employment-history fact.

**Employer job description** is saved only as the selected Application's optional `jobDescription`.
It survives workspace backup/restore and tracker merges with other local application fields. It is
context and is never emitted as a work-history description or used as instructions. Its editor
supports 30,000 characters. Existing notes remain separate.

**Selected professional title** has its own `professional_titles` list and
`identity.professional_title` selection in the existing private preferences schema. Users type any
new title in **New professional title**, choose **Add professional title**, and Save Preferences.
They may enter up to four semicolon-separated titles and choose **Add title combinations** to add
ordered combinations; the active title is selected independently. Lists support up to 100 entries,
preserve imported custom entries, and ship empty. No operator's real titles, work, education,
posting text or preferences are embedded in source or fixtures as product defaults.

Professional-title suggestions are a deterministic, local lexical ranking of the user's own saved
titles against the role, opportunity posting and selected reviewed experience. The top three show
the matching word evidence. Suggestions require target evidence, never select or save a title
automatically, and do not establish qualifications or semantic role fit. A missing match stays
unresolved. This is a bounded first suggestion engine, not a trained classification model.
