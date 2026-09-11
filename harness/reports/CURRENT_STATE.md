# EscapeHatch Current State

**Verified `main` floor before this resume-presentation sprint:** `4f31a74dbc83da5c162d6910f23bfe55c0dfda2a`, after the local-first application-companion contract merged.

## Working

- Root governance authority exists at `AGENTS.md`.
- Career-state v1 persists profile → opportunity → resume → application → study guidance → evidence with portable artifact ownership.
- A profile may carry an optional, backward-compatible `career_objective` that separates the user's desired lane from current employment identity. It records target role families, explicitly deprioritized role families, capabilities to lead with, and portable proof artifacts.
- The representative career-state fixture demonstrates an agentic-software escape route: a technical-operations profile targets AI/automation engineering roles, leads with software/automation proof, preserves role-specific gaps, and routes those gaps into StudySyndicate guidance.
- The versioned application-companion contract defines a local-first/private state boundary shared by browser extension, Microsoft Store app, Play Store app, and local web delivery surfaces.
- Public hosting and a public user profile are not required by the companion contract. Real profile/application state remains user-owned and must stay out of repository history and distribution bundles.
- The companion may record progress from explicit user action, same-session page confirmation, or user-confirmed external evidence, but may not submit applications, navigate past the submission boundary, or perform attestation.
- Google Drive is modeled as an optional explicit user-authorized sync adapter to a user-selected file/folder. Provider credentials do not belong in career state; public sharing is never required.
- Divergent local/remote state must preserve both copies and surface resolution. Silent overwrite is forbidden.
- Explicit validated export/import remains the provider-independent portability path.
- Profile/application-content telemetry defaults off and is forbidden by the companion contract; authorized sync is kept distinct from telemetry.
- Resume/CV creation, tailoring, export, and synchronization now have a registered presentation-quality owner at `contracts/resume-presentation.v1.json`.
- Resume presentation doctrine is anchored in `AGENTS.md`: generic agent defaults may not silently regress the registered quality floor.
- The presentation contract preserves the approved modern technical hierarchy: Trebuchet MS for name/headline/section/title emphasis, Arial for body content, restrained navy/slate accents, single-column selectable text, a 10 pt minimum body floor, two-page master target, DOCX + text-preserving PDF outputs, and actual rendered-page QA.
- Resume contact/content remains private user-owned state. Real name, phone, email, address, and resume text are not repository fixtures.
- Resume presentation validation is fail-closed and includes negative cases for two-column layout, sub-10 pt body text, sidebars, layout tables, semantic icons, image text, typography flattening, loss of agentic-project prominence, non-extractable PDF policy, missing render QA, unstable Drive projection identity, private contact tracking, universal ATS guarantees, and semantic color use.
- Study-guidance export to StudySyndicate exists and has dedicated product CI.
- Base harness maps, workflows, registry, hooks, skill, operator report, validators, and CI exist.
- The durable Windows repository resolver preserves durable work under `Desktop\Dev`, not temporary storage.
- Application question semantics are modeled independently of employer, ATS vendor, page number, and field order.
- Application preference persistence is user-owned browser-local state with explicit Save/Export/Import/Clear controls and no repository tracking; browser storage is one adapter rather than the whole companion architecture.
- Application question coverage includes identity/contact, EEO/demographic, eligibility/history, compensation/education/accommodation, legal/compliance, and certification families.
- Unknown questions fail closed to mapping; selected answers are never committed as fixtures.
- The concurrent application-autofill product PR remains separately owned historical donor evidence. Current-main Application Assist Session owns the browser control loop under `browser/application-assist` and `contracts/application-assist-session.v1.json`.
- Application Assist Session implements Start Assist, Fill Allowed Fields, Pause, Resume, Emergency Stop, Undo Last Fill, and confirmation-evidence metadata through `user-owned state → canonical Fill Plan → policy gate → DOM writer`.
- Product release identity is owned by `VERSION` (cutover `1.0.0`) with policy at `contracts/product-release.v1.json`, mirror sync for the Application Assist extension package version, changelog binding, and fail-closed validation/tests.
- Repository promotion is owned by `contracts/repository-promotion.v1.json` (provider-agnostic) bound to `.github/workflows/promotion.yml` (GitHub Actions adapter for observed host github.com). The pipeline enforces exact-candidate SHA pin, cheapest-to-strongest DAG (governance → product version → promotion policy → compile/lint → unit → integration → build → harness-e2e vs application-e2e distinct → release-gate → provider merge), explicit required-check manifest, review/thread gates, stale-proof invalidation via `expected_head_sha` compare-and-set, concurrency/recursion guards, least-privilege permissions, degraded-provider `PROVIDER_*` fail-closed handling, artifact provenance, and `merge-base --is-ancestor` post-containment. Promotion is provider-side merge/tag via `gh api`; local `git merge` is not promotion.

## Broken

- No known resume-presentation, companion-contract, or career-objective contract breakage is present on this sprint floor.

## Missing / intentionally not yet established

