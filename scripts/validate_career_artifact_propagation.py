#!/usr/bin/env python3
"""Validate synthetic or operator-local career artifact propagation receipts.

This validator checks declared provenance and dependency bookkeeping. Only a
live provider readback can establish that the supplied evidence is genuine.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "harness/contracts/career-artifact-propagation.v1.json"
FIXTURE = ROOT / "fixtures/career-artifact-propagation.v1.example.json"
DIGEST = re.compile(r"[a-f0-9]{64}\Z")


class PropagationError(ValueError):
    pass


def need(value, label):
    if not isinstance(value, str) or not value.strip():
        raise PropagationError(f"{label} required")


def load_contract():
    data = json.loads(CONTRACT.read_text(encoding="utf-8"))
    if data.get("schema") != "escapehatch/career-artifact-propagation/v1" or data.get("version") != 1:
        raise PropagationError("contract identity/version drift")
    policy = data.get("policy", {})
    composition = data.get("derivative_composition")
    if not isinstance(composition, dict):
        raise PropagationError("missing derivative-composition contract")
    sources = composition.get("inputs", {})
    if not isinstance(sources, dict) or set(sources) != {
        "factual_claims", "author_voice", "employer_context", "optional_prior_derivatives"
    }:
        raise PropagationError("derivative source authority incomplete")
    if any(not isinstance(value, str) or not value.strip() for value in sources.values()):
        raise PropagationError("derivative source route missing")
    if composition.get("outputs") != [
        "role_resume", "role_cover_letter", "short_application_answer"
    ]:
        raise PropagationError("derivative output coverage missing")
    scopes = composition.get("scope_policies", {})
    if not isinstance(scopes, dict) or scopes.get("approved_cover_letters") != "protected_without_explicit_edit_approval" or scopes.get("submitted_applications") != "immutable_without_separate_operator_authority" or scopes.get("employer_facts") != "exact_opportunity_only":
        raise PropagationError("derivative authority boundary missing")
    if composition.get("private_content_prohibited_in_git") is not True:
        raise PropagationError("private author language cannot enter tracked fixtures")
    receipt = composition.get("required_derivative_receipt")
    if not isinstance(receipt, list) or not {
        "source_claim_revision", "author_voice_revision", "opportunity_fingerprint",
        "claim_provenance_ids", "artifact_revision", "author_review_state",
        "export_readback_state"
    }.issubset(set(receipt)):
        raise PropagationError("unversioned career derivative")
    if composition.get("synthetic_validation_does_not_prove_live_private_source_hydration") is not True:
        raise PropagationError("invalid derivative proof ceiling")
    mandatory = (
        "source_event_required", "source_revision_required",
        "claim_current_only_after_provider_readback",
        "never_auto_change_approved_document",
        "no_private_records_in_tracked_fixtures",
        "no_automatic_browser_final_submission",
    )
    if any(policy.get(x) is not True for x in mandatory):
        raise PropagationError("mandatory propagation safety policy missing")
    nodes = data.get("artifacts")
    if not isinstance(nodes, list) or len(nodes) < 8:
        raise PropagationError("artifact registry incomplete")
    by_id = {}
    for node in nodes:
        name = node.get("id")
        need(name, "node.id")
        if name in by_id or not isinstance(node.get("parents"), list):
            raise PropagationError("duplicate node or malformed parents")
        if not isinstance(node.get("required"), bool) or node.get("policy") not in (
            "review_only", "editable", "approved_locked", "derived", "operator_controlled"
        ):
            raise PropagationError("invalid node classification: " + name)
        by_id[name] = node
    for name, node in by_id.items():
        if name in node["parents"] or len(set(node["parents"])) != len(node["parents"]):
            raise PropagationError("invalid parent references: " + name)
        if any(parent not in by_id for parent in node["parents"]):
            raise PropagationError("unregistered parent for " + name)

    visited, active = set(), set()

    def visit(name):
        if name in active:
            raise PropagationError("artifact dependency cycle")
        if name in visited:
            return
        active.add(name)
        for parent in by_id[name]["parents"]:
            visit(parent)
        active.remove(name)
        visited.add(name)

    for name in by_id:
        visit(name)
    if by_id["approved_cover_letter"]["policy"] != "approved_locked":
        raise PropagationError("user-approved document write protection lost")
    if by_id["browser_draft"]["policy"] != "operator_controlled":
        raise PropagationError("browser authority lost")
    return by_id, policy


def reachable(changed, nodes):
    pending = [changed]
    visited = set()
    while pending:
        parent = pending.pop()
        for name, node in nodes.items():
            if parent in node["parents"] and name not in visited:
                visited.add(name)
                pending.append(name)
    return visited


def check_case(case, nodes, policy):
    if not isinstance(case, dict):
        raise PropagationError("case must be an object")
    root = case.get("changed_node")
    if root not in nodes:
        raise PropagationError("unknown changed node")
    revision = case.get("source_revision")
    need(revision, "source_revision")
    receipts = case.get("receipts")
    if not isinstance(receipts, dict):
        raise PropagationError("missing receipt registry")
    wanted = reachable(root, nodes)
    if set(receipts) != wanted:
        raise PropagationError("missing/unexpected descendants: expected " + repr(sorted(wanted)))
    is_open = False
    for name in sorted(wanted):
        receipt = receipts[name]
        if not isinstance(receipt, dict):
            raise PropagationError("invalid receipt: " + name)
        status = receipt.get("status")
        if status not in policy["statuses"]:
            raise PropagationError("unknown status at " + name)
        if receipt.get("source_revision") != revision:
            raise PropagationError("stale source revision at " + name)
        node = nodes[name]
        if status in ("UPDATED_VERIFIED", "VERIFIED_UNCHANGED"):
            need(receipt.get("destination_revision"), name + ".destination_revision")
            if receipt.get("provider_readback") is not True:
                raise PropagationError("no provider readback at " + name)
            if not isinstance(receipt.get("artifact_sha256"), str) or not DIGEST.fullmatch(receipt["artifact_sha256"]):
                raise PropagationError("invalid artifact digest at " + name)
            need(receipt.get("reason"), name + ".reason")
            if node["policy"] == "approved_locked" and status == "UPDATED_VERIFIED" and case.get("operator_approved_edit") is not True:
                raise PropagationError("approved document edited without express authority")
        elif status == "PROTECTED_NO_EDIT":
            need(receipt.get("reason"), name + ".reason")
            if node["policy"] != "approved_locked":
                raise PropagationError("protected receipt on nonapproved node")
            is_open = True
        elif status == "BLOCKED":
            need(receipt.get("reason"), name + ".reason")
            need(receipt.get("next_action"), name + ".next_action")
            is_open = True
        else:
            if node["required"]:
                raise PropagationError("required artifact cannot be NOT_APPLICABLE: " + name)
            need(receipt.get("reason"), name + ".reason")
    result = "OPEN" if is_open else "CURRENT"
    if case.get("declared_current") is True and result != "CURRENT":
        raise PropagationError("false current claim with protected/blocked dependency")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=FIXTURE,
                        help="synthetic cases or untracked local/private receipt JSON")
    parser.add_argument("--scaffold", help="emit a fully blocked receipt template for this changed node")
    parser.add_argument("--source-revision", help="provider-reviewed source revision for --scaffold")
    args = parser.parse_args()
    try:
        nodes, policy = load_contract()
        if args.scaffold is not None:
            if args.scaffold not in nodes:
                raise PropagationError("unknown changed node")
            need(args.source_revision, "source revision for scaffold")
            affected = sorted(reachable(args.scaffold, nodes))
            if not affected:
                raise PropagationError("changed node has no descendants to reconcile")
            case = {
                "name": "unverified-reconciliation",
                "changed_node": args.scaffold,
                "source_revision": args.source_revision,
                "receipts": {
                    node: {
                        "status": "BLOCKED",
                        "source_revision": args.source_revision,
                        "reason": "dependent not yet verified",
                        "next_action": "read current provider source and dependent; reconcile, export and read back",
                    }
                    for node in affected
                },
                "expected": "OPEN",
            }
            if check_case(case, nodes, policy) != "OPEN":
                raise PropagationError("scaffold is not safely blocked")
            print(json.dumps({
                "schema": "escapehatch/career-artifact-propagation-cases/v1",
                "synthetic_only": False,
                "cases": [case],
            }, indent=2))
            return 0
        payload = json.loads(args.input.read_text(encoding="utf-8"))
        if payload.get("schema") != "escapehatch/career-artifact-propagation-cases/v1":
            raise PropagationError("receipt case schema drift")
        if args.input.resolve() == FIXTURE.resolve() and payload.get("synthetic_only") is not True:
            raise PropagationError("tracked test cases must be synthetic")
        cases = payload.get("cases")
        if not isinstance(cases, list) or not cases:
            raise PropagationError("no cases")
        for index, case in enumerate(cases):
            expected = case.get("expected")
            if expected not in ("CURRENT", "OPEN", "REJECT"):
                raise PropagationError("expected result missing at case " + str(index))
            try:
                actual = check_case(case, nodes, policy)
            except (PropagationError, TypeError, KeyError):
                actual = "REJECT"
            if actual != expected:
                raise PropagationError(
                    f"case {index} ({case.get('name', 'unnamed')}) expected {expected} got {actual}"
                )
        print(f"PASS career artifact propagation: {len(nodes)} nodes, {len(cases)} cases")
        return 0
    except (OSError, ValueError, TypeError, KeyError) as error:
        print("FAIL career artifact propagation: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
