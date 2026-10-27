#!/usr/bin/env python3
"""Fail closed on known career-story duration truncation and ownership demotion.

Inputs contain one source-grounded claim paragraph each; do not commit private payloads.
This check does not infer truthful durations from text and is not a full semantic judge.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/career-claim-fidelity.v1.json"
FIXTURES = ROOT / "fixtures/career-claim-fidelity.v1.example.json"

DURATION = re.compile(
    r"\b(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|"
    r"several|few|a few|\d+\+?)\s*[- ]\s*(?:days?|weeks?|months?|years?))\b",
    re.IGNORECASE,
)
TEMPORARY_DEMOTION = re.compile(
    r"\b(?:just|only|merely|briefly|temporarily)\s+"
    r"(?:covered|covering|filled\s+in|stepped\s+in|substituted)\b",
    re.IGNORECASE,
)


class ClaimFidelityError(ValueError):
    pass


def audit(source: dict, draft: str) -> list[str]:
    if not isinstance(source, dict) or not isinstance(draft, str) or not draft.strip():
        raise ClaimFidelityError("missing source or draft")
    required = {"owner_scope", "duration_verified", "avoid_temporary_cover_framing"}
    if not required.issubset(source):
        raise ClaimFidelityError("required source-grounding fields missing")
    if source["owner_scope"] not in {"owner", "contributor"}:
        raise ClaimFidelityError("invalid owner_scope")
    if type(source["duration_verified"]) is not bool or type(source["avoid_temporary_cover_framing"]) is not bool:
        raise ClaimFidelityError("verification fields must be booleans")
    reasons = []
    if not source["duration_verified"] and DURATION.search(draft):
        reasons.append("UNVERIFIED_PROJECT_DURATION")
    if source["owner_scope"] == "owner" and source["avoid_temporary_cover_framing"] and TEMPORARY_DEMOTION.search(draft):
        reasons.append("OWNERSHIP_DEMOTION")
    return reasons


def validate() -> dict:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    if contract.get("schema") != "escapehatch/career-claim-fidelity/v1" or contract.get("version") != 1:
        raise ClaimFidelityError("career claim contract drift")
    principles = contract.get("principles", {})
    required = (
        "partial_observation_is_not_total_duration",
        "latest_user_correction_outweighs_derivative_text",
        "default_omit_unverified_project_duration",
        "preserve_factual_functional_ownership",
        "preserve_distinct_employers_and_dates",
        "preserve_author_voice_and_contractions",
        "never_commit_private_career_content",
    )
    if any(principles.get(k) is not True for k in required):
        raise ClaimFidelityError("mandatory claim fidelity guarantee missing")
    if contract.get("runtime_evidence_contract", {}).get("fail_closed_without_source") is not True:
        raise ClaimFidelityError("source omission must fail closed")
    return contract


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=FIXTURES, help="synthetic cases or local untracked private claims")
    args = parser.parse_args()
    try:
        validate()
        payload = json.loads(args.input.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or not isinstance(payload.get("cases"), list) or not payload["cases"]:
            raise ClaimFidelityError("cases input missing or empty")
        if args.input == FIXTURES and payload.get("synthetic_only") is not True:
            raise ClaimFidelityError("tracked fixtures must be synthetic")
        for i, case in enumerate(payload["cases"]):
            reasons = audit(case["source"], case["draft"])
            state = "REJECT" if reasons else "PASS"
            if "expected" in case and state != case["expected"]:
                raise ClaimFidelityError("synthetic expectation mismatch at case " + str(i))
            if "expected" not in case and state == "REJECT":
                raise ClaimFidelityError("draft claim failed at case " + str(i) + ": " + ",".join(reasons))
        print(f"PASS career claim fidelity: contract + {len(payload['cases'])} scoped claims checked")
        return 0
    except (OSError, ValueError, TypeError, KeyError) as error:
        print("FAIL career claim fidelity: " + str(error))
        return 1


if __name__ == "__main__":
    sys.exit(main())
