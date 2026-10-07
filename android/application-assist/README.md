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
