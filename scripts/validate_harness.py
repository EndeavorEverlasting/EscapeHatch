#!/usr/bin/env python3
"""Validate EscapeHatch operational harness completeness and ownership."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST = REPO_ROOT / "harness" / "manifest.v1.json"
EXPECTED_SCHEMA = "escapehatch-harness/v1"
REQUIRED_COMPONENT_KEYS = (
    "codebase_map",
    "workflow_specs",
    "artifact_registry",
    "harness_validator",
    "governance_validator",
    "pre_commit_hook",
    "pre_push_hook",
    "scoped_skill",
    "operator_report",
    "lua_design_constraints",
    "ci_workflow",
)
REQUIRED_MAP_MARKERS = (
    "## Repository floor",
    "## Structure",
    "## Product entry points",
    "## Validation commands",
    "## Build, test, and deploy commands",
    "## Fresh-agent path",
)
REQUIRED_WORKFLOW_MARKERS = (
    "## Task Pickup",
    "## Pre-commit validation",
    "## Failure Recovery",
    "## Artifact discipline",
    "## Handoff",
    "## Product-runtime introduction gate",
)
REQUIRED_ARTIFACT_MARKERS = (
    "## Naming rules",
    "## Registered artifacts",
    "## Validation output",
    "## Product artifact gate",
)
REQUIRED_LUA_MARKERS = (
    "## Host owns the application",
    "## State isolation",
    "## Error boundary",
    "## Sandboxing",
    "## Execution model",
    "## Type discipline",
    "## Conceptual integrity",
    "## Validation expectations for the first Lua product sprint",
)

PRE_COMMIT_ACTIVE_LINES = (
    'repo=$(git rev-parse --show-toplevel)',
    'git -C "$repo" checkout-index --all --prefix="$snapshot/"',
    'python scripts/validate_governance.py',
    'python scripts/validate_harness.py',
    'git -C "$repo" diff --cached --check',
)
PRE_PUSH_ACTIVE_LINES = (
    'while read -r local_ref local_sha remote_ref remote_sha',
    'git archive --format=tar --output="$archive" "$local_sha"',
    'python scripts/validate_governance.py',
    'python scripts/validate_harness.py',
    'git diff --check "$base" "$local_sha" --',
)


class HarnessError(ValueError):
    """Raised when a harness contract is missing or malformed."""


def fail(message: str) -> int:
    print(f"HARNESS_VALIDATION: FAIL: {message}", file=sys.stderr)
    return 1


def read_text(relative: str) -> str:
    path = REPO_ROOT / relative
    if not path.is_file():
        raise HarnessError(f"missing component: {relative}")
    return path.read_text(encoding="utf-8")


def require_markers(relative: str, markers: tuple[str, ...]) -> None:
    text = read_text(relative)
    missing = [marker for marker in markers if marker not in text]
    if missing:
        raise HarnessError(f"{relative} missing markers: " + ", ".join(missing))


def validate_manifest() -> dict:
    if not MANIFEST.is_file():
        raise HarnessError("missing harness/manifest.v1.json")
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HarnessError(f"invalid harness manifest JSON: {exc}") from exc

    if data.get("schema") != EXPECTED_SCHEMA:
        raise HarnessError(f"unexpected manifest schema: {data.get('schema')!r}")
    if data.get("canonical_governance") != "AGENTS.md":
        raise HarnessError("manifest must point canonical_governance to AGENTS.md")

    components = data.get("components")
    if not isinstance(components, dict):
        raise HarnessError("manifest components must be an object")
    missing = [key for key in REQUIRED_COMPONENT_KEYS if key not in components]
    if missing:
        raise HarnessError("manifest missing component keys: " + ", ".join(missing))

    values = [components[key] for key in REQUIRED_COMPONENT_KEYS]
    if len(values) != len(set(values)):
        raise HarnessError("manifest component paths must be unique")

    for key in REQUIRED_COMPONENT_KEYS:
        relative = components[key]
        if (
            not isinstance(relative, str)
            or not relative
            or relative.startswith("/")
            or ".." in Path(relative).parts
        ):
            raise HarnessError(f"invalid component path for {key}: {relative!r}")
        if not (REPO_ROOT / relative).is_file():
            raise HarnessError(f"manifest component missing on disk: {key} -> {relative}")

    expected_order = [
        "python scripts/validate_governance.py",
        "python scripts/validate_harness.py",
        "git diff --check",
    ]
    if data.get("validation_order") != expected_order:
        raise HarnessError("manifest validation_order is not canonical")
    if data.get("artifact_registry") != components["artifact_registry"]:
        raise HarnessError("artifact_registry alias must match registered component path")
    return data


def active_shell_lines(text: str) -> tuple[str, ...]:
    """Return executable-looking shell source lines, excluding blanks/comments."""
    return tuple(
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )


def validate_hook_text(relative: str, text: str, required_lines: tuple[str, ...]) -> None:
    if not text.startswith("#!/bin/sh\nset -eu\n"):
        raise HarnessError(f"{relative} must fail closed with sh + set -eu")
    active = active_shell_lines(text)
    missing = [line for line in required_lines if line not in active]
    if missing:
        raise HarnessError(
            f"{relative} missing active shell commands: " + ", ".join(missing)
        )


def validate_hooks(components: dict[str, str]) -> int:
    pre_commit_path = components["pre_commit_hook"]
    pre_push_path = components["pre_push_hook"]
    pre_commit = read_text(pre_commit_path)
    pre_push = read_text(pre_push_path)

    validate_hook_text(pre_commit_path, pre_commit, PRE_COMMIT_ACTIVE_LINES)
    validate_hook_text(pre_push_path, pre_push, PRE_PUSH_ACTIVE_LINES)

    # Negative fixtures ensure required commands cannot be satisfied by comments/text.
    self_tests = 0
    for relative, source, required_lines in (
        (pre_commit_path, pre_commit, PRE_COMMIT_ACTIVE_LINES),
        (pre_push_path, pre_push, PRE_PUSH_ACTIVE_LINES),
    ):
        command = "python scripts/validate_harness.py"
        commented = source.replace(command, f"# {command}", 1)
        try:
            validate_hook_text(relative, commented, required_lines)
        except HarnessError:
            self_tests += 1
        else:
            raise HarnessError(f"hook negative fixture unexpectedly passed: {relative}: comment")

        quoted = source.replace(command, f"echo '{command}'", 1)
        try:
            validate_hook_text(relative, quoted, required_lines)
        except HarnessError:
            self_tests += 1
        else:
            raise HarnessError(f"hook negative fixture unexpectedly passed: {relative}: echo")

    return self_tests


def validate_ci(relative: str) -> None:
    text = read_text(relative)
    required = (
        "name: Harness Validation",
        "pull_request:",
        "push:",
        "python scripts/validate_governance.py",
        "python scripts/validate_harness.py",
        "git diff --check",
    )
    missing = [item for item in required if item not in text]
    if missing:
        raise HarnessError(f"{relative} missing CI controls: " + ", ".join(missing))


def validate_skill(relative: str) -> None:
    text = read_text(relative)
    for marker in (
        "## Trigger",
        "## Required inputs",
        "## Procedure",
        "## Failure behavior",
        "## Expected outputs",
    ):
        if marker not in text:
            raise HarnessError(f"{relative} missing skill section: {marker}")


def validate_report(relative: str) -> None:
    text = read_text(relative)
    for marker in (
        "## Working",
        "## Broken",
        "## Missing / intentionally not yet established",
        "## Principal risks",
    ):
        if marker not in text:
            raise HarnessError(f"{relative} missing operator section: {marker}")


def validate_no_placeholders(paths: list[str]) -> None:
    for relative in paths:
        if re.search(r"\b(?:TODO|TBD|FIXME)\b", read_text(relative)):
            raise HarnessError(f"placeholder marker found in harness component: {relative}")


def validate_governance() -> None:
    process = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "validate_governance.py")],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if process.returncode:
        raise HarnessError(
            "governance validator failed: " + (process.stdout + process.stderr).strip()
        )


def main() -> int:
    try:
        data = validate_manifest()
        components = data["components"]
        require_markers(components["codebase_map"], REQUIRED_MAP_MARKERS)
        require_markers(components["workflow_specs"], REQUIRED_WORKFLOW_MARKERS)
        require_markers(components["artifact_registry"], REQUIRED_ARTIFACT_MARKERS)
        require_markers(components["lua_design_constraints"], REQUIRED_LUA_MARKERS)
        hook_self_tests = validate_hooks(components)
        validate_ci(components["ci_workflow"])
        validate_skill(components["scoped_skill"])
        validate_report(components["operator_report"])
        validate_no_placeholders(
            [
                components["codebase_map"],
                components["workflow_specs"],
                components["artifact_registry"],
                components["lua_design_constraints"],
                components["scoped_skill"],
                components["operator_report"],
            ]
        )
        validate_governance()
    except HarnessError as exc:
        return fail(str(exc))

    print("HARNESS_VALIDATION: PASS")
    print(f"manifest={MANIFEST.relative_to(REPO_ROOT)}")
    print(f"components={len(REQUIRED_COMPONENT_KEYS)}")
    print(f"schema={EXPECTED_SCHEMA}")
    print(f"hook_self_tests={hook_self_tests}")
    print("governance_validator=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
