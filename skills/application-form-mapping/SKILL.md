# Skill: Application Form Mapping

## Trigger

Use this skill when EscapeHatch encounters a new application page, unfamiliar question wording, reordered questions, a professional self-rating, or an ATS option set that does not map cleanly to the existing application-form taxonomy.

## Required inputs

- sanitized field label/prompt;
- control type and sanitized option labels when applicable;
- current `harness/contracts/application-form-taxonomy.v1.json`;
- current `harness/contracts/application-preference-cache.v1.json`;
- application opportunity identifier when an opportunity-specific preference may apply;
- relevant evidence source when a field asks for professional experience, industry exposure, or credential status.

Do not use or commit real selected answers as mapping fixtures.

## Procedure

1. Normalize prompt text using taxonomy matching rules and search aliases for an existing canonical question ID.
2. Prefer semantic reuse over employer-specific IDs; verify family, sensitivity, answer scope, automation, confirmation, and claim policy.
3. For professional claims, bind the answer to evidence rather than optimism: familiarity is not administration experience; adjacent documentation is not Confluence experience; adjacent technology work is not utilities-industry experience; intention is not certification pursuit.
4. For capability ratings, use the employer's actual definition. Low recent frequency does not automatically reduce a demonstrable capability, but named audience/history requirements cannot be invented.
5. Keep page archetypes descriptive only; never bind matching to page number/order.
6. EEO/demographic questions require explicit preference; legal/current facts and credential pursuit require current confirmation; attestation remains manual-only.
7. Add only generic aliases or a narrowly defined new semantic ID, then add/update sanitized validator fixtures.
8. Run `python scripts/validate_application_harness.py`, `python scripts/validate_harness.py`, and `git diff --check`.

## Failure behavior

- Multiple plausible IDs: leave unresolved rather than guessing.
- Saved semantic answer absent from options: leave blank.
- Evidence insufficient for a claimed proficiency/industry/credential level: leave blank and surface the exact gap.
- Materially different legal fact: create a new canonical ID rather than overloading an old one.
- Never print, commit, or place real user preference values in fixtures, reports, logs, or PR text.
- Never broaden into form submission, scraping, automatic attestation, or fabrication of qualifications.

## Expected outputs

- reused or new canonical question ID;
- generic alias/fixture changes when required;
- explicit sensitivity/scope/freshness/claim policy;
- evidence-backed disposition for professional claims;
- passing application-harness and harness validators;
- unresolved questions listed without personal answers.
