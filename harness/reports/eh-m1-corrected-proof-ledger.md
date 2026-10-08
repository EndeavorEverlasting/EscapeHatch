# EH-M1 corrected proof ledger

**Correction lane:** EH-M2 P82 evidence hardening
**EH-M1 merge:** `5a4e6de` (PR #56) / head `ce9cf0e`
**Capability hardening:** PR #57 floor + capability-containment promotion (rank display-only)
**Architecture:** retained (not challenged)
**Rule:** KEEP is not PROVEN. Target prototype is never achieved without supporting capabilities.

## Capability proof states

| Capability | Correct proof state |
| --- | --- |
| platform-neutral presence contract | PROVEN |
| EH-U1/mobile separation | PROVEN |
| canonical session identity reuse | PROVEN |
| no second application state machine | PROVEN |
| Android architecture decision | ACCEPTED DESIGN |
| host-side state machine | HOST_SIMULATION_PROVEN |
| deep-link parser semantics | HOST_SIMULATION_PROVEN |
| share-text parser semantics | HOST_SIMULATION_PROVEN |
| dismiss/session retention model | HOST_SIMULATION_PROVEN |
| notification-over-browser behavior | UNOBSERVED_ANDROID |
| Android deep-link Activity reception | UNOBSERVED_ANDROID |
| actual Sharesheet reception | UNOBSERVED_ANDROID |
| process-death session restoration | UNOBSERVED_ANDROID |
| Android notification lifecycle | UNOBSERVED_ANDROID |
| foreground-service behavior | UNOBSERVED_ANDROID |
| physical-device/OEM behavior | UNOBSERVED_DEVICE |
| Bubble behavior | UNOBSERVED_DEVICE |
| Play Store acceptance | UNOBSERVED_EXTERNAL |

## Old claim → corrected classification

| Historical claim (EH-M1 closeout) | Correction |
| --- | --- |
| H1–H6 KEEP ⇒ architecture empirically decided | KEEP = candidate retained; architecture = ACCEPTED DESIGN |
| “handoff proven host-side” | HOST_SIMULATION_PROVEN parser semantics only |
| “session resume proven host-side” | HOST_SIMULATION_PROVEN in-memory store only |
| “primary mechanism decided” | ACCEPTED DESIGN; UNOBSERVED_ANDROID for runtime |
| H1 browser_foreground=True KEEP | Assigned host input; UNOBSERVED_ANDROID for notification-over-browser |
| H5 authored score winner | STATIC_REASONING decision aid, not Android observation |
| H6 bubbles not primary because recommendation metadata | STATIC_REASONING; Bubble behavior UNOBSERVED_DEVICE |

Historical receipt KEEP labels are preserved under `historical_decision_label` when the spike runner regenerates `android-assist-presence-spike-receipt.v1.json` (schema version 2).
