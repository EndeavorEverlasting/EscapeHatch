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
    require("drive.google.com" in pure, "pure module missing Drive host")
    require("assertEmployerFacingDocumentUrl" in fill, "fill path must call assertEmployerFacingDocumentUrl")
    require("private_cloud_document_url_forbidden" in fill, "fill path must surface forbid reason")
    require("private_cloud_document_url_forbidden" in test, "tests must cover forbid code")
    require("perezparallax.dev/static/resume/current.html" in test or "public" in test.lower(), "tests must allow public resume URL")
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
