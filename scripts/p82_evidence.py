#!/usr/bin/env python3
"""Shared P82 evidence capability checks (capability containment is sole promotion authority)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "p82-evidence-class.v1.json"

REQUIRED_FIELDS = (
    "hypothesis_id",
    "hypothesis",
    "build_artifact",
    "measurement_source",
    "observation",
    "decision",
    "decision_reason",
    "promotion_allowed",
    "proof_ceiling",
    "achieved_prototype_level",
    "target_prototype_level",
)

PROTOTYPE_ORDER = ("P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7")


def load_contract() -> dict[str, Any]:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def _class_index(contract: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    data = contract or load_contract()
    return {item["id"]: item for item in data["evidence_classes"]}


def display_orders(contract: dict[str, Any] | None = None) -> dict[str, int]:
    """Non-authoritative display/sort order. MUST NOT be used for promotion."""
    data = contract or load_contract()
    out: dict[str, int] = {}
    for item in data["evidence_classes"]:
        out[item["id"]] = int(item.get("display_order", item.get("rank", 0)))
    return out


def ranks(contract: dict[str, Any] | None = None) -> dict[str, int]:
    """Compatibility alias for display_orders. Rank is display-only and non-authoritative."""
    return display_orders(contract)


def capabilities_for(evidence_class: str, contract: dict[str, Any] | None = None) -> list[str]:
    idx = _class_index(contract)
    item = idx.get(evidence_class)
    if not item:
        return []
    return list(item.get("capabilities") or [])


def evidence_records(record: dict[str, Any], contract: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Normalize canonical evidence[] or legacy single evidence_class into evidence records."""
    data = contract or load_contract()
    raw = record.get("evidence")
    if isinstance(raw, list) and raw:
        normalized: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            cls = item.get("evidence_class")
            caps = item.get("capabilities")
            if caps is None and isinstance(cls, str):
                caps = capabilities_for(cls, data)
            normalized.append(
                {
                    "evidence_class": cls,
                    "capabilities": list(caps or []),
                }
            )
        return normalized
    cls = record.get("evidence_class")
    if isinstance(cls, str) and cls:
        return [{"evidence_class": cls, "capabilities": capabilities_for(cls, data)}]
    return []


def aggregate_capabilities(
    evidence: list[dict[str, Any]] | dict[str, Any],
    contract: dict[str, Any] | None = None,
) -> list[str]:
    data = contract or load_contract()
    if isinstance(evidence, dict):
        records = evidence_records(evidence, data)
    else:
        records = evidence
    caps: set[str] = set()
    for item in records:
        declared = item.get("capabilities")
        if declared is None and item.get("evidence_class"):
            declared = capabilities_for(str(item["evidence_class"]), data)
        for cap in declared or []:
            caps.add(str(cap))
    return sorted(caps)


def required_capabilities_for(record: dict[str, Any], contract: dict[str, Any] | None = None) -> list[str]:
    data = contract or load_contract()
    explicit = record.get("required_capabilities")
    if isinstance(explicit, list) and explicit:
        return sorted({str(c) for c in explicit})
    minimum = record.get("minimum_evidence_class")
    if isinstance(minimum, str) and minimum:
        return sorted(capabilities_for(minimum, data))
    return []


def missing_capabilities(actual: list[str] | set[str], required: list[str] | set[str]) -> list[str]:
    have = {str(c) for c in actual}
    need = {str(c) for c in required}
    return sorted(need - have)


def promotion_allowed(record: dict[str, Any], contract: dict[str, Any] | None = None) -> bool:
    data = contract or load_contract()
    actual = aggregate_capabilities(record, data)
    required = required_capabilities_for(record, data)
    if not required:
        return False
    return not missing_capabilities(actual, required)


def _prototype_index(contract: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in contract.get("prototype_levels", [])}


def prototype_supported_by_capabilities(
    level: str,
    caps: list[str] | set[str],
    contract: dict[str, Any] | None = None,
) -> bool:
    data = contract or load_contract()
    proto = _prototype_index(data).get(level)
    if not proto:
        return False
    have = {str(c) for c in caps}
    any_of = proto.get("required_capabilities_any_of")
    if isinstance(any_of, list) and any_of:
        return any(set(group).issubset(have) for group in any_of if isinstance(group, list))
    required = proto.get("required_capabilities") or []
    return set(required).issubset(have)


def max_achieved_prototype_level(
    caps: list[str] | set[str],
    contract: dict[str, Any] | None = None,
) -> str | None:
    data = contract or load_contract()
    achieved: str | None = None
    for level in PROTOTYPE_ORDER:
        if prototype_supported_by_capabilities(level, caps, data):
            achieved = level
    return achieved


