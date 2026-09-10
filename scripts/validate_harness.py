#!/usr/bin/env python3
"""Fail-closed completeness checks for the EscapeHatch operational harness."""
from __future__ import annotations
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "harness/manifest.v1.json"
SCHEMA = "escapehatch-harness/v1"
COMPONENTS = {
    "codebase_map": "harness/CODEBASE_MAP.md",
    "workflow_specs": "harness/WORKFLOWS.md",
    "artifact_registry": "ARTIFACT_REGISTRY.md",
    "harness_validator": "scripts/validate_harness.py",
    "governance_validator": "scripts/validate_governance.py",
    "application_harness_validator": "scripts/validate_application_harness.py",
    "resume_presentation_validator": "scripts/validate_resume_presentation.py",
    "repo_resolver": "scripts/resolve_repo.ps1",
    "application_form_taxonomy": "harness/contracts/application-form-taxonomy.v1.json",
    "application_preference_cache": "harness/contracts/application-preference-cache.v1.json",
    "application_form_workflow": "harness/workflows/APPLICATION_FORM_INTAKE.md",
    "resume_presentation_contract": "contracts/resume-presentation.v1.json",
    "pre_commit_hook": ".githooks/pre-commit",
    "pre_push_hook": ".githooks/pre-push",
    "scoped_skill": "skills/harness-operations/SKILL.md",
    "application_mapping_skill": "skills/application-form-mapping/SKILL.md",
    "operator_report": "harness/reports/CURRENT_STATE.md",
    "application_operator_report": "harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md",
    "lua_design_constraints": "harness/constraints/LUA_EMBEDDING.md",
    "ci_workflow": ".github/workflows/harness.yml",
}
VALIDATION_ORDER = [
    "python scripts/validate_governance.py",
    "python scripts/validate_application_harness.py",
    "python scripts/validate_application_companion.py",
    "python scripts/validate_resume_presentation.py",
    "python scripts/validate_harness.py",
    "python scripts/validate_career_state.py",
    "git diff --check",
]
MARKERS = {
    "harness/CODEBASE_MAP.md": ("## Repository floor","## Structure","## Durable Windows repository root","## Product entry points","## Application-question entry points","## Application companion entry points","## Resume presentation entry points","## Validation commands","## Build, test, and deploy commands","## Fresh-agent path"),
    "harness/WORKFLOWS.md": ("## Repository Location","## Task Pickup","## Application Form Intake","## Application Companion","## Resume Presentation","## Pre-commit validation","## Failure Recovery","## Artifact discipline","## Handoff","## Product-runtime introduction gate"),
    "ARTIFACT_REGISTRY.md": ("## Naming rules","## Registered artifacts","## User-owned local artifacts","## Validation output","## Product artifact gate"),
    "harness/workflows/APPLICATION_FORM_INTAKE.md": ("## Trigger","## Authorities","## Order-independent intake","## Preference resolution","## Sensitivity and freshness","## Learning a new form","## Failure handling","## Handoff"),
    "skills/harness-operations/SKILL.md": ("## Trigger","## Required inputs","## Procedure","## Failure behavior","## Expected outputs"),
    "skills/application-form-mapping/SKILL.md": ("## Trigger","## Required inputs","## Procedure","## Failure behavior","## Expected outputs"),
    "harness/reports/CURRENT_STATE.md": ("## Working","## Broken","## Missing / intentionally not yet established","## Career escape-route boundary","## Local-first companion boundary","## Resume presentation quality boundary","## Application automation boundary","## Validation floor","## Principal risks"),
    "harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md": ("## Evidence reviewed","## Working","## Broken","## Missing / intentionally not yet established","## Principal risks","## Validation","## Proof ceiling"),
    "harness/constraints/LUA_EMBEDDING.md": ("## Host owns the application","## State isolation","## Error boundary","## Sandboxing","## Execution model","## Type discipline","## Conceptual integrity"),
}
REQUIRED_REGISTRY = {
    "Agent governance doctrine": "AGENTS.md",
    "Harness manifest": "harness/manifest.v1.json",
    "Codebase map": "harness/CODEBASE_MAP.md",
    "Workflow specs": "harness/WORKFLOWS.md",
    "Windows repo resolver": "scripts/resolve_repo.ps1",
    "Application form taxonomy": "harness/contracts/application-form-taxonomy.v1.json",
    "Application preference-cache policy": "harness/contracts/application-preference-cache.v1.json",
    "Application form intake workflow": "harness/workflows/APPLICATION_FORM_INTAKE.md",
    "Application mapping skill": "skills/application-form-mapping/SKILL.md",
    "Application automation report": "harness/reports/APPLICATION_FORM_AUTOMATION_STATE.md",
    "Application harness validator": "scripts/validate_application_harness.py",
    "Application companion contract": "contracts/application-companion.v1.json",
    "Application companion example fixture": "fixtures/application-companion.v1.example.json",
    "Application companion validator": "scripts/validate_application_companion.py",
    "Resume presentation contract": "contracts/resume-presentation.v1.json",
    "Resume presentation validator": "scripts/validate_resume_presentation.py",
}
PLACEHOLDER = re.compile(r"\b(?:TODO|TBD|FIXME)\b")

