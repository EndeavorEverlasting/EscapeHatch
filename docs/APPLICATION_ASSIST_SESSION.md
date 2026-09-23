# EscapeHatch Application Assist Session

## Purpose

Application Assist Session turns the proven browser-local identity fill runtime into a persistent
same-application control loop:

Open application → **Start Assist** → fill deterministic allowed fields → gated Progression Plan may advance safe intermediate pages → operator reviews manual gates →
**Pause / Resume / Emergency Stop / Undo Last Fill** → operator submits manually → confirmation can be
recorded as companion evidence metadata.

The Progression Plan and account-bootstrap state machine are typed, versioned contracts. Final submission, attestation, CAPTCHA, and MFA remain manual.

## Architecture

All DOM mutation follows one sealed pipeline:

`user-owned state → canonical Fill Plan → policy gate → DOM writer`

The DOM writer may execute only gate-allowed Fill Plan items. There is no side door that writes profile
values directly into the page.

Extended pipeline with progression (gated navigation adapter after DOM writer):

`user-owned state → page classification → canonical Fill Plan → policy gate → DOM writer → Progression Plan → progression_gate → navigation_adapter`

No navigation may bypass the Progression Plan. The invariant `no_dom_write_may_bypass_canonical_fill_plan` remains, plus `no_navigation_may_bypass_progression_plan` for the progression extension. Contract owner: `contracts/application-assist-session.v1.json` (progression schema `escapehatch/application-progression/v1`).

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

### Three interaction languages

Mouse, keyboard, and phone share one semantic action table owned by `contracts/application-assist-modality.v1.json`.

| Mode | Grammar |
| --- | --- |
| Mouse | Visible direct controls; hover titles may show shortcuts but never own an essential path |
| Keyboard | `/` or `Ctrl+K` opens the command palette; `S/F/P/R/U/C/G` run session/profile destinations; `Esc` dismisses overlays without stopping the session; `Shift+Esc` or `!` latches Emergency Stop |
| Phone | Lands on a labeled session command sheet (not a compressed desktop form). Profile is a separate destination. Opening the sheet does not autofocus text fields or summon the software keyboard. Touch and synthesized click are deduped |

Fill values resolve through the preference-cache precedence (`session_confirmation` → `opportunity_override` → `profile_preference`) when `escapeHatch.applicationQuestionPreferences.v1` is present, then fall back to the assist profile. Saving the assist profile also projects identity values into that preference store as `profile_preference` entries. The policy gate consults the taxonomy automation-policy mirror before allowing a write.

## Progression Plan and progression_gate

Intermediate navigation is **no longer globally forbidden**. The legacy global `click_next_or_continue` prohibition has been replaced by a typed Progression Plan.

The Progression Plan is gated; only **AUTO_ADVANCE_SAFE** may advance, everything else is **REVIEW_REQUIRED** (machine-defined decisions in `contracts/application-assist-session.v1.json` progression.decisions / progression.states).

### Allowed-when gates (all must pass for AUTO_ADVANCE_SAFE)

An intermediate page is AUTO_ADVANCE_SAFE only when all applicable gates pass:

1. session_is_active_and_not_emergency_stopped
2. current_page_archetype_is_recognized
3. candidate_control_uniquely_identified_as_intermediate_next_or_continue (e.g., Next / Continue / Save & Continue, uniquely identified)
4. candidate_is_not_submit_apply_finish_certify_sign_accept_attestation
5. deterministic_fill_completed_and_stable_after_live_rescan
6. no_visible_validation_error_present
7. no_required_unknown_manual_review_control_unresolved
8. no_password_requested_outside_explicit_account_bootstrap_state
9. no_file_upload_captcha_mfa_otp_legal_compliance_attestation_demographic_gate_unresolved
10. action_identity_unchanged_between_plan_construction_and_execution
11. advance_budget_loop_guard_not_exceeded
12. next_observed_page_transition_matches_permitted_state_transition

Any other condition is **REVIEW_REQUIRED** and stops automated progression with a precise reason. The contract stores these as `progression.allowed_when` and `progression.intermediate_policy.allowed_when` (length 12, versioned).

### Terminal forbidden (never auto-advanced)

`progression.terminal_forbidden` includes at least: `submit`, `apply`, `finish`, `send`, `certify`, `sign`, `accept`, `attestation`, `captcha`, `mfa`, `otp`, `verification`, `unknown`, `manual`. The companion `progression.terminal_manual_reasons` enumerates machine reasons such as `final_submit`, `captcha_present`, `mfa_required`, `unknown_control`, `ambiguous_progression`, `validation_error_present`, etc. Negative fixtures prove Submit/Apply/attestation/CAPTCHA/MFA/unknown cannot be auto-advanced.

### Loop guard and final-submit boundary

