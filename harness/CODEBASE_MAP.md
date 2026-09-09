# EscapeHatch Codebase Map

## Repository floor

EscapeHatch has canonical governance, an operational application harness, a portable career-state graph with optional trajectory preservation, a StudySyndicate guidance bridge, and a bounded browser-local identity/contact autofill product. The harness owns semantic question identity, claim truthfulness, preference safety, validation, and operating procedures; browser code owns only explicit user-invoked fill behavior.

## Structure

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Canonical repository-wide agent governance. |
| `ARTIFACT_REGISTRY.md` | Canonical durable artifact registry. |
| `contracts/career-state.v1.schema.json` | Career state, optional trajectory, opportunities, resumes, applications, guidance, and evidence. |
| `fixtures/career-state.v1.example.json` | Synthetic portable career-state fixture. |
| `scripts/validate_career_state.py` | Career graph, trajectory, provenance, and backward-compatibility validator. |
| `scripts/export_study_guidance.py` | StudySyndicate guidance exporter. |
| `contracts/application-autofill.v1.json` | Browser autofill safety and portability contract. |
| `browser/application-autofill/` | Manual MV3 identity/contact autofill extension. |
| `docs/APPLICATION_AUTOFILL.md` | Autofill operator guide and proof ceiling. |
| `harness/manifest.v1.json` | Harness component map and validation order. |
| `harness/contracts/application-form-taxonomy.v1.json` | Employer/order-independent question taxonomy and evidence-backed professional claims. |
| `harness/contracts/application-preference-cache.v1.json` | User-owned preference persistence, reuse, privacy, and claim policy. |
| `harness/workflows/APPLICATION_FORM_INTAKE.md` | Trajectory/claim preflight and semantic form intake. |
| `skills/application-form-mapping/SKILL.md` | Safe mapping/evidence procedure. |
| `harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md` | Current application automation coverage/gaps. |
| `scripts/validate_application_harness.py` | Application taxonomy/preference/claim validator. |
| `scripts/resolve_repo.ps1` | Durable Windows repo/worktree resolver under `Desktop\Dev`. |
| `scripts/validate_governance.py` | Governance validator. |
| `scripts/validate_harness.py` | Harness completeness/integration validator. |
| `.github/workflows/harness.yml` | Harness and Windows location CI. |
| `.github/workflows/application-autofill.yml` | Autofill contract/runtime CI. |

## Durable Windows repository root

Durable Windows checkouts/worktrees belong under an observed `Desktop\Dev` ancestor or `$HOME\Desktop\Dev`; temporary directories are validator-only.

```powershell
pwsh -NoProfile -File scripts/resolve_repo.ps1 -ResolveOnly
```

For an exact unmerged branch, use `scripts/resolve_repo.ps1 -Branch '<branch>' -ExpectedCommit '<sha>'`; it verifies origin/head and preserves separately owned work.

## Product entry points

Career persistence enters through `contracts/career-state.v1.schema.json`. When a trajectory is known, preserve target/adjacent/avoid titles, preferred/avoid activities, constraints, and per-opportunity trajectory lane/reasons so repeated applications do not silently redefine the desired career direction.

Browser autofill enters through `browser/application-autofill/manifest.json` and `contracts/application-autofill.v1.json`. It fills only empty recognized identity/contact controls after explicit user invocation. It does not own questionnaire claims, resume tailoring, navigation, certification, or submission.

## Application-question entry points

- Taxonomy: `harness/contracts/application-form-taxonomy.v1.json`
- Preference/claim policy: `harness/contracts/application-preference-cache.v1.json`
- Workflow: `harness/workflows/APPLICATION_FORM_INTAKE.md`
- Skill: `skills/application-form-mapping/SKILL.md`
- Operator report: `harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md`
- Validator: `scripts/validate_application_harness.py`

Professional questions reuse semantic IDs but remain evidence-backed. Unknown/ambiguous questions fail closed. Real selected answers never belong in tracked fixtures, reports, or contracts.

## Configuration and contracts

- Governance: `AGENTS.md`
- Harness manifest: `harness/manifest.v1.json`
- Artifact registry: `ARTIFACT_REGISTRY.md`
- Career-state contract: `contracts/career-state.v1.schema.json`
- Autofill product contract: `contracts/application-autofill.v1.json`
- Application taxonomy: `harness/contracts/application-form-taxonomy.v1.json`
- Preference-cache policy: `harness/contracts/application-preference-cache.v1.json`
- Lua design input: `harness/constraints/LUA_EMBEDDING.md`

## Validation commands

Run from repository root:

```text
python scripts/validate_governance.py
python scripts/validate_application_harness.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
python tests/test_study_guidance_export.py
python tests/test_application_autofill_contract.py
node tests/test_application_autofill.mjs
git diff --check
```

## Build, test, and deploy commands

- Career-state/trajectory contract: `python scripts/validate_career_state.py`
- Study-guidance adapter: `python tests/test_study_guidance_export.py`
- Application semantics/claims: `python scripts/validate_application_harness.py`
- Browser autofill contract: `python tests/test_application_autofill_contract.py`
- Browser autofill runtime: `node tests/test_application_autofill.mjs`
- Windows path-policy proof: `.github/workflows/harness.yml`
- Product deployment: **not established**; unpacked browser loading is operator runtime, not deployment proof.

Do not claim ATS compatibility from repository validation.

## Fresh-agent path

1. Read `AGENTS.md`, current reports, this map, manifest, and artifact registry.
2. Resolve durable repo state through `scripts/resolve_repo.ps1` on Windows.
3. Read career-state trajectory before job-search/application work when available; do not re-interview the operator for facts already persisted.
4. For application questions, read taxonomy, preference policy, intake workflow, and mapping skill before writing.
5. For browser fill changes, read `contracts/application-autofill.v1.json` and its tests before editing runtime code.
6. Declare sprint scope before the first write.
7. Run the owning validators plus manifest validation before commit/integration.
8. Report only proof actually observed; live ATS behavior remains a separate runtime gate.
