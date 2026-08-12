# Application Form Intake and Preference Workflow

## Trigger

Use this workflow when an application page contains reusable identity, demographic, eligibility, compensation, education, accommodation, legal/compliance, or certification questions, or when a fresh ATS presents an unknown wording/order for a known question.

## Authorities

- Question taxonomy: `harness/contracts/application-form-taxonomy.v1.json`
- Preference-cache policy: `harness/contracts/application-preference-cache.v1.json`
- Harness artifact registry: `ARTIFACT_REGISTRY.md`
- Product career state: `contracts/career-state.v1.schema.json`

The taxonomy owns semantic question IDs. It does not own real user answers. Real preferences remain user-owned browser-local state.

## Order-independent intake

1. Inspect visible labels, associated `name`/`id`, placeholder text, nearby prompt text, control type, and available options.
2. Normalize text according to the taxonomy contract.
3. Match the field to a canonical question ID by meaning. Page number, employer, ATS vendor, and DOM order are hints only and never canonical keys.
4. If one canonical ID is unambiguous, resolve the applicable preference.
5. If no ID is safe, leave the field blank and surface it for mapping. Never guess.
6. If a known question appears on a different page or in a different order, reuse the same canonical ID and preference policy.

## Preference resolution

Resolve in this order:

1. `session_confirmation` for current per-application facts;
2. `opportunity_override` for application-specific choices such as compensation;
3. `profile_preference` for stable or explicitly chosen reusable preferences.

If an ATS does not expose an option matching the saved semantic choice, leave the field blank and surface the available options. Do not coerce a different answer.

## Sensitivity and freshness

- Identity/contact: may fill from an explicit saved profile.
- EEO/demographic choices: may fill only from an explicit user preference. Never infer disability, veteran status, race/ethnicity, or gender.
- Work authorization/history/accommodation: cache only when explicitly chosen and reconfirm according to the taxonomy.
- Compensation: prefer opportunity-specific values; do not silently reuse a target from a different opportunity.
- Legal/compliance questions: require a current per-application confirmation before automated fill.
- Certification/attestation: always manual. Never auto-check, auto-sign, auto-navigate, or auto-submit.

A single confirmation step may satisfy multiple fields in one application when they share the same current fact, but it must not silently carry into a later application when the contract says `confirm_each_application`.

## Learning a new form

When a new corporation or ATS changes wording/order:

1. Capture only sanitized question text, control type, and option labels needed to reproduce matching.
2. Do not capture or commit the operator's selected values.
3. Search the taxonomy aliases.
4. If semantics already exist, add only a generic alias when it improves cross-employer matching.
5. If semantics are genuinely new, add a new canonical question ID in the narrowest family.
6. Add/update a sanitized fixture in the application-harness validator or a dedicated fixture path.
7. Run `python scripts/validate_application_harness.py` and `python scripts/validate_harness.py`.
8. Update `harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md` with coverage/gap state, not personal answers.

## Failure handling

- Ambiguous match: leave blank and report the competing canonical IDs.
- Unknown option set: leave blank and surface available options.
- Sensitive value missing: request an explicit local preference; do not infer.
- Legal/current value stale: request current confirmation.
- Attestation encountered: stop automation at the attestation boundary and require operator action.
- Unexpected submit/navigation trigger: treat as a product safety defect; do not work around it in the harness.

## Handoff

Report canonical question IDs added/reused, aliases/page archetypes, preference scope/freshness, sanitized fixtures, validators/results, unresolved unknown questions, proof ceiling, and commit/PR state. Never include real saved preference values.
