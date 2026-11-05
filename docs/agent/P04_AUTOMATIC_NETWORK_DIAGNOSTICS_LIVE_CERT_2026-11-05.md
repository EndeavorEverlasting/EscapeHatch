# P04 — Automatic Network Diagnostics | Trifecta Convergence + Windows Live Cert

**Date:** 2026-11-05. **Parent objective:** EscapeHatch autonomously explains slow or failing network paths during applications. This supersedes the manual-only decision in `TRIFECTA_NETWORK_PATH_RECOVERY_2026-11-05.md`. Keep the one-shot diagnostic as an optional fallback. PiShark's independent network monitoring stays unchanged.

**Provider truth at setup:** EscapeHatch `main@4b3f84f3866498cf174944825b074b0b8dce63db`; owned working branch `feat/native-path-quality-diagnostics-20261105`; draft PR #196. Refresh exact HEAD, checks, pending reviews and main before any integration. Trifecta = canonical TokenCorridor P08 → P82 → P07. P04 owns dependency factoring and the successor handoff; the user's final requested host gate is a local-agent P08 live cert.

## 2026-11-05 source continuation — supersedes earlier unresolved implementation notes

- Active entrypoint: `managed-network-quality-plugin.ts` is registered by `vite.config.ts`; it composes the original one-shot source with the opt-in automatic runtime. `network-quality-state.ts` serves the side-effect-free GET `/monitor/health`; the enable/disable route retains strict origin, localhost and personal-scope checks.
- Browser-level notifications are now implemented in `src/components/network-event-notification.ts` and called from `automatic-network-quality-check.tsx` only for a newly observed confirmed event after OS/browser permission. **No browser-open means no browser toast**; the host sampler continues in the managed runtime. Native Windows notifications with browser fully closed are not implemented; device-wide alerts remain PiShark's separate responsibility.
- Dedicated automatic quality, persistence, malformed-evidence and same-origin refusal cases are now in the already-registered `network-navigation-diagnosis.test.ts`, not only in the standalone `quality-transition.test.ts`. They run under `npm run test:managed-assist`.
- GitHub Actions identified Node 22 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` from TypeScript constructor parameter properties at earlier head `44a9b7e4`. Both `quality-transition.ts` and `network-quality-runtime.ts` have since been repaired using explicit constructor assignments. Recheck the **current** head's managed-assist test result; older green runs or the failed intermediate run do not prove current source.
- P08 acceptance includes automatic samples without repeatedly pressing Run, permission/notification observation while browser is open, contextual in-app status, and the protected employer tab / saved-answer controls. **Do not claim native notification center delivery with browser closed.**

## Launch order and runtime placement

1. **CURRENT_CHAT_RUNTIME / GitHub provider:** implementation, source readback, CI inspection, branch/PR preservation. Own `artifacts/escape-hatch/network-*.ts`, `quality-transition.ts`, `src/components/automatic-network-quality-check.tsx`, `src/components/application-puzzle.tsx`, and this handoff. No private Windows proof claims.
2. **CI_OR_REMOTE_RUNNER / GitHub Actions:** existing managed-browser, web-cockpit, career, promotion and harness checks; run dedicated transition and route tests on exact head if the checks are registered.
3. **LOCAL_AGENT_RUNTIME / authorized personal Windows checkout:** ONLY after current source gates are green: P08 runtime using the existing owned EscapeHatch launcher, never an unmanaged shell session.
4. **OPERATOR_OR_PHYSICAL_RUNTIME:** only for any genuinely unavailable personal-device permission or judgment, not for generating scripts, tests, manifests or commands.

Dependency graph: sensor + consented runtime → same-origin status and control → UI state → deterministic tests and CI → P08 Windows display plus known-good application-control proof. One writer owns PR #196; parallel CI runs are independent verification, not evidence of multi-agent dispatch. No contract-valid agent-parallel receipt has been produced.

## Current implemented behavior and acceptance floor

- `network-path-quality.ts`: bounded fixed DNS / two TCP paths / TLS handshake; no throughput or ISP attribution.
- `quality-transition.ts`: require **two matching bad samples** for an alert, **two good** for recovery, 10-minute bad-alert cooldown. Partial target failures are UNKNOWN, not network-wide evidence.
- `network-quality-runtime.ts`: 60-second samples in the managed Windows app after approval; local private `network-quality-monitor-policy.v1.json` records opt-in across launches. Stops on disable or server close, does not upload receipts.
- `managed-network-quality-plugin.ts`: one active owner for the legacy one-shot endpoint and automatic monitor; no probing in synthetic preview. Unused older plugin entrypoint is kept as historical source and not registered.
- `network-quality-route.ts`: operator-gated POST enable/disable; `network-quality-state.ts`: side-effect-free same-origin GET status; `src/components/automatic-network-quality-check.tsx` presents enabled state and contextual alerts, with the manual diagnostic collapsed underneath in `application-puzzle.tsx`.
- Explicit opt-in is a ONE-TIME device-level action, **not one click per diagnosis**. The program checks automatically after approval. The browser UI does not perform probes and does not alter VPN, application pages, credentials, profile fields, saved answers or submission receipts.

**Do not overclaim:** The current branch implements **in-app** contextual alerts. Native OS toast / Windows notification center delivery has **not** been implemented or live-certified, and a cloud test or UI text cannot substitute for a Windows notification. Prior attempts to write the native-toast script and some exact test/tool files were rejected by provider safety checks. Retain this as an explicit feature gap rather than using uncontrolled shell/process workarounds.

## Deterministic source gates before P08

- Run `node --experimental-strip-types --test artifacts/escape-hatch/quality-transition.test.ts` at the exact source head. The file exists but is not automatically included in the repository's explicit `test:managed-assist` script; registering and executing it in the canonical CI gate is required.
- Add source-bound tests for partial/malformed results, stale gaps, consecutive samples, cooldown, recovered state, persistence across restart, disable during in-flight sampling, request-origin rejection, no probing on preview/unmanaged hosts, multi-tab toggle and rate bounds. Use ephemeral test directories, no real network.
- Run `npm --prefix artifacts/escape-hatch run test:managed-assist`, `npm --prefix artifacts/escape-hatch run typecheck`, `npm --prefix artifacts/escape-hatch run build`, `python scripts/validate_application_autofill_parent.py`, `python scripts/validate_application_journey.py`, and `git diff --check`.
- Inspect exact PR diff and CI source-head identity; verify the legacy manual route and automatic route are not both sampling. Review owner contracts; no unrelated application or VPN mutations.
- Improve in-scope evidence gaps before declaring fixed point. **P08 may not be marked PASS from build, source, route ACK or synthetic test alone.**

## Local-agent P08 LIVE CERT (after source gates)

1. Preserve dirty worktrees. `git fetch --all --prune`; record exact main, PR #196 head, installed EscapeHatch version, process identity, private data root and baseline application state.
2. Start through the repository's canonical **owned Windows launcher** on a permitted personal device; attach to the existing session, not a disposable foreign listener.
3. Open Browser assist. Record the first-view default (automatic checks OFF on a fresh user) and absence of unsolicited DNS/TCP probes. Enable once, with actual personal-device permission, then leave the panel; observe independently advancing samples at the host's one-minute cadence. Navigate away and back; confirm preference and state continuity without another button press.
4. Use controlled permitted failure/recovery conditions (or wait for naturally occurring evidence). Verify **two consecutive samples** before degraded event, anti-spam interval, two recovery samples, and no fake Mbps/ISP attribution. Check that browser in-app context appears and is screen-reader legible. Do **not** claim Windows toast unless a genuine native notification has been implemented and visually observed.
5. Prove a protected known-good control: the already-open employer application tab, exact opportunity binding, document/answer state, submission listener and final operator-only Submit remain untouched during sampling. No actual employer submission, VPN disconnect, OTP collection or account preference mutation.
6. Check disable, app restart, logout/login where approved, fullscreen/focus behavior and absence of surprise consoles; record real outputs and where timestamps/notifications appeared. Restore test environment and preserve logs privately.
7. Write a private redacted receipt with actual runtime identity, SHA, user approval, steps, sample timestamps, outcomes, protected control, uncertainties, and one next executable action. Never commit private network or employer data.

**Truth dimensions:** FEATURE_SOURCE_COMMITTED ≠ TARGETED_TEST_PASS ≠ ALL_CI_PASS ≠ PR_MERGED ≠ HOST_INSTALLED ≠ AUTOMATED_SAMPLING_OBSERVED ≠ NOTIFICATION_DISPLAYED. A GitHub PR, this file and green generic CI are not live evidence. Merge only after all relevant required source gates and repository authority are satisfied; never silently merge pending unrelated application branches.

## Exact continuation

Keep work on PR #196. Finish dedicated source and route tests, register them in CI, and resolve native notification delivery as a separately verified output if required for product acceptance. Then perform the P08 local-agent live-cert sequence above; update **this** canonical handoff in place, not a competing plan.