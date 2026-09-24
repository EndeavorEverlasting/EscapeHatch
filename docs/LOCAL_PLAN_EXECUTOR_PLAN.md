# EscapeHatch Local Repository Plan Executor

**Canonical plan owner:** \`docs/LOCAL_PLAN_EXECUTOR_PLAN.md\`  
**Plan date:** 2026-09-24  
**Planning floor:** \`integration/replit-donor-b01f628-20260921@fb888ae5611e8242883d7a6134259f2dd9c03110\`  
**Provider default:** \`main@0824535b9dc1341def885a79a098d297df770ac8\`  
**Disposition:** planning / harness design only; this artifact does not claim that a local executor is running.  
**Run manifest:** \`Outputs/prompt-parallel-dispatch/runs/escapehatch-mainline-autoload-multisurface-executor-20260924/manifest.json\`

## 1. Mission

Provide a durable local orchestration loop that can work through the repository's remaining plan graph without requiring the operator to manually open chats, paste handoffs, remember branch ownership, or mark remote completion.

The executor must continuously reconcile current repository/provider truth, choose dependency-ready work, isolate writers, execute bounded sprints, carry context across model windows, validate exact candidates, publish remote progress, converge proven work, and only mark a plan complete when its required proof state is actually reached.

The executor is a repository harness. It does not own EscapeHatch product/domain behavior.

## 2. Current floor

Provider truth at planning time:

- default branch: \`main@0824535b9dc1341def885a79a098d297df770ac8\`;
- integration branch: \`integration/replit-donor-b01f628-20260921@fb888ae5611e8242883d7a6134259f2dd9c03110\`;
- integration is 129 commits ahead / 0 behind main;
- open product/recovery owners include PR #27, #29, #30, #31, and planning PR #35;
- PR #27 currently has unresolved review findings and failing Web Cockpit Validation;
- PR #29 currently has unresolved review findings and multiple failing required workflows;
- PR #30 remains a stacked repair with an unresolved submission-evidence review finding and failing application-queue workflow;
- PR #31 is green on observed workflows but still has unresolved timestamp/read-back review findings;
- PR #35 is planning-only and currently has unresolved design/reproducibility findings plus failing Harness Validation.

The generated project-plan mirror currently reports:

- 64 Merged;
- 55 Drafts;
- 1 Active (#118);
- 0 Ready;
- 0 Merging.

\`docs/plans/*.md\` is generated from a task-board export and must not be hand-edited. \`docs/plans/recovered-task-export.v1.json\` remains the tracked recovery input until a newer explicit board export is imported.

## 3. Operator authorization interpretation

The operator has requested that the local agent work through the repository plans to completion.

That authorization means the executor should inspect every unfinished plan/task, but it must not blindly implement stale duplicated proposals.

For each unfinished item, classify against refreshed truth:

- \`ALREADY_PROVEN\` — behavior already exists and current proof satisfies the plan;
- \`EXECUTABLE\` — still relevant and dependency-ready;
- \`WAITING_DEPENDENCY\`;
- \`SUPERSEDED\` — newer canonical owner covers the same requirement;
- \`STALE_OR_INVALID\` — current repository reality invalidates the proposal;
- \`BLOCKED_EXTERNAL\`;
- \`UNSAFE\`.

Draft status does not waive the reconciliation pass. The operator's sweep authorization permits relevant safe draft work to advance, but the executor must record why each Draft was accepted, superseded, or closed instead of turning all drafts into code mechanically.

## 4. Remote execution ledger

Do not rewrite generated task files to advertise execution progress.

Create a provider-visible execution overlay owned by the harness, for example:

\`Outputs/plan-executor/ledger.json\`

Each plan/task entry should include:

- stable plan/task identity;
- canonical source path;
- source revision/fingerprint;
- current execution disposition;
- dependency identities;
- mutation owner;
- isolated branch/worktree identity;
- claimed_at / heartbeat / lease state;
- head SHA;
- PR URL/number;
- strongest proof state;
- validator/check receipts;
- integration SHA;
- refreshed default-main containment state;
- blocker/reason;
- exact next action;
- last context handoff artifact.

Only the executor/convergence owner updates this ledger through compare-and-set/revision checks.

Other agents read this remote ledger before claiming work, so parallel contributors can respect existing ownership.

## 5. Isolation and collision rules

Before claiming work:

1. fetch/prune remote truth;
2. resolve actual default and integration heads;
3. inspect open/recent PRs, branches, worktrees, changed files, and declared owners;
4. build expected-write sets;
5. refuse a second writer on the same shared file/schema/workflow unless the existing lane is explicitly converged or superseded.

Each mutating lane receives:

- its own branch;
- preferably its own Git worktree;
- exact base SHA;
- owned paths;
- forbidden paths;
- dependency SHAs;
- validation contract;
- convergence owner.

Never reset/clean/delete another lane's workspace.

## 6. Iterative local-agent window protocol

The local executor must treat a model context window as a replaceable worker process, not as the state owner.

### 6.1 Durable handoff

Each active lane maintains a machine-readable handoff such as:

\`Outputs/plan-executor/handoffs/<lane-id>.json\`

Required fields:

- lane id and plan/task identity;
- mission;
- exact repository/ref/worktree;
- base/head SHA;
- owned/forbidden mutation surfaces;
- completed checklist items;
- current diff summary;
- tests/validators already run and exact results;
- unresolved review/CI findings;
- proof-relevance fingerprint;
- blockers;
- next executable action;
- uncommitted/untracked preservation state;
- related PR/issue URLs;
- context epoch / handoff sequence.

### 6.2 Context rollover

When the active worker approaches its context ceiling, encounters a hard termination, or reaches a natural bounded checkpoint:

1. reconcile actual repository/provider state;
2. checkpoint the lane handoff;
3. publish/update the remote ledger;
4. commit/push only valid bounded work;
5. start the next local agent window with the handoff as input;
6. require the successor to refresh truth before mutation;
7. successor explicitly acknowledges the prior owned surfaces and resumes the exact next action.

The human operator is not the message bus.

### 6.3 No invisible work

Every evidence-changing checkpoint updates either the PR, receipt, handoff, or execution ledger. A worker that disappears must leave enough remote/local state for a successor to know what happened.

## 7. Plan intake and dependency graph

Input owners:

- canonical tracked plans such as \`docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md\`, \`docs/APPLICATION_CONTEXT_AUTOFILL_PLAN.md\`, \`docs/WINDOWS_RUNTIME_LIFECYCLE_PLAN.md\`, and \`docs/CAREER_STORE_IMPORT_PLAN.md\`;
- generated \`docs/plans/index.md\` / task files as backlog evidence;
- open PRs/review threads/checks;
- harness contracts, registries, workflows, validators, fixtures;
- current provider/default/integration refs.

The executor builds one normalized DAG. A plan line item is not dispatched just because a Markdown heading exists; it must map to a canonical owner, acceptance gate, and writable/non-writable surfaces.

## 8. Completion semantics

Remote states:

- \`PLANNED\`;
- \`CLAIMED\`;
- \`IMPLEMENTED\`;
- \`VALIDATED\`;
- \`PR_OPEN\`;
- \`INTEGRATED_TO_STAGING\`;
- \`MAINLINE_CONTAINED\`;
- \`OBSERVED\` when live runtime proof is required;
- \`COMPLETE\`;
- \`SUPERSEDED\`;
- \`BLOCKED\`.

No item becomes \`COMPLETE\` from branch code or a green PR alone.

Default rule:

> COMPLETE requires the plan's own proof ceiling plus integration into the branch that the plan declares terminal. For product behavior requested on main, mainline containment is mandatory.

## 9. Review/CI repair loop

For every open PR in the graph:

1. read all unresolved inline threads and top-level review findings;
2. reproduce/validate the finding;
3. repair the smallest canonical owner;
4. add negative/positive regression coverage when the defect family warrants it;
5. rerun focused then broader checks;
6. reply with evidence and resolve valid threads;
7. re-fetch exact PR head and required checks;
8. merge only when current gates pass.

PR #27/#29/#30/#31/#35 are current priority blockers because later application/bootstrap/import lanes depend on them.

## 10. Local execution adapter

The exact local agent product is an adapter behind this contract.

Probe in order at runtime:

1. repo-proven local agent runner, if one exists on the refreshed checkout;
2. installed OpenCode/Cursor/Codex/Claude wrapper evidenced on the workstation;
3. AgentSwitchboard/GNHF adapter if installed and repository-compatible;
4. provider/CI execution for lanes that do not require the local GUI/workstation;
5. deterministic local process jobs for non-LLM validators/builds.

The plan must not invent availability. If no autonomous local LLM adapter can be proven, the executor bootstrap sprint creates the smallest command-addressable adapter/config needed to launch one worker with a handoff path, owned worktree, and return receipt.

## 11. Mainline sweep algorithm

Pseudo-flow:

\`
refresh provider/local truth
-> ingest plans + task mirror + open PRs
-> reconcile stale/superseded/already-done work
-> build dependency DAG
-> claim all dependency-ready non-colliding lanes
-> launch isolated workers
-> collect handoffs/receipts
-> repair review/CI
-> converge dependency order
-> promote validated product candidate
-> verify mainline containment
-> update remote ledger
-> repeat until no EXECUTABLE work remains
\`

A loop iteration may end with BLOCKED work; it may not silently call blocked work complete.

## 12. Bounded sprints

### EH-PEX0 — Plan Execution Contract & Ledger

**Goal:** define the remote ownership/proof overlay, lane lease/CAS rules, handoff schema, task reconciliation dispositions, and mainline completion semantics.

**Owns**
- new \`contracts/repository-plan-execution.v1.json\`;
- \`Outputs/plan-executor/ledger.json\` schema/seed;
- handoff/receipt schemas;
- negative collision/stale-proof fixtures;
- validator/tests.

### EH-PEX1 — Plan Discovery & DAG Builder

**Dependencies:** EH-PEX0.

**Goal:** ingest canonical plans, generated task mirror, open PRs, and current provider refs into one deterministic dependency graph.

**Owns**
- plan/task parser;
- owner/collision resolver;
- accepted/superseded/already-proven classification;
- graph/queue tests.

### EH-PEX2 — Isolated Worktree/Branch Claimer

**Dependencies:** EH-PEX0, EH-PEX1.

**Goal:** allocate one writer per lane with preserved worktree state and remote ledger claim.

### EH-PEX3 — Context Rollover / Successor Handoff

**Dependencies:** EH-PEX0.

**Goal:** persist machine-readable lane handoff and allow a successor local-agent window to resume without operator shuttling.

### EH-PEX4 — Local Agent Adapter

**Dependencies:** EH-PEX0, EH-PEX2, EH-PEX3.

**Goal:** select/prove an actually installed local agent execution adapter and launch bounded lane prompts with return receipts.

### EH-PEX5 — PR Review/CI Convergence Loop

**Dependencies:** EH-PEX1.

**Goal:** make unresolved review/check repair a first-class queue instead of leaving stale open PRs blocking successors.

### EH-PEX6 — Mainline Completion Writer

**Dependencies:** EH-PEX0, repository promotion contract.

**Goal:** update remote execution state only after staging/mainline containment and required proof gates.

### EH-PEX7 — Full Repository Sweep Acceptance

**Dependencies:** EH-PEX1..EH-PEX6.

**Goal:** execute the loop over the real remaining plan set until every item is COMPLETE/SUPERSEDED/STALE/BLOCKED with evidence and no unclaimed dependency-ready work remains.

**Proof ceiling:** local/provider observed sweep only. It cannot claim an inaccessible external board changed unless that board is actually updated/read back.

## 13. First execution wave after implementation authorization

Priority repair/convergence before new product feature lanes:

1. repair/reconcile PR #27;
2. repair/reconcile PR #29 and its stacked #30/#31 repairs in dependency order;
3. repair PR #35 planning defects and pin its current floor;
4. converge the required owners to the refreshed integration floor;
5. execute EH-PEX0/EH-PEX1/EH-PEX3 in parallel where file ownership permits;
6. bootstrap/prove EH-PEX4;
7. let the executor take over the remaining repository graph.

The operator should not have to paste each sprint manually once EH-PEX4 is proven.