- `progression.loop_guard`: max_advances_per_session=20, max_advances_per_page=3, require_page_transition=true, detect_repeated_page=true. Prevents SPA loop/repeated-page auto-advance.
- `progression.final_submit_boundary`: never_auto_submit=true, attestation_manual_only=true, manual_only_controls includes submit/apply/finish/send/certify/attestation/captcha/mfa/unknown, and require_operator_confirmation=true. The pipeline enforces `progression_gate` after `dom_writer`; navigation via `navigation_adapter` only when gated.

The progression contract version is `escapehatch/application-progression/v1` at `progression.version = 1`.

## Account bootstrap state machine

Application sites commonly require a site account. Account setup is application logic, not prompt logic.

### States (versioned in `account_bootstrap.states`)

`APPLICATION_ENTRY` → `EMAIL_PROBE` → one of `EXISTING_ACCOUNT_LOGIN` / `CREATE_ACCOUNT_CHOICE` / `ACCOUNT_CREATION` → optional `VERIFICATION_REQUIRED` → `APPLICATION_FORM`.

Additional terminal/manual states: `AUTH_MISMATCH`, `CAPTCHA_REQUIRED`, `MFA_REQUIRED`, `REVIEW_REQUIRED`.

Full ordered state list in contract: APPLICATION_ENTRY, EMAIL_PROBE, EXISTING_ACCOUNT_LOGIN, CREATE_ACCOUNT_CHOICE, ACCOUNT_CREATION, VERIFICATION_REQUIRED, APPLICATION_FORM, AUTH_MISMATCH, CAPTCHA_REQUIRED, MFA_REQUIRED, REVIEW_REQUIRED (versioned, schema `escapehatch/application-account-bootstrap/v1`).

Transitions are typed in `account_bootstrap.transitions`; only permitted state transitions may be observed after a gated advance. Terminal manual states (`AUTH_MISMATCH`, `CAPTCHA_REQUIRED`, `MFA_REQUIRED`, `REVIEW_REQUIRED`) never auto-advance and require operator review.

### Secret-handling invariants

- Generation only in `ACCOUNT_CREATION` (account_bootstrap.secret_handling.generation_allowed_only_in = ACCOUNT_CREATION).
- Persistence is `session_scoped` only (browser session storage, not repository, not export).
- Never commit / never log / never export — `secret_handling.never_commit=true`, `never_log=true`, `never_export=true`.
- Fixtures use synthetic placeholders only (`synthetic_placeholders_only`).
- The runtime must provide a user-visible copy/reveal action and an explicit “change/save this password” handoff after account creation.
- Generated secrets never appear in repository proof artifacts, logs, screenshots, or telemetry.

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

- submit forms or auto-activate final Apply / Submit Application / Finish / Send / certification actions (final_submit_boundary.never_auto_submit remains hard)
- auto-advance intermediate progression unless the Progression Plan is AUTO_ADVANCE_SAFE via all `allowed_when` gates and progression_gate; ambiguous or terminal actions are REVIEW_REQUIRED
- auto-advance Submit/Apply/Certify/Sign/Accept/attestation/CAPTCHA/MFA/OTP/verification/unknown controls (terminal_forbidden)
- fill passwords except via the explicit `ACCOUNT_CREATION` account-bootstrap state with session-scoped secret handling; file uploads, hidden controls, questionnaires, EEO, legal, or attestation controls remain manual
- overwrite existing or user-edited values
- infer that an observed, stale, forwarding, or merely known phone number is the operator's preferred high-stakes contact channel
- continue writing after Pause or Emergency Stop
- undo values the operator edited after EscapeHatch inserted them
- request broad host permissions or make page-runtime network requests

Earlier global `click_next_or_continue` prohibition has been replaced by the gated progression policy above; the hard final-submit/attestation/CAPTCHA/MFA boundary is retained and extended.

## Load locally in Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `browser/application-assist`.
5. Open a real job application page.
6. Open the popup, save/import a synthetic or private profile, choose **Start Assist**.
7. Choose **Fill Allowed Fields**, then exercise Pause, Resume, Emergency Stop, and Undo Last Fill.
8. Navigate and submit the application yourself. Safe intermediate pages may advance automatically via the Progression Plan; any REVIEW_REQUIRED or terminal gate stops for operator review.
9. Optionally choose **Record Confirmation Evidence** after you confirm submission on-page.

## Validation

```bash
python tests/test_application_assist_session_contract.py
python tests/test_application_assist_modality_contract.py
node tests/test_application_assist_session.mjs
node tests/test_application_assist_modality.mjs
git diff --check
```

Repository tests prove the Fill Plan / policy / writer contract, Progression Plan / progression_gate / navigation_adapter contract, account-bootstrap states and secret invariants, control-loop safety, and three-mode semantic convergence. Live ATS compatibility, physical-phone ergonomics, and a completed real application still require observed browser/device proof with the unpacked extension.
