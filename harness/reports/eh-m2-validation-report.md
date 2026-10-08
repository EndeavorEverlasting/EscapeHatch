# EH-M2 validation report

**Lane:** EH-M2 P82 evidence capability hardening
**Branch:** `fix/eh-m2-p82-evidence-capabilities-20261007`
**Floor:** `upstream/main` @ `560e734` (PR #57)

## Validation executed

| Command | Outcome |
| --- | --- |
| `python scripts/run_android_assist_presence_spike.py` | PASS — ACCEPTED_DESIGN; no promotion |
| `python scripts/validate_p82_evidence.py` | PASS — capability_containment authority |
| `python scripts/validate_application_assist_presence_surface.py` | PASS |
| `python scripts/run_eh_m2_experiments.py` | PASS — H1–H5/H8 BLOCKED (no JDK/SDK/adb); achieved=P0 |
| `python tests/test_p82_evidence.py` | PASS (10) |
| `python tests/test_application_assist_presence_surface.py` | PASS (7) |
| `python scripts/validate_harness.py` | PASS |
| `git diff --check` | PASS |
| `gradlew :app:assembleDebug` | NOT RUN — JDK/SDK/wrapper unavailable |

## Regression fixtures

| Fixture | Result |
| --- | --- |
| NEG-1 host cannot prove policy | FAIL as required |
| NEG-2 device cannot prove browser | FAIL as required |
| NEG-3 Play release not universal | FAIL as required |
| NEG-4 target masquerading as achieved | FAIL as required |
| POS-1 honest blocked | PASS |
| POS-2 combined evidence | PASS |

## Proof ceiling

Achieved evidence capabilities: **static_reasoning**, **host_execution**, **simulated_state**.
**android_compilation** / **android_runtime** / **browser_integration** / **physical_device** / **play_distribution**: UNPROVEN in this environment.
Scalar `rank` / `highest_evidence_class` are display-only and non-authoritative.
