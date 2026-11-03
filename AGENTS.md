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

For the zero-friction, extension-free, review-only application experience and its verified-versus-unproven implementation gates, read `docs/agent/P04_ZERO_FRICTION_APPLICATION_EXECUTION_2026-10-20.md` before changing the managed browser, answer memory, job source bridge, onboarding or submission path. A safe registry-free field-fill/PDF fallback is `REVIEW_REQUIRED`, **not** `REVIEW_READY` or full parent completion.

### Canonical installation-to-application scene graph is contractual

All setup, installer, opportunity intake, prerequisite prompts, managed-browser login, resume, form preparation and final-review changes must consult `contracts/application-journey-scenes.v1.json` and `docs/agent/APPLICATION_JOURNEY_SCENE_SYSTEM_2026-10-25.md`. The scene registry is the single user-journey mapping; `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md` and Issue #69 remain the implementation owner and parent completion gate. Run `python scripts/validate_application_journey.py` in addition to the existing application parent validator for related work. Preserve the installer PR #95, launcher #98, and parallel UI/progress work while reconciling exact-head integrations. Never treat credential page exit, URL change, successful request, locally saved answer or file-picker insertion as a completed application. Authentication credentials, MFA and CAPTCHA stay with the employer; final Submit and legal/EEO decisions stay operator-only.

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

## 10. Application startup and user-context readiness

Starting EscapeHatch means recovering the user's workspace, not merely observing a listening server.
Use `Launch-EscapeHatch.cmd`, which delegates through the installation/bootstrap owner, and follow
`docs/WINDOWS_RUNTIME_LIFECYCLE.md`. Preserve the installation's selected source and the stable
user store across checkouts. Never replace a dirty checkout or browser edits to obtain a clean launch.

Before reporting ready, verify the managed workspace readiness endpoint and observe the populated
profile/progress or the explicit recovery screen. Inspect remembered sources and tracker freshness;
neither HTTP 200, a process receipt, an auth-file presence flag, nor a stale snapshot proves user-context
readiness or live cloud access. Missing, invalid, conflicting or unauthorized context must produce a
specific recovery action and remain unproven until resolved. Use available authorized connectors to
recover existing artifacts; never ask the user to reconstruct discoverable context or create new OAuth
credentials by default. Keep private data and source identities outside Git. Uninstall preserves user
state and external artifacts; erasure requires a separate explicit user request.


**P94 operator-first recovery route:** If startup opens synthetic/sample identity, answers or opportunities appear missing, or the operator cannot begin a real job application, immediately execute `docs/agent/APPLICATION_JOURNEY_SCENE_SYSTEM_2026-10-25.md` §9.8 on the actual installed Windows host. Resolve installation-selected source and real-vs-fixture process/data ownership, repair the first proven gate, and supply the usable existing Applications → Assist → employer-browser path. Synthetic tests and GitHub merges are not the operator's live acceptance. Protect 21033 and all private data; do not ask the operator to retest sample accounts or re-enter answers.

**P04 operator-light real-application sprint:** When the operator asks the local agent to advance genuine saved job applications while they rest, read `docs/agent/P04_OPERATOR_LIGHT_APPLICATION_SPRINT_2026-10-27.md` before creating plans or synthetic tests. Use the existing career index, primary tracker, approved career profile, managed browser preparation controller, and installed private workspace to prepare the next up to three *unsubmitted*, verified-fit openings. Persist per-opportunity review checkpoints, proceed to another candidate on user-only gates, and deliver a concise real-workspace review queue. Never auto-submit, silently upload unapproved documents, launch applied/closed jobs, use Gmail, invent private facts or treat a green GitHub PR as a completed employer draft. The operator can rest; the local agent performs reachable steps without requiring continuous supervision. Section 9.8 of the canonical journey still owns recovery if the app opens synthetic/blank state.

### Applicant context ownership is a release-blocking boundary (P04, 2026-10-28)

Applicant work requires verified active owner/workspace IDs, never code access or contact matches. Never mix developer/agent/applicant/fixture context or publish private inputs. Unknown/mismatched owners block import/merge/retrieval/generation/refresh/writes; preserve data for review. Multi-user claims require independent proof. Run bootstrap/assist/parent validators.

### Application-required-field and answer-memory regression guard (2026-10-27)

For any application-form fill, verification, browser agent, or prompt handoff, inventory all required controls before reporting review readiness. Treat native `required`, `aria-required`, visible label/legend `*`, group-required metadata, and rendered required markers as signals; do not classify a starred employer question as optional merely because HTML validation is absent. The required inventory includes file inputs, hidden-but-labelled uploads, conditional/dynamically revealed questions and protected privacy/attestation checkboxes. Map using labels and group prompts, not click index. Read back actual selections and attached file-input state; verify employer acceptance separately. Legal/consent/EEO actions remain operator-controlled, and an unselected required privacy control must appear as a visible operator action, never disappear from readiness counts.

Resume an existing real application and hydrate previously approved answers from the user's PRIVATE canonical workspace and current opportunity overlay before asking or guessing. A recent explicit user correction outranks older derivatives or defaults; persist future corrections through existing answer-memory owner (not a second store). Do not hardcode private applicant values or link private answer documents into public repository history. After each fill and every conditional reveal, re-inspect required fields; report exact unresolved field names and `REVIEW_REQUIRED` until safe checks and protected handoff are complete. Execute `node --experimental-strip-types --test application-requirements.test.ts` from `artifacts/escape-hatch` and the existing managed-assist/full parent validators as relevant; static/synthetic PASS alone does not prove a live ATS or installed build.


### Résumé graph (P00/P01/P04)
Never replace a persistent platform resume with a job derivative. Unknown slot => review. See `harness/contracts/resume-selection-graph.v1.json`. Operator controls Submit.

### Self-contained agent context routing and private-profile continuation (2026-10-31)

A local agent must be able to execute EscapeHatch work using this repository alone: read this `AGENTS.md`, `harness/WORKFLOWS.md`, `ARTIFACT_REGISTRY.md`, `docs/agent/TRIFECTA.md`, and the existing local contracts/validators. TokenCorridor is an optional upstream prompt/reference system, never a prerequisite to start or complete an EscapeHatch sprint. Keep applicant-private answers, personal developer/agent preferences, and product/repository doctrine in separate owner-scoped stores; do not publish actual applicant data in tracked source. On 2026-10-31 the operator requested a private, owner-safe author-voice/profile recovery plus durable local-agent handoff: start at `docs/agent/CONTEXT_BOUNDARY_AND_PRIVATE_PROFILE_HANDOFF_2026-10-31.md` and `harness/contracts/agent-context-boundaries.v1.json`, continue existing private profile issue #146 under parent #69, and validate with `python scripts/validate_agent_context_boundaries.py --self-test` followed by `python scripts/validate_agent_context_boundaries.py`. The private source is recorded; installed workspace persistence and employer form behavior must be verified separately. Preserve current browser edits and operator-only Submit.
