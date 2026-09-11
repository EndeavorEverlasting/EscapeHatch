# EscapeHatch Codebase Map

## Repository floor

EscapeHatch has canonical governance, an operational harness, a portable career-state graph, a local-first application-companion contract, an ATS-conservative resume-presentation contract, and a StudySyndicate guidance bridge. Application-form automation is split into a product lane and a harness lane: product code owns runtime behavior; the harness owns semantic question identity, preference safety policy, validation, and operating procedures.

## Structure

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Canonical repository-wide agent governance. Do not create a competing authority. |
| `ARTIFACT_REGISTRY.md` | Canonical registry for tracked and generated artifacts. |
| `contracts/career-state.v1.schema.json` | Versioned product persistence contract for career state, study guidance, and artifact ownership. |
| `contracts/application-companion.v1.json` | Local-first product contract for private installable/local companion surfaces, progress recording, portability, and optional sync. |
| `contracts/application-assist-session.v1.json` | Browser Application Assist Session contract: Fill Plan, policy gate, DOM writer, pause/stop/undo, confirmation evidence metadata. |
| `browser/application-assist/` | Manifest V3 unpacked extension implementing the assist-session control loop without auto-submit. |
| `VERSION` | Canonical human-facing EscapeHatch product release SemVer. Exact freshness remains the Git commit. |
| `contracts/product-release.v1.json` | Product-release scheme, bump matrix, mirror list, cutover, compatibility, and tag policy. |
| `scripts/product_version.py` | show/check/next/bump/tag-plan mechanics for the VERSION authority. |
| `scripts/validate_product_version.py` | Fail-closed product version and mirror-drift validator. |
| `CHANGELOG.md` | Human product release notes bound to VERSION. |
| `docs/APPLICATION_ASSIST_SESSION.md` | Operator load and control-loop instructions for Application Assist. |
| `contracts/resume-presentation.v1.json` | ATS-conservative typography, page-layout, structure, output, privacy, and rendered-QA contract for user-owned resumes. |
| `fixtures/career-state.v1.example.json` | Portable representative product fixture with no real personal data. |
| `fixtures/application-companion.v1.example.json` | Synthetic companion session fixture demonstrating progress recording and opt-in Google Drive sync without real user data. |
| `scripts/validate_career_state.py` | Deterministic career-state/reference-graph validator. |
| `scripts/validate_application_companion.py` | Fail-closed validator for companion privacy, delivery, progress, portability, and sync boundaries. |
| `scripts/validate_resume_presentation.py` | Fail-closed validator for resume typography/layout/ATS-conservative structure/output/QA rules. |
| `scripts/export_study_guidance.py` | Cross-repo StudySyndicate guidance exporter. |
| `harness/manifest.v1.json` | Machine-readable harness component map and validation order. |
| `harness/CODEBASE_MAP.md` | This repository map. |
| `harness/WORKFLOWS.md` | Task pickup, repo acquisition, application intake/companion, resume presentation, validation, failure, and handoff workflows. |
| `harness/contracts/application-form-taxonomy.v1.json` | Employer/order-independent canonical application question taxonomy. |
| `harness/contracts/application-preference-cache.v1.json` | User-owned browser-local preference persistence and portability policy. |
| `harness/workflows/APPLICATION_FORM_INTAKE.md` | Modular application-question intake/mapping workflow. |
| `harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md` | Human-readable application automation coverage and gaps. |
| `harness/constraints/LUA_EMBEDDING.md` | Lua design constraints for future runtime work. |
| `harness/reports/CURRENT_STATE.md` | Human-readable repository operational status. |
| `scripts/resolve_repo.ps1` | Durable Windows repo/worktree resolver under `Desktop\Dev`. |
| `scripts/validate_application_harness.py` | Application taxonomy/preference safety validator with negative fixtures. |
| `scripts/validate_governance.py` | Governance contract validator. |
| `scripts/validate_harness.py` | Harness completeness/integration validator. |
| `.githooks/` | Opt-in local pre-commit and pre-push validation. |
| `.github/workflows/harness.yml` | Linux governance/harness/product-contract validation plus Windows durable-root proof. |
| `.github/workflows/career-state.yml` | Career-state, companion, and StudySyndicate product-contract validation. |
| `.github/workflows/promotion.yml` | GitHub Actions adapter for repository promotion (provider-side merge executor). |
| `contracts/repository-promotion.v1.json` | Provider-agnostic promotion policy (DAG, required checks, triggers, fail-closed). |
| `scripts/promotion_guard.py` | Promotion guard: exact candidate, required checks, stale proof, compare-and-set, degraded provider. |
| `scripts/validate_repository_promotion.py` | Fail-closed promotion contract/adapter validator. |
| `tests/test_repository_promotion.py` | Fault-injection tests for promotion blocking paths. |
| `skills/harness-operations/SKILL.md` | Repeatable repo harness operating procedure. |
| `skills/application-form-mapping/SKILL.md` | Procedure for adding/reusing application question semantics safely. |

## Durable Windows repository root

