# EscapeHatch Operational Workflows

These workflows implement the execution discipline in `AGENTS.md`. They do not override governance.

## Workflow selection

Use **Task Pickup** for any new writing sprint. Use **Failure Recovery** when a declared validation or required command fails. Use **Handoff** before changing agents/chats or when a blocker prevents the current lane from advancing.

## Task Pickup

1. Read `AGENTS.md`, `harness/reports/CURRENT_STATE.md`, `harness/CODEBASE_MAP.md`, and `harness/manifest.v1.json`.
2. Inspect the current branch, relevant history, and existing canonical owners.
3. Search for existing helpers, schemas, validators, registries, skills, and output patterns before creating replacements.
4. Declare repo/branch, lane/mission, owned scope, forbidden scope, expected artifacts, validation commands, and proof ceiling.
5. Use one writer per branch. Use a separate branch/worktree for parallel ownership.
6. Make the smallest change that advances the declared mission.
7. Register any new durable artifact or generator in `ARTIFACT_REGISTRY.md`.
8. Update `harness/CODEBASE_MAP.md` if entry points, configuration, build, test, or deploy commands change.
9. Run validation in the manifest order before committing.

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

## Failure Recovery

1. Stop the completion claim.
2. Preserve the exact failing command and salient output.
3. Determine whether the failure is inside owned scope.
4. If inside owned scope, repair the smallest responsible surface and rerun the failing check first.
5. If outside owned scope, do not modify it casually. Record the blocker, owner/dependency, and exact command or operator action needed to advance.
6. Never bypass a failing validator by deleting the check, weakening the contract, force-pushing, or expanding scope without updating the sprint declaration.
7. After repair, rerun the full declared validation order.

## Artifact discipline

- Tracked canonical artifacts must have exactly one owner path.
- Generated artifacts must be registered before they are relied on.
- Resolve artifact paths through `ARTIFACT_REGISTRY.md`, the harness manifest, or the owning generator; do not guess paths from filenames or stale prose.
- Do not commit secrets, local credentials, transient caches, or generated junk.
- A new schema or manifest must include an explicit version identifier.

## Handoff

A handoff must contain repo/branch, sprint/lane, owned and forbidden scope, files changed, artifacts produced, validation actually run, skipped checks, proof ceiling, commit SHA, push/PR state, gaps/risks, important paths, preserved parallel/dirty work, and one exact next command that advances the next unproven state.

Do not hand off a plan as completed work.

## Product-runtime introduction gate

EscapeHatch currently has no product runtime. The first sprint that introduces one must register real source/config entry points, real build/test/deploy commands, durable outputs, focused validation, and any applicable Lua constraints before claiming product-runtime proof.
