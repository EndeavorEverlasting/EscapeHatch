# EscapeHatch Convergence Control Plan — 2026-09-27

**Status:** ACTIVE CONVERGENCE CONTROL  
**Canonical integration branch:** `integration/replit-donor-b01f628-20260921`  
**Fresh provider tip at plan creation:** `e83f3a231acd0f748bd70792c906d30f3578d842`  
**Provider default branch at plan creation:** `main@0824535b9dc1341def885a79a098d297df770ac8`  
**Operator-reported primary local path:** `C:\Users\pa_rperez26\OneDrive - Northwell Health\OG Laptop Backup\Desktop\dev\EscapeHatch\`  
**Local truth:** NOT provider-verifiable; refresh before every local write  
**Purpose:** turn parallel agent/lane output into one operator-usable product state and one dependency-aware continuation map.

## 1. Why this plan exists

EscapeHatch now has multiple successful sprints whose terminal reports used different floors, different lane names, different proof ceilings, and different notions of "next." That created the appearance of four incompatible products even though the provider shows one sequential integration spine.

The coordination defect is not merely "too many branches." It is:

> lane-local completion reports were allowed to masquerade as program-level truth.

This plan installs a coordinator model:

```text
lane result
  -> provider refresh
  -> containment / merge verification
  -> contract-state classification
  -> collision/dependency reconciliation
  -> one convergence matrix
  -> operator-facing judgment
```

A lane report is evidence to reconcile, not the final program status.

## 2. Fresh provider truth

At plan creation, the current merged integration sequence is:

```text
PR #46  design(comp-qmem): COMP/QMEM executable seams
  head 54e31a261a409a30663c27754d22a9b8fcaa7dee
       ↓
integration 1fa7406e21e092f60495b7296df401f541f7c097
       ↓
PR #47  default autofill + compact popup + Windows exe installer
  head 735c81bf87c3a2a62ec82d3962be1e17c9071f84
       ↓
integration 200389612008ee89eddc24206631cb4b0cce644c
       ↓
PR #48  P04 COMP0 / proof-loop factoring
  head 7ce11208b45335a992e8d5a8042f8032964cae9c
       ↓
integration c4bd3b2be8475dcae03b853c0dbe01401a592b5b
       ↓
PR #49  P01 application-packet recommendation readiness
  head fa8f903891aee0837bf37f23f9989d38cecf9329
       ↓
