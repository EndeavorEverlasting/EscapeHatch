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

### EscapeHatch browser-application parent outcome is persistent
The **P04 parent objective** is deterministic, end-to-end browser-based job-application preparation across varying ATS forms, using the user's reviewed career state, selected role documents and approved answers; final submission and attestations remain operator-controlled. Parent authority and nine conjunctive proof gates: https://github.com/EndeavorEverlasting/EscapeHatch/issues/69 and `harness/contracts/application-autofill-parent.v1.json`; the execution design remains owned by `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`.

Every agent, lane, sprint, PR, handoff and completion report touching résumé import, source catalogs, Google authorization, form taxonomy, managed Chrome, attachments, navigation, recovery or event tracking must recover and link this parent, prove its own contribution, and state which **parent** gates remain unproven. Source access, imported PDFs, a filled single page, a synthetic green test, a merged PR or successful one-off ATS run never closes the parent. Preserve existing main and separately owned work; make the next bounded executable contribution toward the integrated browser workflow. Do not silently reduce the objective to retrieving résumé data. Run `python scripts/validate_application_autofill_parent.py` on affected changes.

### Resume presentation quality is contractual
When an agent creates, refreshes, tailors, exports, or synchronizes a resume or CV, it must read and preserve the registered `contracts/resume-presentation.v1.json` presentation floor unless the user explicitly approves a different style. Content tailoring may change role-specific emphasis, but it must not silently regress typography, ATS-conservative structure, page-layout rules, output consistency, or required rendered-artifact QA. An optional visual projection may follow `contracts/resume-presentation-visual.v1.json` only when the user explicitly requests a non-ATS human-facing layout; that projection is never the default for Application Assist / employer submissions. Real resume content and contact data remain user-owned private inputs and must not be committed to this public repository. The operator folder `Source Resumes Not to Mutate but to Generate/` is read-only reference material.

### Career claim fidelity is contractual

All resume, cover-letter, career-profile, export, and browser-application text must preserve the user's current approved scope and chronology. A well-recalled partial period is **not** the total project duration. The user's explicit correction overrides old agent drafts and derivative PDFs, but factual claims still require evidence or appropriately attributed user testimony. Do not describe a multi-month responsibility as a brief coverage assignment merely because one six-week interval is easy to document. Avoid exact public duration unless the full duration is source-verified and useful.

Before releasing generated text, load `contracts/career-claim-fidelity.v1.json` and run `python scripts/validate_career_claim_fidelity.py`; apply its local `--input` mode to untracked, source-grounded claim paragraphs when available. A passing synthetic check is **not** a proof of arbitrary text semantics, real source ingestion, PDF regeneration, or complete browser application readiness. Private claim records, resumes, contact data, and documents must remain outside this public repository.


### Career artifact propagation must be reconciled

A user correction, approved new achievement, or approved career-story edit is a **source event**, not permission to silently rewrite every document. Before closing the work, identify the affected master and role-specific resumes, approved cover letters, derived PDFs, pre-submission bundles, and browser-application fields. Use the canonical dependency and receipt contract at `harness/contracts/career-artifact-propagation.v1.json` and its validator once installed. For every reachable dependent, record `UPDATED_VERIFIED`, `VERIFIED_UNCHANGED`, `PROTECTED_NO_EDIT`, `BLOCKED`, or genuinely `NOT_APPLICABLE` with source revision and destination readback evidence. Never treat a plan, an export request, or a GitHub merge as verified downstream propagation. A missing or stale dependent must not be reported current.

**Respect author approval and live work:** leave user-approved documents unchanged unless the operator expressly requests editing them; do not overwrite an active application session, submit an application, or replace private career assets without authorized provider writes. A protected artifact may be checked for impact and marked `PROTECTED_NO_EDIT` rather than mutated. Disclose stale or blocked outputs in the handoff; do not quietly backfill them or invent facts. Private career text, source locators, identities, and packet bytes must never enter tracked fixtures or public commits.

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

## 9. Trifecta workflow shorthand

When the operator invokes **trifecta**, resolve and apply TokenCorridor's **P08 Live Runtime Proof Executor**, **P82 Prototype-Measure-Refine Delivery Loop**, and **P07 Repo Sprint Executor** together. See `docs/agent/TRIFECTA.md` for canonical source locations, invocation boundaries, and proof reporting. This is a workflow reference under this governance contract, not a second governance authority. Missing prompt infrastructure or unavailable proof must be reported explicitly; the shorthand never grants credential access, personal-data disclosure, or final application submission authority.
