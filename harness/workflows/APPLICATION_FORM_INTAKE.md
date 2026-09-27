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

## Manual application proof capture and evidence-to-alias bridge

A manually completed application is both an employment event and a source of structural product evidence. Preserve those two concerns separately.

### Private proof owner

The user's private proof store may contain screenshots, provider confirmations, sent-message/outbox evidence, detailed per-application receipts, and the user's actual submitted answers. That store is **not** a repository fixture source of truth.

For every manually completed application:

1. preserve the strongest available completion evidence: provider confirmation, application-received page, sent-message/outbox proof, or equivalent;
2. reconcile the job tracker/application ledger with company, role, route, application date, provider/surface, and proof reference;
3. when the flow contains reusable form evidence, preserve a detailed private receipt or screenshot sequence;
4. classify the submission state using the existing Application Assist / Companion evidence contract; a filled form, review page, saved draft, composed email, or screenshot without a qualifying confirmation is not enough to promote to submitted;
5. keep credentials, signatures, sensitive answers, and raw private screenshots out of Git.

### Sanitized structural observation

A private proof artifact may be distilled into repository-safe observations containing only what is needed to improve matching:

- normalized field label/prompt;
- associated sanitized name/id/placeholder when materially useful;
- control type;
- sanitized option labels;
- page/stage archetype;
- action-control wording and semantic class;
- application surface/vendor as a non-canonical hint;
- whether the observation confirmed an existing canonical question, added a safe alias, or exposed a missing semantic owner.

Do **not** copy the user's selected value into the structural observation.

### Alias admission rule

Different wording may map to one canonical question only when the meanings are equivalent under the same sensitivity, scope, freshness, automation, and confirmation policy.

Examples:

- `Phone Number`, `Primary Number`, and `Primary Phone Number` may map to `identity.phone` when the control is actually the primary contact phone field;
- `Highest Level of Completed Education` and `Highest Level of Education Obtained` may map to `education.highest_completed_level`;
- a field that can accept either annual or hourly desired pay must **not** be collapsed into an annual-only compensation semantic merely because its label contains “salary”;
- `Current Salary`, `Minimum Acceptable Salary`, and `Desired Salary` remain different semantics;
- `Review and Submit` as a step label is not proof that a nearby control is a final submit action.

If equivalence is not safe, leave the observation unresolved and route it to the canonical plan/taxonomy owner instead of broadening aliases until they become ambiguous.

### Agent discovery / rework prevention

Before asking the operator to re-document a manual application, agents should recover in this order:

1. current application tracker/career-state entry;
2. current private proof ledger or linked per-application receipt when access is available;
3. current application-form taxonomy and this workflow;
4. current automation-state report for already-known gaps;
5. only then request new evidence that is genuinely missing.

The repository stores the **protocol and sanitized semantics**, not private application proof. The private proof store remains the evidentiary source; the tracker/career state remains the operational index.

## Failure handling

- Ambiguous match: leave blank and report the competing canonical IDs.
- Unknown option set: leave blank and surface available options.
- Sensitive value missing: request an explicit local preference; do not infer.
- Legal/current value stale: request current confirmation.
- Attestation encountered: stop automation at the attestation boundary and require operator action.
- Unexpected submit/navigation trigger: treat as a product safety defect; do not work around it in the harness.

## Handoff

Report canonical question IDs added/reused, aliases/page archetypes, preference scope/freshness, sanitized fixtures, validators/results, unresolved unknown questions, proof ceiling, and commit/PR state. Never include real saved preference values.
