# EscapeHatch Current State

**Verified `main` floor before this harness sprint:** `9c364a78f9a77a61cecb2f55c50c3e3b805c89a0`, after the application study-guidance bridge merged.

## Working

- Root governance authority exists at `AGENTS.md`.
- Career-state v1 persists profile → opportunity → resume → application → study guidance → evidence with portable artifact ownership.
- Study-guidance export to StudySyndicate exists and has dedicated product CI.
- Base harness maps, workflows, registry, hooks, skill, operator report, validators, and CI exist.
- The durable Windows repository resolver from the older harness lane is incorporated into this harness floor so durable work resolves under `Desktop\Dev`, not temporary storage.
- Application question semantics are now modeled independently of employer, ATS vendor, page number, and field order.
- Application preference persistence is defined as user-owned browser-local state with explicit Save/Export/Import/Clear controls and no repository tracking.
- Application question coverage includes identity/contact, EEO/demographic, eligibility/history, compensation/education/accommodation, legal/compliance, and certification families.
- Unknown questions fail closed to mapping; selected answers are never committed as fixtures.
- The concurrent application-autofill product PR remains separately owned and is not modified by this harness sprint.

## Broken

- The older Windows-resolver harness PR was based on a stale pre-product floor and is no longer the correct convergence vehicle. Its durable resolver behavior is preserved here instead of merging the stale tree over newer product work.

## Missing / intentionally not yet established

- Product implementation for questionnaire families beyond identity/contact autofill.
- Automatic capture of newly selected questionnaire preferences from arbitrary ATS controls.
- Live cross-employer proof of semantic question matching.
- Product UI for per-application confirmation of current legal/compliance answers.
- Product support for opportunity-specific compensation overrides through the browser cache.
- Automatic application submission/navigation.
- Automatic truth/accuracy certification or signature.
- Broad scraping/discovery automation.
- Broad Lua runtime.

## Application automation boundary

The harness models recurring questions by canonical meaning, not page order. The observed application evidence motivated reusable families including EEO, veteran, race/ethnicity, gender, prior-employer status, work authorization, sponsorship, compensation, education, accommodation, non-compete/restrictive agreement, debarment/exclusion/investigation, and final truth/accuracy certification.

Real selected answers from operator applications are user-owned private state. They are deliberately absent from tracked contracts/reports. Product implementations should store them under the browser-local preference contract and expose a full clear action.

Certification/attestation stays manual even when all preceding fields can be filled automatically.

## Validation floor

Run:

```text
python scripts/validate_governance.py
python scripts/validate_application_harness.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
python tests/test_study_guidance_export.py
git diff --check
```

On Windows:

```powershell
pwsh -NoProfile -File scripts/resolve_repo.ps1 -ResolveOnly
```

## Principal risks

- Coupling automation to one corporation's page sequence or ATS DOM shape.
- Storing real demographic/legal/financial answers in tracked fixtures, reports, or logs.
- Inferring sensitive demographic/accommodation values.
- Reusing a salary target across opportunities without an explicit override decision.
- Reusing stale legal/compliance answers without per-application confirmation.
- Automatically checking certification/attestation or submitting an application.
- Weakening unknown-question failure behavior to increase fill rate.
- Reintroducing temporary directories for durable repository/worktree state.
- Colliding with the separately owned application-autofill product branch.

## Next product gate after this harness sprint

After this harness merges, reconcile the open application-autofill product lane onto the new floor, then implement the smallest questionnaire-preference adapter that consumes canonical question IDs, writes only user-owned browser-local preference state, leaves unknown questions blank, and stops at certification/submission boundaries.
