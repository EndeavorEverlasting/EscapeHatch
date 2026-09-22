# EscapeHatch Windows Runtime Lifecycle Plan

Status: TRACKED PLAN — EH-R0 contract floor implemented; EH-R1/R2 implementation not started.

Canonical planning owner for this work: `docs/WINDOWS_RUNTIME_LIFECYCLE_PLAN.md`.

## Evidence floor

- Provider repository: `EndeavorEverlasting/EscapeHatch`.
- Provider default branch: `main@0824535b9dc1341def885a79a098d297df770ac8`.
- Current prepared integration owner: `integration/replit-donor-b01f628-20260921` after local launcher convergence (includes exact launcher commit content formerly at `5effcd293bdf4ded725a4ca28908b8b986b359ec` plus the overnight spaces/node-shim fix).
- Operator-local launcher implementation was recovered onto the integration floor via cherry-pick convergence; EH-R2 no longer waits on a provider-resolvable `5effcd2` object.
- EH-R0 owns `contracts/local-runtime-lifecycle.v1.json`, `fixtures/local-runtime-lifecycle.v1.example.json`, and `scripts/validate_local_runtime_lifecycle.py`.
- The prepared provider branch contains the donor web cockpit and the original root workspace package contract that the local launcher commit modifies.
- Current `artifacts/escape-hatch/vite.config.ts` binds Vite to an explicit host/port with `strictPort: true`, but it has no runtime identity, control-plane health response, or graceful shutdown API (EH-R1 not started).
- Existing repository governance requires product/runtime behavior to live in application/scripts/contracts rather than prompt-only workflow.
- Prior launcher/distribution planning defined EH-L2 as install-like Windows start/reuse/stop behavior with health diagnostics.
- New operator runtime evidence shows manual stale-port cleanup and PowerShell job creation during recovery. That is sufficient to treat “find an existing instance / recover stale listeners / stop cleanly” as a first-class runtime-lifecycle problem rather than another one-off port-kill snippet.

## Problem statement

The launcher currently has to infer instance state from a loopback port and process observations. Port occupancy alone is not a safe identity signal:

- an old EscapeHatch process may still own port 21031;
- a stale runtime receipt may point at a PID that was reused;
- an unrelated process may own port 21031;
- a healthy EscapeHatch instance may exist even when the launching shell has no PowerShell Job object for it;
- a PowerShell background Job is scoped to a shell session and is not a durable cross-launcher ownership mechanism;
- blindly killing the port owner risks terminating an unrelated process.

The lifecycle design must therefore make process identity explicit and make start/stop/restart idempotent.

## Non-negotiable lifecycle rules

1. **Port occupancy is evidence, not identity.**
2. **Never kill an unknown listener merely because it owns port 21031.**
3. **A process may be terminated automatically only after current ownership is positively re-proven.**
4. **PowerShell Job identity is not canonical runtime identity.** The runtime must survive launcher-shell exit and remain discoverable from a new shell.
5. **Start, stop, status, and restart share one canonical implementation.** CMD/PowerShell user surfaces are thin adapters.
6. **Graceful shutdown is preferred.** Forced process-tree termination is a bounded fallback for a process that is still positively proven to be owned.
7. **Runtime receipts and shutdown secrets are user-local runtime data and must never be committed.**
8. **A browser page must not receive the shutdown secret.** Initial close UX is a Windows launcher/shortcut, not a web “Quit” button.
9. **Startup and shutdown operations are serialized per repository identity** to prevent racing double-starts and start/stop collisions.
10. **Every destructive decision rechecks authoritative process state immediately before acting** to defend against PID reuse and stale observations.

## Canonical runtime identity model

### Repository fingerprint

Compute a stable per-checkout fingerprint from the normalized canonical repository root. Windows path comparison must be case-insensitive before hashing. The raw path need not be exposed by HTTP.

Suggested identity:

`repoFingerprint = SHA256(lowercase(normalized absolute repo root))`

The fingerprint differentiates two EscapeHatch checkouts that happen to use the same default port.

### Per-instance identity

Every fresh start creates:

- cryptographically random `instanceId`;
- cryptographically random shutdown token;
- process PID;
- OS-observed process start time;
- repository fingerprint;
- port and host;
- runtime protocol version;
- UTC start timestamp.

### Runtime state

Preferred state root:

`%LOCALAPPDATA%\EscapeHatch\runtime\<repoFingerprint>\runtime.json`

Suggested receipt fields:

