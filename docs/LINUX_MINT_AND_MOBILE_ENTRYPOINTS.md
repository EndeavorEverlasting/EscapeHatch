# Linux Mint and phone entrypoints — cross-platform groundwork

**Parent:** [EscapeHatch application journey #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69) · [canonical scenes](../contracts/application-journey-scenes.v1.json) · [Android presence contract](APPLICATION_ASSIST_MOBILE_PRESENCE_PLAN.md)

## Product decision (P141 scout → P82 experiment → P07 execution → P04 factoring)

Three candidate strategies were compared against the existing cockpit, managed-browser, and mobile companion owners:

| Strategy | User value | Evidence / decision |
| --- | --- | --- |
| Native Linux user-scoped launcher for the **existing** cockpit | High, low architectural churn | **Selected**. Reuse the Vite runtime identity protocol; add a safe Mint path. |
| Rebuild the whole cockpit as a Linux application | High cost and duplicated browser/application state | Rejected until measurable web-shell limitations require it. |
| Set Vite `HOST=0.0.0.0` and browse it from phones | Fast demonstration, but private workspace/control endpoints exposed | **Rejected** as a release path. No authentication or CSRF/privacy boundary has been established for this exposure. |

**P82 experiment admission:** Hypothesis: a Linux-native supervisor can reuse the existing managed-runtime protocol without restarting arbitrary processes or exposing an HTTP listener on the LAN. Baseline: Windows-only installer and loopback Vite server. Prototype: consent-based bootstrap + Python 3 supervisor on Linux. Falsifiers: repeat launch creates a second instance; a mismatched runtime is killed; `HOST=0.0.0.0` changes the bound interface; the app is called running without identity readback. Measurement: local fake-Vite contract test with real subprocess and HTTP; CI check on Linux. The result is a **host-side prototype**, not a real Mint installation, Android APK, or cross-device login proof.

## Linux Mint: first-run operator path

1. From the [repository](https://github.com/EndeavorEverlasting/EscapeHatch), save and inspect `Get-EscapeHatch.sh`. Run `bash Get-EscapeHatch.sh --check`. This checks Git, Node.js **22.16+**, npm, Python 3 and the optional existing checkout without modifying files.
2. Run `bash Get-EscapeHatch.sh --install`. Review the exact source destination (`${XDG_DATA_HOME:-~/.local/share}/escapehatch/source` by default); enter **y** to authorize clone and npm package installation. The installed code is cloned from the canonical EscapeHatch repository. The script never uses sudo, silently installs OS packages, or overwrites an existing unrelated directory.
3. The launcher opens `http://127.0.0.1:5173/` only after the existing runtime identity endpoint confirms its instance, repository fingerprint, protocol and PID. Browser opening requires a graphical desktop; otherwise use the printed URL.
4. Later, run `bash Get-EscapeHatch.sh --status`, `--start`, or `--stop` from the downloaded script. `--stop` requires an identity-verified token-bearing response, not a process-name kill.
5. To obtain a newer **main** version, stop the app and invoke `--update`. The script requires a clean main checkout and performs fetch + fast-forward only; no reset, force-push, forced update, automatic dependency elevation or user-data deletion.

**Dependency recovery:** Install any missing Git/Python/npm/Node prerequisites through trusted Linux Mint and Node.js channels, then repeat `--check`. Do not substitute a Node major version below 22.16. **Storage:** the existing cockpit uses browser-local storage. A different browser/profile/device will not automatically have the same career state; cross-device synchronization remains a separate security and data-migration capability.

**Release status:** The script is a feature-branch prototype until reviewed, merged, Linux Mint-desktop-tested and included in a release. A successful synthetic identity handshake proves only lifecycle control, not a completed employer application. Before merge, run the focused workflow and the existing parent/journey validations. Do not advertise a raw `main` URL as a proven installer until merged.

## Mobile: preserve platform ownership, establish an authenticated access gate

**Android:** Reuse `android/application-assist/` and `contracts/application-assist-presence-surface.v1.json` for quiet companion presence, Share/intent capture, operator-controlled answers, and review. Android Chrome does **not** offer the desktop managed Chrome/MV3 capabilities; do not claim employer-form autopilot parity from sharesheet/deep-link plumbing. Complete debug APK compilation, emulator/device install, browser Share handoff and persistence proof before saying Android users can install it. Final Submit, protected attestations, MFA/CAPTCHA and legal choices remain with the operator.

**Phone access to a desktop-hosted cockpit:** A separate authenticated device gateway is required before cross-device browsing. The current Vite dev server has local workspace, browser-control and shutdown surfaces; merely listening on `0.0.0.0`, VPN connectivity, NAT or an HTTPS tunnel is **not authorization**. Define an independently authenticated, scoped read/review API; CSRF/origin handling; pairing/revocation; short-lived sessions; TLS; local data consent/migration; and observability. Do not expose the raw Vite server, local tokens, private resumes or unrestricted managed-browser controls. Hold any such gateway for dedicated design/security review and real two-device tests.

**iOS:** Safari share/deep link and secure web review are candidate surfaces. No iOS build, background integration or ATS automation is claimed.

## P04 bounded continuation lanes

| Lane | Owner/scope | Gate |
| --- | --- | --- |
| L-MINT-1 | `Get-EscapeHatch.sh`, Linux runtime, isolated tests/CI | Linux synthetic lifecycle test; real Mint first and repeat run; app UI opens; clean controlled update |
| L-MINT-2 | Native Mint desktop application-menu shortcut and prerequisite repair UX | GUI install, session restart, non-technical first-run observed; no root privileges |
| M-ANDROID | Existing Android application-assist project (not a second application state machine) | Build/install APK, sharesheet resume, private session persistence on Android |
| M-GATEWAY | New separately scoped authenticated transport/contract; no changes to local Vite exposure by default | Threat model, authenticated two-device read/review, revocation, offline/reconnect and negative authorization tests |
| M-PARITY | Existing shared application journey and mobile responsive UX | Same opportunity/review state semantics; 360–430 px layouts, touch, accessibility, resume and failure recovery |

### Acceptance and protected controls

- Windows launch and identity-bound graceful stop continue to work; this lane never changes `.cmd`/`.ps1` owners.
- No phone obtains desktop-local control merely from shared Wi-Fi or an accessible port.
- The managed app never claims `REVIEW_READY` without trusted employer-final-boundary evidence; human final Submit remains mandatory.
- Existing source files, previously approved career documents, browser storage and user applications are never reset or modified by update.
- Cross-device private career state is **not synced** until a consented, versioned and verified transport exists.
- Synthetic fixture success is distinct from Mint GUI, Android handset, employer ATS, public release or deployed gateway proof.

## Validation

```bash
bash -n Get-EscapeHatch.sh
python3 -m py_compile scripts/linux/escapehatch_runtime.py
python3 -m unittest discover -s tests -p 'test_linux_mint_bootstrap.py' -v
python3 scripts/validate_application_journey.py
python3 scripts/validate_application_autofill_parent.py
```

**Proof ceiling on the feature branch:** Linux process/control-contract simulation only, with real subprocesses and loopback HTTP; no physical Mint/phone runtime evidence, npm dependency install from the network, live employer browser proof or public release.