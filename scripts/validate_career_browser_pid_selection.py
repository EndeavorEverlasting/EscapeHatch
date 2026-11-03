#!/usr/bin/env python3
"""Validate EscapeHatch career-browser PID selection contract and fixtures."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "career-browser-pid-selection.v1.json"
FIXTURE = ROOT / "fixtures" / "career-browser-pid-selection.v1.example.json"
LIBRARY = ROOT / "scripts" / "windows" / "EscapeHatch-CareerBrowser-PidSelection.ps1"
CLI = ROOT / "scripts" / "windows" / "EscapeHatch-CareerBrowser.ps1"
TESTS = ROOT / "tests" / "windows" / "Test-EscapeHatch-CareerBrowser-PidSelection.ps1"

CONTRACT_SCHEMA = "escapehatch-career-browser-pid-selection/v1"
FIXTURE_SCHEMA = "escapehatch-career-browser-pid-selection-fixture/v1"

REQUIRED_INVARIANTS = {
    "snapshot_before_open_when_launching",
    "prefer_s2_minus_s1_when_new_pids_exist",
    "attach_existing_does_not_require_new_pid",
    "never_relaunch_when_owned_progress_session_is_selectable",
    "never_bind_playwright_mcp_ephemeral_profile_as_career_session",
    "prefer_browser_root_pid_over_renderer_utility_gpu",
    "prefer_signed_in_persistent_profiles_over_incognito",
    "private_session_remains_attachable_when_it_holds_progress",
    "locate_progress_answers_which_window_holds_application",
    "user_data_dir_is_primary_ownership_signal",
    "receipt_pid_alone_is_not_identity",
    "attach_only_refuses_launch_and_termination",
    "frozen_selection_until_exit_or_explicit_rebind",
    "operator_progress_is_evidence_not_interference",
}

REQUIRED_MODES = {
    "CAPTURE_BASELINE",
    "SELECT_AFTER_LAUNCH",
    "ATTACH_EXISTING",
    "ATTACH_ONLY",
    "STATUS",
    "LOCATE_PROGRESS",
}

REQUIRED_CASE_IDS = {
    "attach-existing-owned-root-over-playwright-mcp",
    "select-after-launch-prefers-new-pid",
    "attach-only-fails-without-owned-session",
    "attach-existing-when-no-baseline-available",
    "prefer-signed-in-managed-over-incognito-managed",
    "locate-progress-reports-private-when-only-match",
}

REQUIRED_LIBRARY_MARKERS = {
    "Get-EhCareerBrowserProcessSnapshot",
    "Compare-EhCareerBrowserProcessSnapshots",
    "Select-EhCareerBrowserTarget",
    "ATTACH_EXISTING",
    "ATTACH_ONLY",
    "LOCATE_PROGRESS",
    "forbidden_ephemeral",
    "managed_career_user_data_dir",
    "signed_in_persistent_profile",
    "private_or_incognito_session",
    "Get-EhNewProcessIdsSinceBaseline",
}


class ValidationError(ValueError):
    pass


def load(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(f"{path.relative_to(ROOT)}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValidationError(f"{path.relative_to(ROOT)} must contain an object")
    return value


def require(cond: bool, message: str) -> None:
    if not cond:
        raise ValidationError(message)


def validate_contract(contract: dict) -> None:
    require(contract.get("schema") == CONTRACT_SCHEMA, f"contract schema must be {CONTRACT_SCHEMA}")
    invariants = set(contract.get("invariants") or [])
    missing = REQUIRED_INVARIANTS - invariants
    require(not missing, f"missing invariants: {sorted(missing)}")
    modes = set((contract.get("modes") or {}).keys())
    missing_modes = REQUIRED_MODES - modes
    require(not missing_modes, f"missing modes: {sorted(missing_modes)}")
    scoring = contract.get("scoring") or {}
    require(
        scoring.get("attach_existing_does_not_require_new_pid_signal") is True,
        "scoring.attach_existing_does_not_require_new_pid_signal must be true",
    )
    require(
        scoring.get("prefer_signed_in_over_incognito_when_both_eligible") is True,
        "scoring.prefer_signed_in_over_incognito_when_both_eligible must be true",
    )
    family = contract.get("process_family") or {}
    require(
        "ms-playwright-mcp" in (family.get("forbidden_user_data_dir_markers") or []),
        "must forbid ms-playwright-mcp profiles",
    )
    impl = contract.get("canonical_implementation") or {}
    require(impl.get("library") == "scripts/windows/EscapeHatch-CareerBrowser-PidSelection.ps1", "library path mismatch")
    require(impl.get("cli") == "scripts/windows/EscapeHatch-CareerBrowser.ps1", "cli path mismatch")


def validate_fixture(fixture: dict) -> None:
    require(fixture.get("schema") == FIXTURE_SCHEMA, f"fixture schema must be {FIXTURE_SCHEMA}")
    cases = fixture.get("cases") or []
    require(isinstance(cases, list) and cases, "fixture must include cases")
    ids = {case.get("id") for case in cases}
    missing = REQUIRED_CASE_IDS - ids
    require(not missing, f"missing fixture cases: {sorted(missing)}")
    for case in cases:
        expected = case.get("expected") or {}
        require("ok" in expected, f"{case.get('id')}: expected.ok required")
        require("selectionReason" in expected, f"{case.get('id')}: expected.selectionReason required")
        require("afterProcesses" in case, f"{case.get('id')}: afterProcesses required")


def validate_implementation_files() -> None:
    for path in (LIBRARY, CLI, TESTS):
        require(path.is_file(), f"missing implementation file: {path.relative_to(ROOT)}")
    text = LIBRARY.read_text(encoding="utf-8")
    missing = [marker for marker in REQUIRED_LIBRARY_MARKERS if marker not in text]
    require(not missing, f"library missing markers: {missing}")
    cli = CLI.read_text(encoding="utf-8")
    for action in ("AttachExisting", "AttachOnly", "CaptureBaseline", "SelectAfterLaunch", "Status", "LocateProgress"):
        require(action in cli, f"cli missing action {action}")


def main() -> int:
    try:
        contract = load(CONTRACT)
        fixture = load(FIXTURE)
        validate_contract(contract)
        validate_fixture(fixture)
        validate_implementation_files()
    except ValidationError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print("PASS: career-browser PID selection contract + fixture + implementation anchors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