- `schema`: `escapehatch-local-runtime/v1`
- `instanceId`
- `repoFingerprint`
- `pid`
- `processStartTimeUtc`
- `host`
- `port`
- `runtimeProtocol`
- `shutdownToken`
- `startedAtUtc`

The file is written atomically only after a runtime process has been spawned. Tokens and local paths must not appear in repository logs, CI output, or tracked fixtures.

### Lifecycle serialization

Use one per-repository named mutex or equivalent exclusive local lock keyed by `repoFingerprint`, for example:

`Local\EscapeHatch.Runtime.<repoFingerprint>`

Start/stop/restart/status acquire the same lifecycle lock before making state-changing decisions. Status may use a bounded read path if the implementation can prove it does not race mutations; otherwise it uses the same lock.

## Local control plane

The Vite runtime gains a minimal development-server control plane owned by product runtime code rather than PowerShell heuristics.

### GET /__escapehatch/runtime

Returns JSON sufficient to establish runtime identity without leaking the local repository path or shutdown secret:

- `app: "EscapeHatch"`
- `protocol: 1`
- `instanceId`
- `repoFingerprint`
- `pid`
- `startedAtUtc`

No permissive CORS headers are added.

### POST /__escapehatch/shutdown

Requirements:

- loopback request only;
- matching runtime protocol;
- matching `instanceId`;
- a random per-instance shutdown token supplied in a custom request header;
- no token value in logs or response bodies;
- respond before initiating shutdown;
- close the Vite server cleanly, then exit the process;
- if graceful close hangs, the Windows lifecycle manager owns bounded escalation.

The launcher passes `instanceId`, `repoFingerprint`, and the shutdown token to the child process through environment variables. They are not embedded in the web application bundle.

## Ownership classification state machine

Every start/stop operation classifies current state before action.

### A. No listener, no live receipt

State: `STOPPED`.

- remove stale receipt if one exists and its process identity is no longer valid;
- Start may launch;
- Stop succeeds idempotently as “already stopped”.

### B. Healthy runtime + matching receipt

State: `OWNED_HEALTHY`.

Required agreement:

- receipt instanceId == health instanceId;
- receipt repoFingerprint == health repoFingerprint == current repo fingerprint;
- receipt PID == health PID;
- OS process PID exists;
- OS process start time matches the receipt.

Start: reuse and open browser.
Stop: authenticated graceful shutdown.
Restart: graceful stop then cold start.

### C. Healthy EscapeHatch runtime but missing/stale receipt

State: `OWNED_ADOPTABLE` only when:

- runtime endpoint identifies EscapeHatch protocol;
- repo fingerprint matches current checkout;
- reported PID owns the configured listening socket;
- OS command line is consistent with the current EscapeHatch Vite runtime.

Reconstruct the local receipt from authoritative observations and continue. Do not kill/restart merely because the receipt was lost.

### D. Listener is an owned but unhealthy/orphaned EscapeHatch process

State: `OWNED_UNHEALTHY`.

Positive ownership requires more than port number:

- socket owner PID;
- current process start time;
- command line resolves to Node running the EscapeHatch Vite entrypoint under the same repository root or another equally strong repository-native identity signal.

Start/Restart may terminate this process only after re-verifying the same ownership immediately before kill, then prove the port is free and cold-start.
Stop may terminate it with the same safeguards.

### E. Port 21031 owned by an unrelated or unproven process

State: `FOREIGN_CONFLICT`.

Behavior:

- do not kill;
- show PID/process name when safely available;
- explain that port 21031 is occupied by a process EscapeHatch cannot prove it owns;
- exit nonzero;
- provide a diagnostic/status command rather than an automatic destructive action.

### F. Receipt points to a reused PID or mismatched process

State: `STALE_RECEIPT`.

Behavior:

- never act on the PID from the receipt;
- remove/replace the stale receipt only after proving it does not identify the current EscapeHatch runtime;
- return to listener classification.

## Canonical Windows lifecycle implementation

Target shape after the contract sprint:

