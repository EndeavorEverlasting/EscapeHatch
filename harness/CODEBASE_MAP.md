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
| `harness/WORKFLOWS.md` | Task pickup, repository acquisition, validation, failure, and handoff workflows. |
| `harness/constraints/LUA_EMBEDDING.md` | Lua design constraints to preserve when a product runtime is introduced. |
| `harness/reports/CURRENT_STATE.md` | Human-readable operational status. |
| `scripts/resolve_repo.ps1` | Durable Windows repository-root resolver and non-destructive checkout/worktree acquisition helper. |
| `scripts/validate_governance.py` | Governance contract validator. |
| `scripts/validate_harness.py` | Harness completeness and contract validator. |
| `.githooks/` | Opt-in local pre-commit and pre-push checks. |
| `.github/workflows/harness.yml` | CI validation for governance, harness contracts, and Windows durable-root resolution. |
| `skills/harness-operations/SKILL.md` | Repeatable harness operating procedure for agents. |

## Durable Windows repository root

For durable Windows repository work, the harness resolves the development root to `Desktop\Dev` under the current user profile. On a normal local profile this is `$HOME\Desktop\Dev`; if PowerShell is already anywhere inside a `Desktop\Dev` tree, that observed ancestor wins.

The durable root is **not** `%TEMP%`, `AppData\Local\Temp`, or another disposable scratch directory. Temporary directories remain appropriate for ephemeral validator snapshots, but not for the repository checkout or a worktree that matters.

Resolve the durable root from an EscapeHatch checkout with:

```powershell
$DevRoot = & .\scripts\resolve_repo.ps1 -ResolveOnly
Set-Location $DevRoot
```

Resolve or acquire a specific remote branch non-destructively with:

```powershell
$RepoPath = & .\scripts\resolve_repo.ps1 -Branch '<branch>' -ExpectedCommit '<sha>'
Set-Location $RepoPath
```

The resolver reuses a clean matching checkout when safe. Otherwise it keeps the canonical checkout intact and creates a detached isolated worktree under the same durable `Desktop\Dev` root. It never force-updates a branch and never chooses a temporary directory for durable repository state.

## Product entry points

The product floor is contract-only; no executable application runtime exists yet. `contracts/career-state.v1.schema.json` is the canonical persistence boundary for the first product slice. `scripts/validate_career_state.py` is its owning executable validator. The fixture demonstrates a targeted opportunity with a user-owned resume reference without committing real personal career data.

The contract intentionally does not implement discovery, resume rendering, application submission, scraping, auto-apply behavior, database storage, or Lua execution.

## Current configuration and contracts

- Governance: `AGENTS.md`
- Harness manifest: `harness/manifest.v1.json`
- Artifact registry: `ARTIFACT_REGISTRY.md`
- Windows durable-root resolver: `scripts/resolve_repo.ps1`
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

On Windows, resolve the expected durable root with:

```powershell
pwsh -NoProfile -File scripts/resolve_repo.ps1 -ResolveOnly
```

## Build, test, and deploy commands

- Product build: **not established**
- Product contract test: `python scripts/validate_career_state.py`
- Product deployment: **not established**
- Repository contract validation: use the commands above.
- Windows path-policy proof: `.github/workflows/harness.yml` runs `scripts/resolve_repo.ps1 -ResolveOnly` on `windows-latest`.

The career-state validator proves schema identity, reference integrity, portable relative artifact locators, and negative fixtures. It does not prove a UI, database, resume generator, ATS integration, or runtime behavior.

## Fresh-agent path

1. Read `AGENTS.md`.
2. Read `harness/reports/CURRENT_STATE.md`.
3. Read this map and `harness/manifest.v1.json`.
4. On Windows, resolve durable repository state through `scripts/resolve_repo.ps1`; do not default durable work to `%TEMP%`.
5. Select a workflow from `harness/WORKFLOWS.md`.
6. Read `contracts/career-state.v1.schema.json` before product persistence work and the Lua constraint only when scripting is in scope.
7. Declare sprint scope before the first write.
8. Run validators before committing and report only the proof actually obtained.
