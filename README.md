# EscapeHatch

A private, locally managed career workspace for preparing job applications, keeping opportunity-specific documents together, and resuming employer forms after sign-in. **Final submission always belongs to the user.**

## Windows: download, install, and open

**[Download the guided EscapeHatch installer](https://raw.githubusercontent.com/EndeavorEverlasting/EscapeHatch/main/Get-EscapeHatch.cmd)** — save `Get-EscapeHatch.cmd`, then double-click it. Windows may warn before running a downloaded command script; review the source first and approve only if you trust it. This is a Windows command script, **not a signed .exe or MSI**. The downloadable entrypoint is released only when [the installer integration](https://github.com/EndeavorEverlasting/EscapeHatch/pull/95) and [journey implementation](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69) have reached verified `main`.

The script guides installation: choose an empty source folder; approve installation of missing Git/Node LTS prerequisites through winget; clone the canonical repository only with confirmation; then delegate to the ownership-aware `scripts/windows/EscapeHatch-Install.ps1` for managed startup. Existing source trees and career data are preserved; no Git pull/reset, arbitrary process termination, or bypass of provider logins. A new shell may be needed after installing a dependency. An already-installed copy can be opened through its existing EscapeHatch Start Menu shortcut.

**Current distribution gate:** Until the installer branch and this scene branch are integrated and Windows tested, the `main` download link may not exist or the bootstrap may report that its installer is missing. Treat a successful download as neither a tested installation nor a running application; use the PR and validation receipts to check release readiness.

## Use EscapeHatch

1. Launch the local cockpit and paste a public HTTPS employer job URL.
2. EscapeHatch shows current readiness and required missing profile, question, and role-document inputs; answer only what you can confirm.
3. Open the opportunity in its owned managed Chrome window. If the employer requests sign-in or SSO, complete it **in Chrome**, not in EscapeHatch.
4. The cockpit observes when the actual application form returns and becomes stable. It may resume a previously authorized contact fill; an always-available **I've signed in — check again** control and a clear **Resume filling this application** control remain available.
5. Approve the exact résumé/cover-letter files and question answers, review verified effects, and perform final Submit yourself.

No completed application is inferred from a URL change, login success, field fill call, document-picker interaction, or button click.

## Repository-wide scene law

The canonical mapping is [`contracts/application-journey-scenes.v1.json`](contracts/application-journey-scenes.v1.json). Its owning [execution design](docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md), [scene runbook](docs/agent/APPLICATION_JOURNEY_SCENE_SYSTEM_2026-10-25.md), and [P04 parent gate](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69) apply to installer, application intake, prerequisites, authentication handoff, form preparation, interruption recovery, and final review.

Development entrypoint, for developers with an existing checkout: [artifacts/escape-hatch/README.md](artifacts/escape-hatch/README.md). Do not confuse the developer launcher with the clean-machine installer.