Durable Windows checkouts/worktrees belong under an observed `Desktop\Dev` ancestor or `$HOME\Desktop\Dev`. `%TEMP%` and `AppData\Local\Temp` are valid only for disposable validator snapshots.

Resolve the durable root:

```powershell
pwsh -NoProfile -File scripts/resolve_repo.ps1 -ResolveOnly
```

Resolve/acquire an exact unmerged branch non-destructively:

```powershell
pwsh -NoProfile -File scripts/resolve_repo.ps1 -Branch '<branch>' -ExpectedCommit '<sha>'
```

The resolver verifies origin and requested remote head, preserves dirty/differently owned canonical work, and uses a detached worktree when needed.

## Product entry points

Canonical product persistence remains `contracts/career-state.v1.schema.json`; `scripts/validate_career_state.py` validates it. `contracts/application-companion.v1.json` defines the delivery/privacy/synchronization boundary for clients that read and write that user-owned career state. `contracts/resume-presentation.v1.json` defines the visual/structural quality boundary for resume outputs while leaving private resume content user-owned. `scripts/export_study_guidance.py` exports typed guidance to StudySyndicate.

The companion contract is surface-agnostic at the state boundary. Browser extensions, Microsoft Store apps, Play Store apps, and local web runtimes may use different storage/runtime adapters without creating separate career-state formats. Public hosting and a public profile are optional, not prerequisites.

An application-autofill product lane may implement browser behavior, but harness contracts do not become product code. The harness defines semantic question IDs and preference boundaries so product implementations can remain modular across corporations, ATS vendors, page counts, and question order.

The harness does not authorize scraping, automatic application submission, automatic navigation, or automatic certification/attestation.

## Application-question entry points

- Taxonomy: `harness/contracts/application-form-taxonomy.v1.json`
- Preference policy: `harness/contracts/application-preference-cache.v1.json`
- Workflow: `harness/workflows/APPLICATION_FORM_INTAKE.md`
- Skill: `skills/application-form-mapping/SKILL.md`
- Operator report: `harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md`
- Validator: `scripts/validate_application_harness.py`

Canonical question IDs, not page positions, own meaning. Unknown questions fail closed into a mapping queue. Real selected answers never belong in tracked fixtures, reports, or contracts.

## Application companion entry points

- Companion contract: `contracts/application-companion.v1.json`
- Synthetic session fixture: `fixtures/application-companion.v1.example.json`
- Canonical state: `contracts/career-state.v1.schema.json`
- Preference policy: `harness/contracts/application-preference-cache.v1.json`
- Validator: `scripts/validate_application_companion.py`
- Operating workflow: **Application Companion** in `harness/WORKFLOWS.md`

The companion is local-first: the user's career state remains the primary logical state, while browser/store/local-web surfaces are adapters. Google Drive is an optional user-authorized synchronization adapter, not the primary database and not a public publishing requirement. Conflicting local/remote revisions preserve both copies and surface resolution instead of silently overwriting either source.

Progress recording is assistive only. The companion may write a career-state status after explicit user action, same-session confirmation, or user-confirmed external evidence, but submission, navigation past the submission boundary, and attestation remain user actions.

## Application assist session entry points

- Assist contract: `contracts/application-assist-session.v1.json`
- Extension runtime: `browser/application-assist/`
- Operator docs: `docs/APPLICATION_ASSIST_SESSION.md`
- Runtime tests: `tests/test_application_assist_session.mjs`
- Contract tests: `tests/test_application_assist_session_contract.py`
- CI: `.github/workflows/application-assist.yml`
- Taxonomy binding: `harness/contracts/application-form-taxonomy.v1.json` identity-contact family
- Operating workflow: **Application Assist Session** in `harness/WORKFLOWS.md`

The assist session ports the proven browser fill matching from the stale autofill lane onto current main without wholesale PR merge. DOM writes must follow `user-owned state → canonical Fill Plan → policy gate → DOM writer`. Pause, Resume, Emergency Stop, and Undo Last Fill are first-class controls. Auto-submit, Next/Continue clicking, and attestation remain forbidden.

## Product release versioning entry points

- Canonical product release: `VERSION`
- Policy contract: `contracts/product-release.v1.json`
- Mechanics: `python scripts/product_version.py`
- Validator: `python scripts/validate_product_version.py`
- Tests: `python tests/test_product_version.py`
- Changelog: `CHANGELOG.md`
- Current mirrored surface: `browser/application-assist/manifest.json` `#/version`
- Operating workflow: **Product Release Versioning** in `harness/WORKFLOWS.md`

`VERSION` is the only human-facing product release authority. Schema/protocol versions (`escapehatch-*/vN`, contract `version` integers) remain independent. A Git tag `vX.Y.Z` must point at the exact validated release commit; UI labels and badges are not freshness proof. Rollback redeploys a prior tagged commit/artifact and never reuses or decrements a released version.

## Repository promotion entry points

