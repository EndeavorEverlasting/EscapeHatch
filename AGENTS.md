# EscapeHatch Agent Governance Doctrine

This root `AGENTS.md` is the repository's canonical agent governance contract and single source of truth for how automated and human-directed agents operate in EscapeHatch. Repository work must conform to this contract unless a higher-precedence instruction explicitly overrides it.

## 1. Agent Operating Principles

### Evidence before action
Inspect the repository, current branch/ref, existing contracts, nearby patterns, and relevant history before mutating files. Prefer repository evidence over assumptions. When evidence is incomplete, reduce scope rather than inventing facts.

### Floor before furniture
Establish contracts, data boundaries, safety gates, validation, and persistence guarantees before adding convenience features or polish. Do not build product surface area on an unproven foundation.

### Bounded sprints with declared scope
Every writing sprint must declare its lane, mission, owned scope, forbidden scope, expected artifacts, validation commands, and proof ceiling before making changes. Keep mutations inside that boundary.

### One writer per branch
A branch has one active writer at a time. Parallel agents must use separate branches or worktrees with explicit owned and forbidden scope. Never overwrite or silently absorb separately owned work.

### Reuse before replacing
Search for existing contracts, helpers, schemas, validators, scripts, naming conventions, and documentation before creating new ones. Repair or extend the canonical owner when one exists; do not create competing sources of truth.

### No completion without proof
A task is not complete because code was written or a plan looks plausible. Completion requires actual validation evidence appropriate to the claimed proof ceiling.

### Resume presentation quality is contractual
When an agent creates, refreshes, tailors, exports, or synchronizes a resume or CV, it must read and preserve the registered `contracts/resume-presentation.v1.json` presentation floor unless the user explicitly approves a different style. Content tailoring may change role-specific emphasis, but it must not silently regress typography, ATS-conservative structure, page-layout rules, output consistency, or required rendered-artifact QA. Real resume content and contact data remain user-owned private inputs and must not be committed to this public repository.

## 2. Instruction Precedence

When instructions conflict, use this order from highest to lowest precedence:

1. Platform, security, legal, and repository-owner instructions.
2. This governance contract.
3. Task-specific prompts and sprint instructions.
4. Generic agent defaults or conventions.

Lower-precedence instructions must never be used to bypass or reinterpret a higher-precedence safety, ownership, or scope boundary.

## 3. Mandatory Sprint Declaration

Before the first write in every sprint, state all of the following:

- **Repo and branch:** exact repository and working branch/ref.
- **Lane and mission:** the bounded workstream and the outcome being pursued.
- **Owned scope:** files, directories, behaviors, or contracts the sprint may change.
- **Forbidden scope:** files, systems, behaviors, secrets, or adjacent work the sprint must not change.
- **Expected artifacts:** concrete files, reports, commits, PRs, or other outputs that must exist when the sprint is done.
- **Validation commands:** exact checks that will be run, not checks merely recommended for later.
- **Proof ceiling:** the strongest claim the available environment and validation can actually support.

If the sprint changes materially, update the declaration before continuing.

## 4. Execution Discipline

Use the following loop for writing work:

1. **Request:** identify the user-visible goal and repository boundary.
2. **Evidence review:** inspect current state and canonical owners.
3. **Bounded plan:** choose the smallest safe change that advances the goal.
4. **Action:** mutate only owned scope.
5. **Artifacts:** produce the declared tracked outputs and any required evidence.
6. **Validation:** run the declared checks and record their real results.
7. **Report:** name changed files, results, gaps, risks, and git/PR state.
8. **Next decision:** provide the next executable action that advances the first remaining unproven state.

Do not substitute commentary for an executable step when safe, authorized work remains.

## 5. Completion Standard

A writing task is complete only when all applicable conditions below are satisfied:

- Every created or modified file is named in the report.
- Declared validation was actually run; skipped checks are named with the reason they were skipped.
- Validation output supports the completion claim and stays within the declared proof ceiling.
- A commit SHA exists for the completed mutation.
- Push state and pull-request state are reported explicitly.
- Preserved dirty work, parallel work, or cleanup state is reported when relevant.
- Exactly one actionable next command is provided to advance the next useful unproven state, or `none; no safe actionable work remains` is used only when that statement is actually true.

A green local check does not prove deployment, production behavior, third-party service behavior, or a platform-specific runtime that was not exercised.

## 6. Forbidden Behaviors

The following are prohibited:

- Acknowledgment without mutation when the task explicitly authorizes and requires repository changes.
- Plans without execution when safe, scoped execution is available.
- Summaries without proof presented as completed work.
- Completion claims without running the checks that support those claims.
- Secret, token, password, credential, private-key, or sensitive configuration exposure in source, logs, prompts, reports, commits, or PR text.
- Destructive cleanup, force-push, history rewriting, or deletion of separately owned work unless a higher-precedence instruction explicitly authorizes it.
- Creating a competing governance, schema, registry, manifest, or canonical owner when an existing one can be repaired or extended.
- Expanding into forbidden or adjacent scope merely because it would be convenient.

## 7. Actionable Next Command Contract

The final report for serious repository work must not leave `NEXT COMMAND`, `NEXT ACTION`, `NEXT STEP`, or `NEXT STEPS` blank, placeholder-only, observation-only, or generic.

The next command must:

- begin with the first executable action that advances the next unproven state;
- name any real blocker or dependency instead of pretending it is complete;
- preserve dirty or separately owned work through a non-destructive mechanism when necessary;
- run the owning validator, build, launcher, or other relevant proof step;
- resolve canonical artifacts from tracked repository contracts rather than guessed paths; and
- propagate nonzero exit status when used as an operator command.

When no artifact exists yet, the next action must create or repair the next owned artifact and prove it. When review, merge, credentials, a protected runtime, a technician workstation, or production access is the true blocker, the report must identify that blocker and provide the exact command or operator action that advances that gate without claiming higher proof.

## 8. Governance Ownership

`AGENTS.md` owns repository-wide agent governance. Changes to this doctrine must be deliberate, reviewable, and validated by the repository governance validator. Task prompts may specialize behavior inside their bounded scope but may not silently create a second governance authority.
