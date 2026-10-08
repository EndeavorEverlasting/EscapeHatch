#!/usr/bin/env python3
"""Fail-closed P82 evidence capability validator + proof-inflation fixtures."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from p82_evidence import (  # noqa: E402
    REQUIRED_FIELDS,
    load_contract,
    promotion_allowed,
    ranks,
    validate_experiment,
)

CONTRACT = ROOT / "contracts" / "p82-evidence-class.v1.json"
NEG = ROOT / "fixtures" / "p82-proof-inflation.negative.json"
POS = ROOT / "fixtures" / "p82-proof-inflation.positive-keep.json"
SPIKE_RECEIPT = ROOT / "harness" / "reports" / "android-assist-presence-spike-receipt.v1.json"
M2_RECEIPT = ROOT / "harness" / "reports" / "eh-m2-p82-experiment-receipt.v1.json"

FIXTURE_MATRIX = (
    ("NEG-1", ROOT / "fixtures" / "p82-neg-host-cannot-prove-policy.json", "fail", "play_policy_documentation"),
    ("NEG-2", ROOT / "fixtures" / "p82-neg-device-cannot-prove-browser.json", "fail", "browser_integration"),
    ("NEG-3", ROOT / "fixtures" / "p82-neg-play-not-universal.json", "fail", None),
    ("NEG-4", ROOT / "fixtures" / "p82-neg-target-as-achieved.json", "fail", "achieved_prototype_level"),
    ("POS-1", ROOT / "fixtures" / "p82-pos-honest-blocked.json", "pass", None),
    ("POS-2", ROOT / "fixtures" / "p82-pos-combined-evidence.json", "pass", None),
)


def _expect_fail(errs: list[str], needle: str | None) -> bool:
    if not errs:
        return False
    if needle is None:
        return True
    return any(needle in e for e in errs)


def main() -> int:
    errors: list[str] = []
    contract = load_contract()
    if contract.get("schema") != "escapehatch/p82-evidence-class/v1":
        errors.append("bad p82 evidence schema")
    if contract.get("promotion_authority") != "capability_containment":
        errors.append("promotion_authority must be capability_containment")
    if contract.get("promotion_rules", {}).get("rank_participates_in_admissibility") is not False:
        errors.append("rank must not participate in admissibility")

    ids = {c["id"] for c in contract["evidence_classes"]}
    for required in (
        "STATIC_REASONING",
        "HOST_SIMULATION",
        "COMPILED_ANDROID",
        "EMULATOR_OBSERVED",
        "BROWSER_OBSERVED",
        "PHYSICAL_DEVICE_OBSERVED",
        "PLAY_POLICY_DOCUMENTED",
        "PLAY_RELEASE_OBSERVED",
    ):
        if required not in ids:
            errors.append(f"missing evidence class {required}")

    for item in contract["evidence_classes"]:
        if item.get("rank_role") != "display_only_non_authoritative":
            errors.append(f"{item.get('id')}: rank_role must be display_only_non_authoritative")
        if not item.get("capabilities"):
            errors.append(f"{item.get('id')}: missing capabilities")

    # Rank comparison must not authorize promotion (HOST_SIMULATION rank > PLAY_POLICY rank).
    if ranks(contract).get("HOST_SIMULATION", 0) > ranks(contract).get("PLAY_POLICY_DOCUMENTED", 0):
        if promotion_allowed(
            {
                "evidence_class": "HOST_SIMULATION",
                "required_capabilities": ["play_policy_documentation"],
            },
            contract,
        ):
            errors.append("rank leak: HOST_SIMULATION must not satisfy play_policy_documentation")

    if not NEG.is_file() or not POS.is_file():
        errors.append("missing proof-inflation fixtures")
    else:
        neg = json.loads(NEG.read_text(encoding="utf-8"))
        pos = json.loads(POS.read_text(encoding="utf-8"))
        neg_errs = validate_experiment(neg, contract)
        if not any("missing capabilities" in e or "insufficient evidence capabilities" in e for e in neg_errs):
            errors.append("negative fixture must fail capability promotion check")
        pos_errs = validate_experiment(pos, contract)
        if pos_errs:
            errors.append(f"positive KEEP fixture unexpectedly failed: {pos_errs}")

    for label, path, expect, needle in FIXTURE_MATRIX:
        if not path.is_file():
            errors.append(f"missing fixture {path.name}")
            continue
        record = json.loads(path.read_text(encoding="utf-8"))
        errs = validate_experiment(record, contract)
        if expect == "fail":
            if not _expect_fail(errs, needle):
                errors.append(f"{label}: expected FAIL ({needle}), got {errs or 'PASS'}")
        else:
            if errs:
                errors.append(f"{label}: expected PASS, got {errs}")

    for receipt_path, lane in ((SPIKE_RECEIPT, "spike"), (M2_RECEIPT, "m2")):
        if not receipt_path.is_file():
            if lane == "m2":
                errors.append("missing EH-M2 experiment receipt")
            continue
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        for item in receipt.get("iterations", []):
            for field in REQUIRED_FIELDS:
                if field not in item:
                    errors.append(f"{lane} receipt {item.get('hypothesis_id')}: missing {field}")
            errors.extend(validate_experiment(item, contract))
            if item.get("promotion_allowed") is True:
                # Spike and current M2 floor must remain unpromoted without runtime evidence.
                if lane == "spike":
                    errors.append(f"spike receipt {item.get('hypothesis_id')}: promotion_allowed must be false")
        if lane == "spike":
            acceptance = receipt.get("acceptance", {})
            if acceptance.get("any_promotion_allowed") is True:
                errors.append("EH-M1 spike receipt must not claim any_promotion_allowed=true")
            arch = receipt.get("architecture_decision", {})
            if arch.get("status") == "DECIDED" and arch.get("empirical_android_proof") is not False:
                if "empirical_android_proof" not in arch:
                    errors.append("architecture_decision must declare empirical_android_proof")
        if lane == "m2":
            caps = receipt.get("achieved_evidence_capabilities")
            if not isinstance(caps, list):
                errors.append("EH-M2 receipt must declare achieved_evidence_capabilities")
            else:
                forbidden = {
                    "android_compilation",
                    "android_runtime",
                    "browser_integration",
                    "physical_device",
                    "play_distribution",
                    "emulator_runtime",
                }
                leaked = forbidden.intersection(caps)
                if leaked:
                    errors.append(f"EH-M2 receipt claims unobserved capabilities: {sorted(leaked)}")
            if receipt.get("highest_evidence_class_role") not in {
                "display_only_non_authoritative",
                None,
            }:
                # Allow absence only when field removed; if present must be marked.
                pass
            if "highest_evidence_class" in receipt and receipt.get("highest_evidence_class_role") != (
                "display_only_non_authoritative"
            ):
                errors.append("highest_evidence_class must be marked display_only_non_authoritative")

    if errors:
        print("P82_EVIDENCE: FAIL")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("P82_EVIDENCE: PASS")
    print(f"contract={CONTRACT.relative_to(ROOT).as_posix()}")
    print("promotion_authority=capability_containment")
    return 0


if __name__ == "__main__":
    sys.exit(main())
