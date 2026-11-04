#!/usr/bin/env python3
"""Validate the repository-owned P04 secure sync dispatch manifest.

This validates routing and claimed proof states. GitHub Actions independently
executes the CI jobs; the validator never simulates a local-agent launch.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "Outputs/prompt-parallel-dispatch/runs/escapehatch-secure-device-sync-20261103/manifest.json"
WORKFLOW = ROOT / ".github/workflows/private-profile-sync-security.yml"
EXPECTED_CI_JOBS = {"capsule-confidentiality", "two-device-conflict"}


def validate(path: Path = DEFAULT_MANIFEST) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != "prompt-parallel-dispatch/v1":
        raise ValueError("P04 manifest schema missing")
    if data.get("repository") != "EndeavorEverlasting/EscapeHatch":
        raise ValueError("Wrong repository")
    if data.get("run_id") != "escapehatch-secure-device-sync-20261103":
        raise ValueError("Wrong run identity")
    lanes = data.get("lanes")
    if not isinstance(lanes, list) or len(lanes) < 5:
        raise ValueError("Incomplete dispatch lanes")
    ids = [item.get("lane_id") for item in lanes]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate lane IDs")
    if set(data.get("launch_order", [])) != set(ids):
        raise ValueError("Launch order does not cover the lanes exactly")
    ci = [item for item in lanes if item.get("execution_environment") == "CI_OR_REMOTE_RUNNER"]
    names = {item.get("adapter", {}).get("job") for item in ci}
    if names != EXPECTED_CI_JOBS:
        raise ValueError("Wrong or missing GitHub Actions jobs")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    if not all(("\n  " + name + ":") in workflow for name in EXPECTED_CI_JOBS):
        raise ValueError("Dispatch references nonexistent CI job")
    for item in ci:
        launch = item.get("launch") or {}
        if launch.get("mode") != "automatic_pull_request_check":
            raise ValueError("CI must launch on PR without operator action")
        if item.get("owned_mutation_surfaces") != []:
            raise ValueError("Synthetic CI must not write applicant state")
    for item in lanes:
        if item.get("execution_environment") == "LOCAL_AGENT_RUNTIME":
            if item.get("status", "").startswith("PASS"):
                raise ValueError("Unobserved local device cannot claim a pass")
            if not item.get("dependencies"):
                raise ValueError("Device action lacks dependency gates")
    if data.get("statuses", {}).get("installed") or data.get("statuses", {}).get("provider_synced"):
        raise ValueError("Manifest claims unobserved device/provider activation")
    return {"valid": True, "ci_jobs": sorted(names), "local_lanes": len(lanes) - len(ci)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    try:
        outcome = validate(args.manifest)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"P04_DISPATCH_INVALID: {exc}")
        return 1
    print(json.dumps(outcome, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
