#!/usr/bin/env python3
"""Fail closed on known canned contrast language and out-of-comment-scope edits.

Tracked fixtures are entirely synthetic. Private inputs belong outside git.
This lexical tool is not a semantic judge and cannot infer factual truth.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/career-language-style.v1.json"
FIXTURES = ROOT / "fixtures/career-language-style.v1.example.json"

PATTERNS = (
    ("FIRST_PERSON_X_NOT_Y", re.compile(
        r"\bI\s+(?:do|build|create|lead|deliver|design|make|write|manage|develop|treat|turn|use|am)\b"
        r"[^\n.!?]{0,120}?(?:[—–]\s*not\b|,\s*not\b)", re.IGNORECASE
    )),
    ("NOT_JUST_BUT", re.compile(
        r"\bnot\s+just\b[^\n.!?]{0,120}?\bbut\b", re.IGNORECASE
    )),
    ("DO_NOT_JUST_BUT", re.compile(
        r"\b(?:do\s+not|don't|don’t)\s+just\b[^\n.!?]{0,120}?\bbut\b",
        re.IGNORECASE
    )),
)

class LanguageStyleError(ValueError):
    pass

def audit_voice(text: str, approved: bool = False) -> list[str]:
    if not isinstance(text, str) or not text.strip():
        raise LanguageStyleError("voice text must be a nonempty string")
    if type(approved) is not bool:
        raise LanguageStyleError("operator-approved contrast flag must be a boolean")
    if approved:
        return []
    return [name for name, pattern in PATTERNS if pattern.search(text)]

def audit_comment_scope(before: list[str], after: list[str], allowed: list[int]) -> list[str]:
    if not isinstance(before, list) or not isinstance(after, list):
        raise LanguageStyleError("before and after must be paragraph arrays")
    if any(not isinstance(p, str) for p in before + after):
        raise LanguageStyleError("paragraph values must be strings")
    if len(before) != len(after):
        return ["PARAGRAPH_STRUCTURE_CHANGED"]
    if not isinstance(allowed, list) or any(type(i) is not int or i < 0 or i >= len(before) for i in allowed):
        raise LanguageStyleError("allowed_change_indices must contain valid zero-based indices")
    if len(set(allowed)) != len(allowed):
        raise LanguageStyleError("allowed_change_indices must be unique")
    changed = {i for i, (b, a) in enumerate(zip(before, after)) if b != a}
    unauthorized = sorted(changed - set(allowed))
    return ["OUT_OF_SCOPE_CHANGE:" + ",".join(map(str, unauthorized))] if unauthorized else []

def validate_contract() -> None:
    data = json.loads(CONTRACT.read_text(encoding="utf-8"))
    if data.get("schema") != "escapehatch/career-language-style/v1" or data.get("version") != 1:
        raise LanguageStyleError("contract identifier drift")
    p = data.get("principles", {})
    required = (
        "avoid_canned_x_not_y", "do_not_ban_all_dashes",
        "permit_explicitly_approved_true_contrast",
        "comment_edits_only_within_authorized_scope",
        "preserve_other_author_changes",
        "no_fact_promotion_from_stylistic_edits", "private_inputs_never_tracked",
    )
    if any(p.get(key) is not True for key in required):
        raise LanguageStyleError("mandatory language/style principles missing")

def check_case(case: dict) -> str:
    if not isinstance(case, dict):
        raise LanguageStyleError("each case must be an object")
    if case.get("type") == "voice":
        reasons = audit_voice(case.get("text"), case.get("operator_approved_factual_contrast", False))
    elif case.get("type") == "comment_scope":
        reasons = audit_comment_scope(
            case.get("before"), case.get("after"), case.get("allowed_change_indices")
        )
    else:
        raise LanguageStyleError("unknown case type")
    return "REJECT" if reasons else "PASS"

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=FIXTURES,
                        help="review cases JSON; real user material must remain untracked")
    args = parser.parse_args()
    try:
        validate_contract()
        payload = json.loads(args.input.read_text(encoding="utf-8"))
        cases = payload.get("cases") if isinstance(payload, dict) else None
        if not isinstance(cases, list) or not cases:
            raise LanguageStyleError("nonempty cases list required")
        if args.input.resolve() == FIXTURES.resolve() and payload.get("synthetic_only") is not True:
            raise LanguageStyleError("tracked fixtures must be synthetic-only")
        for index, case in enumerate(cases):
            outcome = check_case(case)
            expected = case.get("expected")
            if expected is None:
                if outcome == "REJECT":
                    raise LanguageStyleError("style/scope rejection at case " + str(index))
            elif expected not in ("PASS", "REJECT") or outcome != expected:
                raise LanguageStyleError("unexpected outcome at case " + str(index))
        print(f"PASS career language style: contract + {len(cases)} scoped synthetic/review cases checked")
        return 0
    except (OSError, TypeError, ValueError, KeyError) as error:
        print("FAIL career language style: " + str(error))
        return 1

if __name__ == "__main__":
    sys.exit(main())
