#!/usr/bin/env python3
"""P00/P01 structural enforcement for the applicant-isolated resume DAG."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
contract_path = ROOT / "harness/contracts/resume-selection-graph.v1.json"
source_path = ROOT / "artifacts/escape-hatch/src/lib/resume-selection-graph.ts"
tests_path = ROOT / "artifacts/escape-hatch/src/lib/resume-selection-graph.test.ts"

def main() -> None:
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    assert contract["schema"] == "escapehatch/resume-selection-graph/v1"
    assert contract["version"] == 1
    model = contract["canonical_model"]
    assert model["allowed_resume_derivations"] == {
        "canonical": [], "domain": ["canonical"], "job": ["canonical", "domain"]
    }
    p = contract["platform_persistence"]
    assert p["initial_scope"] == "unknown"
    assert p["default_when_unknown"] == "REVIEW_REQUIRED_NO_UPLOAD"
    assert p["never_auto_replace_persistent_resume"] is True
    assert p["never_auto_submit"] is True
    assert "candidate_resume_id" in p["user_consent_must_name"]
    assert "content_digest" in p["user_consent_must_name"]
    assert contract["invariants"]["no_private_fixtures"] is True
    assert contract["queue_effective_master"]["never_use_job_derivative_for_global"] is True
    assert contract["queue_effective_master"]["stable_under_queue_order_permutation"] is True
    assert contract["implementation"]["runtime"] == source_path.relative_to(ROOT).as_posix()
    assert contract["implementation"]["runtime_tests"] == tests_path.relative_to(ROOT).as_posix()
    code = source_path.read_text(encoding="utf-8")
    tests = tests_path.read_text(encoding="utf-8")
    required = [
        "export function validateResumeGraph(",
        "export function resolveResumeForPlatform(",
        "export function resolveEffectiveMasterForQueue(",
        "QUEUE_DOMAIN_CONFLICT_REVIEW_REQUIRED",
        "export function impactedResumeDescendants(",
        "PLATFORM_SLOT_SEMANTICS_UNVERIFIED",
        "UPLOAD_REQUIRES_CONSENT",
        "PERSISTENT_SLOT_HAS_JOB_DERIVATIVE",
        "AMBIGUOUS_DOMAIN_MASTERS",
        "INVALID_GRAPH",
    ]
    for marker in required:
        assert marker in code, f"missing canonical graph gate: {marker}"
    for disallowed in (".submit(", ".requestSubmit(", "chrome.tabs", "fetch(", "XMLHttpRequest"):
        assert disallowed not in code
    assert "never" in tests.lower() and "unknown" in tests.lower()
    assert "synthetic-owner-a" in tests
    print("RESUME_SELECTION_GRAPH_CONTRACT: PASS (static; does not prove provider/browser writes)")

if __name__ == "__main__":
    main()
