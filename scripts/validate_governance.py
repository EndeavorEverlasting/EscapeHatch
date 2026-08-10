#!/usr/bin/env python3
"""Validate the canonical EscapeHatch agent governance doctrine."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
GOVERNANCE = REPO_ROOT / "AGENTS.md"

TITLE = "# EscapeHatch Agent Governance Doctrine"
REQUIRED_HEADINGS = (
    "## 1. Agent Operating Principles",
    "## 2. Instruction Precedence",
    "## 3. Mandatory Sprint Declaration",
    "## 4. Execution Discipline",
    "## 5. Completion Standard",
    "## 6. Forbidden Behaviors",
    "## 7. Actionable Next Command Contract",
    "## 8. Governance Ownership",
)

REQUIRED_BY_SECTION = {
    REQUIRED_HEADINGS[0]: (
        "Evidence before action",
        "Floor before furniture",
        "Bounded sprints with declared scope",
        "One writer per branch",
        "Reuse before replacing",
        "No completion without proof",
    ),
    REQUIRED_HEADINGS[2]: (
        "Repo and branch",
        "Lane and mission",
        "Owned scope",
        "Forbidden scope",
        "Expected artifacts",
        "Validation commands",
        "Proof ceiling",
    ),
    REQUIRED_HEADINGS[3]: (
        "**Request:**",
        "**Evidence review:**",
        "**Bounded plan:**",
        "**Action:**",
        "**Artifacts:**",
        "**Validation:**",
        "**Report:**",
        "**Next decision:**",
    ),
    REQUIRED_HEADINGS[4]: (
        "Every created or modified file is named in the report",
        "Declared validation was actually run",
        "Validation output supports the completion claim",
        "A commit SHA exists",
        "Push state and pull-request state",
        "Exactly one actionable next command is provided",
    ),
    REQUIRED_HEADINGS[5]: (
        "Acknowledgment without mutation",
        "Plans without execution",
        "Summaries without proof",
        "Completion claims without running the checks",
        "Secret, token, password, credential, private-key",
    ),
    REQUIRED_HEADINGS[6]: (
        "The final report for serious repository work must not leave",
        "The next command must:",
        "begin with the first executable action",
        "name any real blocker or dependency",
        "preserve dirty or separately owned work",
        "run the owning validator, build, launcher",
        "resolve canonical artifacts from tracked repository contracts",
        "propagate nonzero exit status",
    ),
    REQUIRED_HEADINGS[7]: (
        "`AGENTS.md` owns repository-wide agent governance",
        "may not silently create a second governance authority",
    ),
}

PRECEDENCE = (
    "Platform, security, legal, and repository-owner instructions.",
    "This governance contract.",
    "Task-specific prompts and sprint instructions.",
    "Generic agent defaults or conventions.",
)


class GovernanceError(ValueError):
    """Raised when the governance contract is malformed."""


def parse_sections(text: str) -> tuple[str, list[str], dict[str, str]]:
    lines = text.splitlines()
    first_nonempty = next((line.strip() for line in lines if line.strip()), "")
    headings: list[str] = []
    sections: dict[str, list[str]] = {}
    current: str | None = None

    for line in lines:
        if re.fullmatch(r"## [^\r\n]+", line):
            if line in sections:
                raise GovernanceError(f"duplicate section heading: {line}")
            headings.append(line)
            current = line
            sections[current] = []
        elif current is not None:
            sections[current].append(line)

    return first_nonempty, headings, {
        heading: "\n".join(body).strip() for heading, body in sections.items()
    }


def validate_text(text: str) -> None:
    if len(text.strip()) < 1500:
        raise GovernanceError("AGENTS.md is unexpectedly short")
    if re.search(r"\b(?:TODO|TBD)\b", text):
        raise GovernanceError("placeholder text is not allowed in the governance contract")

    title, headings, sections = parse_sections(text)
    if title != TITLE:
        raise GovernanceError(f"canonical title mismatch: {title!r}")

    missing = [heading for heading in REQUIRED_HEADINGS if heading not in sections]
    if missing:
        raise GovernanceError("missing headings: " + ", ".join(missing))

    positions = [headings.index(heading) for heading in REQUIRED_HEADINGS]
    if positions != sorted(positions):
        raise GovernanceError("required governance sections are out of order")

    for heading, required_phrases in REQUIRED_BY_SECTION.items():
        body = sections[heading]
        absent = [phrase for phrase in required_phrases if phrase not in body]
        if absent:
            raise GovernanceError(
                f"{heading} missing required doctrine: " + ", ".join(absent)
            )

    precedence_body = sections[REQUIRED_HEADINGS[1]]
    numbered = [
        match.group(1).strip()
        for line in precedence_body.splitlines()
        if (match := re.fullmatch(r"\d+\.\s+(.+)", line.strip()))
    ]
    if tuple(numbered) != PRECEDENCE:
        raise GovernanceError(
            "instruction precedence must contain exactly the four canonical entries in order"
        )


def remove_section(text: str, heading: str) -> str:
    lines = text.splitlines()
    start = lines.index(heading)
    end = len(lines)
    for idx in range(start + 1, len(lines)):
        if lines[idx].startswith("## "):
            end = idx
            break
    return "\n".join(lines[:start] + lines[end:]) + "\n"


def expect_invalid(label: str, candidate: str) -> None:
    try:
        validate_text(candidate)
    except GovernanceError:
        return
    raise AssertionError(f"negative fixture unexpectedly passed: {label}")


def run_self_tests(text: str) -> int:
    count = 0

    for heading in REQUIRED_HEADINGS:
        expect_invalid(f"removed heading {heading}", remove_section(text, heading))
        count += 1

    for heading, phrases in REQUIRED_BY_SECTION.items():
        for phrase in phrases:
            body = parse_sections(text)[2][heading]
            if phrase not in body:
                raise AssertionError(f"fixture source missing phrase: {heading}: {phrase}")
            expect_invalid(
                f"removed control {heading}: {phrase}",
                text.replace(phrase, "[REMOVED CONTROL]", 1),
            )
            count += 1

    first, fourth = PRECEDENCE[0], PRECEDENCE[3]
    expect_invalid(
        "reordered precedence",
        text.replace(f"1. {first}", f"1. {fourth}", 1).replace(
            f"4. {fourth}", f"4. {first}", 1
        ),
    )
    count += 1

    expect_invalid(
        "rule moved outside owning section",
        text.replace("### Evidence before action\n", "### Evidence\n", 1)
        + "\n<!-- Evidence before action -->\n",
    )
    count += 1

    return count


def main() -> int:
    if not GOVERNANCE.is_file():
        print(
            f"GOVERNANCE_VALIDATION: FAIL: missing canonical governance file: "
            f"{GOVERNANCE.relative_to(REPO_ROOT)}",
            file=sys.stderr,
        )
        return 1

    text = GOVERNANCE.read_text(encoding="utf-8")
    try:
        validate_text(text)
        self_tests = run_self_tests(text)
    except (GovernanceError, AssertionError) as exc:
        print(f"GOVERNANCE_VALIDATION: FAIL: {exc}", file=sys.stderr)
        return 1

    print("GOVERNANCE_VALIDATION: PASS")
    print(f"governance_file={GOVERNANCE.relative_to(REPO_ROOT)}")
    print(f"bytes={len(text.encode('utf-8'))}")
    print(f"required_sections={len(REQUIRED_HEADINGS)}")
    print(f"self_tests={self_tests}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
