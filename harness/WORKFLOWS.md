# EscapeHatch Operational Workflows

These workflows implement the execution discipline in `AGENTS.md`. They do not override governance.

## Workflow selection

Use **Repository Location** before durable Windows repository acquisition or proof work. Use **Task Pickup** for any new writing sprint. Use **Failure Recovery** when a declared validation or required command fails. Use **Handoff** before changing agents/chats or when a blocker prevents the current lane from advancing.

## Repository Location

On Windows, durable repository state belongs under the user's `Desktop\Dev` development root. The canonical resolver is `scripts/resolve_repo.ps1`.

Rules:

1. If the current PowerShell location is already inside a `Desktop\Dev` tree, use that observed `Desktop\Dev` ancestor.
2. Otherwise prefer `$HOME\Desktop\Dev`, then an existing `%USERPROFILE%\Desktop\Dev`, then the Windows known Desktop folder plus `Dev`.
3. If no durable `Dev` directory exists, establish `$HOME\Desktop\Dev`.
4. Never use `%TEMP%` or `AppData\Local\Temp` as the default location for a durable checkout or worktree.
5. Preserve an existing checkout. Fetch without force. If the requested branch/commit cannot safely own the canonical checkout, create or reuse a clean detached worktree under the same durable `Desktop\Dev` root.

From an existing EscapeHatch checkout:

```powershell
$DevRoot = & .\scripts\resolve_repo.ps1 -ResolveOnly
Set-Location $DevRoot
```

For an exact unmerged branch/commit:

```powershell
$RepoPath = & .\scripts\resolve_repo.ps1 -Branch '<branch>' -ExpectedCommit '<sha>'
Set-Location $RepoPath
```

The second form verifies the remote branch head before selecting the worktree.

## Task Pickup

1. Read `AGENTS.md`, `harness/reports/CURRENT_STATE.md`, `harness/CODEBASE_MAP.md`, and `harness/manifest.v1.json`.
2. Resolve the durable repository/worktree location using **Repository Location** when working on Windows.
3. Inspect the current branch, relevant history, and existing canonical owners.
4. Search for existing helpers, schemas, validators, registries, skills, and output patterns before creating replacements.
5. Declare repo/branch, lane/mission, owned scope, forbidden scope, expected artifacts, validation commands, and proof ceiling.
6. Use one writer per branch. Use a separate branch/worktree for parallel ownership.
7. Make the smallest change that advances the declared mission.
8. Register any new durable artifact or generator in `ARTIFACT_REGISTRY.md`.
9. Update `harness/CODEBASE_MAP.md` if entry points, configuration, build, test, deploy commands, or repository-location contracts change.
10. Run validation in the manifest order before committing.

## Pre-commit validation

Required floor:

```text
python scripts/validate_governance.py
python scripts/validate_harness.py
git diff --check
```

Then run every product-specific test/build command registered in `harness/CODEBASE_MAP.md` for the changed scope. If no such command exists, report that fact; do not claim product build or runtime proof.

Enable the optional local hooks with:

```text
git config core.hooksPath .githooks
```

The pre-commit hook materializes the Git index into an isolated snapshot and runs the governance and harness validators against exactly what will be committed; unstaged working-tree replacements cannot hide or fabricate staged validity. The pre-push hook materializes each non-deletion commit named by Git's pre-push input, runs the validators against that committed tree, and checks whitespace across the pushed range (falling back to the remote `main` merge base for a new branch).

Temporary validator snapshots are intentionally disposable and do not conflict with the durable repository-location rule.

## Failure Recovery

1. Stop the completion claim.
2. Preserve the exact failing command and salient output.
3. Determine whether the failure is inside owned scope.
4. If inside owned scope, repair the smallest responsible surface and rerun the failing check first.
5. If outside owned scope, do not modify it casually. Record the blocker, owner/dependency, and exact command or operator action needed to advance.
6. If repository acquisition landed in a disposable location, preserve any real work and reacquire through `scripts/resolve_repo.ps1` under `Desktop\Dev`; do not delete the old location until ownership and state are proven.
7. Never bypass a failing validator by deleting the check, weakening the contract, force-pushing, or expanding scope without updating the sprint declaration.
8. After repair, rerun the full declared validation order.

## Artifact discipline

- Tracked canonical artifacts must have exactly one owner path.
- Generated artifacts must be registered before they are relied on.
- Resolve artifact paths through `ARTIFACT_REGISTRY.md`, the harness manifest, or the owning generator; do not guess paths from filenames or stale prose.
- Resolve durable Windows repository paths through `scripts/resolve_repo.ps1`; do not guess old sibling names or default durable work to temporary storage.
- Do not commit secrets, local credentials, transient caches, or generated junk.
- A new schema or manifest must include an explicit version identifier.

## Handoff

A handoff must contain repo/branch, sprint/lane, owned and forbidden scope, files changed, artifacts produced, validation actually run, skipped checks, proof ceiling, commit SHA, push/PR state, gaps/risks, important paths, preserved parallel/dirty work, and one exact next command that advances the next unproven state.

On Windows, that next command must begin from or deterministically resolve the durable `Desktop\Dev` root when it needs a checkout/worktree. Do not hand off `%TEMP%` as the durable repository location.

Do not hand off a plan as completed work.

## Product-runtime introduction gate

EscapeHatch currently has no executable product runtime. The first sprint that introduces one must register real source/config entry points, real build/test/deploy commands, durable outputs, focused validation, and any applicable Lua constraints before claiming product-runtime proof.
