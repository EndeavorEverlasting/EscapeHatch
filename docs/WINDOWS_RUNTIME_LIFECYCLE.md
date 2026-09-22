# EscapeHatch local Windows lifecycle

The visible launchers are deliberately thin. Process identity, receipts, locking, graceful shutdown, and destructive fallbacks all live in `scripts/windows/EscapeHatch-Runtime.ps1`.

## Everyday actions

- **Start / open:** double-click `Launch-EscapeHatch.cmd`.
- **Close:** double-click `Close-EscapeHatch.cmd`. Closing an already-stopped instance is a successful no-op.
- **Status:** double-click `Status-EscapeHatch.cmd`. It reports the lifecycle state without requiring you to inspect PowerShell jobs, Node PIDs, or Vite.
- **Restart (advanced):** run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\EscapeHatch-Runtime.ps1 -Action Restart`.

The PowerShell siblings are equivalent entry points for users who prefer PowerShell.

## What Status means

- `STOPPED` — no managed listener is present.
- `OWNED_HEALTHY` — runtime identity, receipt, process start time, repository fingerprint, and listening socket agree.
- `OWNED_ADOPTABLE` — the same checkout's healthy runtime is positively identified, but its secret-bearing receipt is missing or stale. Start reuses it; Close re-proves ownership before bounded termination because the old shutdown token is intentionally unrecoverable.
- `OWNED_UNHEALTHY` — the same checkout's Vite process owns the configured port but the managed control plane is not healthy. Recovery is allowed only after immediate ownership reproof.
- `FOREIGN_CONFLICT` — the port is occupied but EscapeHatch cannot prove it owns the process. Nothing is killed automatically.

A foreign conflict is a safety result, not an invitation to kill every Node process or every owner of port 21031.

## Local runtime data

Runtime state and bounded logs are user-local and untracked:

- receipt: `%LOCALAPPDATA%\EscapeHatch\runtime\<repoFingerprint>\runtime.json`
- logs: `%LOCALAPPDATA%\EscapeHatch\logs\<repoFingerprint>\`

The receipt contains the per-instance shutdown token. Do not copy it into tickets, chat, screenshots, repository files, or logs.

## Optional configuration

- `PORT` defaults to `21031`.
- `BASE_PATH` defaults to `/`.
- `ESCAPEHATCH_NO_BROWSER=1` suppresses automatic browser opening for automation/tests.
- `ESCAPEHATCH_START_TIMEOUT_SECONDS` and `ESCAPEHATCH_STOP_TIMEOUT_SECONDS` adjust bounded lifecycle waits.

The browser application never receives the shutdown token. There is intentionally no web-page Quit button in this lifecycle version.

## Troubleshooting

If Start or Close reports `FOREIGN_CONFLICT`, use `Status-EscapeHatch.cmd` and inspect the reported process information. The lifecycle manager will not terminate an unproven listener. Do not use broad commands such as `taskkill /IM node.exe` or `Get-Process node | Stop-Process`.

If Vite dependencies are missing, install the artifact dependencies under `artifacts\escape-hatch` before retrying the launcher. Lifecycle validation in CI uses the same managed runtime path and permanently checks that a foreign listener survives untouched.
