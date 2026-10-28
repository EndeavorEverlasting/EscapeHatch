# EscapeHatch Application Assist — Android (EH-M2)

This is the **Android companion adapter** for the existing EscapeHatch Application Assist session. It is not the full desktop managed-Chrome autopilot and is not yet a Play Store release. Final employer submission remains with the user.

## Build on Linux Mint or Windows

**Preferred for non-developers / initial testers:** Use the repository's **Android Companion Debug APK** GitHub Actions run. When the build passes, the run retains an artifact named `EscapeHatch-Android-Assist-debug-test-only` for 7 days. The extracted `app-debug.apk` is **debug-signed for testing only**, not a release-signed or Play Store app. Downloading an Actions artifact and installing an APK are separate steps; no device installation, Android browser/Share interoperability or production security claim is implied.

**Developer build:** JDK 17, Android SDK platform 34/build-tools 34.0.0, and **Gradle 8.7** are required. This directory does not currently contain `gradlew` / `gradlew.bat`; do not copy a nonexistent wrapper command from an old handoff.

```bash
cd android/application-assist
gradle --no-daemon :app:assembleDebug
# Expected output only after a successful build:
# app/build/outputs/apk/debug/app-debug.apk
```

On Windows with a configured Gradle installation, use `gradle.bat :app:assembleDebug`. Build output is not automatically installed. Do not commit debug APKs, credentials, signed release keys, application resumes, or real employer answers.

## Android handset smoke-test (explicit user action)

1. Open the [Android Companion Debug APK workflow](https://github.com/EndeavorEverlasting/EscapeHatch/actions/workflows/android-companion.yml) and select a **successful** run on the desired code revision.
2. Download the `EscapeHatch-Android-Assist-debug-test-only` workflow artifact, extract `app-debug.apk`, and transfer it to a test Android handset. GitHub artifact download may require sign-in. Inspect the APK provenance before allowing your phone to install it.
3. On your own test device, grant **Install unknown apps** only to the installer app you deliberately use. Install this debug APK. Android's dialog wording varies. Do not weaken Play Protect or device-wide security to install it.
4. Open EscapeHatch Assist. Fresh launch should show **no application session**. In Chrome/Firefox, use **Share** on a public HTTPS employer job posting and select EscapeHatch Assist.
5. Confirm the incoming job URL is shown; notification controls remain user-invoked; background/resume retains the same job; sharing a second job does not inherit the first job's session ID or unanswered fields. Attempting to share a local HTTP or credential-bearing URL should not seed a session.
6. Capture a privacy-safe pass/fail receipt with handset/Android version, app commit, build run, and the exact action observed. Do not include an employer login, personal résumé, stored responses, or unredacted screenshots.

**This is a controlled beta smoke test, not a claim that Android can autonomously fill employer browser forms or synchronize private desktop career state.**

## Companion experience and boundaries

- The Android launcher opens a companion Activity, with an explicit Share/text and `escapehatch://assist` handoff path.
- The stored Android state is a projection of `escapeHatch.applicationAssistSession.v1`, not a cross-device synchronization service.
- A low-priority notification can make the companion available beside an active browser. Notification permissions on Android 13+ are user-controlled.
- No draw-over-apps permission, Accessibility Service, password capture, silent application submission, or automatic browser DOM injection.
- First launch without a shared opportunity should be an honest empty state rather than a fictitious job/application.

## Release gates before recommending real phone installation

1. Exact-head Gradle build and APK artifact readback.
2. Install in an Android emulator and at least one physical handset, launch, share a real public job URL, return/resume same session and dismiss/restore notification.
3. Validate permission prompts, browser handoff, malicious URLs/intent inputs, persistence, device rotation and absence of sensitive data in build artifacts or logs.
4. Review real packaging/signing, privacy/consent, accessibility, UI/branding and distribution before any public release.

The Android app cannot connect to a Linux Mint desktop merely because the two devices share Wi-Fi. An independently authenticated/scope-limited remote gateway is required; see [Linux and mobile entrypoint gates](../../docs/LINUX_MINT_AND_MOBILE_ENTRYPOINTS.md).

## Existing experiment runner

From repository root:

```bash
python scripts/run_eh_m2_experiments.py
```

The EH-M2 experiment ledger measures evidence capabilities per hypothesis. Source presence and host-side tests alone are not compiled/device proof.
