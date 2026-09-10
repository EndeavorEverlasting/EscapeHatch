#!/usr/bin/env python3
"""Fail-closed validation for the EscapeHatch resume presentation contract."""
from __future__ import annotations

import copy
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/resume-presentation.v1.json"
SCHEMA = "escapehatch-resume-presentation/v1"
HEX = re.compile(r"^#[0-9A-F]{6}$")


class ResumePresentationError(ValueError):
    pass


def load_contract() -> dict:
    try:
        data = json.loads(CONTRACT.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ResumePresentationError(f"invalid contract: {exc}") from exc
    validate(data)
    return data


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ResumePresentationError(message)


def validate(data: dict) -> None:
    require(data.get("schema") == SCHEMA, "schema mismatch")
    require(data.get("version") == 1, "version mismatch")

    authority = data.get("authority", {})
    require(authority.get("canonical_contract") is True, "contract must be canonical")
    require(authority.get("private_content_in_repository") is False, "private resume content must stay out of Git")
    require(authority.get("universal_ats_compatibility_claim") is False, "universal ATS claims are forbidden")

    page = data.get("page", {})
    require(page.get("size") == "US Letter", "page size must remain US Letter")
    require(page.get("orientation") == "portrait", "orientation must remain portrait")
    require(page.get("layout") == "single_column", "layout must remain single-column")
    require(page.get("target_pages") == 2, "master presentation target must remain two pages")
    require(float(page.get("minimum_body_font_pt", 0)) >= 10.0, "body font floor must be at least 10 pt")
    margins = page.get("margins_inches", {})
    require(margins == {"top": 0.55, "bottom": 0.55, "left": 0.65, "right": 0.65}, "canonical margins changed")

    palette = data.get("palette", {})
    for key in ("primary_navy", "secondary_slate", "primary_text", "secondary_text", "background"):
        require(bool(HEX.fullmatch(str(palette.get(key, "")))), f"invalid color: {key}")
    require(palette.get("primary_navy") == "#17365D", "primary navy changed")
    require(palette.get("secondary_slate") == "#34495E", "secondary slate changed")
    require(palette.get("primary_text") == "#202020", "primary text changed")
    require(palette.get("color_is_decorative_only") is True, "color must remain decorative only")
    require(palette.get("must_remain_legible_in_grayscale") is True, "grayscale legibility required")

    typography = data.get("typography", {})
    exact = {
        "name": ("Trebuchet MS", 23.0, True, "#17365D"),
        "career_headline": ("Trebuchet MS", 11.5, True, "#34495E"),
        "contact_line": ("Arial", 9.5, False, "#404040"),
        "section_heading": ("Trebuchet MS", 11.5, True, "#17365D"),
        "project_or_position_title": ("Trebuchet MS", 10.75, True, "#202020"),
        "body": ("Arial", 10.5, False, "#202020"),
        "bullet": ("Arial", 10.25, False, "#202020"),
    }
    for key, (font, size, bold, color) in exact.items():
        item = typography.get(key, {})
        require(item.get("font") == font, f"{key} font changed")
        require(float(item.get("size_pt", 0)) == size, f"{key} size changed")
        require(item.get("bold") is bold, f"{key} weight changed")
        require(item.get("color") == color, f"{key} color changed")
    require(typography.get("section_heading", {}).get("uppercase") is True, "section headings must remain uppercase")
    require(float(typography.get("section_heading", {}).get("bottom_rule_pt", 0)) == 0.5, "section rule changed")
    bullet = typography.get("bullet", {})
    require(bullet.get("glyph") == "•", "standard round bullet required")
    require(float(bullet.get("line_spacing", 0)) == 1.05, "bullet line spacing changed")
    require(float(bullet.get("space_after_pt", -1)) == 2.5, "bullet spacing changed")

    structure = data.get("structure", {})
    true_rules = (
        "single_column",
        "selectable_text_required",
        "standard_round_bullets_required",
        "standard_section_names_preferred",
        "dates_must_be_conventional_text",
        "hyperlinks_must_have_visible_text",
    )
    false_rules = (
        "text_boxes_allowed",
        "sidebars_allowed",
        "layout_tables_allowed",
        "graphical_skill_bars_allowed",
        "semantic_icons_allowed",
        "meaningful_content_in_headers_or_footers_allowed",
        "image_based_text_allowed",
    )
    for key in true_rules:
        require(structure.get(key) is True, f"required ATS-conservative structure disabled: {key}")
    for key in false_rules:
        require(structure.get(key) is False, f"forbidden ATS-sensitive structure enabled: {key}")

    hierarchy = data.get("content_hierarchy", {})
    require(hierarchy.get("career_identity_before_employment_history") is True, "career identity must lead")
    require(hierarchy.get("software_and_agentic_systems_before_professional_experience_for_agentic_lane") is True, "agentic-lane project prominence regressed")
    require(hierarchy.get("employment_titles_must_remain_factual") is True, "factual employment titles required")
    require(hierarchy.get("projects_may_be_visually_prominent_only_when_supported_by_evidence") is True, "project prominence must be evidence-backed")

    outputs = data.get("outputs", {})
    require(outputs.get("required_formats") == ["docx", "pdf"], "DOCX + PDF outputs required")
    require(outputs.get("pdf_must_preserve_extractable_text") is True, "PDF extractable text required")
    require(outputs.get("docx_must_preserve_real_text") is True, "DOCX real text required")
    require(outputs.get("derived_outputs_must_match_canonical_resume_content") is True, "derived content consistency required")

    gate = data.get("quality_gate", {})
    for key in (
        "render_docx_to_page_images",
        "inspect_every_rendered_page",
        "check_for_clipping",
        "check_for_overlap",
        "check_for_broken_glyphs",
        "check_page_balance",
        "run_accessibility_audit_when_supported",
        "verify_pdf_text_extraction",
        "verify_contact_identity_consistency_across_current_outputs",
        "preserve_existing_drive_ids_when_replacing_current_projections",
    ):
        require(gate.get(key) is True, f"quality gate disabled: {key}")

    privacy = data.get("privacy", {})
    for key in ("real_name", "phone", "email", "address", "resume_content"):
        require(privacy.get(key) == "user_owned_input_only", f"private field ownership changed: {key}")
    require(privacy.get("tracked_fixtures_must_be_synthetic") is True, "fixtures must remain synthetic")

    proof = data.get("proof_ceiling", {})
    does_not = set(proof.get("does_not_prove", []))
    require("universal ATS vendor compatibility" in does_not, "ATS proof ceiling missing")
    require("application success" in does_not, "outcome proof ceiling missing")


def expect_invalid(label: str, candidate: dict) -> None:
    try:
        validate(candidate)
    except ResumePresentationError:
        return
    raise ResumePresentationError(f"negative fixture unexpectedly passed: {label}")


def self_tests(data: dict) -> int:
    cases: list[tuple[str, dict]] = []

    def mutate(label: str, path: tuple[str, ...], value: object) -> None:
        candidate = copy.deepcopy(data)
        node = candidate
        for key in path[:-1]:
            node = node[key]
        node[path[-1]] = value
        cases.append((label, candidate))

    mutate("two-column layout", ("page", "layout"), "two_column")
    mutate("body below 10 pt", ("typography", "body", "size_pt"), 9.0)
    mutate("sidebar enabled", ("structure", "sidebars_allowed"), True)
    mutate("layout table enabled", ("structure", "layout_tables_allowed"), True)
    mutate("semantic icons enabled", ("structure", "semantic_icons_allowed"), True)
    mutate("image text enabled", ("structure", "image_based_text_allowed"), True)
    mutate("plain heading font regression", ("typography", "section_heading", "font"), "Arial")
    mutate("project prominence disabled", ("content_hierarchy", "software_and_agentic_systems_before_professional_experience_for_agentic_lane"), False)
    mutate("pdf text extraction disabled", ("outputs", "pdf_must_preserve_extractable_text"), False)
    mutate("render QA disabled", ("quality_gate", "render_docx_to_page_images"), False)
    mutate("drive identity preservation disabled", ("quality_gate", "preserve_existing_drive_ids_when_replacing_current_projections"), False)
    mutate("private phone tracked", ("privacy", "phone"), "repository")
    mutate("universal ATS guarantee", ("authority", "universal_ats_compatibility_claim"), True)
    mutate("color becomes semantic", ("palette", "color_is_decorative_only"), False)

    for label, candidate in cases:
        expect_invalid(label, candidate)
    return len(cases)


def main() -> int:
    try:
        data = load_contract()
        negatives = self_tests(data)
    except (ResumePresentationError, KeyError, TypeError, ValueError) as exc:
        print(f"RESUME_PRESENTATION_VALIDATION: FAIL: {exc}", file=sys.stderr)
        return 1

    print("RESUME_PRESENTATION_VALIDATION: PASS")
    print(f"contract={CONTRACT.relative_to(ROOT)}")
    print("layout=SINGLE_COLUMN")
    print("fonts=TREBUCHET_MS+ARIAL")
    print("master_target_pages=2")
    print("docx_pdf_outputs=REQUIRED")
    print("render_qa=REQUIRED")
    print("pdf_extractable_text=REQUIRED")
    print("private_resume_content_in_git=FORBIDDEN")
    print("universal_ats_guarantee=FORBIDDEN")
    print(f"negative_fixtures={negatives}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
