# EscapeHatch Mobile Application Assist Presence Plan (EH-M1)

**Sprint:** EH-M1 — Mobile Application Assist presence surface (Android-first)
**Canonical plan owner:** `docs/APPLICATION_ASSIST_MOBILE_PRESENCE_PLAN.md`
**Parent roadmap:** `docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md`
**Contract owner:** `contracts/application-assist-presence-surface.v1.json`
**Related desktop lane:** EH-U1 (`docs/APPLICATION_ASSIST_AMBIENT_COMPANION_PLAN.md`) — **not this sprint**
**Plan date:** 2026-10-07
**Branch:** `feat/eh-m1-android-assist-presence-20261007`

## Sprint declaration

| Field | Value |
| --- | --- |
| Repo / branch | EscapeHatch / `feat/eh-m1-android-assist-presence-20261007` |
| Lane / mission | EH-M1 — platform-neutral presence-surface contract + Android adapter design + host-side spike + ADR |
| Owned scope | presence-surface contract; mobile plan; Android capability matrix; ADR; `android/application-assist-spike/**`; spike runner/validator/tests/receipt; registry + autopilot cross-links; CURRENT_STATE/CODEBASE_MAP notes |
| Forbidden scope | EH-U1 `presence.js` rewrite; iOS implementation; Accessibility Service as V1 dependency; `SYSTEM_ALERT_WINDOW` without proof; second session/career store; autonomous form submission; claiming Android Chrome has desktop extension APIs |
| Expected artifacts | contract, plan, matrix, ADR, spike + receipt, validator/tests, registry/roadmap updates |
| Validation commands | `python scripts/run_android_assist_presence_spike.py`; `python scripts/validate_application_assist_presence_surface.py`; `python tests/test_application_assist_presence_surface.py`; `git diff --check` |
| Proof ceiling | repository contract + host-side spike simulation; **no** Play packaging, physical-device, or live Android browser injection claim |

## Product intent

> EscapeHatch stays quietly present while I apply, remembers what I am doing, and is one gesture away whenever I need help.

The Android UI mechanism is an implementation detail. Persistent contextual availability is the contract.

## Doctrine

**Presence, not nagging.** Quiet by default; dismissible; resumable; non-blocking; visually subordinate; state-preserving; no prompt storms on ordinary navigation.

## Architecture boundary

```text
Application Assist Session
        │
        ├── Desktop browser adapter
        │      └── EH-U1 in-page beacon  (separate lane)
        │
        └── Mobile adapters
               ├── Android presence surface  (EH-M1)
               └── future iOS constrained surface
```

Shared layer owns application/session/commands/answers/evidence/persistence.
Presentation adapters own OS integration, affordance rendering, lifecycle, permissions, handoff.

This sprint is **not EH-U1**. EH-U1 remains the in-page desktop/browser beacon owner (`escapehatch/application-assist-presence/v1` on branch `feat/eh-u1-20260923`, not yet on `main` at EH-M1 floor). EH-M1 owns the **presence-surface** affordance contract that sits beside that operational projection.

## Phase map

| Phase | Outcome | Status |
| --- | --- | --- |
| M0 Evidence recovery | Recover EH-U1, session, companion, modality, intake, registry conventions | PROVEN |
| M1 Presence-surface contract | `contracts/application-assist-presence-surface.v1.json` | PROVEN in this sprint |
| M2 Android capability matrix | Bubble / overlay / notification / companion / Sharesheet comparison | PROVEN in this sprint |
| M3 Technical spike | Host-side spike + Kotlin stubs + receipt | PROVEN host-side; device APK BLOCKED |
| M4 Architecture decision | ADR accepted from spike evidence | PROVEN in this sprint |
| M5 Sequencing / roadmap | Autopilot + registry + CURRENT_STATE cross-links | PROVEN in this sprint |

## Prototype ladder actually used

1. **Spike (host-side)** — Python mechanism matrix + session/handoff/affordance simulation (`scripts/run_android_assist_presence_spike.py`).
2. **Kotlin stubs** — promotable Android source sketches under `android/application-assist-spike/` (not SDK-built).
3. **Integrated candidate / release candidate** — REQUIRED SUCCESSOR (Play app packaging lane).

### Iteration log (P82 style)

| ID | Hypothesis | Decision | Evidence |
| --- | --- | --- | --- |
| H1 | Quiet notification affordance can stay available over browser without overlay | KEEP | spike receipt |
| H2 | Same session id/origin resumes after leave/return | KEEP | session store key reuse |
| H3 | Deep link + Sharesheet hand off context | KEEP | parser proofs |
| H4 | Dismiss preserves session; no nav prompt storm | KEEP | affordance machine |
| H5 | Overlay unnecessary for V1 | KEEP | score matrix |
| H6 | Bubbles not V1 primary (conversation mismatch) | KEEP | API 30+ conversation rules |

## iOS boundary (non-implementation)

Documented constraints only. Candidate surfaces: Share extension, Safari Web Extension, companion app, app-group state, notification/Live Activity, in-app browser. **Do not promise Android-style arbitrary overlay on iOS.** Shared contract must remain platform-neutral.

## Safety / privacy

- No password/protected credential capture
- Clipboard only on explicit user action
- No automatic screenshots/page capture
- Accessibility Service forbidden as V1 dependency
- Overlay requires proof lower authority is insufficient (ADR rejects for V1 primary)
- Telemetry off; PII stays in platform app data / user-selected store; never repository

## Acceptance gates (sprint)

- [x] EH-U1 and mobile assist separated as presentation adapters
- [x] One canonical application-assist session model reused
- [x] No second application state machine
- [x] Bubble vs overlay vs notification/companion investigated with evidence
- [x] Play/permission constraints documented
- [x] Browser→EscapeHatch handoff proven host-side
- [x] Session resume after leaving browser proven host-side
- [x] Spike decides primary V1 mechanism
- [x] iOS constraints recorded without iOS implementation
- [x] Follow-on lanes deterministic

## NEXT LANES

### EH-M2 — Android companion app skeleton (Play-ready packaging floor)

- **Owner:** Android packaging lane
- **Depends on:** EH-M1 ADR + presence-surface contract
- **Owned:** Gradle project, applicationId, quiet notification channel, session store adapter, deep link + share target wiring
- **Forbidden:** Accessibility Service; SYSTEM_ALERT_WINDOW; form auto-submit; EH-U1 desktop rewrite
- **Acceptance:** debug APK installs; notification resurfaces same session; share target seeds context; validators green
- **First action:** provision JDK 17 + Android SDK; `./gradlew :application-assist:assembleDebug`

### EH-M3 — Assist command sheet on Android

- **Owner:** Mobile UX lane
- **Depends on:** EH-M2
- **Owned:** command sheet UI mapping modality contract actions
- **Forbidden:** new session semantics; password capture
- **Acceptance:** resume/pause/stop/copy answer/open full experience via sheet

### EH-M4 — Optional Bubbles enhancement

- **Owner:** Mobile UX lane
- **Depends on:** EH-M2 quiet baseline OBSERVED on device
- **Owned:** BubbleMetadata opt-in only if doctrine-safe
- **Forbidden:** forcing MessagingStyle conversation fiction as core product identity
- **Acceptance:** bubble remains user-dismissible; no notification storm

### EH-U1 — Desktop in-page beacon (parallel, separate writer)

- Unchanged ownership. May merge independently. Must not absorb Android adapter work.

## Proof ceiling

Host-side repository proof only. Physical Android device, OEM browser quirks, and Play review outcomes remain unproven until EH-M2+ device receipts exist.
