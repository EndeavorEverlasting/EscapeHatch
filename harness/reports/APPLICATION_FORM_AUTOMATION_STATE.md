# Application Form Automation State

## Evidence reviewed

Observed application screens demonstrate that one hiring flow can split recurring questions across multiple pages and can place them in an order that another employer may not use. The harness therefore treats page grouping as advisory and canonical question meaning as authoritative.

The observed question families include:

- identity/contact;
- EEO and voluntary demographic questions;
- prior-employer/work-authorization/sponsorship questions;
- desired compensation and currency;
- education level;
- reasonable-accommodation need;
- restrictive-agreement/non-compete questions;
- government debarment/exclusion/investigation questions;
- truth/accuracy certification.

No real selected answers from the observed application are tracked in the repository.

## Working

- `harness/contracts/application-form-taxonomy.v1.json` defines order-independent, employer-independent canonical question IDs and aliases.
- `harness/contracts/application-preference-cache.v1.json` defines user-owned browser-local persistence, import/export bounds, precedence, and full-clear behavior.
- EEO/demographic preferences are explicit-user-only and never inferred.
- Opportunity-specific compensation values override profile defaults.
- Legal/compliance facts require per-application confirmation.
- Truth/accuracy attestation remains manual-only.
- Unknown questions fail closed to mapping rather than guessed answers.
- `scripts/validate_application_harness.py` checks observed coverage, privacy boundaries, references, automation policies, and negative fixtures.
- The Windows durable-root resolver from the superseded harness lane is preserved as `scripts/resolve_repo.ps1`.
- Current Application Assist Session (`browser/application-assist`, `contracts/application-assist-session.v1.json`) ports the proven identity/contact fill matching into a persistent same-application control loop with Fill Plan → policy gate → DOM writer, Pause/Resume/Stop/Undo, and confirmation-evidence metadata.


## 2026-09-27 manual-proof observation round

A private application-proof corpus now covers multiple completion routes: multi-step ATS confirmation, custom application confirmation, and direct-email submission evidence. Raw screenshots and selected answers remain outside the repository. The repository receives only sanitized structural observations.

### Aliases promoted from repeated/observed structure

- `identity.phone`: add `Primary Number` / `Primary Phone Number` as aliases of the existing primary contact-phone semantic. Runtime matching is pinned by Application Assist session tests; the existing phone-authority gate still requires `user_confirmed_primary`.
- `education.highest_completed_level`: add `Highest Level of Education Obtained` as a semantic alias. Questionnaire runtime support remains a separate unproven transition.

### Observed gaps that must not be papered over with loose aliases

- personal website / portfolio URL is common profile information but has no current canonical profile/runtime field in Application Assist;
- a desired-compensation field that explicitly accepts annual **or** hourly input needs the unit-aware compensation resolver; do not force it into `compensation.desired_annual_salary`;
- age-threshold, essential-functions, capability-tenure, product-tenure, scripting-language, and detailed veteran subcategory questions need their own canonical policy/Answer Memory decisions where semantics are stable;
- final confirmation screenshots can support submission evidence only through the existing evidence contract; review pages, drafts, signatures, and screenshots are not reusable authority to submit or sign.

### Durable operating protocol

`harness/workflows/APPLICATION_FORM_INTAKE.md` owns the manual-proof capture -> sanitized observation -> canonical alias/question workflow. `skills/application-form-mapping/SKILL.md` is the agent-facing reusable procedure. The private proof ledger and per-application receipts stay outside Git; the tracker/career state is the operational index.

## Broken

No known harness-contract failure at this authored floor.

## Missing / intentionally not yet established

- Product support for questionnaire families beyond the identity/contact Application Assist lane.
- Automatic capture of a newly chosen preference from arbitrary ATS controls.
- Runtime semantic matching against every ATS framework/custom component.
- A local UI for reviewing stale legal/current answers before an application.
- Live proof that the same canonical question IDs survive multiple real employers/ATS vendors.
- Automatic navigation or submission. These remain forbidden at this harness floor.
- Automatic certification/attestation. This remains intentionally manual.

## Principal risks

- Encoding employer/page order instead of semantic question identity.
- Treating sensitive demographic answers as inferable facts.
- Reusing opportunity-specific salary expectations globally.
- Reusing stale legal/compliance answers without current confirmation.
- Committing real browser preference state or selected answers.
- Expanding alias matching until ambiguous questions are silently misclassified.
- Confusing successful field fill with authorization to submit an application.

## Validation

Run:

```text
python scripts/validate_governance.py
python scripts/validate_application_harness.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
python tests/test_application_assist_session_contract.py
node tests/test_application_assist_session.mjs
git diff --check
```

On Windows, also run:

```powershell
pwsh -NoProfile -File scripts/resolve_repo.ps1 -ResolveOnly
```

## Proof ceiling

Repository contracts, validators, CI, and sanitized semantic coverage can prove harness readiness. They cannot prove third-party ATS behavior or the correctness/currentness of a user's private answers without observed browser runtime evidence.