CURRENT integration e83f3a231acd0f748bd70792c906d30f3578d842
```

### Historical / unresolved siblings

- PR #45: planning-only predecessor for the P95 popup/autofill/installer work. Closed unmerged after #47 delivered the implementation. **HISTORICAL / SUPERSEDED**.
- PR #29: recovery owner for Application Assist/A6 reconciliation. **OPEN**.
- PR #30 and #31: child recovery/proof guard lanes based on the recovery stack. **OPEN**.
- `main`: still materially behind integration. Promotion is a separate program gate and must not be inferred from integration state.

## 3. Program status matrix

| Program slice | Strongest state | Evidence | What it does **not** prove | Exact next transition |
| --- | --- | --- | --- | --- |
| P95-A default autofill | ✅ INTEGRATED | PR #47 inside current integration spine | zero-click/background fill across page lifecycle | local live acceptance; then Ambient Assist successor |
| P95-U action popup | ✅ INTEGRATED | PR #47 | actual Chrome/Edge popup appearance on workstation | local live popup observation |
| P95-R installer / exe | ✅ INTEGRATED | PR #47 | actual operator double-click install on workstation | local install acceptance |
| COMP/QMEM architecture | ✅ DESIGNED / PROTOTYPED | PR #46 + `docs/EH_COMP_QMEM_PROGRAM_DESIGN.md` | production COMP0/QMEM0 contracts | build EH-COMP0 |
| P04 COMP0 execution map | ✅ TRACKED / INTEGRATED | PR #48 + `docs/plans/EH_COMP0_PROOF_LOOP_P04_2026-09-27.md` | COMP0 implementation | local EH-COMP0 writer |
| P01 application packet readiness | ✅ INTEGRATED | PR #49 | live provider artifact generation on every ATS | consume harness during application work |
| Recovery stack #29/#30/#31 | ⏳ OPEN / SEPARATELY OWNED | provider PR state | integration | reconcile before QMEM1 / runtime lanes that touch their owners |
| Terminal closeout governance | ⚠️ MISSING at floor | `AGENTS.md` lacks outcome-first terminal hierarchy | consistent future reporting | add governance rule in this control PR |
| Ambient Application Assist | 🔵 DESIGNED IN SUCCESSOR PLAN | `docs/AMBIENT_APPLICATION_ASSIST_PLAN.md` | implementation | AA0 prototype/contract after baseline gates |
| Provider `main` promotion | ⚪ NOT DONE | `main@0824535b...` | production/mainline convergence | separate promotion decision after integration program is ready |

## 4. Runtime partition — who can do what

### 4.1 REMOTE / current ChatGPT + connected-provider runtime

This runtime owns work that can be proven from GitHub/provider truth without pretending to control the operator workstation.

**Authorized / appropriate here:**
- refresh branches, PRs, commits, CI and provider containment;
- reconcile lane outputs against the current integration floor;
- write/update canonical plans, contracts, governance, maps, and handoffs;
- open/review/merge repository PRs when gates are satisfied;
- classify states as DESIGNED / IMPLEMENTED / VALIDATED / INTEGRATED / BLOCKED / REQUIRED SUCCESSOR;
- keep the convergence matrix current;
- review local-agent PRs after they are pushed;
- route collisions before creating another writer.

**Not provable here:**
- dirty/untracked local checkout state;
- Windows file locks / OneDrive behavior;
- double-click installer experience;
- actual `EscapeHatch.exe` workstation launch;
- live Chrome/Edge popup geometry;
- local browser extension permissions;
- unpushed Cursor worktrees;
- physical/operator acceptance.

### 4.2 LOCAL / Cursor + Windows workstation runtime

The operator-supplied workspace root is:

`C:\Users\pa_rperez26\OneDrive - Northwell Health\OG Laptop Backup\Desktop\dev\EscapeHatch\`

Local agents own work requiring filesystem, Windows, browser, process, or unpushed Git state.

**Local requirements:**
- refresh remote refs before any write;
- never force-reset the operator's dirty/default checkout merely to become current;
- inspect existing worktrees/branches before creating another;
- use isolated worktrees for new mutating lanes;
- perform Windows installer/live browser proof;
- implement product code that requires the local toolchain;
- push bounded commits/PRs back to GitHub for remote reconciliation.

**Provider truth never proves local cleanliness. Local anecdotes never prove remote integration.**

### 4.3 CI / hosted runner

CI owns exact-candidate static/build/test proof when workflows are available.

CI does not prove:
- Windows interaction not represented by the runner;
- Chrome/Edge unpacked-extension UX unless explicitly exercised;
- operator acceptance;
- local OneDrive/file-lock behavior.

### 4.4 OPERATOR / physical acceptance

The operator owns:
- final application submission / attestations;
- workstation double-click acceptance;
- actual popup usability judgment;
- explicit preference/permission decisions that the product cannot infer safely.

## 5. Immediate execution order

### Parallel Group A — safe now

#### A1. LOCAL LIVE PROOF — P95 acceptance

**Owner:** local Windows/operator lane  
**Mutation:** none required unless proof exposes a defect  
**Dependency:** current integration contains PR #47  
**Goal:** close the two remaining P95 live gates.

Proof:
1. install from an isolated checkout/worktree of refreshed integration;
2. verify the installed `EscapeHatch.exe` path and lifecycle;
3. load the installed/current extension in Chrome or Edge;
4. verify desktop action popup is compact and not semantically classified as phone;
5. verify default autofill setting is ON, opt-out persists, manual Fill remains available.

If a live defect appears, open a new bounded repair lane. Do not rewrite history or re-open the old lane narrative.

#### A2. LOCAL MUTATION — EH-COMP0

**Owner:** one isolated local writer  
**Dependency:** current integration contains #46/#47/#48/#49  
**Canonical plan:** `docs/plans/EH_COMP0_PROOF_LOOP_P04_2026-09-27.md`  
**Goal:** production compensation provenance + taxonomy semantics + compensation-specific precedence + focused validation.

This is the **next ready product mutation** in the COMP/QMEM subgraph.

Do not start QMEM0 simultaneously because COMP0 and QMEM0 share taxonomy/preference owners.

### Parallel Group B — remote coordination

#### B1. REMOTE — Convergence coordinator

**Owner:** connected-provider coordinator  
**Goal:** review A1/A2 outputs after push/evidence; update this matrix from provider truth; integrate only exact green heads.

#### B2. REMOTE — Ambient Application Assist design floor

**Owner:** this plan / `docs/AMBIENT_APPLICATION_ASSIST_PLAN.md`  
**Goal:** preserve the zero-click successor architecture and prevent accidental implementation as a DOM-polling cron loop.

Broad implementation waits for the AA0 prototype gate defined in that plan.

## 6. Waiting lanes

### EH-COMP1

Waits for EH-COMP0 integration.

Owns runtime compensation field matching / Fill Plan integration.

### EH-QMEM0

Waits for EH-COMP0 because the two share taxonomy/preference owners.

### EH-QMEM1

Waits for:
- EH-QMEM0; and
- explicit reconciliation of the open PR #29 recovery owner.

### Ambient AA implementation

Contract/prototype design can proceed without mutating shared product files.

Broad implementation must first:
- preserve the P95 live baseline;
- choose a browser/runtime bridge and permission model through executable evidence;
- avoid colliding with COMP0 shared career-state/taxonomy mutations.

### `main` promotion

Not part of an individual feature lane.

Promotion should happen only after the program coordinator decides the integration branch has reached the intended release floor and runs the repository-owned promotion gates.

## 7. Ambient successor relationship

PR #47 delivered:

`user opens popup -> Start Assist -> automatic canonical Fill Plan`

The successor requirement is stronger:

`user opens eligible application page -> EscapeHatch already has current profile -> safe fields fill without opening popup`

That successor is owned by:

`docs/AMBIENT_APPLICATION_ASSIST_PLAN.md`

The old P95 plan remains historical design evidence. Do not relabel #47 as having implemented background/zero-click lifecycle behavior.

## 8. Convergence coordinator protocol

After any lane reports completion:

1. **REFRESH**
   - fetch current provider branch/PR state;
   - resolve current integration tip.
2. **LOCATE**
   - identify exact lane commit/PR;
   - distinguish local-only, pushed, open PR, merged, and contained states.
3. **CLASSIFY**
   - DESIGNED / TRACKED / IMPLEMENTED / VALIDATED / INTEGRATED / DEPLOYED / OBSERVED.
4. **RECONCILE**
   - check shared files/contracts/workflows;
   - check dependencies and blockers;
   - check whether another lane superseded the reported result.
5. **UPDATE ONE MATRIX**
   - update this plan/current-state owner rather than emitting another isolated status narrative.
6. **NAME ONE NEXT TRANSITION**
   - distinguish product mutation, live proof, provider integration, and operator action.

A lane's "success" notification does not skip steps 1–5.

## 9. Terminal reporting contract

The operator-facing terminal closeout for a serious sprint must use this order:

### CHANGED
Durable behavior, contracts, files, or product surfaces that changed.

### PROVED
Only tests/validators/builds/live observations that actually ran, plus commit/PR identity.

### UNPROVEN
Required evidence that remains outside the proof ceiling.

### INTEGRATED SHA
Exact merge/integration identity and whether the current integration tip contains it.

### NEXT LIVE GATE
The single first executable transition that advances the program.

Transient lane probes, retry spam, OneDrive locks, intermediary harness failures, "workers are still running," and similar journey noise belong in the terminal report **only if they survive as unresolved blockers or materially change risk**.

## 10. Local recovery / preflight command

Run this before either local lane writes anything:

```powershell
$repo = "C:\Users\pa_rperez26\OneDrive - Northwell Health\OG Laptop Backup\Desktop\dev\EscapeHatch"
git -C $repo fetch --all --prune --tags
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git -C $repo status --short --branch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git -C $repo worktree list
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git -C $repo log --oneline --decorate -12 upstream/integration/replit-donor-b01f628-20260921
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git -C $repo merge-base --is-ancestor e83f3a231acd0f748bd70792c906d30f3578d842 upstream/integration/replit-donor-b01f628-20260921
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

