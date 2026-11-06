# Skill: Application Form Mapping

## Trigger

Use for unfamiliar ATS form wording, reordered questions, new pages, or unmatched option sets.

## Required inputs

- Sanitized field prompt, control type, and available sanitized option labels.
- Current `harness/contracts/application-form-taxonomy.v1.json` and `harness/contracts/application-preference-cache.v1.json`.
- Opportunity ID if an opportunity-specific preference applies.

Never use real selected answers as fixtures.

## Procedure

1. Normalize the prompt using taxonomy rules; search existing canonical IDs and aliases.
2. Reuse a semantically equivalent question ID before creating one; never match by form position.
3. Verify family, sensitivity, answer scope, automation policy and confirmation policy.
4. For known questions, add only necessary generic aliases; for new questions, choose the narrowest stable ID.
5. Keep page archetypes descriptive, never dependent on page number or DOM order.
6. EEO/demographics: explicit preference only; no inference.
7. Legal/compliance: fresh per-application confirmation; certification and attestation are manual.
8. Add sanitized tests and run `python scripts/validate_application_harness.py`, `python scripts/validate_harness.py`, and `git diff --check`.

## Failure behavior

- Multiple plausible question IDs or an unavailable saved choice: do not guess; leave unresolved/blank.
- Different legal facts require distinct IDs rather than aliasing an older answer.
- Never publish real profile/preferences to fixtures, logs, reports or PRs.
- Do not extend mapping into form submission, scraping or automatic attestation.

## Expected outputs

Reused/new canonical question ID; minimal sanitized aliases/fixtures; page archetype when useful; explicit sensitivity/scope/freshness; passed validators; unresolved questions without personal values.
