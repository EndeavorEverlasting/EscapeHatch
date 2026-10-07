#!/usr/bin/env python3
"""Fail-closed validator for EH-M1 presence-surface contract + spike receipt."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from p82_evidence import validate_experiment  # noqa: E402

CONTRACT = ROOT / "contracts" / "application-assist-presence-surface.v1.json"
SESSION = ROOT / "contracts" / "application-assist-session.v1.json"
EVIDENCE = ROOT / "contracts" / "p82-evidence-class.v1.json"
PLAN = ROOT / "docs" / "APPLICATION_ASSIST_MOBILE_PRESENCE_PLAN.md"
MATRIX = ROOT / "docs" / "APPLICATION_ASSIST_ANDROID_CAPABILITY_MATRIX.md"
ADR = ROOT / "docs" / "adr" / "ADR-20261007-android-assist-presence-v1.md"
LEDGER = ROOT / "harness" / "reports" / "eh-m1-corrected-proof-ledger.md"
SPIKE_README = ROOT / "android" / "application-assist-spike" / "README.md"
RECEIPT = ROOT / "harness" / "reports" / "android-assist-presence-spike-receipt.v1.json"
REGISTRY = ROOT / "ARTIFACT_REGISTRY.md"
AUTOPILOT = ROOT / "docs" / "APPLICATION_ASSIST_AUTOPILOT_PLAN.md"

REQUIRED_AFFORDANCE = {
    "unavailable",
    "dormant",
    "available",
    "surfaced",
    "expanded",
    "temporarily_dismissed",
    "session_ended",
}
REQUIRED_ACTIONS = {
    "resume_assist_session",
    "inspect_application_context",
    "answer_or_copy_field_response",
    "open_command_sheet",
    "capture_or_paste_question",
    "mark_field_or_application_progress",
    "handoff_to_full_experience",
    "dismiss_or_minimize",
    "end_session",
}
REQUIRED_ADAPTERS = {
    "desktop_in_page_beacon",
    "android_presence_surface",
    "ios_constrained_surface",
}


def fail(msg: str) -> None:
    raise AssertionError(msg)


def main() -> int:
    errors: list[str] = []

    def check(cond: bool, msg: str) -> None:
        if not cond:
            errors.append(msg)

    for path in (CONTRACT, SESSION, EVIDENCE, PLAN, MATRIX, ADR, LEDGER, SPIKE_README, REGISTRY, AUTOPILOT):
        check(path.is_file(), f"missing required artifact: {path.relative_to(ROOT)}")

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    session = json.loads(SESSION.read_text(encoding="utf-8"))

    check(contract.get("schema") == "escapehatch/application-assist-presence-surface/v1", "bad surface schema")
    check(contract.get("not_eh_u1") is True, "must declare not_eh_u1")
    check(contract.get("lane") == "EH-M1", "lane must be EH-M1")
    check(
        contract["dependencies"]["session_schema"] == session["schema"],
        "surface must depend on live session schema",
    )
    check(
        contract["session_identity"]["storage_key"] == session["storage"]["session_key"],
        "surface must reuse session storage key",
    )
    affordance = {s["id"] for s in contract["presentation_affordance_states"]}
    check(affordance == REQUIRED_AFFORDANCE, f"affordance states mismatch: {affordance}")
    actions = {a["id"] for a in contract["logical_actions"]}
    check(REQUIRED_ACTIONS <= actions, f"missing actions: {REQUIRED_ACTIONS - actions}")
    adapters = {a["id"] for a in contract["adapters"]}
    check(REQUIRED_ADAPTERS <= adapters, f"missing adapters: {REQUIRED_ADAPTERS - adapters}")
    check(contract["android_v1_policy"]["accessibility_service"] == "forbidden_as_v1_requirement", "a11y policy")
    check("no_second_application_state_machine" in contract["invariants"], "missing invariant")
    check(contract["doctrine"]["presence_not_nagging"] is True, "doctrine")

    plan = PLAN.read_text(encoding="utf-8")
    for marker in (
        "EH-M1",
        "not EH-U1",
        "presence-surface",
        "Android-first",
        "iOS",
        "NEXT LANES",
    ):
        check(marker in plan, f"plan missing marker: {marker}")

    matrix = MATRIX.read_text(encoding="utf-8")
    for mech in (
        "Android Bubbles",
        "SYSTEM_ALERT_WINDOW",
        "notification",
        "Sharesheet",
        "Accessibility",
    ):
        check(mech in matrix, f"matrix missing: {mech}")

    adr = ADR.read_text(encoding="utf-8")
    adr_l = adr.lower()
    check(
        "notification_foreground_service" in adr
        or "quiet ongoing notification" in adr_l
        or "quiet notification" in adr_l,
        "ADR missing preferred mechanism",
    )
    check("SYSTEM_ALERT_WINDOW" in adr, "ADR must discuss overlay")
    check("accepted" in adr_l and "status" in adr_l, "ADR status")

    if not RECEIPT.is_file():
        errors.append("missing spike receipt; run scripts/run_android_assist_presence_spike.py")
    else:
        receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
        arch = receipt.get("architecture_decision", {})
        check(arch.get("status") == "ACCEPTED_DESIGN", "architecture must be ACCEPTED_DESIGN not empirical DECIDED")
        check(arch.get("empirical_android_proof") is False, "architecture must declare empirical_android_proof=false")
        check(receipt.get("acceptance", {}).get("architecture_accepted_design") is True, "acceptance missing design flag")
        check(receipt.get("acceptance", {}).get("any_promotion_allowed") is False, "spike must not claim promotion")
        check(
            "SYSTEM_ALERT_WINDOW" in arch.get("permissions_not_required_for_v1", []),
            "overlay must remain not required",
        )
        for item in receipt.get("iterations", []):
            for err in validate_experiment(item):
                errors.append(err)
            if item.get("decision") == "PROMOTE":
                errors.append(f"{item.get('hypothesis_id')}: EH-M1 spike must not PROMOTE Android claims")
            if item.get("promotion_allowed") is True:
                errors.append(f"{item.get('hypothesis_id')}: promotion_allowed must be false on EH-M1 host spike")
        ledger = LEDGER.read_text(encoding="utf-8")
        for marker in (
            "UNOBSERVED_ANDROID",
            "HOST_SIMULATION_PROVEN",
            "ACCEPTED DESIGN",
            "KEEP is not PROVEN",
        ):
            check(marker in ledger, f"corrected ledger missing marker: {marker}")

    registry = REGISTRY.read_text(encoding="utf-8")
    check("application-assist-presence-surface.v1.json" in registry, "registry missing surface contract")
    check("android-assist-presence-spike-receipt" in registry or "Android assist presence spike" in registry, "registry missing spike")

    autopilot = AUTOPILOT.read_text(encoding="utf-8")
    check("EH-M1" in autopilot, "autopilot plan must cross-link EH-M1")

    kotlin_dir = ROOT / "android" / "application-assist-spike" / "src" / "main" / "kotlin" / "com" / "escapehatch" / "assist" / "spike"
    for name in (
        "AssistSessionStore.kt",
        "PresenceSurfaceStateMachine.kt",
        "HandoffIntents.kt",
        "QuietNotificationPresence.kt",
        "BubblePresenceCandidate.kt",
        "OverlayPresenceRejected.kt",
    ):
        check((kotlin_dir / name).is_file(), f"missing kotlin spike file: {name}")

    if errors:
        print("APPLICATION_ASSIST_PRESENCE_SURFACE: FAIL")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("APPLICATION_ASSIST_PRESENCE_SURFACE: PASS")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"APPLICATION_ASSIST_PRESENCE_SURFACE: FAIL\n  - {exc}")
        sys.exit(1)