class HarnessError(ValueError):
    pass

def read(path: str) -> str:
    target = ROOT / path
    if not target.is_file():
        raise HarnessError(f"missing component: {path}")
    return target.read_text(encoding="utf-8")

def load_manifest() -> dict:
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HarnessError(f"invalid harness manifest: {exc}") from exc
    if data.get("schema") != SCHEMA:
        raise HarnessError("manifest schema mismatch")
    if data.get("canonical_governance") != "AGENTS.md":
        raise HarnessError("manifest governance owner mismatch")
    if data.get("components") != COMPONENTS:
        raise HarnessError("manifest component map is not canonical")
    if len(set(COMPONENTS.values())) != len(COMPONENTS):
        raise HarnessError("manifest component paths must be unique")
    if data.get("validation_order") != VALIDATION_ORDER:
        raise HarnessError("manifest validation order mismatch")
    if data.get("artifact_registry") != COMPONENTS["artifact_registry"]:
        raise HarnessError("artifact registry alias mismatch")
    for path in COMPONENTS.values():
        p = Path(path)
        if p.is_absolute() or ".." in p.parts or not (ROOT / p).is_file():
            raise HarnessError(f"invalid/missing component path: {path}")
    return data

def validate_markers() -> None:
    for path, markers in MARKERS.items():
        text = read(path)
        missing = [marker for marker in markers if marker not in text]
        if missing:
            raise HarnessError(f"{path} missing markers: {', '.join(missing)}")
        if PLACEHOLDER.search(text):
            raise HarnessError(f"placeholder marker found in {path}")

def parse_registry() -> dict[str, str]:
    text = read("ARTIFACT_REGISTRY.md")
    if "## Registered artifacts\n" not in text:
        raise HarnessError("artifact registry table missing")
    section = text.split("## Registered artifacts\n",1)[1].split("\n## ",1)[0]
    rows = {}; owners = set()
    for raw in section.splitlines():
        if not raw.strip().startswith("|"):
            continue
        cells = [cell.strip() for cell in raw.strip().strip("|").split("|")]
        if not cells or cells[0] in {"Artifact","---"}:
            continue
        if len(cells) != 5 or not (cells[1].startswith("`") and cells[1].endswith("`")):
            raise HarnessError("artifact registry row format invalid")
        name, owner = cells[0], cells[1][1:-1]
        if name in rows:
            raise HarnessError(f"duplicate artifact name: {name}")
        if owner in owners:
            raise HarnessError(f"duplicate artifact owner: {owner}")
        rows[name] = owner; owners.add(owner)
        if not (ROOT / owner).is_file():
            raise HarnessError(f"registered tracked owner missing: {owner}")
    for name, expected in REQUIRED_REGISTRY.items():
        if rows.get(name) != expected:
            raise HarnessError(f"registry owner mismatch for {name}")
    return rows

