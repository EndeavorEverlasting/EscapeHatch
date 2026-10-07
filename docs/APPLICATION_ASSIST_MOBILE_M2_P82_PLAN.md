# EH-M2 P82 experiment ladder — Android Application Assist

**Lane:** EH-M2  
**Canonical plan:** `docs/APPLICATION_ASSIST_MOBILE_M2_P82_PLAN.md`  
**Depends on:** EH-M1 presence-surface contract + corrected proof ledger  
**Evidence contract:** `contracts/p82-evidence-class.v1.json`  
**LKG architecture:** quiet notification + companion activity + Sharesheet/deep-link; no overlay; no Accessibility; Bubbles optional later  

## Sprint declaration

| Field | Value |
| --- | --- |
| Repo / branch | EscapeHatch / `feat/eh-m2-p82-evidence-ladder-20261007` |
| Mission | Correct EH-M1 evidence semantics; promote Android scaffold through measurable P82 ladder |
| Owned | evidence contract; validators/fixtures; corrected ledger; Gradle app under `android/application-assist/`; EH-M2 experiment runner/receipts |
| Forbidden | reopen EH-M1 architecture without stronger evidence; Accessibility; overlay-first; second session store; iOS impl; claiming unobserved proof |
| Validation | `python scripts/run_android_assist_presence_spike.py`; `python scripts/validate_p82_evidence.py`; `python scripts/validate_application_assist_presence_surface.py`; `python tests/test_p82_evidence.py`; `python scripts/run_eh_m2_experiments.py`; Android build when SDK present; harness; `git diff --check` |

## Ladder

| ID | Prototype | Required evidence | Notes |
| --- | --- | --- | --- |
| H1 | P1 compile | COMPILED_ANDROID | Gradle app builds |
| H2 | P2 emulator | EMULATOR_OBSERVED | deep link Activity |
| H3 | P2/P3 | EMULATOR_OBSERVED / BROWSER_OBSERVED | Sharesheet |
| H4 | P2 | EMULATOR_OBSERVED | durable session |
| H5 | P3/P4 | BROWSER_OBSERVED / PHYSICAL_DEVICE_OBSERVED | quiet notification |
| H6 | P2+ | EMULATOR_OBSERVED+ | FGS necessity |
| H7 | from H2–H6 | Android observations | overlay still unnecessary? |
| H8 | P4 | PHYSICAL_DEVICE_OBSERVED | Bubbles after H5 baseline |

## Acceptance

EH-M2 complete only when H1–H7 have evidence classes meeting their gates (or honest BLOCKED with tooling named). Physical-device may remain successor if unavailable — must stay UNPROVEN, never silently promoted.
