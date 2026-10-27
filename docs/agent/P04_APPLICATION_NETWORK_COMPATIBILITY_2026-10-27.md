# P04 / Trifecta / P11 — Application network and email verification recovery

**Date:** 2026-10-27  
**Parent:** [Application Assist issue #69](https://github.com/EndeavorEverlasting/EscapeHatch/issues/69) and `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`.  
**Scope:** Browser compatibility recovery and guarded restoration, not login bypass, protected attestations, or automated final Submit.  
**Evidence boundary:** Only synthetic test values in the public repository. User job submissions, email addresses, VPN account details, screenshots and interview deadlines stay private.  
**Routing:** TokenCorridor P04 (factoring), trifecta P08 → P82 → P07, and P11 offline validation.

## Preserved design decisions

1. **Default-on assist preference** (`vpn_recovery_assist_enabled: true` in the private application-preferences schema) is a saved preference to *offer* recovery, not blanket prior authorization to disconnect a VPN. The user can turn it off. Unsupported/unsafe adapters remain inert.
2. The existing `vpn-recovery.ts` owns the exact one-employer-navigation-retry transaction. Disconnect only after an actual per-retry user approval, supported provider/connection identity, confirmed connected state, safe kill-switch preflight and a private durable `RESTORE_REQUIRED` journal.
3. Restoration must run immediately after the bounded navigation retry, on success or failure. Do not leave the VPN disabled while a user fills a long form or completes an interview. An interrupted process must find its pending journal on startup and restore with a verified provider readback **before** another attempt.
4. The **new file-backed journal** in `vpn-recovery-journal.ts` is exclusive-create, fail-closed on corruption, and stored under the local user's private state directory, not in Git or employer page context. Pending restoration survives process boundaries.
5. Employer email masking is a separate problem. A rejected address or missing verification code can be identified locally and surfaced as a user action, but does not establish that the email-alias provider was blocked or that a VPN caused it. Never silently substitute addresses, read OTPs, manipulate employer verification endpoints, or infer application submission from login progress.
6. Keep the existing same-opportunity session, protected document and field readbacks, operator-only terminal action, receipt-based submission observer and verified external tracker sync. Do not reapply to an already submitted requisition to test this feature.

## Evidence and acceptance matrix

| Gate | Owner | Current status | Next executable proof |
| --- | --- | --- | --- |
| Durable private restoration journal | `vpn-recovery-journal.ts` | Source and focused synthetic tests authored | Run `npm --prefix artifacts/escape-hatch run test:managed-assist` at exact head and verify CI |
| Default-on recover-assist toggle | `application-preferences.ts` and `application-preferences.tsx` | Persisted preference and UI source authored | Browser-test save, reload, explicit-off and legacy-profile round trip |
| Generic employer email/code classifier | `employer-verification-recovery.ts` | Source and focused synthetic tests authored | Wire locally observed employer validation feedback, test no PII/OTP logging |
| NordVPN Windows provider adapter | New owned adapter used by existing `vpn-recovery.ts` | **NOT IMPLEMENTED** | On operator workstation prove supported client identity, safe kill-switch readback, exact connection readback and restore |
| Managed-browser orchestration | `browser-assist-control.ts` plus existing UI | **NOT WIRED** | Test one consented failed navigation → one retry → journal → reconnect and identity readback |
| P08 live runtime | Existing managed launcher and isolated synthetic ATS | **UNPROVEN** | Exercise recovery and known-good fill/document/final-review controls on a disposable session, then authorized live-site test without submitting |
| P04 deterministic parallel-dispatch receipt | `Outputs/prompt-parallel-dispatch` | **UNPROVEN**: existing manifest belongs to an independent submission-sync run; canonical schema/runner absent in current main | Preserve prior manifest; implement or recover canonical schema/runner and issue a distinct validated dispatch |

## Immediate execution order

**Lane A / independent source boundary:** provider adapter discovery and read-only Windows client status + kill-switch audit. Owned scope: adapter, its synthetic tests, startup restoration integration. Forbidden: arbitrary network adapters, credentials, live disconnect without operator approval.

**Lane B / independently writable:** classify actual employer field-level verification feedback, preserve same-application context and offer operator-controlled approved email replacement. Owned scope: form observation + error UX + tests. Forbidden: OTP interception, guessed emails, anti-spam bypass or final Submit.

**Convergence:** after both lanes, wire the app preference and one bounded recovery transaction into the canonical managed-browser control. Run the one-command P11 synthetic gate, browser regressions, exact-head CI and P08 protected live controls. Only then consider mainline promotion under existing rules.

This document is a repository execution receipt, not a claim that NordVPN integration or employer runtime recovery has already been tested.