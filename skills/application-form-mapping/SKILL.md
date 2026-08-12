# Skill: Application Form Mapping

## Trigger

Use this skill when EscapeHatch encounters a new application page, unfamiliar question wording, reordered questions, or an ATS option set that does not map cleanly to the existing application-form taxonomy.

## Required inputs

- sanitized field label/prompt;
- control type;
- sanitized option labels when applicable;
- current `harness/contracts/application-form-taxonomy.v1.json`;
- current `harness/contracts/application-preference-cache.v1.json`;
- application opportunity identifier when an opportunity-specific preference may apply.

Do not use or commit real selected answers as mapping fixtures.

## Procedure

1. Normalize the prompt text using the taxonomy matching rules.
2. Search aliases for an existing canonical question ID.
3. Prefer semantic reuse over employer-specific IDs.
4. Verify family, sensitivity, answer scope, automation policy, and confirmation policy.
5. If the question is known, record only a generic alias when necessary.
6. If it is new, create one canonical ID with the narrowest stable meaning.
7. Keep page archetypes descriptive only; do not bind matching to page number/order.
8. For EEO/demographic questions, require explicit preference and forbid inference.
9. For legal/compliance questions, require per-application confirmation.
10. Keep attestation/certification manual-only.
11. Add or update sanitized validator fixtures.
12. Run `python scripts/validate_application_harness.py`, `python scripts/validate_harness.py`, and `git diff --check`.

## Failure behavior

- If wording could map to multiple IDs, leave it unresolved rather than guessing.
- If the saved preference is not among the page's available options, leave it blank.
- If an application asks for a materially different legal fact, create a new canonical ID rather than overloading an old one.
- Never print, commit, or place real user preference values in fixtures, reports, logs, or PR text.
- Never broaden the skill into form submission, scraping, or automatic attestation.

## Expected outputs

- reused or new canonical question ID;
- generic alias/fixture changes when required;
- updated page archetype only when it improves discovery;
- explicit sensitivity/scope/freshness policy;
- passing application-harness and harness validators;
- unresolved questions listed without personal answers.
