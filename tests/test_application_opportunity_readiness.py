#!/usr/bin/env python3
"""Focused regression tests for application-opportunity recommendation readiness."""
from __future__ import annotations
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts" / "validate_application_opportunity_readiness.py"

def _module():
    spec = importlib.util.spec_from_file_location("opportunity_readiness", VALIDATOR)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def test_registered_fixtures() -> None:
    module = _module()
    fixtures = sorted((ROOT / "fixtures" / "application-opportunity-readiness").glob("*.json"))
    assert len(fixtures) == 4
    for fixture in fixtures:
        ok, errors = module.validate_fixture(fixture)
        assert ok, f"{fixture}: {errors}"

def test_ready_requires_resume_letter_resolution_and_handoff() -> None:
    module = _module()
    ready = module._load(ROOT / "fixtures" / "application-opportunity-readiness" / "01-existing-resume-ready.json")
    assert module.validate_receipt(ready) == []

    broken = dict(ready)
    broken["resume"] = dict(ready["resume"], state="MISSING")
    assert "recommendation ready requires durable resume" in module.validate_receipt(broken)

    broken = dict(ready)
    broken["cover_letter"] = dict(ready["cover_letter"], demand="UNKNOWN", state="BLOCKED")
    assert "cover letter demand must be resolved" in module.validate_receipt(broken)

    broken = dict(ready)
    broken["operator_handoff"] = dict(ready["operator_handoff"], artifact_links=[])
    assert "operator handoff requires clickable artifact links" in module.validate_receipt(broken)

if __name__ == "__main__":
    test_registered_fixtures()
    test_ready_requires_resume_letter_resolution_and_handoff()
    print("APPLICATION_OPPORTUNITY_READINESS_TESTS: PASS")
