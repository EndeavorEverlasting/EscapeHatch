# Career Browser PID Selection

Canonical owner for binding the EscapeHatch managed career Chrome process that already holds application progress.

## Why

Agents were opening extra browsers and losing the in-progress managed session because EscapeHatch had Node/Vite PID ownership on `:21031` but no Chrome attach selector. BlacksmithGuild already had the right foundation: snapshot before open, diff after open, freeze the chosen PID/hwnd. EscapeHatch needed the extra case BlacksmithGuild only partially covers: **the window was already open before the agent started**.

Private/incognito sessions hold the least saved identity. Prefer signed-in persistent Chrome/Edge profiles when both are eligible. If progress already lives in a private session (for example Broadcastwell started there), attach that window instead of relaunching.

## Modes

| Action | When to use |
|--------|-------------|
| `CaptureBaseline` | Immediately before *you* open/launch Chrome |
| `SelectAfterLaunch` | After that open; prefers `S2 - S1` new PIDs |
| `AttachExisting` / `AttachOnly` | Window already running with progress; **no launch-delta available** |
| `LocateProgress` | Answer which window holds an in-progress application for a host hint |
| `Status` | Inspect candidates without mutating |
| `BindReceipt` | Re-prove a saved receipt against the live process |

## Invocation

```powershell
pwsh -File scripts/windows/EscapeHatch-CareerBrowser.ps1 -Action LocateProgress -TargetHostHint broadcastwell.com
pwsh -File scripts/windows/EscapeHatch-CareerBrowser.ps1 -Action AttachExisting -ExpectedAssistOriginPort 21031 -TargetHostHint broadcastwell.com
pwsh -File scripts/windows/EscapeHatch-CareerBrowser.ps1 -Action Status -Json
pwsh -File tests/windows/Test-EscapeHatch-CareerBrowser-PidSelection.ps1
python scripts/validate_career_browser_pid_selection.py
```

## Ownership signals

Primary: `user-data-dir` under `%LOCALAPPDATA%\EscapeHatch\managed-career-browser(-origins)`.
Reject: Playwright MCP / temp Playwright profiles.
Prefer: browser root PID (no `--type=`), remote debugging, assist-origin folder port match, visible window / host hint, signed-in persistent profiles over `--incognito` / InPrivate / Guest.

## Provenance

Adapted from `EndeavorEverlasting/BlacksmithGuild` (`pr11-process-window-classifier.ps1`, `launcher-pid-baseline-policy.ps1`, AttachOnly / existing-session semantics). EscapeHatch extension: `ATTACH_EXISTING` and `LOCATE_PROGRESS` scoring that do **not** require `new_pid_after_baseline`, plus signed-in preference over private sessions.
