# EscapeHatch

A private, locally managed career workspace for preparing job applications, keeping opportunity-specific documents together, and resuming employer forms after sign-in. **Final submission always belongs to the user.**

## Hey, press me, click me.

With Docker running in Linux-container mode, [download and extract EscapeHatch](https://github.com/EndeavorEverlasting/EscapeHatch/archive/refs/heads/main.zip) or open your checkout. Double-click the file for your computer.

| Computer | Open this file |
| --- | --- |
| Windows | `Hey, press me, click me.cmd` |
| macOS (Apple Silicon or Intel) | `Hey, press me, click me.command` |
| Linux desktop | `Hey, press me, click me.desktop` |

The first launch builds the app and opens the **Journey** tutorial in your default browser. Follow the chick to import a résumé, restore an exported workspace from Profile, or start with an opportunity. On macOS, if the extracted command is not executable, run `chmod +x "Hey, press me, click me.command"` once. On Linux, your desktop may ask you to trust the launcher. If your file manager opens it as text, run `bash scripts/container/launch.sh` from the extracted folder.

The app listens on this computer at `localhost:21030`. The container uses a dedicated Docker volume for your data. To close it, run `bash scripts/container/launch.sh stop` on macOS or Linux, or run `"Hey, press me, click me.cmd" stop` in Windows Command Prompt. Close and reopen EscapeHatch after updating the source to pick up the new build.

The Docker launcher supports the local cockpit, tutorial, and workspace. From **Applications**, open a saved posting to complete the employer form and attach files in your browser. Use the native Windows route below for managed employer Chrome, host Google access, and native extension integration. Mobile companion installation is separate.

## Windows: download, install, and open

**[Download the guided developer-preview setup](https://raw.githubusercontent.com/EndeavorEverlasting/EscapeHatch/main/Get-EscapeHatch.cmd)** — save `Get-EscapeHatch.cmd`, then double-click it. Windows may warn before running a downloaded command script; review the source first and approve only if you trust it. This is an unsigned Windows command script. The signed consumer installer remains a release gate under [Issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69).

The script guides installation: choose an empty source folder; approve installation of missing Git/Node LTS prerequisites through winget; clone the canonical repository only with confirmation; then delegate to the ownership-aware `scripts/windows/EscapeHatch-Install.ps1` for managed startup. Existing source trees and career data are preserved; no Git pull/reset, arbitrary process termination, or bypass of provider logins. A new shell may be needed after installing a dependency. An already-installed copy can be opened through its existing EscapeHatch Start Menu shortcut.

The [Windows preview package workflow](.github/workflows/windows-preview-package.yml) produces a commit-addressed ZIP and checksum from tracked source. In that extracted package, `Get-EscapeHatch.cmd` verifies the inventory and stages a per-user release without Git, Python, or a source-folder prompt. The bundled variant includes verified Node/npm and complete upstream license notices; it does not require system Node, npm, Git, or Python. App dependency installation still requires network access. Source-only previews continue to require Node.js 22.16 or newer. Existing installation selection and private data are preserved. A checksum proves integrity against its manifest, not publisher authentication.

**Current distribution gate:** Signed packaging and Chrome Web Store enrollment are not yet a verified single-download consumer journey. The 1.5.0 candidate bundles Node/npm and registers an owned per-user native host. Review the private workspace fields and approved answers in the extension once, then connect that Chrome profile. Later opens refresh the approved projection; changed source requires review again. Known answers appear inside the extension module. Phone authority requires separate approval. A different Chrome profile or conflicting saved information is rejected. The new nativeMessaging permission requires browser approval. The [execution record](docs/agent/P04_ONE_DOWNLOAD_EXTENSION_AND_PRIVATE_PROFILE_BOOTSTRAP_2026-10-28.md) distinguishes local package/runtime tests from installed-user proof. Chrome Web Store publication and browser approval remain separate from creating an extension ZIP.

## Linux Mint: inspect, install, and launch

A Linux-native, user-scoped [bootstrap](Get-EscapeHatch.sh) is now under review. Download and inspect `Get-EscapeHatch.sh`, then use `bash Get-EscapeHatch.sh --check` to verify Git, Python 3, npm and Node.js 22.16+ without changing files. Use `bash Get-EscapeHatch.sh --install` to approve clone/dependency installation and launch. After installation: `--start`, `--status`, `--stop`, and explicit clean-checkout `--update` are available. A user-owned **EscapeHatch** app-menu launcher is registered under Linux Mint after an approved install; run `bash Get-EscapeHatch.sh --shortcut` to repair its menu entry without modifying other desktop launchers.

The Mint launcher retains local-only `127.0.0.1` binding and an identity-verified graceful shutdown; it does not use sudo, reset existing work, or auto-update. **This is feature-branch groundwork, not yet an approved Linux Mint release**. Linux process tests are not proof of the physical Mint desktop/browser journey. See the [Linux and mobile platform gates](docs/LINUX_MINT_AND_MOBILE_ENTRYPOINTS.md).

## Phones and Android

The repository contains an Android Application Assist companion project, but phone installation and cross-device cockpit access remain separately gated. Android's Share/deep-link handoff is not desktop Chrome managed-automation parity. **Do not expose the local cockpit to phones by changing `HOST` to `0.0.0.0` or publishing an unauthenticated tunnel.** Private career state requires consented synchronization and an authenticated, scoped mobile access path. Follow the [mobile architecture and release criteria](docs/LINUX_MINT_AND_MOBILE_ENTRYPOINTS.md).

## Use EscapeHatch

1. Launch the local cockpit and paste a public HTTPS employer job URL.
2. EscapeHatch shows current readiness and required missing profile, question, and role-document inputs; answer only what you can confirm.
3. Open the opportunity in its owned managed Chrome window. If the employer requests sign-in or SSO, complete it **in Chrome**, not in EscapeHatch.
4. The cockpit observes when the actual application form returns and becomes stable. It may resume a previously authorized contact fill; an always-available **I've signed in — check again** control and a clear **Resume filling this application** control remain available.
5. Approve the exact résumé/cover-letter files and question answers, review verified effects, and authorize the final click. [EscapeHatch can execute that click on a supported managed Lever application](docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md#approved-submit-on-managed-lever).

No completed application is inferred from a URL change, login success, field fill call, document-picker interaction, or button click.

## Repository-wide scene law

The canonical mapping is [`contracts/application-journey-scenes.v1.json`](contracts/application-journey-scenes.v1.json). Its owning [execution design](docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md), [scene runbook](docs/agent/APPLICATION_JOURNEY_SCENE_SYSTEM_2026-10-25.md), and [P04 parent gate](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69) apply to installer, application intake, prerequisites, authentication handoff, form preparation, interruption recovery, and final review.

Development entrypoint, for developers with an existing checkout: [artifacts/escape-hatch/README.md](artifacts/escape-hatch/README.md). Do not confuse the developer launcher with the clean-machine installer.

## Product identity

The approved chick-and-hatch mascot, usage, provenance and release checks are recorded in [the cockpit brand identity contract](artifacts/escape-hatch/BRAND_IDENTITY.md). The real application journey, private career state and operator-only final submission are unchanged by branding.