def validate_prototype_evidence_alignment(
    record: dict[str, Any],
    contract: dict[str, Any] | None = None,
) -> list[str]:
    data = contract or load_contract()
    errors: list[str] = []
    hid = record.get("hypothesis_id", "<unknown>")
    caps = aggregate_capabilities(record, data)
    achieved = record.get("achieved_prototype_level")
    target = record.get("target_prototype_level")
    proto_ids = set(_prototype_index(data))

    if achieved not in proto_ids:
        errors.append(f"{hid}: unknown achieved_prototype_level {achieved!r}")
    if target not in proto_ids:
        errors.append(f"{hid}: unknown target_prototype_level {target!r}")
    if achieved in proto_ids and not prototype_supported_by_capabilities(str(achieved), caps, data):
        errors.append(
            f"{hid}: FAIL — achieved_prototype_level={achieved} not supported by evidence capabilities "
            f"{caps}"
        )
    if achieved in proto_ids and target in proto_ids:
        # Target may equal achieved only when promotion is honestly allowed at that level.
        if (
            achieved == target
            and record.get("decision") == "BLOCKED"
            and not promotion_allowed(record, data)
        ):
            # Honest blocked can still name a target equal only if evidence already supports it;
            # otherwise this is target masquerading as achieved (NEG-4).
            max_ok = max_achieved_prototype_level(caps, data)
            if max_ok is None or PROTOTYPE_ORDER.index(str(achieved)) > PROTOTYPE_ORDER.index(max_ok):
                errors.append(
                    f"{hid}: FAIL — target prototype cannot masquerade as achieved "
                    f"(achieved={achieved}, max_supported={max_ok})"
                )
    # Deprecated ambiguous prototype_level must not silently inflate achieved.
    legacy = record.get("prototype_level")
    if legacy and achieved and legacy != achieved and legacy == target:
        # Allowed: legacy field retained as target-shaped compatibility metadata.
        pass
    if legacy and achieved and str(legacy) != str(achieved):
        # If legacy equals a higher unsupported level while achieved is honest, OK.
        # If record only has legacy and we synthesized nothing, handled by required fields.
        if str(legacy) in proto_ids and not prototype_supported_by_capabilities(str(legacy), caps, data):
            if record.get("decision") == "PROMOTE" or bool(record.get("promotion_allowed")):
                errors.append(
                    f"{hid}: FAIL — legacy prototype_level={legacy} unsupported by evidence capabilities"
                )
    return errors


def satisfies(actual: str, minimum: str, contract: dict[str, Any] | None = None) -> bool:
    """Legacy name retained: interpret as capability containment, never rank comparison."""
    data = contract or load_contract()
    actual_caps = capabilities_for(actual, data)
    required = capabilities_for(minimum, data)
    if not required:
        return False
    return not missing_capabilities(actual_caps, required)


def validate_experiment(record: dict[str, Any], contract: dict[str, Any] | None = None) -> list[str]:
    data = contract or load_contract()
    errors: list[str] = []
    hid = record.get("hypothesis_id", "<unknown>")

    # Migrate ambiguous prototype_level into achieved/target when possible for validation.
    working = dict(record)
    if "achieved_prototype_level" not in working and "prototype_level" in working:
        # Fail closed: ambiguous field is never treated as achieved evidence.
        # Derive achieved from capabilities; keep legacy value as target hint only.
        caps = aggregate_capabilities(working, data)
        derived = max_achieved_prototype_level(caps, data) or "P0"
        working["achieved_prototype_level"] = derived
        working.setdefault("target_prototype_level", working["prototype_level"])

    for field in REQUIRED_FIELDS:
        if field not in working:
            errors.append(f"{hid}: missing field {field}")

    decision = working.get("decision")
    if decision not in data["decisions"]:
        errors.append(f"{hid}: invalid decision {decision!r}")

    records = evidence_records(working, data)
    if not records:
        errors.append(f"{hid}: missing evidence[] or legacy evidence_class")

    idx = _class_index(data)
    for item in records:
        cls = item.get("evidence_class")
        if cls is not None and cls not in idx:
            errors.append(f"{hid}: unknown evidence_class {cls!r}")
        declared = set(item.get("capabilities") or [])
        if cls in idx:
            expected = set(capabilities_for(str(cls), data))
            if declared and not declared.issubset(expected | set(data.get("capabilities") or [])):
                # Declared caps may equal class caps; extra unknown caps are rejected.
                unknown = declared - set(data.get("capabilities") or [])
                if unknown:
                    errors.append(f"{hid}: unknown capabilities {sorted(unknown)}")
            if declared and cls in idx and not declared.issubset(expected):
                # Evidence record may not claim capabilities its class does not establish.
                extra = declared - expected
                if extra:
                    errors.append(
                        f"{hid}: evidence_class {cls} cannot claim capabilities {sorted(extra)}"
                    )

    minimum = working.get("minimum_evidence_class")
    if minimum is not None and minimum not in idx:
        errors.append(f"{hid}: unknown minimum_evidence_class {minimum!r}")

    required = required_capabilities_for(working, data)
    if not required:
        errors.append(f"{hid}: missing required_capabilities (or legacy minimum_evidence_class)")

    actual_caps = aggregate_capabilities(working, data)
    missing = missing_capabilities(actual_caps, required)
    allowed = not missing and bool(required)
    claimed = bool(working.get("promotion_allowed"))

    if decision == "PROMOTE" and missing:
        errors.append(
            f"{hid}: FAIL — insufficient evidence capabilities for promotion "
            f"(missing={missing}; actual={actual_caps}; required={required})"
        )
    if claimed and missing:
        errors.append(
            f"{hid}: promotion_allowed=true but missing capabilities {missing}"
        )
    if decision == "PROMOTE" and not claimed:
        errors.append(f"{hid}: PROMOTE requires promotion_allowed=true")
    if decision == "KEEP" and claimed and missing:
        errors.append(f"{hid}: KEEP cannot claim promotion_allowed under missing capabilities")

    # Explicit guard: rank/display_order must never authorize promotion.
    if working.get("promotion_authorized_by_rank") is True:
        errors.append(f"{hid}: FAIL — rank must not authorize promotion")

    errors.extend(validate_prototype_evidence_alignment(working, data))

    # Cross-check helper vs claimed flag when no missing fields blocked the computation.
    if required and records and claimed != allowed and decision == "PROMOTE":
        # Already covered by missing-capability errors; keep single authority message.
        pass

    return errors


def achieved_evidence_capabilities(records: list[dict[str, Any]], contract: dict[str, Any] | None = None) -> list[str]:
    data = contract or load_contract()
    caps: set[str] = set()
    for record in records:
        caps.update(aggregate_capabilities(record, data))
    return sorted(caps)
