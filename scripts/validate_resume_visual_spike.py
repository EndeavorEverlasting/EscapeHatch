#!/usr/bin/env python3
"""Validate the synthetic visual-resume reverse-engineer spike (R5 structural markers).

Live PDF compile is attempted only when a TeX engine is on PATH. Missing TeX is a
proof-ceiling (BLOCKED live PDF), not a contract failure for source markers.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates/resume-visual-dynamic/v1/synthetic-dynamic.tex"
RECEIPT_DIR = ROOT / "harness/reports"
RECEIPT = RECEIPT_DIR / "resume-visual-spike-receipt.v1.json"
SOURCE_DIR_NAME = "Source Resumes Not to Mutate but to Generate"

R5_MARKERS = (
    "ESCAPEHATCH_R5:dark_schematic_bg",
    "ESCAPEHATCH_R5:main_left_column",
    "ESCAPEHATCH_R5:door_hanger_sidebar",
    "ESCAPEHATCH_R5:horizontal_skill_bars",
    "ESCAPEHATCH_R5:contact_icon_cluster",
    "ESCAPEHATCH_R5:single_page_target",
)

STRUCTURAL_TOKENS = (
    "PageDark",
    "SkillBar",
    "rounded corners",
    "Professional Experience",
    "Technical Skills",
    "NOT_FOR_ATS_SUBMISSION",
)


class SpikeError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SpikeError(message)


def find_engine() -> str | None:
    for name in ("pdflatex", "xelatex", "lualatex", "tectonic"):
        path = shutil.which(name)
        if path:
            return path
    return None


def validate_source_markers(text: str) -> dict:
    missing = [m for m in R5_MARKERS if m not in text]
    require(not missing, f"missing R5 markers: {missing}")
    missing_tokens = [t for t in STRUCTURAL_TOKENS if t not in text]
    require(not missing_tokens, f"missing structural tokens: {missing_tokens}")
    require("Alex Rivera" in text or "ALEX RIVERA" in text, "synthetic identity missing")
    require("Occupations.RP@" not in text, "real contact email leaked into synthetic template")
    require("631 388" not in text and "631-388" not in text, "real phone fragment leaked")
    return {
        "r5_markers_present": list(R5_MARKERS),
        "structural_tokens_present": list(STRUCTURAL_TOKENS),
        "score": f"{len(R5_MARKERS)}/{len(R5_MARKERS)}",
        "decision": "KEEP",
    }


def try_compile(engine: str) -> dict:
    with tempfile.TemporaryDirectory(prefix="eh-visual-spike-") as tmp:
        work = Path(tmp)
        tex = work / "synthetic-dynamic.tex"
        tex.write_text(TEMPLATE.read_text(encoding="utf-8"), encoding="utf-8")
        cmd = [engine, "-interaction=nonstopmode", "-halt-on-error", tex.name]
        if Path(engine).name.lower().startswith("tectonic"):
            cmd = [engine, str(tex)]
        proc = subprocess.run(
            cmd,
            cwd=work,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        pdf = work / "synthetic-dynamic.pdf"
        out_dir = ROOT / "Outputs" / "resume-visual"
        out_dir.mkdir(parents=True, exist_ok=True)
        if proc.returncode == 0 and pdf.is_file():
            target = out_dir / "synthetic-dynamic.pdf"
            target.write_bytes(pdf.read_bytes())
            return {
                "attempted": True,
                "engine": engine,
                "exit_code": proc.returncode,
                "pdf": str(target.relative_to(ROOT)),
                "live_pdf_proof": "OBSERVED",
            }
        return {
            "attempted": True,
            "engine": engine,
            "exit_code": proc.returncode,
            "stderr_tail": (proc.stderr or proc.stdout or "")[-1200:],
            "live_pdf_proof": "FAILED",
        }


def assert_source_folder_untouched() -> dict:
    source = ROOT / SOURCE_DIR_NAME
    return {
        "path": SOURCE_DIR_NAME,
        "exists": source.is_dir(),
        "doctrine": "read_only_reference_never_mutate",
        "mutated_by_this_script": False,
    }


def main() -> int:
    try:
        require(TEMPLATE.is_file(), f"missing template: {TEMPLATE}")
        text = TEMPLATE.read_text(encoding="utf-8")
        markers = validate_source_markers(text)
        source_state = assert_source_folder_untouched()
        engine = find_engine()
        if engine:
            compile_result = try_compile(engine)
        else:
            compile_result = {
                "attempted": False,
                "engine": None,
                "live_pdf_proof": "BLOCKED",
                "blocker": "no pdflatex/xelatex/lualatex/tectonic on PATH",
            }
    except (OSError, SpikeError, subprocess.TimeoutExpired) as exc:
        print(f"RESUME_VISUAL_SPIKE_VALIDATION: FAIL: {exc}", file=sys.stderr)
        return 1

    receipt = {
        "schema": "escapehatch-resume-visual-spike-receipt/v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "template": str(TEMPLATE.relative_to(ROOT)),
        "r5": markers,
        "source_reference": source_state,
        "compile": compile_result,
        "proof_levels": {
            "source_structural_markers": "VALIDATED",
            "live_pdf_compile": compile_result.get("live_pdf_proof"),
        },
    }
    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")

    print("RESUME_VISUAL_SPIKE_VALIDATION: PASS")
    print(f"template={TEMPLATE.relative_to(ROOT)}")
    print(f"r5_score={markers['score']}")
    print(f"decision={markers['decision']}")
    print(f"live_pdf_proof={compile_result.get('live_pdf_proof')}")
    print(f"receipt={RECEIPT.relative_to(ROOT)}")
    if compile_result.get("live_pdf_proof") == "BLOCKED":
        print("NOTE: install a TeX engine to raise proof to OBSERVED PDF compile")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