- Promotion contract: `contracts/repository-promotion.v1.json` (provider-agnostic, one concrete adapter bound at runtime)
- Guard/executor: `scripts/promotion_guard.py` (exact SHA pin, required checks, review/threads, stale proof, compare-and-set, degraded provider, idempotency)
- Validator: `python scripts/validate_repository_promotion.py`
- Tests: `python tests/test_repository_promotion.py` + `python scripts/promotion_guard.py self-test`
- CI adapter: `.github/workflows/promotion.yml` (GitHub Actions — observed host github.com; triggers pull_request/merge_group/push/workflow_dispatch; concurrency + recursion guard; gh api + expected_head_sha merge)
- Operating workflow: **Repository Promotion** in `harness/WORKFLOWS.md`

Promotion is provider-agnostic at the contract and bound to one concrete host adapter at runtime. The workflow orchestrates but does not duplicate validation — it invokes repo-owned validators. Promotion fails closed on SKIP/stale/partial truth, missing required checks, unresolved threads, insufficient approval, unauthorized targets, provider degradation, or head moves. Post-promotion containment is verified via `git merge-base --is-ancestor`.

## Resume presentation entry points

- Presentation contract: `contracts/resume-presentation.v1.json`
- Validator: `scripts/validate_resume_presentation.py`
- Governance owner: **Resume presentation quality is contractual** in `AGENTS.md`
- Operating workflow: **Resume Presentation** in `harness/WORKFLOWS.md`
- Artifact ownership: `ARTIFACT_REGISTRY.md`

The repository stores presentation rules, not the user's real resume. The registered floor preserves a single-column ATS-conservative structure, Trebuchet MS + Arial hierarchy, restrained navy/slate palette, minimum body-text size, DOCX + text-preserving PDF outputs, and rendered-page QA. Master and tailored content remain private/user-owned. A style-changing request may override the presentation contract only when the user explicitly approves the change; a generic agent default must not silently flatten the resume back to plain formatting.

The contract does not prove universal ATS compatibility. A specific resume is visually proven only after the actual DOCX is rendered and every page inspected, the PDF is checked for extractable text, and current projections are checked for contact/content consistency.

## Configuration and contracts

- Governance: `AGENTS.md`
- Harness manifest: `harness/manifest.v1.json`
- Artifact registry: `ARTIFACT_REGISTRY.md`
- Product release authority: `VERSION`
- Product release policy: `contracts/product-release.v1.json`
- Repository promotion policy: `contracts/repository-promotion.v1.json`
- Career-state contract: `contracts/career-state.v1.schema.json`
- Application companion contract: `contracts/application-companion.v1.json`
- Resume presentation contract: `contracts/resume-presentation.v1.json`
- Application taxonomy: `harness/contracts/application-form-taxonomy.v1.json`
- Preference-cache policy: `harness/contracts/application-preference-cache.v1.json`
- Lua design input: `harness/constraints/LUA_EMBEDDING.md`

## Validation commands

Run from repository root:

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

## Build, test, and deploy commands

- Product build on `main`: **not established**
- Product release identity: `python scripts/product_version.py show` / `python scripts/validate_product_version.py`
- Career-state contract: `python scripts/validate_career_state.py`
- Application companion contract: `python scripts/validate_application_companion.py`
- Application assist session: `python tests/test_application_assist_session_contract.py` and `node tests/test_application_assist_session.mjs`
- Resume presentation contract: `python scripts/validate_resume_presentation.py`
- Study-guidance adapter: `python tests/test_study_guidance_export.py`
- Application harness: `python scripts/validate_application_harness.py`
- Repository convergence: run validation commands above
- Windows path-policy proof: `.github/workflows/harness.yml`
- Store packaging/publishing: **not established**
- Google Drive runtime adapter: **not established**
- Product deployment: **not established**

Do not claim browser/ATS, Google Drive, Microsoft Store, or Play Store runtime proof from repository validation. Resume presentation validation proves the contract; rendered resume proof requires the private output artifacts themselves. Application Assist repository tests prove the Fill Plan control loop; live ATS proof still requires the unpacked extension on a real application page. Product version validation proves authority/mirror/tag-plan policy; a published GitHub Release or store listing requires the downstream publication gate.

## Fresh-agent path

1. Read `AGENTS.md`.
2. Read `harness/reports/CURRENT_STATE.md`.
3. Read this map, `harness/manifest.v1.json`, and `ARTIFACT_REGISTRY.md`.
4. On Windows, resolve durable repo state through `scripts/resolve_repo.ps1`.
5. Select the workflow in `harness/WORKFLOWS.md`.
6. For application pages/questions, read the taxonomy, preference policy, application workflow, and mapping skill before writing.
7. For companion/runtime/state-sync work, read `contracts/application-companion.v1.json`, the career-state schema, and the Application Companion workflow before writing.
8. For resume/CV creation, tailoring, export, or sync, read `contracts/resume-presentation.v1.json` and follow the Resume Presentation workflow before touching private resume content.
9. Read Lua constraints only when scripting is in scope.
10. Declare sprint scope before the first write.
11. Run validators in manifest order before committing.
12. Report only the proof actually observed.
