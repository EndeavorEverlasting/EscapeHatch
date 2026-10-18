# Application Form Automation State

## Parent objective and proof ceiling — 2026-10-18

**Canonical parent:** https://github.com/EndeavorEverlasting/EscapeHatch/issues/69
**Executable acceptance gate:** `harness/contracts/application-autofill-parent.v1.json` and `python scripts/validate_application_autofill_parent.py`.
**State: OPEN.** The objective is a broadly reusable, deterministic browser job-application preparation workflow across ATS form layouts, not merely fetching résumés or filling contact details.

Provider evidence from reviewed PR descriptions (not re-proven by this report):
- PR #63: managed-Chrome launch/contact fill/private PDF attach implementation and synthetic tests, draft/unmerged; workstation integration proof still needed.
- PR #64: reports actual Windows Savantage staged form populated, including visible PDF filenames, with operator final submission withheld; draft/unmerged, stacked on #63.
- PR #66: user-selected source-directory registry, draft/unmerged, does not yet import résumé data into the running browser workflow.
- PR #67: merged pure navigation consequence classifier; PR #68: merged synthetic identical-Submit persistent-button fixture in Chromium; these are not a verified product navigation executor.
- Issue #60 and PRs #59/#61/#62: separately owned observer/event lane; evidence stream cannot substitute for browser filling.
- PRs TokenCorridor #73/#220: existing Google authorization and live-read work; **recover existing credentials**, don't restart Cloud Console setup by default.

**First unproven parent integration gate:** Converge the current managed-browser PR #63/#64 behavior with the merged navigation policy/fixture and user-reviewed profile/opportunity inputs in a noncolliding worktree; validate the actual Windows managed Chrome application through ready-for-operator review. Subsequent gate: independently established cross-archetype/ATS portability. All 9 parent gates remain unproven as an **integrated end-to-end result** until individual evidence receipts satisfy the owning contract. A green PR, a previous successful single application or synthetic navigation check is weaker evidence.

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
- Current-main Application Assist Session (`browser/application-assist`, `contracts/application-assist-session.v1.json`) ports the proven identity/contact fill matching into a persistent same-application control loop with Fill Plan → policy gate → DOM writer, Pause/Resume/Stop/Undo, and confirmation-evidence metadata.

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
