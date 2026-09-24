#!/usr/bin/env python3
"""Validate resume durability manifests without storing private resume content."""
from __future__ import annotations
import argparse
import json
from pathlib import Path

CONTRACT_SCHEMA = "escapehatch/application-resume-artifact-sync/v1"
MANIFEST_SCHEMA = "escapehatch/application-resume-artifact-manifest/v1"

def _load(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)

def validate_manifest(manifest: dict) -> list[str]:
    errors: list[str] = []
    if manifest.get("schema") != MANIFEST_SCHEMA:
        return ["manifest schema mismatch"]
    if manifest.get("resume_state") != "DURABLE_READY":
        return errors
    drive = manifest.get("drive") or {}
    tracker = manifest.get("tracker") or {}
    required = {
        "drive.company_folder_id": drive.get("company_folder_id"),
        "drive.editable_resume_id": drive.get("editable_resume_id"),
        "drive.pdf_id": drive.get("pdf_id"),
        "tracker.resume_doc_id": tracker.get("resume_doc_id"),
        "tracker.resume_pdf_id": tracker.get("resume_pdf_id"),
    }
    for name, value in required.items():
        if not isinstance(value, str) or not value.strip():
            errors.append(f"missing required durable reference: {name}")
    if drive.get("provider_read_back") is not True:
        errors.append("provider read-back is required before DURABLE_READY")
    if tracker.get("resume_doc_id") != drive.get("editable_resume_id"):
        errors.append("tracker resume_doc_id does not match Drive editable_resume_id")
    if tracker.get("resume_pdf_id") != drive.get("pdf_id"):
        errors.append("tracker resume_pdf_id does not match Drive pdf_id")
    source = manifest.get("resume_source")
    if source not in {"master_copy", "tailored"}:
        errors.append("resume_source must be master_copy or tailored")
    if manifest.get("role_specific_artifact_present") is True and source != "tailored":
        errors.append("role-specific artifact exists but resume_source is not tailored")
    return errors

def validate_fixture(path: Path) -> tuple[bool, list[str]]:
    manifest = _load(path)
    errors = validate_manifest(manifest)
    actual_valid = not errors
    expected_valid = manifest.get("expected_valid")
    if not isinstance(expected_valid, bool):
        return False, ["fixture missing boolean expected_valid"]
    if actual_valid != expected_valid:
        return False, [f"expected_valid={expected_valid} but actual_valid={actual_valid}", *errors]
    return True, errors

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", default="contracts/application-resume-artifact-sync.v1.json")
    parser.add_argument("--fixture", action="append", default=[])
    args = parser.parse_args()
    contract = _load(Path(args.contract))
    if contract.get("schema") != CONTRACT_SCHEMA:
        print("FAIL: contract schema mismatch")
        return 1
    fixtures = [Path(p) for p in args.fixture] or sorted(Path("fixtures/application-resume-artifact-sync").glob("*.json"))
    if not fixtures:
        print("FAIL: no fixtures found")
        return 1
    failed = False
    for path in fixtures:
        ok, errors = validate_fixture(path)
        print(f"{'PASS' if ok else 'FAIL'} {path}")
        if not ok:
            failed = True
            for error in errors:
                print(f"  - {error}")
    return 1 if failed else 0

if __name__ == "__main__":
    raise SystemExit(main())
