# Application Form Intake and Preference Workflow

## Trigger

Use this workflow when an application contains reusable identity, eligibility, compensation, education, professional-skill, industry-experience, credential, accommodation, legal/compliance, demographic, or certification questions, or when a fresh ATS presents unknown wording/order for a known question.

## Authorities

- Question taxonomy: `harness/contracts/application-form-taxonomy.v1.json`
- Preference-cache policy: `harness/contracts/application-preference-cache.v1.json`
- Harness artifact registry: `ARTIFACT_REGISTRY.md`
- Product career state: `contracts/career-state.v1.schema.json`

The taxonomy owns semantic question IDs. It does not own real user answers. Real preferences remain user-owned browser-local state; career trajectory belongs to user-owned career state when present.

## Trajectory and claim preflight

Before spending operator time tailoring or answering a form:

1. Resolve the opportunity against `profile.trajectory` when that optional career-state extension exists.
2. Record `trajectory_lane` and concise `trajectory_reasons`; do not silently treat a high generic fit score as trajectory fit.
3. Prefer primary/adjacent opportunities that move daily work toward recorded target titles and preferred activities. Keep safety roles explicit rather than allowing them to become the default search narrative.
4. For professional self-ratings and qualification questions, separate **demonstrable capability** from **tool-specific experience** and from **recent frequency**.
5. Answer only from supported evidence or an explicit current user choice. Do not upgrade familiarity into administration experience, generic documentation into Confluence experience, adjacent technical work into industry experience, or future intent into a certification/pursuit claim.
6. Reuse a previously confirmed semantic answer only while its confirmation policy remains current. Ask again only when the contract requires it or available options materially change.

The goal is to reduce repeated human effort without manufacturing credentials or steering the operator into off-trajectory work.

## Order-independent intake

1. Inspect visible labels, associated `name`/`id`, placeholder text, nearby prompt text, control type, and available options.
2. Normalize text according to the taxonomy contract.
3. Match the field to a canonical question ID by meaning. Page number, employer, ATS vendor, and DOM order are hints only and never canonical keys.
4. If one canonical ID is unambiguous, resolve the applicable preference and evidence policy.
5. If no ID is safe, leave the field blank and surface it for mapping. Never guess.
6. If a known question appears on a different page or in a different order, reuse the same canonical ID and preference policy.

## Preference resolution

Resolve in this order:

1. `session_confirmation` for current per-application facts;
2. `opportunity_override` for application-specific choices such as compensation;
3. `profile_preference` for stable or explicitly chosen reusable preferences.

Professional claims additionally require the `evidence_backed` policy. If an ATS does not expose an option matching the saved semantic choice, leave the field blank and surface available options rather than coercing a different answer.

## Sensitivity and freshness

- Identity/contact: may fill from an explicit saved profile.
- Professional claims: may reuse an explicit choice only while its evidence basis remains accurate; tool-specific experience cannot be inferred from adjacent work.
- Presentation self-ratings: capability may exceed recent frequency, but labels such as `Expert` must match the employer's stated audience/impact definition.
- Industry experience: answer from actual industry/client experience, not adjacent technology work.
- Credentials/certification pursuit: confirm each application unless durable current evidence still supports the claim; intent alone is not pursuit.
- EEO/demographic choices: explicit-user-only; never infer disability, veteran status, race/ethnicity, or gender.
- Work authorization/history/accommodation: cache only when explicitly chosen and reconfirm according to the taxonomy.
- Compensation: prefer opportunity-specific values; never silently reuse a target from a different opportunity.
- Legal/compliance questions: require a current per-application confirmation before automated fill.
- Certification/attestation: always manual. Never auto-check, auto-sign, auto-navigate, or auto-submit.

A single confirmation step may satisfy multiple fields in one application when they share the same current fact, but it must not silently carry into a later application when the contract says `confirm_each_application`.

## Learning a new form

When a corporation or ATS changes wording/order:

1. Capture only sanitized question text, control type, and option labels needed to reproduce matching.
2. Do not capture or commit the operator's selected values.
3. Search taxonomy aliases before creating identity.
4. If semantics already exist, add only a generic alias when it improves cross-employer matching.
5. If semantics are genuinely new, add a canonical question ID in the narrowest family and declare its claim/sensitivity/freshness policy.
6. Add/update a sanitized validator fixture.
7. Run `python scripts/validate_application_harness.py` and `python scripts/validate_harness.py`.
8. Update `harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md` with coverage/gap state, never personal answers.

## Failure handling

- Ambiguous semantic match: leave blank and report competing IDs.
- Unsupported option set: leave blank and surface available options.
- Professional claim lacks evidence: leave blank or request one explicit clarification; do not inflate the claim.
- Sensitive value missing: request an explicit local preference; do not infer.
- Legal/current or credential-pursuit value stale: request current confirmation.
- Attestation encountered: stop automation at the attestation boundary and require operator action.
- Unexpected submit/navigation trigger: treat as a product safety defect; do not work around it in the harness.

## Handoff

Report trajectory lane when available, canonical question IDs added/reused, claim/sensitivity/scope/freshness policy, sanitized fixtures, validators/results, unresolved questions, proof ceiling, and commit/PR state. Never include real saved preference values.
