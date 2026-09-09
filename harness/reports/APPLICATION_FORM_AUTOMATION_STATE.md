# Application Form Automation State

## Evidence reviewed

Observed application flows show recurring identity, eligibility, compensation, education, legal, demographic, professional self-rating, industry-experience, and credential questions can appear in different orders and pages. Recent application work also demonstrated that the largest human cost is not only typing: it is repeatedly reconstructing career direction and re-deciding whether a skill claim is defensible.

The harness therefore treats semantic meaning, evidence-backed claims, answer freshness, and career trajectory as durable inputs; page grouping and employer wording remain advisory.

No real selected answers are tracked in the repository.

## Working

- `harness/contracts/application-form-taxonomy.v1.json` defines employer/order-independent canonical question IDs, including professional claim IDs for Jira administration, Confluence, presentation capability, utilities/energy experience, and credential status.
- Professional claim questions are `evidence_backed`: the harness forbids upgrading familiarity, adjacent duties, or future intent into stronger claims.
- `harness/contracts/application-preference-cache.v1.json` defines user-owned browser-local persistence, import/export bounds, precedence, full-clear behavior, and professional-claim rules.
- `contracts/career-state.v1.schema.json` can persist an optional trajectory plus per-opportunity trajectory lane/reasons without breaking legacy v1 records.
- Compensation remains opportunity-specific; legal/current and credential-pursuit facts are reconfirmed; EEO/demographic preferences remain explicit-user-only; attestation remains manual-only.
- The application autofill product lane fills only empty identity/contact controls from browser-local data and never submits.
- `scripts/validate_application_harness.py` checks semantic coverage, privacy boundaries, evidence-backed claim policy, references, automation policies, and negative fixtures.

## Broken

No known harness-contract failure at this authored floor. The browser autofill lane still requires exact-head CI and live third-party ATS observation before runtime compatibility can be claimed.

## Missing / intentionally not yet established

- Product UI for questionnaire families beyond identity/contact; the harness owns semantics before UI expansion.
- Automatic capture of newly chosen preferences from arbitrary ATS custom controls.
- Runtime semantic matching against every ATS framework/custom component.
- A local review UI that batches only stale/current confirmations instead of asking the operator repeatedly.
- Automated resume rendering/tailoring from verified evidence. This sprint encodes the trajectory and claim contracts needed for that future product work but does not fabricate or auto-submit resumes.
- Automatic navigation/submission and certification/attestation remain intentionally forbidden.

## Principal risks

- Saving time by silently overstating professional experience.
- Letting repeated conventional PM applications redefine the user's intended trajectory.
- Encoding employer/page order instead of semantic identity.
- Treating sensitive demographic answers as inferable facts.
- Reusing opportunity-specific compensation globally.
- Reusing stale legal/compliance or credential-pursuit answers.
- Committing real browser preference state or selected answers.
- Confusing successful field fill with authorization to submit an application.

## Validation

Run:

```text
python scripts/validate_governance.py
python scripts/validate_application_harness.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
python tests/test_application_autofill_contract.py
node tests/test_application_autofill.mjs
git diff --check
```

On Windows, also run `pwsh -NoProfile -File scripts/resolve_repo.ps1 -ResolveOnly`.

## Proof ceiling

Repository contracts, validators, CI, and sanitized semantic coverage can prove harness readiness and bounded autofill behavior. They cannot prove every third-party ATS runtime, the correctness/currentness of private answers, or authorization to submit an application without observed operator/browser evidence.
