# ADR-20261007 — Android Application Assist presence V1 mechanism

- **Status:** Accepted
- **Evidence class:** STATIC_REASONING / PLAY_POLICY_DOCUMENTED (ACCEPTED DESIGN — not Android-observed)
- **Date:** 2026-10-07
- **Lane:** EH-M1 (architecture); evidence reclassification EH-M2
- **Deciders:** EscapeHatch EH-M1 design + matrix; empirical Android gates deferred to EH-M2+
- **Contract:** `contracts/application-assist-presence-surface.v1.json`
- **Evidence:** `harness/reports/android-assist-presence-spike-receipt.v1.json` (v2 typed classes), `harness/reports/eh-m1-corrected-proof-ledger.md`, `docs/APPLICATION_ASSIST_ANDROID_CAPABILITY_MATRIX.md`

## Context

EscapeHatch Application Assist on desktop is a browser-extension control loop. On Android phones, users apply inside Chrome/Firefox/Samsung Internet without desktop extension APIs. The product needs persistent contextual availability — quietly beside the application flow — without inventing a second session state machine and without equating the contract to `SYSTEM_ALERT_WINDOW`.

EH-U1 owns the desktop in-page beacon. This ADR selects the **Android presentation adapter** only.

## Decision

**Preferred V1 presence mechanism**

1. Quiet ongoing notification (low-importance channel) with actions: Resume / Open commands / Dismiss
2. Optional foreground service only when a durable quiet assist process is required
3. Companion activity hosting the modality command sheet / context inspector
4. Browser handoff via `escapehatch://assist?...` deep link and `ACTION_SEND` Sharesheet text/URL

**Fallback**

Sharesheet / deep link into companion activity with persisted session, even if the user disables notifications.

**Optional later**

Android Bubbles (`Notification.BubbleMetadata`) only after quiet baseline is observed on devices and only if the UX remains non-conversation-spammy.

**Rejected as V1 primary**

- `SYSTEM_ALERT_WINDOW` / draw-over overlay
- Accessibility Service as a dependency

## Consequences

### Positive

- Lowest practical authority that still satisfies “available while applying”
- Aligns with presence-not-nag doctrine
- Reuses `escapeHatch.applicationAssistSession.v1` instead of a parallel store
- Play-policy path avoids special draw-over access for core V1

### Negative / follow-on

- Not a literal floating bubble by default (bubble is optional later)
- Notification permission can be denied → fallback handoff still required
- No in-page DOM fill on Android Chrome without future constrained strategies (Custom Tabs / manual paste / later researched APIs) — out of EH-M1 spike scope
- Physical device proof still BLOCKED until JDK/Android SDK lane (EH-M2)

## Permissions

| Permission / capability | V1 | Why |
| --- | --- | --- |
| `POST_NOTIFICATIONS` | Yes (API 33+) | Quiet affordance |
| Typed `FOREGROUND_SERVICE*` | Optional | Durable assist process if needed |
| `SYSTEM_ALERT_WINDOW` | No | Lower authority sufficient (spike H5) |
| Accessibility | No | Safety/policy/temptation boundary |

## Alternatives considered

| Alternative | Why not V1 primary |
| --- | --- |
| Bubbles-first | API 30+ conversation requirements mismatch job-assist; higher nag risk |
| Overlay-first | Special access friction + spoofing risk; not justified by spike scores |
| Companion-only | Fails “beside the browser” without notification/bubble pairing |
| Desktop-extension port | Android Chrome does not provide the desktop MV3 assist surface |

## Relationship to EH-U1

EH-U1 projects operational presence in-page on desktop. EH-M1 projects presentation affordance on Android. Both consume the same Application Assist session; neither owns submission authority.

## Proof ceiling

Accepted on host-side spike + public Android/Play documentation. Device OEM behavior and Play review remain EH-M2+ observations.
