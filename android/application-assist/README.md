# EscapeHatch Application Assist — Android (EH-M2)

Real Gradle application promoting the EH-M1 spike into a compilable Android adapter.

## LKG architecture (unchanged)

quiet notification + companion activity + Sharesheet/deep-link
no `SYSTEM_ALERT_WINDOW` · no Accessibility · Bubbles optional later · no FGS until H6 evidence

## Build

```text
cd android/application-assist
./gradlew.bat :app:assembleDebug
```

Requires JDK 17+ and Android SDK (compileSdk 34).

## Experiments

```text
python scripts/run_eh_m2_experiments.py
```

Evidence classes are declared per hypothesis. Host presence of sources is not COMPILED_ANDROID.

## Applicant privacy setting: Android bootstrap (not employer-browser automation)

The companion exposes the same semantic flag as the desktop application,
`escapehatch-application-question-preferences/v1` /
`application_privacy_acknowledgement_enabled`, **off by default**.
An explicit toggle persists in Android-private SharedPreferences with readback
and survives normal app upgrades. Disable without erasing the assist session.

This is a **device-local projection**, not a second authoritative career profile,
user-account sync, or a Chrome Android extension. The companion currently
performs session handoff and quiet presence only; enabling this setting performs
zero employer-site actions. A future Android browser executor must establish an
owner-authenticated private profile binding and reconcile conflicting device
values before any use. The installed mobile form path is **UNPROVEN**.

Contract static check: `python tests/test_android_privacy_preference_contract.py`.
On a configured Android build host, compile `:app:assembleDebug` and instrument
the preference upgrade/readback journey; neither is proved by a static check.

Android `versionName` and monotonically increasing `versionCode` derive from canonical repository `VERSION` during Gradle builds. A package missing VERSION fails to build instead of emitting an independently invented release number. This companion remains a prototype, not a published Android browser autofill application.