def validate_hooks() -> None:
    pre = read(".githooks/pre-commit"); push = read(".githooks/pre-push")
    for path, text in ((".githooks/pre-commit",pre),(".githooks/pre-push",push)):
        if not text.startswith("#!/bin/sh\nset -eu\n"):
            raise HarnessError(f"{path} must start with #!/bin/sh and set -eu")
        for token in ("python scripts/validate_governance.py","python scripts/validate_harness.py"):
            if token not in text:
                raise HarnessError(f"{path} missing {token}")
        for forbidden in ("chrome://","Start-Process","curl http","Invoke-WebRequest","npm run dev"):
            if forbidden in text:
                raise HarnessError(f"{path} must not launch runtime/network activity: {forbidden}")
    if "checkout-index --all" not in pre or "diff --cached --check" not in pre:
        raise HarnessError("pre-commit staged snapshot/whitespace proof missing")
    if "git archive --format=tar" not in push or "git diff --check" not in push:
        raise HarnessError("pre-push committed snapshot/whitespace proof missing")

def validate_resolver() -> None:
    text = read("scripts/resolve_repo.ps1")
    for marker in ("Resolve-DurableDevRoot","Find-DesktopDevAncestor","Desktop\\Dev","ExpectedCommit","worktree","--detach","Origin mismatch"):
        if marker not in text:
            raise HarnessError(f"repo resolver missing marker: {marker}")
    if "AppData\\Local\\Temp" in text or "%TEMP%" in text:
        raise HarnessError("repo resolver must not select temporary storage")

def validate_ci() -> None:
    text = read(".github/workflows/harness.yml")
    for marker in ("name: Harness Validation","push:","pull_request:","name: Validate governance","run: python scripts/validate_governance.py","name: Validate application harness","run: python scripts/validate_application_harness.py","name: Validate application companion","run: python scripts/validate_application_companion.py","name: Validate resume presentation","run: python scripts/validate_resume_presentation.py","name: Validate harness","run: python scripts/validate_harness.py","name: Validate career-state contract","run: python scripts/validate_career_state.py","git diff --check","windows-location:","scripts/resolve_repo.ps1 -ResolveOnly","WINDOWS_REPO_ROOT=PASS"):
        if marker not in text:
            raise HarnessError(f"CI missing active marker: {marker}")

def run_validator(path: str) -> None:
    completed = subprocess.run([sys.executable, str(ROOT / path)], cwd=ROOT, text=True, capture_output=True)
    if completed.returncode:
        raise HarnessError(f"{path} failed: {(completed.stdout + completed.stderr).strip()}")

def self_tests(manifest: dict) -> int:
    count = 0; candidates = []
    x = dict(manifest); x["schema"] = "wrong/v1"; candidates.append(x)
    x = json.loads(json.dumps(manifest)); x["components"].pop("application_form_taxonomy"); candidates.append(x)
    x = json.loads(json.dumps(manifest)); x["validation_order"] = x["validation_order"][:-1]; candidates.append(x)
    x = json.loads(json.dumps(manifest)); x["components"]["application_form_taxonomy"] = "../escape.json"; candidates.append(x)
    for candidate in candidates:
        try:
            if candidate.get("schema") != SCHEMA: raise HarnessError("schema")
            if candidate.get("components") != COMPONENTS: raise HarnessError("components")
            if candidate.get("validation_order") != VALIDATION_ORDER: raise HarnessError("order")
            for path in candidate["components"].values():
                p=Path(path)
                if p.is_absolute() or ".." in p.parts: raise HarnessError("path")
        except HarnessError:
            count += 1
        else:
            raise HarnessError("harness negative fixture unexpectedly passed")
    return count

def main() -> int:
    try:
        manifest = load_manifest(); validate_markers(); rows = parse_registry(); validate_hooks(); validate_resolver(); validate_ci()
        run_validator("scripts/validate_governance.py"); run_validator("scripts/validate_application_harness.py"); run_validator("scripts/validate_application_companion.py"); run_validator("scripts/validate_resume_presentation.py")
        negatives = self_tests(manifest)
    except HarnessError as exc:
        print(f"HARNESS_VALIDATION: FAIL: {exc}", file=sys.stderr); return 1
    print("HARNESS_VALIDATION: PASS")
    print(f"manifest={MANIFEST.relative_to(ROOT)}")
    print(f"components={len(COMPONENTS)}")
    print(f"registered_artifacts={len(rows)}")
    print(f"negative_fixtures={negatives}")
    print("governance_validator=PASS")
    print("application_harness_validator=PASS")
    print("application_companion_validator=PASS")
    print("resume_presentation_validator=PASS")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
