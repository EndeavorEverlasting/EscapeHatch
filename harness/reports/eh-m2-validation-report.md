# EH-M2 validation report

**Lane:** EH-M2 P82 evidence ladder
**Branch:** `feat/eh-m2-p82-evidence-ladder-20261007`
**Floor:** `upstream/main` @ `5a4e6de`

## Validation executed

| Command | Outcome |
| --- | --- |
| `python scripts/run_android_assist_presence_spike.py` | PASS — ACCEPTED_DESIGN; no promotion |
| `python scripts/validate_p82_evidence.py` | PASS |
| `python scripts/validate_application_assist_presence_surface.py` | PASS |
| `python scripts/run_eh_m2_experiments.py` | PASS — H1–H5/H8 BLOCKED (no JDK/SDK/adb) |
| `python tests/test_p82_evidence.py` | PASS (3) |
| `python tests/test_application_assist_presence_surface.py` | PASS (7) |
| `python scripts/validate_harness.py` | PASS |
| `git diff --check` | PASS |
| `gradlew :app:assembleDebug` | NOT RUN — JDK/SDK/wrapper unavailable |

## Proof ceiling

Highest achieved: **HOST_SIMULATION** (sources + typed receipts).
**COMPILED_ANDROID** and above: BLOCKED in this environment.
