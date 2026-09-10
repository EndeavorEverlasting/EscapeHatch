# EscapeHatch Codebase Map

## Repository floor

EscapeHatch has canonical governance, an operational harness, a portable career-state graph, a local-first application-companion contract, and a StudySyndicate guidance bridge. Application-form automation is split into a product lane and a harness lane: product code owns runtime behavior; the harness owns semantic question identity, preference safety policy, validation, and operating procedures.

## Structure

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Canonical repository-wide agent governance. Do not create a competing authority. |
| `ARTIFACT_REGISTRY.md` | Canonical registry for tracked and generated artifacts. |
| `contracts/career-state.v1.schema.json` | Versioned product persistence contract for career state, study guidance, and artifact ownership. |
| `contracts/application-companion.v1.json` | Local-first product contract for private installable/local companion surfaces, progress recording, portability, and optional sync. |
| `fixtures/career-state.v1.example.json` | Portable representative product fixture with no real personal data. |
| `fixtures/application-companion.v1.example.json` | Synthetic companion session fixture demonstrating progress recording and opt-in Google Drive sync without real user data. |
| `scripts/validate_career_state.py` | Deterministic career-state/reference-graph validator. |
| `scripts/validate_application_companion.py` | Fail-closed validator for companion privacy, delivery, progress, portability, and sync boundaries. |
| `scripts/export_study_guidance.py` | Cross-repo StudySyndicate guidance exporter. |
| `harness/manifest.v1.json` | Machine-readable harness component map and validation order. |
| `harness/CODEBASE_MAP.md` | This repository map. |
| `harness/WORKFLOWS.md` | Task pickup, repo acquisition, application intake/companion, validation, failure, and handoff workflows. |
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
| `.github/workflows/harness.yml` | Linux harness/product-contract validation plus Windows durable-root proof. |
| `.github/workflows/career-state.yml` | Career-state, companion, and StudySyndicate product-contract validation. |
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

Canonical product persistence remains `contracts/career-state.v1.schema.json`; `scripts/validate_career_state.py` validates it. `contracts/application-companion.v1.json` defines the delivery/privacy/synchronization boundary for clients that read and write that user-owned career state. `scripts/export_study_guidance.py` exports typed guidance to StudySyndicate.

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

## Configuration and contracts

- Governance: `AGENTS.md`
- Harness manifest: `harness/manifest.v1.json`
- Artifact registry: `ARTIFACT_REGISTRY.md`
- Career-state contract: `contracts/career-state.v1.schema.json`
- Application companion contract: `contracts/application-companion.v1.json`
- Application taxonomy: `harness/contracts/application-form-taxonomy.v1.json`
- Preference-cache policy: `harness/contracts/application-preference-cache.v1.json`
- Lua design input: `harness/constraints/LUA_EMBEDDING.md`

## Validation commands

Run from repository root:

```text
python scripts/validate_governance.py
python scripts/validate_application_harness.py
python scripts/validate_application_companion.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
python tests/test_study_guidance_export.py
git diff --check
```

## Build, test, and deploy commands

- Product build on `main`: **not established**
- Career-state contract: `python scripts/validate_career_state.py`
- Application companion contract: `python scripts/validate_application_companion.py`
- Study-guidance adapter: `python tests/test_study_guidance_export.py`
- Application harness: `python scripts/validate_application_harness.py`
- Repository convergence: run validation commands above
- Windows path-policy proof: `.github/workflows/harness.yml`
- Store packaging/publishing: **not established**
- Google Drive runtime adapter: **not established**
- Product deployment: **not established**

Do not claim browser/ATS, Google Drive, Microsoft Store, or Play Store runtime proof from repository validation.

## Fresh-agent path

1. Read `AGENTS.md`.
2. Read `harness/reports/CURRENT_STATE.md`.
3. Read this map, `harness/manifest.v1.json`, and `ARTIFACT_REGISTRY.md`.
4. On Windows, resolve durable repo state through `scripts/resolve_repo.ps1`.
5. Select the workflow in `harness/WORKFLOWS.md`.
6. For application pages/questions, read the taxonomy, preference policy, application workflow, and mapping skill before writing.
7. For companion/runtime/state-sync work, read `contracts/application-companion.v1.json`, the career-state schema, and the Application Companion workflow before writing.
8. Read Lua constraints only when scripting is in scope.
9. Declare sprint scope before the first write.
10. Run validators in manifest order before committing.
11. Report only the proof actually observed.
