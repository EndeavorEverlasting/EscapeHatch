# EH-M2 P82 experiment ladder — Android Application Assist

**Lane:** EH-M2
**Canonical plan:** `docs/APPLICATION_ASSIST_MOBILE_M2_P82_PLAN.md`
**Depends on:** EH-M1 presence-surface contract + corrected proof ledger
**Evidence contract:** `contracts/p82-evidence-class.v1.json`
**LKG architecture:** quiet notification + companion activity + Sharesheet/deep-link; no overlay; no Accessibility; Bubbles optional later

## Sprint declaration

| Field | Value |
| --- | --- |
| Repo / branch | EscapeHatch / `fix/eh-m2-p82-evidence-capabilities-20261007` |
| Mission | Capability-based P82 evidence admissibility; honest achieved vs target prototype levels |
| Owned | evidence contract; validators/fixtures; corrected ledger; EH-M2 experiment runner/receipts (evidence-framework only) |
| Forbidden | reopen EH-M1 architecture without stronger evidence; Accessibility; overlay-first; second session store; iOS impl; claiming unobserved proof; rank-based promotion |
| Validation | `python scripts/run_android_assist_presence_spike.py`; `python scripts/validate_p82_evidence.py`; `python scripts/validate_application_assist_presence_surface.py`; `python tests/test_p82_evidence.py`; `python scripts/run_eh_m2_experiments.py`; Android build when SDK present; harness; `git diff --check` |

## Ladder

Promotion authority is **capability containment**, not scalar evidence rank.
Ask: does the evidence establish every required capability? Never: is this evidence type “higher”?

| ID | Achieved | Target | Required capabilities | Notes |
| --- | --- | --- | --- | --- |
| H1 | P0 (until compile) | P1 | `android_compilation` | Gradle app builds |
| H2 | P0 | P2 | `android_runtime`, `emulator_runtime` | deep link Activity |
| H3 | P0 | P3 | `android_runtime`, `browser_integration` | Sharesheet |
| H4 | P0 | P2 | `android_runtime`, `emulator_runtime` | durable session |
| H5 | P0 | P3 | `android_runtime`, `browser_integration` | quiet notification |
| H6 | P0 | P2 | `android_runtime`, `emulator_runtime` | FGS necessity |
| H7 | P0 / static | P2 | Android observations | overlay still unnecessary? KEEP ≠ PROVEN |
| H8 | P0 | P4+ | `android_runtime`, `physical_device` | Bubbles after H5 baseline |

## Acceptance

EH-M2 complete only when H1–H7 have capability evidence meeting their gates (or honest BLOCKED with tooling named). Physical-device may remain successor if unavailable — must stay UNPROVEN, never silently promoted. `achieved_prototype_level` must never copy `target_prototype_level` without supporting capabilities.
