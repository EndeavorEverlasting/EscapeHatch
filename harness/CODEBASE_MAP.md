# EscapeHatch Codebase Map

## Repository floor

EscapeHatch has canonical governance and harness infrastructure plus its first bounded product contract: a portable career-state graph connecting profile → opportunity → resume → application → evidence.

## Structure

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Canonical repository-wide agent governance. Do not create a competing authority. |
| `ARTIFACT_REGISTRY.md` | Canonical registry for tracked and generated artifacts. |
| `contracts/career-state.v1.schema.json` | Versioned product persistence contract for career state and artifact ownership. |
| `fixtures/career-state.v1.example.json` | Portable representative fixture for the career-state contract. |
| `scripts/validate_career_state.py` | Deterministic career-state/reference-graph validator and negative fixtures. |
| `harness/manifest.v1.json` | Machine-readable harness component map and validation order. |
| `harness/CODEBASE_MAP.md` | This repository map. |
| `harness/WORKFLOWS.md` | Task pickup, validation, failure, and handoff workflows. |
| `harness/constraints/LUA_EMBEDDING.md` | Lua design constraints to preserve when a product runtime is introduced. |
| `harness/reports/CURRENT_STATE.md` | Human-readable operational status. |
| `scripts/validate_governance.py` | Governance contract validator. |
| `scripts/validate_harness.py` | Harness completeness and contract validator. |
| `.githooks/` | Opt-in local pre-commit and pre-push checks. |
| `.github/workflows/harness.yml` | CI validation for governance and harness contracts. |
| `skills/harness-operations/SKILL.md` | Repeatable harness operating procedure for agents. |

## Product entry points

The product floor is contract-only; no executable application runtime exists yet. `contracts/career-state.v1.schema.json` is the canonical persistence boundary for the first product slice. `scripts/validate_career_state.py` is its owning executable validator. The fixture demonstrates a targeted opportunity with a user-owned resume reference without committing real personal career data.

The contract intentionally does not implement discovery, resume rendering, application submission, scraping, auto-apply behavior, database storage, or Lua execution.

## Current configuration and contracts

- Governance: `AGENTS.md`
- Harness manifest: `harness/manifest.v1.json`
- Artifact registry: `ARTIFACT_REGISTRY.md`
- Career-state contract: `contracts/career-state.v1.schema.json`
- Lua design input: `harness/constraints/LUA_EMBEDDING.md`

## Validation commands

Run from the repository root:

```text
python scripts/validate_governance.py
python scripts/validate_harness.py
python scripts/validate_career_state.py
git diff --check
```

## Build, test, and deploy commands

- Product build: **not established**
- Product contract test: `python scripts/validate_career_state.py`
- Product deployment: **not established**
- Repository contract validation: use the commands above.

The career-state validator proves schema identity, reference integrity, portable relative artifact locators, and negative fixtures. It does not prove a UI, database, resume generator, ATS integration, or runtime behavior.

## Fresh-agent path

1. Read `AGENTS.md`.
2. Read `harness/reports/CURRENT_STATE.md`.
3. Read this map and `harness/manifest.v1.json`.
4. Select a workflow from `harness/WORKFLOWS.md`.
5. Read `contracts/career-state.v1.schema.json` before product persistence work and the Lua constraint only when scripting is in scope.
6. Declare sprint scope before the first write.
7. Run validators before committing and report only the proof actually obtained.
