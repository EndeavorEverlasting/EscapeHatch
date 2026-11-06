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
    switching = p["operator_directed_switching"]
    assert "freely switch" in switching["objective"]
    assert "Unlimited user-directed" in switching["repeated_switches"]
    assert "no role, domain scorer" in switching["selection_owner"]
    assert "No automatic" in contract["queue_effective_master"]["no_forced_rollback"]
    assert "not the job queue" in contract["queue_effective_master"]["no_global_lock"]
    assert switching["no_automatic_submit"] is True
    assert "resolveUserSelectedResume" in switching["planner"]
    assert "listApprovedResumeChoices" in switching["picker"]
    assert "temporary_domain_switch" not in p
    assert "indeed_default_master" not in p
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
        "export function resolveUserSelectedResume(",
        "export function listApprovedResumeChoices(",
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
    # P83 prevents a rigid default from overriding a user-chosen résumé.
    handoff = (ROOT / "docs/agent/P04_MASTER_RESUME_APPLICATION_ROUTING_2026-11-05.md").read_text(encoding="utf-8")
    operator_light = (ROOT / "docs/agent/P04_OPERATOR_LIGHT_APPLICATION_SPRINT_2026-10-27.md").read_text(encoding="utf-8")
    domain_plan = (ROOT / "docs/agent/P04_DOMAIN_RESUME_GRAPH_PLATFORM_POLICY_2026-10-28.md").read_text(encoding="utf-8")
    workflow = (ROOT / "harness/WORKFLOWS.md").read_text(encoding="utf-8")
    assert "switch back and forth" in handoff
    assert "operator-directed" in operator_light
    assert "switch back and forth" in domain_plan and "operator" in domain_plan
    assert "user-directed" in workflow
    for bad in ("BLOCK_RELATED_INDEED_QUEUE", "block subsequent Indeed applications",
                "must finish by restoring", "temporary switch and return"):
        assert bad not in (handoff + operator_light + domain_plan + workflow)
    assert "resolveUserSelectedResume" in tests
    assert "listApprovedResumeChoices" in tests
    assert "synthetic-owner-a" in tests
    print("RESUME_SELECTION_GRAPH_CONTRACT: PASS (static; does not prove provider/browser writes)")

if __name__ == "__main__":
    main()
