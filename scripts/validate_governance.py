#!/usr/bin/env python3
"""Validate the canonical EscapeHatch agent governance doctrine."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
GOVERNANCE = REPO_ROOT / "AGENTS.md"

REQUIRED_HEADINGS = (
    "# EscapeHatch Agent Governance Doctrine",
    "## 1. Agent Operating Principles",
    "## 2. Instruction Precedence",
    "## 3. Mandatory Sprint Declaration",
    "## 5. Completion Standard",
    "## 6. Forbidden Behaviors",
    "## 7. Actionable Next Command Contract",
    "## 8. Governance Ownership",
)

REQUIRED_PHRASES = (
    "Evidence before action",
    "Floor before furniture",
    "Bounded sprints with declared scope",
    "One writer per branch",
    "Reuse before replacing",
    "No completion without proof",
    "Platform, security, legal, and repository-owner instructions",
    "This governance contract",
    "Task-specific prompts",
    "Generic agent defaults",
    "Repo and branch",
    "Lane and mission",
    "Owned scope",
    "Forbidden scope",
    "Expected artifacts",
    "Validation commands",
    "Proof ceiling",
    "A commit SHA exists",
    "Push state and pull-request state",
    "Acknowledgment without mutation",
    "Plans without execution",
    "Summaries without proof",
    "Completion claims without running the checks",
    "Secret, token, password, credential, private-key",
)


def fail(message: str) -> int:
    print(f"GOVERNANCE_VALIDATION: FAIL: {message}", file=sys.stderr)
    return 1


def main() -> int:
    if not GOVERNANCE.is_file():
        return fail(f"missing canonical governance file: {GOVERNANCE.relative_to(REPO_ROOT)}")

    text = GOVERNANCE.read_text(encoding="utf-8")
    if len(text.strip()) < 1500:
        return fail("AGENTS.md is unexpectedly short")

    missing_headings = [item for item in REQUIRED_HEADINGS if item not in text]
    if missing_headings:
        return fail("missing headings: " + ", ".join(missing_headings))

    missing_phrases = [item for item in REQUIRED_PHRASES if item not in text]
    if missing_phrases:
        return fail("missing required doctrine: " + ", ".join(missing_phrases))

    if "TODO" in text or "TBD" in text:
        return fail("placeholder text is not allowed in the governance contract")

    print("GOVERNANCE_VALIDATION: PASS")
    print(f"governance_file={GOVERNANCE.relative_to(REPO_ROOT)}")
    print(f"bytes={len(text.encode('utf-8'))}")
    print(f"required_headings={len(REQUIRED_HEADINGS)}")
    print(f"required_phrases={len(REQUIRED_PHRASES)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
