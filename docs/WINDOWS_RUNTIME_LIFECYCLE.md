# EscapeHatch local Windows lifecycle

`scripts/windows/EscapeHatch-Runtime.ps1` owns process identity, receipts, locking, shutdown and destructive fallbacks.

## Everyday actions

- **Start / open:** double-click `Launch-EscapeHatch.cmd`.
- **Install:** double-click `Install-EscapeHatch.cmd`. The standard-user installer checks Node/npm, installs dependencies, remembers the checkout and creates an owned Start Menu shortcut. Reinstall preserves the workspace.
- **Uninstall:** double-click `Uninstall-EscapeHatch.cmd`. It stops only the positively owned selected runtime and removes only unchanged installation-owned shortcuts/receipt. It preserves career data, source files, browser profiles, credentials, and the checkout. It is not personal-data erasure.
- **Close:** double-click `Close-EscapeHatch.cmd`. Already stopped is a successful no-op.
- **Status:** double-click `Status-EscapeHatch.cmd` for lifecycle state; dismiss its window when finished. Automation calls `Status-EscapeHatch.ps1` to avoid the pause.
- **Restart (advanced):** run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\EscapeHatch-Runtime.ps1 -Action Restart`.

PowerShell entry points are equivalent.

## What Status means

- `STOPPED` — no managed listener is present.
- `OWNED_HEALTHY` — runtime identity, receipt, process start time, repository fingerprint, and listening socket agree.
- `OWNED_ADOPTABLE` — this checkout's healthy runtime is identified; its secret-bearing receipt is missing/stale. Start reuses it. Close re-proves ownership before bounded termination; the old shutdown token is unrecoverable.
- `OWNED_UNHEALTHY` — this checkout's Vite owns the configured port but its control plane is unhealthy. Recovery requires immediate ownership reproof.
- `FOREIGN_CONFLICT` — the port is occupied but EscapeHatch cannot prove it owns the process. Nothing is killed automatically.

Foreign conflicts never authorize killing unrelated Node or port 21031 owners.

## Startup includes recovering your work

`Launch-EscapeHatch.ps1` delegates to `scripts/windows/EscapeHatch-Install.ps1 -Action Bootstrap`,
which uses the installation receipt's selected source rather than whichever worktree an agent found.
The existing runtime manager retains all process Start/Stop authority. Missing Node 22.16+/npm produces
an explicit toolchain recovery message; this is not clean-machine OS provisioning or a signed package.

The managed app recovers `%LOCALAPPDATA%\EscapeHatch\workspace.v1.json` before rendering the dashboard.
Profile, answer library, applications, reviewed assist records/answers, and source bindings use existing
parsers. `ESCAPEHATCH_DATA_HOME` is an explicit alternate user-store root for isolated environments.
Browser edits remain a working copy. Nonempty divergent copies hold startup for review; nothing is
silently overwritten. Saving uses a cross-process lock, revision compare-and-set and prior-copy backup.
Choosing between conflicting copies also retains the displaced saved workspace in a uniquely named
`workspace.v1.json.conflict-*` archive under the same lock. Later autosaves do not replace that archive.
Unreadable artifacts hold startup. Explicit recovery import archives unreadable bytes before replacing
the active copy. The cross-process lock uses Node's SQLite OS-backed transaction lock only; workspace
content remains JSON. Process termination releases the lock automatically. It is not a second data store.
Corrupt browser values can be exported raw or archived privately before an explicit restore action.

Previously explicit contact answers are recovered from the stable preference store. On first migration,
the primary checkout is resolved through Git's common directory and its validated old private preference
file is copied only when the stable destination is absent. The source is never moved/deleted. Legal,
EEO, accommodation and attestation answers are not inferred from a résumé or converted into profile facts.

For local import, choose **Import local workspace** on startup. Existing workspace exports remain
supported. For an authorized agent with an existing private artifact, the durable ingress is:

```powershell
npm --prefix artifacts/escape-hatch run import:context -- workspace '<private-workspace-export.json>'
```

The importer refuses to replace a conflicting populated private workspace; reconcile in the app instead.
This workspace is the cockpit projection, not a replacement for the canonical career-state graph or
provider records. Document bytes remain owned by the existing opportunity document store at the stable user-data root. Requested legacy packages are copied only after scope/hash verification; divergent packages require review, and originals are preserved.

## Existing cloud context and source freshness

Remembered source metadata lives at `%LOCALAPPDATA%\EscapeHatch\career-sources.v1.json` with schema
`escapehatch-career-sources/v1` and `sources: [{label, kind, locator}]`. Supported kinds are `drive_folder`,
`google_doc`, and `local_file`; only approved Google URLs are linked, and listing a local file does not
grant arbitrary filesystem reads. This manifest is private configuration, never a tracked fixture.

The optional private `resume-source.v1.json` cache (`escapehatch-cached-resume/v1`, `label`, `text`,
`capturedAt`, optional original source identity) enables **Review saved résumé** in Sources without
manual file shuttling. Its original source remains untouched; extracted claims still require review.

**Refresh connected tracker** makes a real bounded read-only Sheets request using the existing
TokenCorridor credential lease path when available. A local auth-file presence flag is not provider
proof. Missing/expired authorization, invalid data, oversized responses, timeouts, or changed source
bindings preserve the prior snapshot. No fresh OAuth project or credential copy into browser state is
required or implied. ChatGPT's connected Drive account is a separate credential owner; it cannot be
silently exported to the standalone app.

An authorized connected agent may refresh the original provider and import its private export with:

```powershell
npm --prefix artifacts/escape-hatch run import:context -- tracker '<private-provider-export.json>'
```

Input is `{values, target: {spreadsheetId, sheetName}, capturedAt, provenance: "connected_provider_read"}`.
`values` is the actual formatted Sheets ValueRange data, not reconstructed claims. Retain the real read
time; never refresh an old snapshot merely by changing its timestamp. The importer preserves tracker
binding and rejects older exports. Unknown/invalid rows fail closed. Historical `mailto:` rows remain
plain text with no browser launch URL; custom checkbox glyphs remain checkbox evidence only.

## Agent launch acceptance

After fetching/reconciling the repository and inspecting the installation selection, use the canonical
launcher. Query `/__escapehatch/workspace/status` for sanitized readiness, then inspect tracker freshness
and remembered sources. Observe the populated browser profile/progress or the explicit recovery state.
Do not call the app ready from HTTP 200, process health, a screenshot-free inference, stale tracker counts,
or the existence of credentials. Resolve discoverable approved local/provider artifacts before asking
the user to reconstruct context. Never publish contact values, source IDs, résumé text or raw snapshots.

Regression commands: `npm --prefix artifacts/escape-hatch run test:bootstrap`,
`npm --prefix artifacts/escape-hatch run test:bootstrap:browser`, and
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/windows/Test-EscapeHatch-Install.ps1`.
Browser bootstrap proof runs on isolated port 21039 with synthetic state, never the user's runtime port.

