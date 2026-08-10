# Skill: EscapeHatch Harness Operations

## Trigger

Use this skill for any EscapeHatch repository sprint that writes files, validates a branch, produces durable artifacts, prepares a PR, or hands work to another agent/chat.

## Required inputs

- task mission;
- current repository and branch;
- owned and forbidden scope;
- expected artifacts;
- available validation environment;
- intended proof ceiling.

## Procedure

1. Read `AGENTS.md`.
2. Read `harness/reports/CURRENT_STATE.md`, `harness/CODEBASE_MAP.md`, `harness/WORKFLOWS.md`, and `harness/manifest.v1.json`.
3. Resolve canonical artifact owners through `ARTIFACT_REGISTRY.md`.
4. Search before creating; reuse the existing owner, helper, schema, validator, or naming pattern when available.
5. Declare the sprint fields required by governance before writing.
6. Keep one writer per branch and isolate parallel lanes.
7. Implement only owned scope.
8. Run validation in manifest order plus every registered product check relevant to changed scope.
9. Record exact results, skipped checks, proof ceiling, commit SHA, push/PR state, gaps, and risks.
10. End with one executable next command that advances the first remaining unproven state.

## Failure behavior

Do not weaken governance or the harness to make a failing change pass. Preserve failure evidence, repair owned scope, or report the exact external blocker.

## Expected outputs

- bounded tracked changes;
- updated artifact registry/map when ownership or entry points change;
- passing applicable validators;
- commit SHA and remote PR/push state;
- concise human-readable handoff with one next command.
