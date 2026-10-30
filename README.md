# EscapeHatch

A private, locally managed career workspace for preparing job applications, keeping opportunity-specific documents together, and resuming employer forms after sign-in. **Final submission always belongs to the user.**

## Windows: download, install, and open

**[Download the guided developer-preview setup](https://raw.githubusercontent.com/EndeavorEverlasting/EscapeHatch/main/Get-EscapeHatch.cmd)** — save `Get-EscapeHatch.cmd`, then double-click it. Windows may warn before running a downloaded command script; review the source first and approve only if you trust it. This is an unsigned Windows command script. The signed consumer installer remains a release gate under [Issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69).

The script guides installation: choose an empty source folder; approve installation of missing Git/Node LTS prerequisites through winget; clone the canonical repository only with confirmation; then delegate to the ownership-aware `scripts/windows/EscapeHatch-Install.ps1` for managed startup. Existing source trees and career data are preserved; no Git pull/reset, arbitrary process termination, or bypass of provider logins. A new shell may be needed after installing a dependency. An already-installed copy can be opened through its existing EscapeHatch Start Menu shortcut.

The [Windows preview package workflow](.github/workflows/windows-preview-package.yml) produces a commit-addressed ZIP and checksum from tracked source. In that extracted package, `Get-EscapeHatch.cmd` verifies the inventory and stages a per-user release without Git, Python, or a source-folder prompt. The bundled variant includes verified Node/npm and complete upstream license notices; it does not require system Node, npm, Git, or Python. App dependency installation still requires network access. Source-only previews continue to require Node.js 22.16 or newer. Existing installation selection and private data are preserved. A checksum proves integrity against its manifest, not publisher authentication.

**Current distribution gate:** Signed packaging and Chrome Web Store enrollment are not yet a verified single-download consumer journey. The 1.5.0 candidate bundles Node/npm and registers an owned per-user native host. Review the private workspace fields and approved answers in the extension once, then connect that Chrome profile. Later opens refresh the approved projection; changed source requires review again. Known answers appear inside the extension module. Phone authority requires separate approval. A different Chrome profile or conflicting saved information is rejected. The new nativeMessaging permission requires browser approval. The [execution record](docs/agent/P04_ONE_DOWNLOAD_EXTENSION_AND_PRIVATE_PROFILE_BOOTSTRAP_2026-10-28.md) distinguishes local package/runtime tests from installed-user proof. Chrome Web Store publication and browser approval remain separate from creating an extension ZIP.

## Visible guided journey (candidate)

The [Journey Atlas](artifacts/escape-hatch/src/components/journey-atlas.tsx) is available in the website's **Your journey** navigation (direct route `/journey`). It connects the existing profile, source, answer-library, opportunity and browser-assist pages to the canonical application scenes, including login and recovery. The extension popup now offers a six-piece, user-controlled **Guided / Quiet** tutorial, with Guided on for a new browser profile. The Windows installer produces the approved mascot shortcut icon from the already bundled PNG without a network download. These enhancements are in the [ongoing implementation handoff](docs/agent/P04_IMMERSIVE_WAYFINDING_BOOTSTRAP_2026-10-30.md); installed/browser acceptance remains pending until proven. The Preparation Studio/checkpoint work in [draft PR #147](https://github.com/EndeavorEverlasting/EscapeHatch/pull/147) remains a separate owner to reconcile, not a live feature claim.

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

## Product identity

The approved chick-and-hatch mascot, usage, provenance and release checks are recorded in [the cockpit brand identity contract](artifacts/escape-hatch/BRAND_IDENTITY.md). The real application journey, private career state and operator-only final submission are unchanged by branding.