- A repository-owned renderer that consumes private resume content and emits DOCX/PDF. Private rendering currently remains an external/user-owned artifact workflow.
- Universal ATS-vendor certification or observed parsing across every employer ATS; the presentation contract deliberately does not claim this.
- Runtime implementation of the cross-surface local logical store defined by `contracts/application-companion.v1.json`.
- A packaged Microsoft Store application and store submission/publishing pipeline.
- A packaged Android/Play Store application and store submission/publishing pipeline.
- A live local-web companion runtime with stable loopback/origin behavior.
- A live Google Drive OAuth/sync adapter, sync receipt producer, and observed conflict-resolution flow.
- Runtime event capture that writes application progress back into career-state after the registered evidence gates.
- Cross-device synchronization proof.
- A scoring engine that derives opportunity fit from `career_objective`; current `fit_score` remains stored opportunity evidence rather than an automatically recomputed claim.
- Product UI for editing target/deprioritized role families and proof artifacts.
- Product implementation for questionnaire families beyond identity/contact Application Assist.
- Automatic capture of newly selected questionnaire preferences from arbitrary ATS controls.
- Live cross-employer proof of semantic question matching.
- Product UI for per-application confirmation of current legal/compliance answers.
- Product support for opportunity-specific compensation overrides through the browser cache.
- Observed unpacked-extension proof on every third-party ATS; repository tests cover the control loop contract but not vendor DOM frameworks.
- Automatic application submission/navigation.
- Automatic truth/accuracy certification or signature.
- Broad scraping/discovery automation.
- Broad Lua runtime.

## Career escape-route boundary

`profile.headline` remains descriptive profile state; it is not required to masquerade as an employment title. `profile.career_objective.target_lane` owns the desired direction, while `target_roles` and `deprioritized_roles` preserve positive and negative targeting explicitly. `lead_capabilities` records what should be foregrounded when evaluating or tailoring an opportunity, and `proof_artifacts` links portable evidence without embedding private user data into the public repository.

The objective is optional so previously valid v1 states remain readable. Opportunity-specific requirements gaps, applications, receipts, correspondence, interviews, and outcomes remain owned by their existing records rather than being duplicated into the profile.

## Local-first companion boundary

`contracts/application-companion.v1.json` defines the companion as an adapter over `escapehatch-career-state/v1`, not a second database. Browser-extension, Windows Store, Android/Play Store, and local-web surfaces may choose platform-specific storage/runtime implementations while preserving one logical user-owned state contract.

The Prompt Kit portability model is used as a donor pattern: preserve stable local identity across upgrades, keep export/import explicit and validated, treat imported content as data only, and do not make one generated or hosted artifact the owner of user state. EscapeHatch strengthens that pattern for career data by requiring private profiles, distribution/state separation, optional remote sync, conflict preservation, and telemetry exclusion.

A public website is therefore a possible delivery surface, not an architectural prerequisite. A local web app can run from a stable loopback/packaged origin, and installable clients can be distributed independently. Google Drive can hold a synchronized user-owned copy when the user explicitly authorizes it, but Drive does not become public hosting, the canonical product database, or credential storage.

Progress capture is assistive. A recorded application status must be based on explicit user action, same-session page confirmation, or user-confirmed external evidence and must preserve/link evidence. URL-only inference is insufficient. Submission, navigation beyond submission, and attestation remain user actions.

## Resume presentation quality boundary

`contracts/resume-presentation.v1.json` owns the durable presentation floor for master and tailored resume outputs without owning their private content. It makes the latest polished resume aesthetic reproducible rather than dependent on one agent's taste: Trebuchet MS + Arial, navy/slate hierarchy, strong whitespace, thin section rules, single-column selectable text, conventional bullets/dates, and software/agentic project prominence for the current agentic target lane.

The contract separates aesthetics from parser-sensitive structure. Color is decorative only and must remain legible in grayscale. Sidebars, layout tables, text boxes, graphical skill meters, semantic icons, image-based text, and meaningful header/footer-only content are forbidden. The body cannot be reduced below 10 pt merely to force a page target.

Private content remains outside Git. When a real resume is available to the executing agent, its DOCX must be rendered to page images and every page inspected for clipping, overlap, broken glyphs, hierarchy, spacing, and balance; accessibility auditing should run when supported; the PDF must retain extractable text; and current DOCX/PDF/Drive projections must carry consistent contact/content identity. Replacing a current Drive projection should preserve its existing Drive file ID when possible so application-tracker links remain valid.

Repository validation proves the presentation rules are registered and regression-tested. It does not prove that a private resume artifact was rendered correctly unless that artifact was actually inspected, and it does not guarantee universal ATS parsing, recruiter preference, or application success.

## Product release versioning boundary

`VERSION` is the sole human-facing EscapeHatch product release SemVer authority. `contracts/product-release.v1.json` owns scheme justification, bump matrix, synchronized mirrors, cutover rules, compatibility meaning, and tag format. Exact freshness remains the Git commit SHA; tag `vX.Y.Z` must resolve to that validated commit. Schema/protocol versions (`escapehatch-*/vN`, contract `version` integers, Chrome `manifest_version`) are classified separately and are not product authority. Rollback redeploys a prior tagged commit/artifact and never reuses or decrements a released number. GitHub Release and store publication remain downstream gates after repository validation.