## Local runtime data

Runtime state and bounded logs are user-local and untracked:

- receipt: `%LOCALAPPDATA%\EscapeHatch\runtime\<repoFingerprint>\runtime.json`
- logs: `%LOCALAPPDATA%\EscapeHatch\logs\<repoFingerprint>\`

Managed employer Chrome profiles live under the canonical user-data root at
`managed-career-browser-origins/<loopback-port>/`. The profile stays stable across
restarts and checkout upgrades on the same app origin; a different runtime port gets
its own profile. `ESCAPEHATCH_DATA_HOME` also isolates these profiles for tests.
The previous shared `managed-career-browser` profile is preserved, never copied,
attached to, or terminated during this change. Existing sessions in that legacy
profile remain there; the first launch from an origin-scoped profile can require
employer sign-in again. Do not delete Chrome lock files or stop another runtime to
recover a session. The protected 21033 browser is outside production recovery scope.

The receipt contains the per-instance shutdown token. Do not copy it into tickets, chat, screenshots, repository files, or logs.

## Optional configuration

- `PORT` defaults to `21031`.
- `BASE_PATH` defaults to `/`.
- `ESCAPEHATCH_NO_BROWSER=1` suppresses automatic browser opening for automation/tests.
- `ESCAPEHATCH_START_TIMEOUT_SECONDS` and `ESCAPEHATCH_STOP_TIMEOUT_SECONDS` adjust bounded lifecycle waits.

The browser application never receives the shutdown token. There is intentionally no web-page Quit button in this lifecycle version.

## Troubleshooting

If `Status-EscapeHatch.cmd` reports `FOREIGN_CONFLICT`, or Start/Close reports that the listener is unproven and was left untouched, inspect the reported process information. The lifecycle manager will not terminate an unproven listener. Do not use broad commands such as `taskkill /IM node.exe` or `Get-Process node | Stop-Process`.

If Vite dependencies are missing, install the artifact dependencies under `artifacts\escape-hatch` before retrying the launcher. The dedicated Windows lifecycle/fault-injection CI suite is owned by EH-R3 and must be integrated before CI process-safety proof is claimed.
