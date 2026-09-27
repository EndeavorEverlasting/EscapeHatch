#!/usr/bin/env python3
"""Validate EscapeHatch application-opportunity recommendation readiness."""
from __future__ import annotations
import argparse
import json
from pathlib import Path

CONTRACT_SCHEMA = "escapehatch/application-opportunity-readiness/v1"
RECEIPT_SCHEMA = "escapehatch/application-opportunity-readiness-receipt/v1"

REQUIRED_RECORD_FIELDS = [
    "date_applied",
    "submission_status_or_confirmation",
    "application_or_reference_id_if_present",
    "resume_artifact_identity",
    "cover_letter_artifact_identity_if_used",
    "compensation_or_rate_entered_if_asked",
    "nontrivial_questions_and_final_answers",
    "stated_next_step_or_response_timeline",
]

def _load(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)

def _nonempty(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())

def _url(value: object) -> bool:
    return _nonempty(value) and str(value).startswith(("https://", "http://", "mailto:"))

def validate_receipt(receipt: dict) -> list[str]:
    errors: list[str] = []
    if receipt.get("schema") != RECEIPT_SCHEMA:
        return ["receipt schema mismatch"]

    if receipt.get("status") != "RECOMMENDATION_READY":
        return errors

    opportunity = receipt.get("opportunity") or {}
    resume = receipt.get("resume") or {}
    cover = receipt.get("cover_letter") or {}
    handoff = receipt.get("operator_handoff") or {}

    if not _nonempty(opportunity.get("id")):
        errors.append("missing opportunity id")
    if not _nonempty(opportunity.get("organization")):
        errors.append("missing opportunity organization")
    if not _nonempty(opportunity.get("role")):
        errors.append("missing opportunity role")
    if not _url(opportunity.get("apply_url")):
        errors.append("missing verified apply URL")
    if opportunity.get("source_verified") is not True:
        errors.append("recommendation ready requires verified source")

    if resume.get("disposition") not in {"TAILORED_EXISTING", "MASTER_REUSE_EXPLICITLY_APPROVED"}:
        errors.append("recommendation ready requires opportunity-bound resume or explicit master reuse")
    if resume.get("state") != "DURABLE_READY":
        errors.append("recommendation ready requires durable resume")
    if not _url(resume.get("doc_url")) or not _url(resume.get("pdf_url")):
        errors.append("recommendation ready requires resume artifact links")
    if resume.get("provider_read_back") is not True:
        errors.append("recommendation ready requires resume provider read-back")
    if resume.get("tracker_parity") is not True:
        errors.append("recommendation ready requires resume tracker parity")

    demand = cover.get("demand")
    if demand not in {"REQUIRED", "OPTIONAL", "NOT_REQUESTED"}:
        errors.append("cover letter demand must be resolved")
    if demand == "REQUIRED":
        if cover.get("state") != "DURABLE_READY":
            errors.append("required cover letter is not durable ready")
        if not _url(cover.get("doc_url")) or not _url(cover.get("pdf_url")):
            errors.append("required cover letter links are missing")
    elif demand in {"OPTIONAL", "NOT_REQUESTED"} and cover.get("state") not in {"NOT_APPLICABLE", "DURABLE_READY"}:
        errors.append("cover letter state is inconsistent with demand")

    instructions = handoff.get("instructions")
    if not isinstance(instructions, list) or not instructions or any(not _nonempty(item) for item in instructions):
        errors.append("operator handoff requires manual application instructions")

    record_fields = handoff.get("record_fields")
    if record_fields != REQUIRED_RECORD_FIELDS:
        errors.append("operator handoff record fields do not match canonical order")

    links = handoff.get("artifact_links")
    if not isinstance(links, list) or not links or any(not _url(item) for item in links):
        errors.append("operator handoff requires clickable artifact links")
    else:
        required_links = {resume.get("doc_url"), resume.get("pdf_url")}
        if demand == "REQUIRED":
            required_links.update({cover.get("doc_url"), cover.get("pdf_url")})
        if any(link not in links for link in required_links):
            errors.append("operator handoff artifact links do not cover required artifacts")

    return errors

def validate_fixture(path: Path) -> tuple[bool, list[str]]:
    receipt = _load(path)
    errors = validate_receipt(receipt)
    actual_valid = not errors
    expected_valid = receipt.get("expected_valid")
    if not isinstance(expected_valid, bool):
        return False, ["fixture missing boolean expected_valid"]
    if actual_valid != expected_valid:
        return False, [f"expected_valid={expected_valid} but actual_valid={actual_valid}", *errors]
    expected_error = receipt.get("expected_error")
    if expected_valid is False and expected_error:
        if not any(expected_error in error for error in errors):
            return False, [f"expected error not observed: {expected_error}", *errors]
    return True, errors

def validate_contract(contract: dict) -> list[str]:
    errors: list[str] = []
    if contract.get("schema") != CONTRACT_SCHEMA:
        return ["contract schema mismatch"]
    if contract.get("receipt_schema") != RECEIPT_SCHEMA:
        errors.append("receipt schema mismatch in contract")
    required = contract.get("operator_handoff_required_record_fields")
    if required != REQUIRED_RECORD_FIELDS:
        errors.append("canonical operator record fields drift")
    invariants = set(contract.get("invariants") or [])
    for invariant in {
        "missing_resume_routes_to_creation_before_recommendation",
        "required_cover_letter_routes_to_creation_before_recommendation",
        "operator_handoff_must_include_clickable_artifact_links",
        "operator_handoff_must_include_manual_application_steps",
        "operator_handoff_must_include_what_to_record",
        "submission_remains_operator_controlled",
        "screenshots_are_evidence_on_demand_not_required_for_every_page",
    }:
        if invariant not in invariants:
            errors.append(f"missing invariant: {invariant}")
    return errors

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", default="harness/contracts/application-opportunity-readiness.v1.json")
    parser.add_argument("--fixture", action="append", default=[])
    args = parser.parse_args()

    contract_errors = validate_contract(_load(Path(args.contract)))
    if contract_errors:
        for error in contract_errors:
            print(f"FAIL contract: {error}")
        return 1

    fixtures = [Path(p) for p in args.fixture] or sorted(Path("fixtures/application-opportunity-readiness").glob("*.json"))
    if not fixtures:
        print("FAIL: no opportunity-readiness fixtures found")
        return 1

    failed = False
    for path in fixtures:
        ok, errors = validate_fixture(path)
        print(f"{'PASS' if ok else 'FAIL'} {path}")
        if not ok:
            failed = True
            for error in errors:
                print(f"  - {error}")

    if not failed:
        print(f"APPLICATION_OPPORTUNITY_READINESS: PASS fixtures={len(fixtures)}")
    return 1 if failed else 0

if __name__ == "__main__":
    raise SystemExit(main())
