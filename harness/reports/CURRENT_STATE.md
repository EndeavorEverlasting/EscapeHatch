# EscapeHatch Current State

**Verified `main` floor before this product sprint:** `9ed6fa7de83db67412b0150bb3783cf7521afc42`, after the operational application harness merged.

## Working

- Root governance authority exists at `AGENTS.md`.
- Career-state v1 persists profile → opportunity → resume → application → study guidance → evidence with portable artifact ownership.
- A profile may now carry an optional, backward-compatible `career_objective` that separates the user's desired lane from current employment identity. It records target role families, explicitly deprioritized role families, capabilities to lead with, and portable proof artifacts.
- The representative career-state fixture now demonstrates an agentic-software escape route: a technical-operations profile targets AI/automation engineering roles, leads with software/automation proof, preserves role-specific gaps, and routes those gaps into StudySyndicate guidance.
- Study-guidance export to StudySyndicate exists and has dedicated product CI.
- Base harness maps, workflows, registry, hooks, skill, operator report, validators, and CI exist.
- The durable Windows repository resolver from the older harness lane is incorporated into this harness floor so durable work resolves under `Desktop\Dev`, not temporary storage.
- Application question semantics are modeled independently of employer, ATS vendor, page number, and field order.
- Application preference persistence is defined as user-owned browser-local state with explicit Save/Export/Import/Clear controls and no repository tracking.
- Application question coverage includes identity/contact, EEO/demographic, eligibility/history, compensation/education/accommodation, legal/compliance, and certification families.
- Unknown questions fail closed to mapping; selected answers are never committed as fixtures.
- The concurrent application-autofill product PR remains separately owned and is not modified by this career-state sprint.

## Broken

- No known career-objective contract breakage is present on this sprint floor.

## Missing / intentionally not yet established

- A scoring engine that derives opportunity fit from `career_objective`; current `fit_score` remains stored opportunity evidence rather than an automatically recomputed claim.
- Product UI for editing target/deprioritized role families and proof artifacts.
- Product implementation for questionnaire families beyond identity/contact autofill.
- Automatic capture of newly selected questionnaire preferences from arbitrary ATS controls.
- Live cross-employer proof of semantic question matching.
- Product UI for per-application confirmation of current legal/compliance answers.
- Product support for opportunity-specific compensation overrides through the browser cache.
- Automatic application submission/navigation.
- Automatic truth/accuracy certification or signature.
- Broad scraping/discovery automation.
- Broad Lua runtime.

## Career escape-route boundary

`profile.headline` remains descriptive profile state; it is not required to masquerade as an employment title. `profile.career_objective.target_lane` owns the desired direction, while `target_roles` and `deprioritized_roles` preserve positive and negative targeting explicitly. `lead_capabilities` records what should be foregrounded when evaluating or tailoring an opportunity, and `proof_artifacts` links portable evidence without embedding private user data into the public repository.

The objective is optional so previously valid v1 states remain readable. Opportunity-specific requirements gaps, applications, receipts, correspondence, interviews, and outcomes remain owned by their existing records rather than being duplicated into the profile.

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

- Treating current employment title as the desired career lane, or treating the desired lane as fabricated employment history.
- Letting role search drift back toward explicitly deprioritized families because they superficially match prior job titles.
- Recording proof claims without durable artifact references.
- Coupling automation to one corporation's page sequence or ATS DOM shape.
- Storing real demographic/legal/financial answers in tracked fixtures, reports, or logs.
- Inferring sensitive demographic/accommodation values.
- Reusing a salary target across opportunities without an explicit override decision.
- Reusing stale legal/compliance answers without per-application confirmation.
- Automatically checking certification/attestation or submitting an application.
- Weakening unknown-question failure behavior to increase fill rate.
- Reintroducing temporary directories for durable repository/worktree state.
- Colliding with the separately owned application-autofill product branch.

## Next product gate after this sprint

Reconcile the open application-autofill product lane onto the refreshed career-state floor without absorbing this targeting contract into browser-specific code. After that, the next career-state product slice is a deterministic opportunity-ranking adapter that consumes `career_objective`, records why a role matches or conflicts with the target lane, and never converts a heuristic score into an unsupported employment or qualification claim.
