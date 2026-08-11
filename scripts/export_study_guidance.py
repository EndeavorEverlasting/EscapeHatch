#!/usr/bin/env python3
"""Export EscapeHatch study_guidance records as StudySyndicate guidance packets."""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "fixtures/career-state.v1.example.json"
VALIDATOR = ROOT / "scripts/validate_career_state.py"
CONTRACT = "study-syndicate/study-guidance/v1"


class ExportError(ValueError):
    pass


def load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ExportError(str(exc)) from exc


def validate_state(state):
    spec = importlib.util.spec_from_file_location("escapehatch_career_state_validator", VALIDATOR)
    if spec is None or spec.loader is None:
        raise ExportError("unable to load career-state validator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        module.validate(state)
    except module.ContractError as exc:
        raise ExportError(f"career state invalid: {exc}") from exc


def export_record(state, record):
    if record.get("contract") != CONTRACT:
        raise ExportError("guidance contract mismatch")
    application_id = record.get("application_id")
    if application_id:
        application = next((item for item in state.get("applications", []) if item.get("id") == application_id), None)
        if application is None:
            raise ExportError(f"guidance application not found: {application_id}")
        if application.get("opportunity_id") != record.get("opportunity_id"):
            raise ExportError("guidance application/opportunity provenance mismatch")
    origin = {
        "system": "escapehatch",
        "recordType": "application" if application_id else "opportunity",
        "recordId": application_id or record["opportunity_id"],
    }
    trigger = {"kind": record["trigger_kind"], "reason": record["reason"]}
    if record.get("cascade_concept_ids"):
        trigger["cascadeConceptIds"] = record["cascade_concept_ids"]
    concepts = [
        {"conceptId": item["concept_id"], "reason": item["reason"], "priority": item["priority"]}
        for item in record["concepts"]
    ]
    resources = []
    for resource in record["resources"]:
        output = {
            "kind": resource["kind"],
            "title": resource["title"],
            "relation": resource["relation"],
        }
        for source_key, target_key in (
            ("author", "author"),
            ("locator", "locator"),
            ("note", "note"),
            ("concept_ids", "conceptIds"),
        ):
            if source_key in resource:
                output[target_key] = resource[source_key]
        resources.append(output)
    return {
        "guidanceId": record["id"],
        "origin": origin,
        "trigger": trigger,
        "iteration": record["iteration"],
        "concepts": concepts,
        "resources": resources,
        "status": record["status"],
    }


def export_all(state):
    validate_state(state)
    return [export_record(state, record) for record in state.get("study_guidance", [])]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("state", nargs="?", default=str(DEFAULT))
    parser.add_argument("--guidance-id")
    args = parser.parse_args()
    try:
        state = load(args.state)
        packets = export_all(state)
        if args.guidance_id:
            packets = [item for item in packets if item["guidanceId"] == args.guidance_id]
            if not packets:
                raise ExportError(f"guidance id not found: {args.guidance_id}")
        print(json.dumps(packets[0] if args.guidance_id else packets, indent=2, sort_keys=True))
        return 0
    except (ExportError, KeyError, TypeError) as exc:
        print(f"STUDY_GUIDANCE_EXPORT: FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
