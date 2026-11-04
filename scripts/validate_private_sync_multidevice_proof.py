#!/usr/bin/env python3
"""Validate private-sync multi-device proof ledger shape and completion rule (value-free)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SCHEMA = "escapehatch/private-sync-multidevice-proof/v1"
DIGEST = re.compile(r"^[a-f0-9]{64}$")
CONTRACT = Path(__file__).resolve().parents[1] / "harness" / "contracts" / "private-sync-multidevice-proof.v1.json"


def validate_ledger(data: dict) -> list[str]:
    errors: list[str] = []
    if data.get("schema") != SCHEMA:
        errors.append("schema mismatch")
    digest = data.get("projectionDigest")
    if not isinstance(digest, str) or not DIGEST.match(digest):
        errors.append("projectionDigest must be 64 lowercase hex")
    if not isinstance(data.get("reusableAnswerCount"), int) or data["reusableAnswerCount"] < 0:
        errors.append("reusableAnswerCount invalid")
    devices = data.get("devices")
    if not isinstance(devices, list) or len(devices) < 3:
        errors.append("devices must list at least 3 entries")
        return errors
    ids = {d.get("id") for d in devices if isinstance(d, dict)}
    if "desktop" not in ids or "android-phone" not in ids:
        errors.append("devices must include desktop and android-phone")
    if not ({"laptop", "laptop-sim"} & ids):
        errors.append("devices must include laptop or laptop-sim")
    for d in devices:
        if not isinstance(d, dict):
            errors.append("device entry not object")
            continue
        for key in ("id", "status", "digestMatch", "proof"):
            if key not in d:
                errors.append(f"device missing {key}")
        if not isinstance(d.get("digestMatch"), bool):
            errors.append("digestMatch must be boolean")
    three = data.get("threeOfThree")
    if not isinstance(three, bool):
        errors.append("threeOfThree must be boolean")
        return errors
    if three:
        by_id = {d["id"]: d for d in devices if isinstance(d, dict) and "id" in d}
        phone = by_id.get("android-phone") or {}
        desk = by_id.get("desktop") or {}
        peer = by_id.get("laptop") or by_id.get("laptop-sim") or {}
        if not (desk.get("digestMatch") and peer.get("digestMatch") and phone.get("digestMatch")):
            errors.append("threeOfThree true but digestMatch incomplete")
        if phone.get("proof") == "AWAITING_DEVICE" or phone.get("status") == "UNPROVEN":
            errors.append("threeOfThree true but android-phone still unproven")
    return errors


def self_test() -> None:
    good = {
        "schema": SCHEMA,
        "updatedAt": "2026-11-04T00:00:00Z",
        "carrierKind": "folder",
        "projectionDigest": "a" * 64,
        "reusableAnswerCount": 26,
        "devices": [
            {"id": "desktop", "status": "SYNCED", "digestMatch": True, "proof": "LIVE_HOST"},
            {"id": "laptop-sim", "status": "SYNCED", "digestMatch": True, "proof": "ALTERNATE_DATA_HOME"},
            {"id": "android-phone", "status": "UNPROVEN", "digestMatch": False, "proof": "AWAITING_DEVICE"},
        ],
        "threeOfThree": False,
    }
    assert validate_ledger(good) == []
    bad = dict(good)
    bad["threeOfThree"] = True
    assert any("unproven" in e for e in validate_ledger(bad))
    assert CONTRACT.is_file()


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        self_test()
        print("validate_private_sync_multidevice_proof: self-test OK")
        return 0
    path = Path(argv[1]) if len(argv) > 1 else None
    if not path:
        print("Usage: validate_private_sync_multidevice_proof.py --self-test | <ledger.json>", file=sys.stderr)
        return 2
    data = json.loads(path.read_text(encoding="utf-8"))
    errors = validate_ledger(data)
    if errors:
        print("INVALID:", "; ".join(errors), file=sys.stderr)
        return 1
    print(f"OK threeOfThree={data.get('threeOfThree')} devices={len(data.get('devices', []))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
