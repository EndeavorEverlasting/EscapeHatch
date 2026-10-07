#!/usr/bin/env python3
"""Shared P82 evidence-class ranking and promotion checks."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "p82-evidence-class.v1.json"

REQUIRED_FIELDS = (
    "hypothesis_id",
    "hypothesis",
    "evidence_class",
    "minimum_evidence_class",
    "build_artifact",
    "measurement_source",
    "observation",
    "decision",
    "decision_reason",
    "promotion_allowed",
    "proof_ceiling",
    "prototype_level",
)


def load_contract() -> dict[str, Any]:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def ranks(contract: dict[str, Any] | None = None) -> dict[str, int]:
    data = contract or load_contract()
    return {item["id"]: int(item["rank"]) for item in data["evidence_classes"]}


def satisfies(actual: str, minimum: str, contract: dict[str, Any] | None = None) -> bool:
    table = ranks(contract)
    if actual not in table or minimum not in table:
        return False
    return table[actual] >= table[minimum]


def validate_experiment(record: dict[str, Any], contract: dict[str, Any] | None = None) -> list[str]:
    data = contract or load_contract()
    errors: list[str] = []
    hid = record.get("hypothesis_id", "<unknown>")
    for field in REQUIRED_FIELDS:
        if field not in record:
            errors.append(f"{hid}: missing field {field}")
    decision = record.get("decision")
    if decision not in data["decisions"]:
        errors.append(f"{hid}: invalid decision {decision!r}")
    actual = record.get("evidence_class")
    minimum = record.get("minimum_evidence_class")
    table = ranks(data)
    if actual not in table:
        errors.append(f"{hid}: unknown evidence_class {actual!r}")
    if minimum not in table:
        errors.append(f"{hid}: unknown minimum_evidence_class {minimum!r}")
    if actual in table and minimum in table:
        allowed = satisfies(actual, minimum, data)
        claimed = bool(record.get("promotion_allowed"))
        if decision == "PROMOTE" and not allowed:
            errors.append(
                f"{hid}: FAIL — insufficient evidence class for promotion "
                f"(actual={actual}, minimum={minimum})"
            )
        if claimed and not allowed:
            errors.append(
                f"{hid}: promotion_allowed=true but evidence_class {actual} "
                f"does not satisfy minimum {minimum}"
            )
        if decision == "PROMOTE" and not claimed:
            errors.append(f"{hid}: PROMOTE requires promotion_allowed=true")
        if decision == "KEEP" and claimed and not allowed:
            errors.append(f"{hid}: KEEP cannot claim promotion_allowed under insufficient evidence")
    return errors
