# Skill: EscapeHatch Harness Operations

## Trigger

Use this skill for any EscapeHatch repository sprint that writes files, validates a branch, produces durable artifacts, prepares a PR, acquires a Windows checkout/worktree, maps application questions, or hands work to another agent/chat.

## Required inputs

- task mission;
- current repository and branch;
- owned and forbidden scope;
- expected artifacts;
- available validation environment;
- intended proof ceiling;
- durable repository root when platform-specific location matters;
- application question evidence when application-form work is in scope, sanitized to exclude selected user answers.

## Procedure

1. Read `AGENTS.md`.
2. Read `harness/reports/CURRENT_STATE.md`, `harness/CODEBASE_MAP.md`, `harness/WORKFLOWS.md`, `harness/manifest.v1.json`, and `ARTIFACT_REGISTRY.md`.
3. On Windows, resolve durable repository state through `scripts/resolve_repo.ps1`; do not place durable work in `%TEMP%`.
4. Resolve canonical artifact owners before creating files.
5. Search existing contracts/helpers/validators/skills before replacing or duplicating them.
6. For application-form work, read the application taxonomy, preference-cache contract, workflow, mapping skill, and operator report before writing.
7. For opportunity recommendation/manual-application handoff work, read `harness/contracts/application-opportunity-readiness.v1.json`, `harness/workflows/APPLICATION_OPPORTUNITY_READINESS.md`, and `skills/application-opportunity-readiness/SKILL.md`; resolve/create the private packet before calling an opportunity recommendation-ready.
8. Declare the sprint fields required by governance.
9. Keep one writer per branch and isolate parallel lanes.
10. Implement only owned scope.
11. Never commit real application preference values; use sanitized question/option evidence only.
12. Run validation in manifest order plus product checks relevant to changed scope.
13. Record exact results, skipped checks, proof ceiling, commit SHA, push/PR state, gaps, risks, and preserved parallel work.
14. End with one executable next command that advances the first remaining unproven state.

## Failure behavior

Do not weaken governance/harness checks to make a change pass.

For application forms:
- ambiguous/unknown question → leave blank and map semantically;
- missing option match → leave blank and surface available options;
- sensitive value absent → require explicit local preference;
- legal/current value stale → require per-application confirmation;
- attestation/certification → require manual action;
- real preference value appears in tracked content/logs → remove it before commit and use a sanitized fixture.

If durable work exists in temporary storage, preserve unique/dirty work before reacquiring under `Desktop\Dev`.

## Expected outputs

- bounded tracked changes;
- updated registry/map/workflow when authority changes;
- passing applicable validators;
- durable Windows resolution when applicable;
- sanitized application question mapping when applicable;
- no committed real preference values;
- commit SHA and remote push/PR state;
- concise handoff with one exact next command.
