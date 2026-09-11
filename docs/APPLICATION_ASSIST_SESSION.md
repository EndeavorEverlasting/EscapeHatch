# EscapeHatch Application Assist Session

## Purpose

Application Assist Session turns the proven browser-local identity fill runtime into a persistent
same-application control loop:

Open application → **Start Assist** → fill deterministic allowed fields → operator navigates manually →
**Pause / Resume / Emergency Stop / Undo Last Fill** → operator submits manually → confirmation can be
recorded as companion evidence metadata.

## Architecture

All DOM mutation follows one sealed pipeline:

`user-owned state → canonical Fill Plan → policy gate → DOM writer`

The DOM writer may execute only gate-allowed Fill Plan items. There is no side door that writes profile
values directly into the page.

## Session controls

| Control | Behavior |
| --- | --- |
| Start Assist | Binds a session to the active tab origin |
| Fill Allowed Fields | Builds a Fill Plan, re-gates live fields, writes only allowed empty identity/contact controls |
| Pause | Blocks future writes until Resume |
| Resume | Allowed only while the tab origin still matches the session |
| Emergency Stop | Latches stopped status and cancels future writes until a new Start Assist |
| Undo Last Fill | Restores only untouched EscapeHatch-inserted values from the last batch |
| Record Confirmation Evidence | Stores metadata-only confirmation and downloads a companion-compatible progress export; never submits |

Cross-origin transitions pause the session automatically.

Fill values resolve through the preference-cache precedence (`session_confirmation` → `opportunity_override` → `profile_preference`) when `escapeHatch.applicationQuestionPreferences.v1` is present, then fall back to the assist profile. Saving the assist profile also projects identity values into that preference store as `profile_preference` entries. The policy gate consults the taxonomy automation-policy mirror before allowing a write.

## Privacy and browser-local cache

- Profile key: `escapeHatch.applicationAssistProfile.v1`
- Session key: `escapeHatch.applicationAssistSession.v1`
- Export schema: `escapehatch-application-assist-profile/v2`
- v1 Assist and legacy autofill imports remain accepted, but any legacy phone defaults to **unconfirmed** and is withheld until the operator explicitly marks it primary
- A phone being present, previously used, forwarded, or discovered elsewhere is not authority to use it for a life-changing application
- Real profile data is never committed to EscapeHatch
- Imports are capped at 64 KiB, schema-checked, field-whitelisted, and never executed

## Supported fields

Title/prefix, first name, last name, preferred name, email, phone, LinkedIn URL, street address, city,
region/state, postal code, and country. **Phone is special:** it is fillable only when the browser-local profile marks it `user_confirmed_primary`; `unconfirmed` and `secondary_or_forwarded` are fail-closed. Matching prefers HTML `autocomplete` tokens and otherwise uses
normalized label/name/id/placeholder semantics. Select controls require an exact normalized option match.

Canonical question IDs bind to `harness/contracts/application-form-taxonomy.v1.json` identity-contact
questions. Unknown fields stay blank.

## Hard safety boundary

Application Assist does **not**:

- submit forms
- click Next, Continue, Apply, or Submit
- fill passwords, file uploads, hidden controls, questionnaires, EEO, legal, or attestation controls
- overwrite existing or user-edited values
- infer that an observed, stale, forwarding, or merely known phone number is the operator's preferred high-stakes contact channel
- continue writing after Pause or Emergency Stop
- undo values the operator edited after EscapeHatch inserted them
- request broad host permissions or make page-runtime network requests

## Load locally in Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `browser/application-assist`.
5. Open a real job application page.
6. Open the popup, save/import a synthetic or private profile, choose **Start Assist**.
7. Choose **Fill Allowed Fields**, then exercise Pause, Resume, Emergency Stop, and Undo Last Fill.
8. Navigate and submit the application yourself.
9. Optionally choose **Record Confirmation Evidence** after you confirm submission on-page.

## Validation

```bash
python tests/test_application_assist_session_contract.py
node tests/test_application_assist_session.mjs
git diff --check
```

Repository tests prove the Fill Plan / policy / writer contract and control-loop safety. Live ATS
compatibility and a completed real application still require observed browser proof with the unpacked
extension.
