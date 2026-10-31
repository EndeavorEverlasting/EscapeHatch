#!/usr/bin/env python3
"""Validate employer-facing document URL forbid-list and runtime enforcement owners."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "employer-facing-document-url.v1.json"
PURE = ROOT / "artifacts" / "escape-hatch" / "src" / "lib" / "employer-facing-document-url.ts"
TEST = ROOT / "artifacts" / "escape-hatch" / "src" / "lib" / "employer-facing-document-url.test.ts"
FILL = ROOT / "artifacts" / "escape-hatch" / "managed-form.ts"


class ContractError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractError(message)


def main() -> int:
    data = json.loads(CONTRACT.read_text(encoding="utf-8"))
    require(data.get("schema") == "escapehatch/employer-facing-document-url/v1", "schema identity")
    require(data.get("version") == 1, "version")
    hosts = data.get("forbidden_url_host_suffixes")
    require(isinstance(hosts, list) and "drive.google.com" in hosts and "docs.google.com" in hosts, "Drive/Docs hosts required")
    runtime = data.get("runtime_enforcement") or {}
    require(runtime.get("error_code") == "private_cloud_document_url_forbidden", "error code")
    require(PURE.is_file(), "pure module missing")
    require(TEST.is_file(), "unit tests missing")
    require(FILL.is_file(), "managed-form missing")
    pure = PURE.read_text(encoding="utf-8")
    fill = FILL.read_text(encoding="utf-8")
    test = TEST.read_text(encoding="utf-8")
    require("private_cloud_document_url_forbidden" in pure, "pure module missing error code")
    require("employer_facing_document_url_must_be_pdf" in pure, "pure module missing PDF error code")
    require("drive.google.com" in pure, "pure module missing Drive host")
    require("assertEmployerFacingDocumentUrl" in fill, "fill path must call assertEmployerFacingDocumentUrl")
    require("private_cloud_document_url_forbidden" in fill, "fill path must surface forbid reason")
    require("private_cloud_document_url_forbidden" in test, "tests must cover forbid code")
    require("employer_facing_document_url_must_be_pdf" in test, "tests must cover PDF-labeled field gate")
    require(
        "perezparallax.dev/static/resume/current.pdf" in test or "public" in test.lower(),
        "tests must allow public PDF resume URL",
    )
    require(runtime.get("pdf_error_code") == "employer_facing_document_url_must_be_pdf", "contract pdf error code")
    prepare = ROOT / "scripts" / "prepare_managed_application.mjs"
    require(prepare.is_file(), "prepare script missing")
    prepare_text = prepare.read_text(encoding="utf-8")
    require("skipped_non_pdf_url" in prepare_text, "prepare script must refuse non-PDF resume URLs")
    require("current.html" not in prepare_text, "prepare must not hard-default an HTML resume URL")
    require("omitted_no_verified_public_pdf" in prepare_text, "prepare must omit resume when no verified public PDF is supplied")
    print("EMPLOYER_FACING_DOCUMENT_URL_VALIDATION: PASS")
    print(f"contract={CONTRACT.relative_to(ROOT)}")
    print(f"forbidden_hosts={len(hosts)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractError as exc:
        print(f"EMPLOYER_FACING_DOCUMENT_URL_VALIDATION: FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
