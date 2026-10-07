#!/usr/bin/env python3
"""Fail-closed P82 evidence-class validator + proof-inflation fixtures."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from p82_evidence import REQUIRED_FIELDS, load_contract, validate_experiment  # noqa: E402

CONTRACT = ROOT / "contracts" / "p82-evidence-class.v1.json"
NEG = ROOT / "fixtures" / "p82-proof-inflation.negative.json"
POS = ROOT / "fixtures" / "p82-proof-inflation.positive-keep.json"
SPIKE_RECEIPT = ROOT / "harness" / "reports" / "android-assist-presence-spike-receipt.v1.json"


def main() -> int:
    errors: list[str] = []
    contract = load_contract()
    if contract.get("schema") != "escapehatch/p82-evidence-class/v1":
        errors.append("bad p82 evidence schema")
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

    if not NEG.is_file() or not POS.is_file():
        errors.append("missing proof-inflation fixtures")
    else:
        neg = json.loads(NEG.read_text(encoding="utf-8"))
        pos = json.loads(POS.read_text(encoding="utf-8"))
        neg_errs = validate_experiment(neg, contract)
        if not any("insufficient evidence class for promotion" in e for e in neg_errs):
            errors.append("negative fixture must fail promotion inflation check")
        pos_errs = validate_experiment(pos, contract)
        if pos_errs:
            errors.append(f"positive KEEP fixture unexpectedly failed: {pos_errs}")

    if SPIKE_RECEIPT.is_file():
        receipt = json.loads(SPIKE_RECEIPT.read_text(encoding="utf-8"))
        for item in receipt.get("iterations", []):
            for field in REQUIRED_FIELDS:
                if field not in item:
                    errors.append(f"spike receipt {item.get('hypothesis_id')}: missing {field}")
            errors.extend(validate_experiment(item, contract))
            if item.get("decision") == "PROMOTE" and item.get("evidence_class") == "HOST_SIMULATION":
                if item.get("minimum_evidence_class") in {
                    "EMULATOR_OBSERVED",
                    "BROWSER_OBSERVED",
                    "PHYSICAL_DEVICE_OBSERVED",
                }:
                    errors.append("spike receipt illegaly promotes host simulation")
            if item.get("promotion_allowed") is True and item.get("evidence_class") in {
                "HOST_SIMULATION",
                "STATIC_REASONING",
            }:
                # Only illegal when minimum requires higher — validate_experiment covers it.
                pass
        acceptance = receipt.get("acceptance", {})
        if acceptance.get("any_promotion_allowed") is True:
            errors.append("EH-M1 spike receipt must not claim any_promotion_allowed=true")
        if receipt.get("architecture_decision", {}).get("status") == "DECIDED" and receipt.get(
            "architecture_decision", {}
        ).get("empirical_android_proof") is not False:
            # Legacy DECIDED without empirical flag is inflation.
            if "empirical_android_proof" not in receipt.get("architecture_decision", {}):
                errors.append("architecture_decision must declare empirical_android_proof")

    if errors:
        print("P82_EVIDENCE: FAIL")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("P82_EVIDENCE: PASS")
    print(f"contract={CONTRACT.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
