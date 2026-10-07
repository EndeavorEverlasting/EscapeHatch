# Android Application Assist presence spike (EH-M1)

Throwaway-or-promotable spike proving the riskiest Android integration questions for Mobile Application Assist.

## What this spike proves without a device SDK

Host-side proof (no Android SDK required on the developer machine):

```text
python scripts/run_android_assist_presence_spike.py
python scripts/validate_application_assist_presence_surface.py
python tests/test_application_assist_presence_surface.py
```

Those commands exercise:

1. quiet affordance while a simulated browser remains foregrounded
2. reopen of the same assist session id after leave/return
3. browser→EscapeHatch handoff via `escapehatch://assist?...` and Android Sharesheet text
4. state preservation across browser↔companion switches
5. permission/onboarding burden scoring per mechanism
6. Play-policy viability classification
7. capability without Accessibility Service or `SYSTEM_ALERT_WINDOW`

## Kotlin sources

`src/main/kotlin/...` mirrors the selected V1 mechanisms for a future Gradle/Android SDK lane:

- `AssistSessionStore.kt` — same session key semantics as desktop assist
- `PresenceSurfaceStateMachine.kt` — presentation affordance only
- `HandoffIntents.kt` — deep link + share-target parsing
- `QuietNotificationPresence.kt` — preferred V1 affordance sketch
- `BubblePresenceCandidate.kt` — optional bubble path notes
- `OverlayPresenceRejected.kt` — documents why overlay is not V1

Device APK build/install is **BLOCKED** until JDK + Android SDK are available. Do not claim Play packaging from this folder alone.

## Doctrine

Presence, not nagging. The bubble/notification/overlay is an implementation detail serving persistent contextual availability.
