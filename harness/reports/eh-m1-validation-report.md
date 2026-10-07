# EH-M1 validation report

**Lane:** EH-M1 — Mobile Application Assist presence surface
**Branch:** `feat/eh-m1-android-assist-presence-20261007`
**Floor:** `main` @ `e54e77dbfbe1ff3f4dbf4ce87dd1c00f3c969f9f` (pre-sprint)

## Designed

- Platform-neutral presence-surface contract
- Android capability matrix
- ADR (quiet notification primary; overlay rejected)
- Successor lanes EH-M2/M3/M4
- iOS constraints (non-implementation)

## Implemented

- Contract, docs, ADR, fixture
- Host-side spike runner + Kotlin stubs + AndroidManifest sketch
- Validator + unit tests + registry/roadmap cross-links

## Locally validated

| Command | Outcome |
| --- | --- |
| `python scripts/run_android_assist_presence_spike.py` | PASS — DECIDED preferred=`notification_foreground_service + companion_activity`; H1–H6 KEEP |
| `python scripts/validate_application_assist_presence_surface.py` | PASS |
| `python tests/test_application_assist_presence_surface.py` | PASS — 7 tests |
| `python scripts/validate_harness.py` | PASS |
| `git diff --check` | PASS |

## Integration validated

- Not claimed until merged to default branch with owning checks green.

## Proof ceiling

- Host-side simulation: in scope
- Physical Android device / Play Store: BLOCKED (no JDK/Android SDK in EH-M1 environment)
