# EscapeHatch Codebase Map

## Repository floor

EscapeHatch is at a foundation stage. The canonical governance contract is installed, and this harness defines how agents inspect and extend the repository without inventing product behavior.

## Structure

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Canonical repository-wide agent governance. Do not create a competing authority. |
| `ARTIFACT_REGISTRY.md` | Canonical registry for tracked and generated artifacts. |
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

No product source tree, application entry point, runtime configuration, package manifest, database schema, or deployment configuration exists on the verified repository floor yet.

A future product sprint must update this map when it introduces any of those surfaces. Do not guess build, test, or deploy commands before they exist in tracked files.

## Current configuration and contracts

- Governance: `AGENTS.md`
- Harness manifest: `harness/manifest.v1.json`
- Artifact registry: `ARTIFACT_REGISTRY.md`
- Lua design input: `harness/constraints/LUA_EMBEDDING.md`

## Validation commands

Run from the repository root:

```text
python scripts/validate_governance.py
python scripts/validate_harness.py
git diff --check
```

## Build, test, and deploy commands

- Product build: **not established**
- Product tests: **not established**
- Product deployment: **not established**
- Contract validation: use the commands above.

The absence of product commands is a known state, not permission to invent them. The first sprint that creates a product runtime must register its real commands here and in `harness/manifest.v1.json`.

## Fresh-agent path

1. Read `AGENTS.md`.
2. Read `harness/reports/CURRENT_STATE.md`.
3. Read this map and `harness/manifest.v1.json`.
4. Select a workflow from `harness/WORKFLOWS.md`.
5. Read any scoped skill or design constraint relevant to the task.
6. Declare sprint scope before the first write.
7. Run validators before committing and report only the proof actually obtained.