- `scripts/windows/EscapeHatch-Runtime.ps1` — canonical lifecycle manager.
- Actions: `Start`, `Stop`, `Restart`, `Status`.
- Existing `Launch-EscapeHatch.ps1` delegates to `Start`.
- Existing `Launch-EscapeHatch.cmd` remains a thin adapter.
- Add `Close-EscapeHatch.ps1` and `Close-EscapeHatch.cmd` as friendly thin adapters to `Stop`.
- Optional `Restart-EscapeHatch.cmd` is allowed only if observed operator use justifies another visible shortcut; the canonical PowerShell action exists regardless.
- Do not use `Start-Job` as the ownership mechanism.
- Start the Node/Vite runtime as an OS process and capture the real PID.
- Redirect bounded stdout/stderr logs under:
  `%LOCALAPPDATA%\EscapeHatch\logs\<repoFingerprint>\`
- On startup failure, report the useful tail of the current launcher/runtime log without exposing secrets.

## Start algorithm

1. Resolve repository root and expected Vite entrypoint.
2. Compute repository fingerprint.
3. Acquire lifecycle lock.
4. Read runtime receipt if present.
5. Probe `GET /__escapehatch/runtime`.
6. Resolve port owner when a listener exists.
7. Classify state using the ownership state machine.
8. If `OWNED_HEALTHY`, reuse it and open the browser.
9. If `OWNED_ADOPTABLE`, rebuild the receipt, then reuse it.
10. If `OWNED_UNHEALTHY`, re-prove ownership, stop it safely, and prove the port is free.
11. If `FOREIGN_CONFLICT`, fail closed without killing anything.
12. Generate instanceId/token and spawn Node/Vite directly.
13. Persist receipt atomically with PID/start-time identity.
14. Poll the runtime identity endpoint, not merely HTTP 200.
15. Require returned instanceId/PID/fingerprint to match the receipt.
16. On success, open the browser and release the lock.
17. On timeout/early process exit, gather diagnostics, terminate only the positively owned child if still present, clean the receipt, and fail nonzero.

## Stop algorithm

1. Resolve repository root/fingerprint and acquire lifecycle lock.
2. Read receipt and probe runtime identity.
3. Classify state.
4. `STOPPED`: clean stale receipt and return success.
5. `OWNED_HEALTHY`: POST authenticated shutdown.
6. Wait a bounded interval for the exact PID to exit and port 21031 to become free.
7. If graceful shutdown times out, re-check PID start time, command line, repo fingerprint/instance identity, and socket ownership.
8. Only if ownership still matches, stop the exact process; use process-tree force only as the final bounded fallback.
9. Verify the port is free or no longer owned by EscapeHatch.
10. Remove receipt and report success.
11. `OWNED_ADOPTABLE`: adopt receipt, then follow graceful shutdown.
12. `OWNED_UNHEALTHY`: use the ownership-proven fallback path.
13. `FOREIGN_CONFLICT`: leave the listener untouched and return a conflict diagnosis.

## Sprint dependency graph

`EH-R0 -> { EH-R1 || EH-R2 } -> { EH-R3 || EH-R4 } -> EH-R5`

Graph width is 1 at the contract floor, 2 in Wave 1, 2 in Wave 2, then 1 at convergence.

### EH-R0 — Runtime lifecycle contract and ownership fixtures

Primary surface: floor / integration contract / validation.

Goal: make runtime identity, state classification, kill policy, control protocol, and local-state privacy deterministic before implementation.

Likely owned files:

- `contracts/local-runtime-lifecycle.v1.json`
- `fixtures/local-runtime-lifecycle.v1.example.json`
- `scripts/validate_local_runtime_lifecycle.py`
- canonical artifact/harness registries and maps required by repository convention
- focused negative/positive fixtures

Required negative fixtures:

- foreign process on 21031 must never be killable;
- receipt PID reused by another process;
- mismatched instanceId;
- mismatched repo fingerprint;
- stale receipt with no process.

Required positive fixtures:

- matching healthy runtime;
- adoptable same-repo runtime without receipt;
- owned unhealthy same-repo Vite process.

Proof ceiling: repository contract/validator proof; no Windows runtime claim.

### EH-R1 — Vite runtime identity and graceful shutdown control plane

Primary surface: conventional application/runtime logic.

Depends on: EH-R0.

Likely owned files:

- `artifacts/escape-hatch/vite.config.ts`
- a small cohesive runtime-control module under `artifacts/escape-hatch/`
- focused runtime-control tests

Mission:

- expose the versioned identity endpoint;
- implement token-authenticated graceful shutdown;
- keep the secret out of the browser bundle/logs;
- bind to loopback only;
- preserve existing build/dev behavior.

Forbidden:

- Windows launcher implementation;
- career/application domain behavior;
- browser-assist semantics.

Proof ceiling: Node/Vite tests and loopback integration proof; not Windows lifecycle proof.

### EH-R2 — Windows lifecycle manager

Primary surface: launcher / process adapter.

Depends on: EH-R0 and exact availability of the local launcher commit `5effcd2` on the execution floor.

Likely owned files:

- `scripts/windows/EscapeHatch-Runtime.ps1`
- refactor of `Launch-EscapeHatch.ps1` to delegate to the manager
- launcher-specific helpers only when cohesion requires them

Mission:

- implement lock/receipt/state classification;
- start/reuse/adopt/stop/restart/status;
- no PowerShell Job ownership;
- fail closed on foreign port conflicts;
- atomic runtime receipt and bounded logs.

Forbidden:

- Vite endpoint implementation owned by EH-R1;
- UI/domain changes;
- “kill all listeners on 21031” behavior.

Proof ceiling: PowerShell-focused tests with synthetic process/listener cases; graceful endpoint integration waits for EH-R1 convergence.

### EH-R3 — Windows lifecycle regression and fault-injection floor

Primary surface: validation.

Depends on: EH-R1 + EH-R2.

Likely owned files:

- dedicated Windows lifecycle test script(s);
- Windows CI job/workflow wiring;
- negative/fault fixtures that do not require secrets or private data.

Required cases:

1. cold start creates one healthy instance;
2. second start reuses the same instance/PID;
3. concurrent starts converge to one instance;
4. graceful stop frees port 21031;
5. second stop is an idempotent success;
6. stale receipt with no process self-heals;
7. same-repo healthy orphan is adopted;
8. same-repo unhealthy Vite process is recovered;
9. unrelated 21031 listener survives untouched while launcher fails clearly;
10. reused/mismatched PID is never killed;
11. forced child crash is recoverable on next start;
12. startup timeout cleans only its own failed process/receipt;
13. restart yields a new instanceId and no stale listener;
14. secrets never appear in logs/HTTP response.

Proof ceiling: Windows CI/runtime integration proof on hosted runner; not operator workstation acceptance.

### EH-R4 — Friendly close/status UX and runbook

Primary surface: user-facing launcher adapters / docs.

Depends on: EH-R2 contract shape; may proceed in parallel with EH-R3 after EH-R1/R2 rejoin.

Likely owned files:

- `Close-EscapeHatch.ps1`
- `Close-EscapeHatch.cmd`
- concise launcher help/runbook
- optional status display formatting

Mission:

- one user action cleanly closes the owned local runtime;
- “already stopped” is success, not an error;
- foreign-port conflicts are explicit and non-destructive;
- status explains stopped / healthy / unhealthy-owned / foreign-conflict without requiring the user to inspect jobs, PIDs, or Vite.

Initial UX deliberately excludes a web-page Quit button because the browser page must not receive the shutdown capability secret.

Proof ceiling: adapter invocation and user-facing output proof; does not substitute for EH-R3 process safety tests.

### EH-R5 — Convergence, workstation acceptance, and release classification

Primary surface: integration / runtime proof / release hygiene.

Depends on: EH-R3 + EH-R4.

Tasks:

- re-fetch/reconcile the current default branch and exact launcher integration floor;
- integrate R1-R4 in dependency order;
- rerun contract validator, Windows lifecycle tests, Vite build/typecheck, harness validation, and patch hygiene;
- run observed operator-workstation acceptance:
  - start from stopped;
  - launch again while healthy;
  - close;
  - close again;
  - launch after close;
  - simulate/recover one owned stale instance;
  - prove a foreign listener is not killed;
- classify release bump under `contracts/product-release.v1.json`:
  - `minor` if explicit Close/Status/Restart capability ships as new user-visible functionality;
  - `patch` only if the accepted scope is restricted to correcting existing launcher lifecycle behavior without adding a new user-visible capability;
- integrate through the repository promotion contract only after exact-head validation.

Proof ceiling: integrated default-branch repository proof plus observed Windows workstation lifecycle acceptance; no installer/store-distribution claim unless separately executed.

## Parallel ownership and collision map

Wave 0 is serial because the lifecycle contract owns the protocol consumed by both implementation lanes.

After EH-R0:

- EH-R1 owns Vite/runtime-control files.
- EH-R2 owns Windows lifecycle-manager files.
- They may execute in parallel because they consume the same pinned contract and have no intended shared writes.
- Shared contract/schema/registry files remain frozen under EH-R0 ownership during that wave.

After R1/R2 converge:

- EH-R3 owns tests/CI validation wiring.
- EH-R4 owns thin Close/Status adapters and user documentation.
- They may execute in parallel if workflow/docs collision review confirms no shared writer. If both need the same workflow or runbook path, that file is serialized under EH-R3 or convergence ownership.

EH-R5 is the single convergence owner.

## Agent-harness factoring

- Existing `skills/harness-operations/SKILL.md`: KEEP.
- Existing application-form mapping skill: KEEP unchanged; unrelated.
- New runtime skill: DO NOT CREATE by default. Start/stop/recovery is deterministic product/tool behavior and belongs in scripts/contracts/tests.
- New agent capability: DO NOT CREATE unless the refreshed local harness contains a real canonical capability registry. The repository script itself is the reusable capability.
- Trigger: path-based CI for lifecycle contract/PowerShell/runtime-control changes is appropriate after implementation; prompt-only triggers are not.
- Hook: do not place live start/stop/network checks in pre-commit or pre-push hooks; existing harness explicitly forbids runtime/network launch from hooks.
- Provider CI is an execution adapter, not the semantic owner of lifecycle behavior.

## Safety and privacy

- Runtime token and local receipt are never tracked.
- CI fixtures use synthetic tokens/paths.
- No broad process-name kill such as `taskkill /IM node.exe`.
- No unconditional port-owner kill.
- Forced process-tree termination requires positive same-instance ownership immediately before action.
- Do not expose local filesystem paths or shutdown tokens from the HTTP control plane.
- Do not add permissive CORS to the control endpoints.
- No user career/profile/application data belongs in runtime logs.

## Validation order for implementation

1. lifecycle contract validator and negative fixtures;
2. runtime-control unit/integration tests;
3. PowerShell lifecycle unit/synthetic tests;
4. Windows fault-injection/runtime suite;
5. Vite typecheck/build;
6. repository harness validators;
7. `git diff --check` and staged/exact-candidate hygiene;
8. observed Windows workstation acceptance;
9. promotion/default-branch containment proof.

## Acceptance checklist

The whole lifecycle outcome is not complete until all are proven:

- Start from cold is one action.
- Repeated Start reuses a verified healthy instance.
- The launcher can rediscover the same instance from a new shell.
- No PowerShell Job object is needed for identity.
- Close is one action.
- Close is graceful when the runtime is healthy.
- Close is idempotent.
- Restart leaves exactly one healthy instance.
- Lost/stale receipt self-heals.
- Same-repo owned orphan recovery is bounded and safe.
- Unrelated port-21031 processes are never killed.
- PID reuse cannot authorize termination.
- Start/stop races are serialized.
- Runtime tokens do not leak.
- Port 21031 is free after successful stop.
- CI preserves the negative foreign-listener case permanently.
- Workstation acceptance observes start → reuse → close → restart behavior.

## Deferred / explicitly not part of this lifecycle plan

- Chrome/Firefox/DuckDuckGo packaging.
- Microsoft Store packaging.
- Native tray application.
- Automatic shutdown merely because the browser tab/window closes.
- Web-page Quit button.
- Automatic selection of another port when 21031 is occupied by a foreign process. Stable loopback origin remains valuable; changing it requires a separate storage/origin compatibility decision.
- Cross-machine/runtime service management.

## Dispatch durability

The generic prompt requests `harness/contracts/prompt-parallel-dispatch.v1.json` and `scripts/prompt_parallel_dispatch.py`, but neither exists on the refreshed provider integration branch. Therefore executable dispatch validation is currently unavailable on this provider floor.

A blocked transport payload for the above dependency graph is tracked at:

`Outputs/prompt-parallel-dispatch/manifest.blocked.json`

Do not rename it to `manifest.json` or claim dispatch proof until the canonical schema/runner is recovered from the actual execution floor or deliberately introduced by its harness owner.

## First executable transition

DONE on the convergence floor: the exact local launcher commit content (`5effcd293bdf4ded725a4ca28908b8b986b359ec`) plus the overnight spaces/node-shim fix were cherry-picked onto `integration/replit-donor-b01f628-20260921`, and EH-R0 (`contracts/local-runtime-lifecycle.v1.json`, `fixtures/local-runtime-lifecycle.v1.example.json`, `scripts/validate_local_runtime_lifecycle.py`) was executed against that refreshed exact head. EH-R2 must not reconstruct the launcher from chat prose.

Next unproven lanes: EH-R1 (Vite identity + graceful shutdown) and, after EH-R0 acceptance, EH-R2 (Windows lifecycle manager) may proceed in parallel per the dependency graph.
