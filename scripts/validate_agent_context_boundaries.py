#!/usr/bin/env python3
"""Validate EscapeHatch's self-contained agent context boundaries (stdlib only)."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "harness/contracts/agent-context-boundaries.v1.json"
EXPECTED_IDS = {
    "applicant_private",
    "contributor_local",
    "repository_policy",
    "sanitized_handoff",
}
PRIVATE_PATTERNS = (
    re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}"),
    re.compile(r"https?://(?:drive|docs)\.google\.com/", re.I),
    re.compile(r"\b(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b"),
    re.compile(r"\b[A-Z]:\\Users\\", re.I),
)
REQUIRED_HEADINGS = (
    "## Launch order",
    "## Boundary tests",
    "## Required receipt",
)

def leaks(text: str) -> bool:
    return any(pattern.search(text) for pattern in PRIVATE_PATTERNS)

def validate() -> list[str]:
    errors: list[str] = []
    if not CONTRACT_PATH.exists():
        return [f"Missing {CONTRACT_PATH}"]
    try:
        obj = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"Invalid contract: {exc}"]
    if obj.get("schema_version") != "escapehatch/agent-context-boundaries/v1":
        errors.append("Unexpected schema version")
    if obj.get("owner") != "AGENTS.md":
        errors.append("AGENTS.md must own repository doctrine")
    if obj.get("standalone_escapepath_required") is not True:
        errors.append("EscapeHatch must self-bootstrap")
    if obj.get("external_prompt_registry_required") is not False:
        errors.append("External prompt catalog cannot be mandatory")
    ctx = obj.get("context_classes")
    if not isinstance(ctx, list) or {x.get("id") for x in ctx if isinstance(x, dict)} != EXPECTED_IDS:
        errors.append("Context classes missing or incorrect")
    else:
        for entry in ctx:
            should_track = entry["id"] in {"repository_policy", "sanitized_handoff"}
            if entry.get("tracked") is not should_track:
                errors.append(f"Context tracked mismatch: {entry['id']}")
            if not entry.get("owner") or not entry.get("gate"):
                errors.append(f"Missing owner/gate: {entry['id']}")
    files = obj.get("read_first")
    if not isinstance(files, list) or not files:
        errors.append("Missing self-contained read-first map")
        files = []
    for path in [*files, obj.get("handoff", "")]:
        if not path or not (ROOT / path).is_file():
            errors.append(f"Missing repository-owned entry point: {path}")
    for path in ["AGENTS.md", "ARTIFACT_REGISTRY.md"]:
        if not (ROOT / path).is_file():
            errors.append(f"Missing {path}")
    if obj.get("private_source_event", {}).get("repo_payload_allowed") is not False:
        errors.append("Private author source must be disallowed from Git")
    if not str(obj.get("private_source_event", {}).get("alias", "")).startswith("opaque:"):
        errors.append("Private source alias must be opaque")
    source = obj.get("private_source_event", {})
    if source.get("canonical_text_preservation") != "VERBATIM_UNTIL_EXPLICIT_AUTHOR_REVISION":
        errors.append("Canonical author text must be verbatim until explicit revision")
    if source.get("canonical_source_count") != 1:
        errors.append("Canonical author source must not have competing copies")
    if source.get("derivatives_replace_source") is not False:
        errors.append("Derivatives must never replace the canonical source")
    if source.get("derivative_approval") != "SEPARATE_REVIEW":
        errors.append("Derivative approval must be separate from source acceptance")
    if not {"resume", "cover_letter", "professional_bio"}.issubset(
        set(source.get("derived_outputs", []))
    ):
        errors.append("Allowed source-derived writing outcomes missing")
    if obj.get("local_trifecta") != "docs/agent/TRIFECTA.md":
        errors.append("EscapeHatch Trifecta must resolve locally")
    refs = [str(CONTRACT_PATH.relative_to(ROOT)), obj.get("handoff", "")]
    for rel in refs:
        p = ROOT / rel
        if p.is_file() and leaks(p.read_text(encoding="utf-8")):
            errors.append(f"Potential private identifier in tracked {rel}")
    handoff_path = ROOT / obj.get("handoff", "")
    if handoff_path.is_file():
        body = handoff_path.read_text(encoding="utf-8")
        for heading in REQUIRED_HEADINGS:
            if heading not in body:
                errors.append(f"Missing handoff heading: {heading}")
        if "TokenCorridor" not in body or "optional" not in body.lower():
            errors.append("Handoff must explicitly document external registry optionality")
        for required in ["AGENTS.md", "harness/WORKFLOWS.md", "docs/agent/TRIFECTA.md", "scripts/validate_agent_context_boundaries.py"]:
            if required not in body:
                errors.append(f"Missing local harness step in handoff: {required}")
    agent_text = (ROOT / "AGENTS.md").read_text(encoding="utf-8") if (ROOT / "AGENTS.md").is_file() else ""
    if obj.get("handoff", "") not in agent_text:
        errors.append("Root AGENTS.md does not link canonical handoff")
    registry_text = (ROOT / "ARTIFACT_REGISTRY.md").read_text(encoding="utf-8") if (ROOT / "ARTIFACT_REGISTRY.md").is_file() else ""
    if obj.get("handoff", "") not in registry_text:
        errors.append("ARTIFACT_REGISTRY.md does not register handoff")
    if "scripts/validate_agent_context_boundaries.py" not in registry_text:
        errors.append("ARTIFACT_REGISTRY.md does not register validator")
    return errors

def self_test() -> list[str]:
    examples = {
        "neutral": ("opaque:career-author-voice/2026-10-31", False),
        "email": ("someone@example.org", True),
        "drive_link": ("https://docs.google.com/document/d/PRIVATE-ID/edit", True),
        "phone": ("631-555-0101", True),
        "windows_user": ("C:\\Users\\private\\profile.json", True),
    }
    return [f"Leak pattern case failed: {name}" for name, (sample, expected) in examples.items() if leaks(sample) is not expected]

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    errors = self_test() if args.self_test else validate()
    if errors:
        print("FAIL: " + "; ".join(errors))
        return 1
    print("PASS: synthetic private-leak negatives" if args.self_test else "PASS: EscapeHatch self-contained context contract")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
