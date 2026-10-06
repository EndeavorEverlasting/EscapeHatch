#!/usr/bin/env python3
"""Fail-closed validation for the optional visual resume projection contract."""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/resume-presentation-visual.v1.json"
ATS_CONTRACT = ROOT / "contracts/resume-presentation.v1.json"
SCHEMA = "escapehatch-resume-presentation-visual/v1"
TEMPLATE = ROOT / "templates/resume-visual-dynamic/v1/synthetic-dynamic.tex"


class VisualPresentationError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VisualPresentationError(message)


def validate(data: dict) -> None:
    require(data.get("schema") == SCHEMA, "schema mismatch")
    require(data.get("version") == 1, "version mismatch")

    authority = data.get("authority", {})
    require(authority.get("canonical_contract") is True, "contract must be canonical")
    require(authority.get("projection") == "visual", "projection must be visual")
    require(authority.get("not_for_ats_submission") is True, "visual projection must be marked non-ATS")
    require(authority.get("does_not_weaken_ats_contract") is True, "must not weaken ATS contract")
    require(authority.get("ats_contract") == "contracts/resume-presentation.v1.json", "ATS pointer changed")
    require(authority.get("private_content_in_repository") is False, "private content must stay out of Git")
    require(authority.get("universal_ats_compatibility_claim") is False, "ATS claims forbidden")
    require(ATS_CONTRACT.is_file(), "ATS contract missing")

    page = data.get("page", {})
    require(page.get("layout") == "main_plus_right_sidebar", "visual layout regressed")
    require(page.get("target_pages") == 1, "visual target pages regressed")
    background = page.get("background", {})
    require(background.get("mode") == "dark_schematic", "dark schematic background required")
    require(background.get("solid_white_required") is False, "visual bg must allow non-white")

    structure = data.get("structure", {})
    require(structure.get("single_column") is False, "visual may not force single-column")
    require(structure.get("sidebars_allowed") is True, "sidebar must be allowed for visual")
    require(structure.get("graphical_skill_bars_allowed") is True, "skill bars must be allowed for visual")
    require(structure.get("semantic_icons_allowed") is True, "icons must be allowed for visual")
    require(structure.get("image_based_text_allowed") is False, "image-based text remains forbidden")

    content = data.get("content", {})
    require(content.get("tracked_fixtures_must_be_synthetic") is True, "fixtures must remain synthetic")
    require(content.get("real_pii_forbidden_in_git") is True, "real PII forbidden in Git")

    outputs = data.get("outputs", {})
    require(outputs.get("required_formats") == ["pdf"], "visual requires PDF")
    require(outputs.get("docx_not_required") is True, "DOCX must remain optional for visual")

    gate = data.get("quality_gate", {})
    require(gate.get("never_mutate_source_reference_folder") is True, "source mutation must stay forbidden")
    require(gate.get("structural_checklist_against_reference_pdf") is True, "structural checklist required")

    ref = data.get("reference_artifact", {})
    require(ref.get("must_not_mutate_source") is True, "must_not_mutate_source required")
    require(ref.get("tracked_template") == "templates/resume-visual-dynamic/v1/synthetic-dynamic.tex", "template path changed")
    require(TEMPLATE.is_file(), f"missing synthetic template: {TEMPLATE}")


def expect_invalid(label: str, candidate: dict) -> None:
    try:
        validate(candidate)
    except VisualPresentationError:
        return
    raise VisualPresentationError(f"negative fixture unexpectedly passed: {label}")


def self_tests(data: dict) -> int:
    cases: list[tuple[str, dict]] = []

    def mutate(label: str, path: tuple[str, ...], value: object) -> None:
        candidate = copy.deepcopy(data)
        node = candidate
        for key in path[:-1]:
            node = node[key]
        node[path[-1]] = value
        cases.append((label, candidate))

    mutate("ats submission allowed", ("authority", "not_for_ats_submission"), False)
    mutate("weakens ats", ("authority", "does_not_weaken_ats_contract"), False)
    mutate("force single column", ("structure", "single_column"), True)
    mutate("forbid sidebars", ("structure", "sidebars_allowed"), False)
    mutate("forbid skill bars", ("structure", "graphical_skill_bars_allowed"), False)
    mutate("allow image text", ("structure", "image_based_text_allowed"), True)
    mutate("require white bg", ("page", "background", "solid_white_required"), True)
    mutate("allow source mutation", ("quality_gate", "never_mutate_source_reference_folder"), False)
    mutate("private content in repo", ("authority", "private_content_in_repository"), True)

    for label, candidate in cases:
        expect_invalid(label, candidate)
    return len(cases)


def main() -> int:
    try:
        data = json.loads(CONTRACT.read_text(encoding="utf-8"))
        validate(data)
        negatives = self_tests(data)
    except (OSError, json.JSONDecodeError, VisualPresentationError, KeyError, TypeError, ValueError) as exc:
        print(f"RESUME_PRESENTATION_VISUAL_VALIDATION: FAIL: {exc}", file=sys.stderr)
        return 1

    print("RESUME_PRESENTATION_VISUAL_VALIDATION: PASS")
    print(f"contract={CONTRACT.relative_to(ROOT)}")
    print("projection=VISUAL")
    print("not_for_ats_submission=TRUE")
    print("does_not_weaken_ats_contract=TRUE")
    print(f"template={TEMPLATE.relative_to(ROOT)}")
    print(f"negative_fixtures={negatives}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
