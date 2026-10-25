#!/usr/bin/env python3
"""Validate repository-wide installation-to-submission scene ownership, not live UI behavior."""
from __future__ import annotations
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SCENE_PATH = ROOT / "contracts/application-journey-scenes.v1.json"
REQUIRED = (
    "INSTALL_ACQUIRE", "INSTALL_PREFLIGHT", "INSTALL_APPROVAL", "INSTALL_VERIFY",
    "HOME_READY", "OPPORTUNITY_INTAKE", "PREREQUISITES", "APPLICATION_ENTRY",
    "AUTH_HANDOFF", "AUTH_RECHECK", "FORM_PREPARATION", "MANUAL_DECISION",
    "FINAL_REVIEW", "RECOVERY",
)
PARENT = "https://github.com/EndeavorEverlasting/EscapeHatch/issues/69"
class SceneContractError(ValueError):
    pass

def validate(contract: dict, root: Path = ROOT) -> None:
    if contract.get("schema") != "escapehatch/application-journey-scenes/v1":
        raise SceneContractError("schema missing or changed")
    if contract.get("parent_issue") != PARENT:
        raise SceneContractError("parent not linked")
    scenes = contract.get("scenes", [])
    ids = [x.get("id") for x in scenes if isinstance(x, dict)]
    if ids != list(REQUIRED):
        raise SceneContractError("scene graph drift: missing, duplicate, or reordered scenes")
    for scene in scenes:
        if not scene.get("required_evidence") or not scene.get("coach_prompt") or not scene.get("primary_action"):
            raise SceneContractError("scene missing owned evidence/UX action: " + scene.get("id", "?"))
        if scene.get("terminal_submit_automated") is not False:
            raise SceneContractError("automated terminal submit forbidden")
    transitions = contract.get("transitions", [])
    arcs = {(x.get("from"), x.get("to")) for x in transitions}
    if any(a not in ids or b not in ids for a,b in arcs):
        raise SceneContractError("dangling scene transition")
    mandatory = {
        ("INSTALL_ACQUIRE","INSTALL_PREFLIGHT"), ("INSTALL_VERIFY","HOME_READY"),
        ("HOME_READY","OPPORTUNITY_INTAKE"), ("APPLICATION_ENTRY","AUTH_HANDOFF"),
        ("AUTH_HANDOFF","AUTH_RECHECK"), ("AUTH_RECHECK","FORM_PREPARATION"),
        ("FORM_PREPARATION","FINAL_REVIEW"), ("MANUAL_DECISION","FORM_PREPARATION"),
    }
    if not mandatory.issubset(arcs):
        raise SceneContractError("required path or auth resume arc missing")
    if any((id,"RECOVERY") not in arcs for id in ids if id!="RECOVERY"):
        raise SceneContractError("missing recovery path")
    auth = contract.get("auth_handoff", {})
    if auth.get("watch_interval_ms",999999) > 3000:
        raise SceneContractError("login handoff watcher too slow")
    if "two_consecutive" not in auth.get("confirmed_on",""):
        raise SceneContractError("stable login return readback missing")
    if "never final Submit" not in auth.get("on_complete",""):
        raise SceneContractError("resume authority must exclude final submit")
    if contract.get("final_submission") != "operator_only":
        raise SceneContractError("terminal boundary regressed")
    if "password" not in contract.get("user_prompts",{}).get("never_request",[]):
        raise SceneContractError("credential prompt boundary missing")
    if not contract.get("bootstrap",{}).get("depends_on_pr") == 95:
        raise SceneContractError("reviewed installer dependency missing")
    required_files = (
        "Get-EscapeHatch.cmd", "README.md",
        "artifacts/escape-hatch/managed-auth-checkpoint.ts",
        "artifacts/escape-hatch/managed-auth-checkpoint.test.ts",
        "artifacts/escape-hatch/browser-assist-control.ts",
        "artifacts/escape-hatch/src/components/managed-browser-assist.tsx",
        "docs/agent/APPLICATION_JOURNEY_SCENE_SYSTEM_2026-10-25.md",
    )
    for path in required_files:
        if not (root / path).exists():
            raise SceneContractError("missing owned scene consumer: "+path)
    if "application-journey-scenes.v1.json" not in (root / "README.md").read_text(encoding="utf-8"):
        raise SceneContractError("landing page does not route scene graph")
    if "application-journey-scenes.v1.json" not in (root / "AGENTS.md").read_text(encoding="utf-8"):
        raise SceneContractError("agent governance missing scene routing")
    if "managed-auth-checkpoint.test.ts" not in (root / "artifacts/escape-hatch/package.json").read_text(encoding="utf-8"):
        raise SceneContractError("auth regression not wired into managed-assist test command")
    get_script = (root/"Get-EscapeHatch.cmd").read_text(encoding="utf-8")
    for marker in ("git clone --depth 1", "EscapeHatch-Install.ps1", "choice /C YN"):
        if marker not in get_script:
            raise SceneContractError("guided bootstrap missing "+marker)
    runtime = (root/"artifacts/escape-hatch/browser-assist-control.ts").read_text(encoding="utf-8")
    for marker in ("inspectAuthObservation", "advanceAuthCheckpoint", "resumeAllowed", "'/resume'"):
        if marker not in runtime:
            raise SceneContractError("managed auth continuation missing "+marker)
    ux = (root/"artifacts/escape-hatch/src/components/managed-browser-assist.tsx").read_text(encoding="utf-8")
    for marker in ("button-auth-resume", "button-auth-check-again", "coach-approved-email"):
        if marker not in ux:
            raise SceneContractError("missing visible coached auth/prerequisite control "+marker)

def main() -> int:
    try:
        validate(json.loads(SCENE_PATH.read_text(encoding="utf-8")))
        print("PASS 14 owned scenes, auth continuity, bootstrap and coach routing (source-level only)")
        return 0
    except (OSError, ValueError, TypeError, KeyError) as error:
        print("FAIL application journey scene system:", str(error))
        return 1

if __name__ == "__main__":
    sys.exit(main())
