#!/usr/bin/env python3
"""Fail closed on shrinking EscapeHatch's parent mission to a successful subtask."""
from __future__ import annotations
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "harness/contracts/application-autofill-parent.v1.json"
PARENT_URL = "https://github.com/EndeavorEverlasting/EscapeHatch/issues/69"
GATES = (
    "SOURCE_TO_APPROVED_PROFILE",
    "MANAGED_BROWSER_LAUNCH",
    "SEMANTIC_CROSS_FORM_MAPPING",
    "DETERMINISTIC_FILL_AND_PDFS",
    "CONSEQUENCE_SAFE_MULTISTEP",
    "SESSION_CONTINUITY",
    "ADVERSARIAL_CROSS_ARCHETYPE",
    "P08_REAL_BROWSER_USER_JOURNEY",
    "MERGED_AND_LIVE_OBSERVED",
)
OPERATOR_ONLY = {
    "final_submit", "truth_certification", "legal_or_eeo_attestation",
    "captcha_or_mfa", "ambiguous_controls",
}
FALSE_CLOSE = {
    "source_discovered", "credential_present", "resume_read", "resume_parsed",
    "profile_imported", "form_launched", "one_page_filled",
    "synthetic_fixture_passed", "green_pull_request", "merged_without_runtime_proof",
}
LINKED_SUBTASKS = {"/pull/63", "/pull/64", "/pull/66", "/pull/67", "/pull/68", "/issues/60"}


class ParentContractError(ValueError):
    pass


def check(data: dict) -> None:
    if not isinstance(data, dict) or data.get("schema") != "escapehatch/application-autofill-parent/v1":
        raise ParentContractError("wrong parent contract")
    if data.get("owner") != "docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md":
        raise ParentContractError("parent owner displaced")
    if data.get("parent_issue") != PARENT_URL:
        raise ParentContractError("parent issue identity drift")
    mission = data.get("mission", "")
    for essential in ("Deterministically", "browser", "job application", "end-to-end",
                      "operator-controlled final submission"):
        if essential not in mission:
            raise ParentContractError("parent mission weakened: " + essential)
    if data.get("parent_completion_policy") != "conjunctive_full_product_proof_only":
        raise ParentContractError("subtask cannot close parent")
    if data.get("live_observation_required") is not True:
        raise ParentContractError("actual browser observation cannot be optional")
    if data.get("tracked_private_content") != "forbidden":
        raise ParentContractError("private source tracking forbidden")
    if not OPERATOR_ONLY.issubset(set(data.get("operator_only", []))):
        raise ParentContractError("operator submission/attestation authority eroded")
    if not FALSE_CLOSE.issubset(set(data.get("forbidden_false_close", []))):
        raise ParentContractError("regressed premature parent-closure controls")
    deps = data.get("downstream_dependencies", [])
    if not isinstance(deps, list) or not all(isinstance(d, dict) and d.get("completion_insufficient") is True for d in deps):
        raise ParentContractError("subordinate proof ceiling missing")
    refs = {d.get("ref", "") for d in deps}
    if any(not any(marker in ref for ref in refs) for marker in LINKED_SUBTASKS):
        raise ParentContractError("existing product work missing")
    gate_data = data.get("required_gates")
    if not isinstance(gate_data, list) or [d.get("gate") for d in gate_data if isinstance(d, dict)] != list(GATES):
        raise ParentContractError("full-product acceptance gates missing or reordered")
    for gate in gate_data:
        if not isinstance(gate, dict) or not gate.get("proof"):
            raise ParentContractError("gate proof undefined")
        if gate.get("status") not in ("UNPROVEN", "BLOCKED", "PROVEN_LIVE"):
            raise ParentContractError("unrecognized proof status")
        receipt = gate.get("receipt")
        if gate["status"] == "PROVEN_LIVE" and (not isinstance(receipt, str) or not receipt.strip()):
            raise ParentContractError("live proof requires an evidence reference")
        if gate["status"] != "PROVEN_LIVE" and receipt is not None:
            raise ParentContractError("unverified gate has an authoritative receipt")
    if data.get("parent_status") not in ("OPEN", "COMPLETE"):
        raise ParentContractError("unknown parent state")
    if data["parent_status"] == "COMPLETE" and any(g["status"] != "PROVEN_LIVE" for g in gate_data):
        raise ParentContractError("cannot close parent before all gates are PROVEN_LIVE")


def main() -> int:
    try:
        check(json.loads(CONTRACT_PATH.read_text(encoding="utf-8")))
        paths = ("AGENTS.md", "docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md",
                 "harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md",
                 "harness/WORKFLOWS.md")
        for name in paths:
            content = (ROOT / name).read_text(encoding="utf-8")
            if PARENT_URL not in content:
                raise ParentContractError("parent issue link missing from " + name)
        print("PASS application autofill parent: objective, 9 gates, no false completion")
        return 0
    except (OSError, ValueError, TypeError, KeyError) as error:
        print("FAIL application autofill parent: " + str(error))
        return 1


if __name__ == "__main__":
    sys.exit(main())