Current cutover release: `1.0.0`, ratifying the pre-existing Application Assist extension package version without rewriting history. Entrypoint: `python scripts/product_version.py`.

## Repository promotion boundary

`contracts/repository-promotion.v1.json` is provider-agnostic and bound at runtime to `.github/workflows/promotion.yml` when the remote is `github.com`. It defines the cheapest-to-strongest validation DAG, distinct `harness-e2e` (`python scripts/validate_harness.py`) and `application-e2e` (`python tests/test_application_assist_session_contract.py` + `node tests/test_application_assist_session.mjs`) gates, an explicit required-check manifest per destination (policy version 1), trigger → candidate → validation → approval → promotion → post-proof flow, and fail-closed handling for SKIP/stale/partial truth, missing checks, unresolved threads, and provider degradation.

The durable promotion system owns the last-mile mutation via a host-facing workflow/bot. For GitHub, that is the `Repository Promotion` workflow using `scripts/promotion_guard.py` with `expected_head_sha` compare-and-set, merge-queue fallback, concurrency serialization, recursion guards, least-privilege `contents:write`/`pull-requests:write` only in the promote job, and idempotent duplicate-wakeup handling. Local `git merge` or checkout state does not constitute promotion; proof is provider merge/queue result plus `git merge-base --is-ancestor` containment.

Artifacts/caches record source SHA + run ID + checksum; caches never masquerade as fresh validation. Degraded provider (`PROVIDER_UNAVAILABLE` / `PROVIDER_RATE_LIMITED` / `PROVIDER_PARTIAL_TRUTH`) blocks mutation while preserving harness receipts. A queued command is not success; deployment health checks must pass.

## Application automation boundary

The harness models recurring questions by canonical meaning, not page order. The observed application evidence motivated reusable families including EEO, veteran, race/ethnicity, gender, prior-employer status, work authorization, sponsorship, compensation, education, accommodation, non-compete/restrictive agreement, debarment/exclusion/investigation, and final truth/accuracy certification.

Real selected answers from operator applications are user-owned private state. They are deliberately absent from tracked contracts/reports. Product implementations should preserve explicit clear/export/import controls and the per-question privacy/freshness policy regardless of delivery surface.

Certification/attestation stays manual even when preceding fields can be filled automatically. Application Assist may record confirmation metadata after the operator submits; it may not submit or attest.

## Validation floor

Run:

```text
python scripts/validate_governance.py
python scripts/validate_product_version.py
python scripts/validate_repository_promotion.py
python scripts/validate_application_harness.py
python scripts/validate_application_companion.py
python scripts/validate_resume_presentation.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
python tests/test_product_version.py
python tests/test_repository_promotion.py
python tests/test_study_guidance_export.py
python tests/test_application_assist_session_contract.py
node tests/test_application_assist_session.mjs
python scripts/promotion_guard.py self-test
git diff --check
```

On Windows:

```powershell
pwsh -NoProfile -File scripts/resolve_repo.ps1 -ResolveOnly
```

## Principal risks

- Letting a future agent silently flatten a polished resume back to generic typography because visual quality was treated as taste rather than a registered contract.
- Improving aesthetics with sidebars, tables, icons, image text, tiny body copy, or other structures that reduce ATS conservatism.
- Claiming universal ATS compatibility from static structure rules or one successful text-extraction check.
- Updating a canonical resume while leaving current PDF/DOCX projections or tracker-linked Drive files on stale contact/content identity.
- Replacing current Drive projections with new file IDs and breaking durable application-tracker references.
- Committing real resume content or contact data into the public repository merely to validate presentation rules.
- Treating a browser extension, hosted website, Google Drive file, or generated bundle as the canonical owner of career state instead of an adapter/copy around user-owned state.
- Requiring public hosting or public profile visibility merely because one delivery surface is web technology.
- Baking real profile/application data or provider credentials into Store/browser distribution artifacts.
- Silently overwriting divergent local and Drive revisions.
- Treating authorized Drive sync as blanket permission for telemetry or secondary data use.
- Inferring application progress from URL/navigation alone or recording a submission that the user did not perform/confirm.
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
- Treating schema/protocol versions, Chrome `manifest_version`, CI toolchain pins, or UI badges as product release authority instead of `VERSION`.
- Reusing or decrementing a released product version, or tagging a commit that failed owning validation.
- Bypassing required checks, treating SKIP/stale/partial truth as green, or inferring readiness from an aggregate badge.
- Treating a local `git merge` or checkout as provider promotion, or letting a bot commit recursively trigger another promotion.
- Promoting to an unauthorized destination or with stale proof after a head/base move.

## Next product gate after this sprint

Reconcile the open application-autofill product lane onto the refreshed main floor while keeping browser-specific code as one adapter beneath `contracts/application-companion.v1.json`. Resume/CV work must now preserve `contracts/resume-presentation.v1.json` as a separate presentation-quality gate. The next companion implementation slice should establish the smallest shared progress-recorder/local-state adapter plus a local-web reader/writer path, with Google Drive remaining behind an explicit authorization interface until live OAuth/sync proof exists.
