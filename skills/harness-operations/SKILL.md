# Skill: EscapeHatch Harness Operations

## Trigger

Use this skill for any EscapeHatch repository sprint that writes files, validates a branch, produces durable artifacts, prepares a PR, acquires a Windows checkout/worktree, or hands work to another agent/chat.

## Required inputs

- task mission;
- current repository and branch;
- owned and forbidden scope;
- expected artifacts;
- available validation environment;
- intended proof ceiling;
- durable repository root when platform-specific location matters.

## Procedure

1. Read `AGENTS.md`.
2. Read `harness/reports/CURRENT_STATE.md`, `harness/CODEBASE_MAP.md`, `harness/WORKFLOWS.md`, and `harness/manifest.v1.json`.
3. On Windows, resolve durable repository state through `scripts/resolve_repo.ps1`. Prefer the observed `Desktop\Dev` ancestor or `$HOME\Desktop\Dev`; do not place durable checkout/worktree state in `%TEMP%`.
4. Resolve canonical artifact owners through `ARTIFACT_REGISTRY.md`.
5. Search before creating; reuse the existing owner, helper, schema, validator, or naming pattern when available.
6. Declare the sprint fields required by governance before writing.
7. Keep one writer per branch and isolate parallel lanes.
8. Implement only owned scope.
9. Run validation in manifest order plus every registered product check relevant to changed scope.
10. Record exact results, skipped checks, proof ceiling, commit SHA, push/PR state, gaps, and risks.
11. End with one executable next command that advances the first remaining unproven state. On Windows, that command must resolve or start from the durable `Desktop\Dev` root when repository acquisition is involved.

## Failure behavior

Do not weaken governance or the harness to make a failing change pass. Preserve failure evidence, repair owned scope, or report the exact external blocker.

If a durable checkout/worktree was accidentally created in temporary storage, do not destroy it blindly. Prove whether it contains unique or dirty work, then reacquire the required branch/commit through `scripts/resolve_repo.ps1` under `Desktop\Dev` and report the preserved old state.

## Expected outputs

- bounded tracked changes;
- updated artifact registry/map when ownership, entry points, or repository-location policy changes;
- passing applicable validators;
- durable Windows checkout/worktree resolution under `Desktop\Dev` when applicable;
- commit SHA and remote PR/push state;
- concise human-readable handoff with one next command.