If the operator checkout is dirty or on stale `main`, preserve it. Create isolated worktrees from the refreshed integration branch instead of cleaning/resetting the existing workspace.

## 11. Recommended local worktrees

After the preflight proves the current integration floor and no branch collision:

### P95 live acceptance worktree

```powershell
$root = Split-Path -Parent $repo
git -C $repo worktree add "$root\EscapeHatch-live-acceptance" upstream/integration/replit-donor-b01f628-20260921
```

Use this as a disposable proof checkout only; do not turn it into a mutation lane unless a live defect is found.

### COMP0 writer

Create a new uniquely named feature branch from the refreshed integration branch after checking no current branch already owns COMP0.

The existing P04 plan remains the mutation specification; this convergence plan does not duplicate its file-level implementation contract.

## 12. What the coordinator should tell the operator

Do not report:

> three lanes ran, one probe failed, one lock occurred, another agent is waiting...

Report:

> PR #47 is integrated; live installer/browser acceptance is still open. PR #48 made COMP0 the next mutation; COMP0 is not built yet. PR #49 is integrated. The current integration floor is e83f3a2. Two safe local actions can proceed in parallel: P95 live acceptance and one COMP0 writer. Ambient zero-click autofill is a successor program with its own bridge/permission gate.

That is the program judgment.

## 13. Closeout of this control-plan pass

**CHANGED:** one convergence owner now reconciles #46/#47/#48/#49, recovery PRs, local proof, COMP0, and Ambient Assist.  
**PROVED:** provider integration tip and PR states were refreshed before authoring this plan.  
**UNPROVEN:** local dirty-tree state, live Windows/browser gates, COMP0 implementation, ambient implementation, and main promotion.  
**INTEGRATED SHA:** this plan is not integrated until its own PR lands; after merge, replace this sentence in provider truth by containment evidence rather than hand-editing historical facts.  
**NEXT LIVE GATE:** local preflight above, followed by parallel P95 live acceptance + one EH-COMP0 writer.
