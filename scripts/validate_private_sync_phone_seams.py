#!/usr/bin/env python3
"""Validate private-sync phone seam contract anchors and anti-recurrence rules."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "harness" / "contracts" / "private-sync-phone-seams.v1.json"
SCHEMA = "escapehatch/private-sync-phone-seams/v1"
REQUIRED_SEAM_IDS = {
    "SEAM-HASH-FILENAME",
    "SEAM-DRIVE-FOLDER-WITHOUT-LAN",
    "SEAM-CHROME-HTTPS-FIRST",
    "SEAM-BROWSER-SPRAY",
    "SEAM-CODE-NOT-VISIBLE",
    "SEAM-EMPTY-CODE-SURFACE",
    "SEAM-BUTTONS-IGNORE-STATE",
    "SEAM-AGENT-AS-STEP-RELAY",
    "SEAM-PLAYWRIGHT-AS-HOST",
    "SEAM-NORD-LAN-GATE",
    "SEAM-LAN-VS-FOLDER-COPY-CONFLICT",
}


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)


def main() -> int:
    if not CONTRACT.is_file():
        fail(f"missing contract {CONTRACT}")
        return 1
    data = json.loads(CONTRACT.read_text(encoding="utf-8"))
    errors: list[str] = []
    if data.get("schema") != SCHEMA:
        errors.append("schema mismatch")
    seams = data.get("seams")
    if not isinstance(seams, list) or not seams:
        errors.append("seams must be non-empty list")
        seams = []
    ids = {s.get("id") for s in seams if isinstance(s, dict)}
    missing = REQUIRED_SEAM_IDS - ids
    if missing:
        errors.append(f"missing seam ids: {sorted(missing)}")
    for s in seams:
        if not isinstance(s, dict):
            errors.append("seam not object")
            continue
        for key in ("id", "symptom", "requiredBehavior", "owners", "forbiddenAgentResponse"):
            if key not in s or s[key] in (None, "", []):
                errors.append(f"{s.get('id', '?')} missing {key}")
    for rel in data.get("requiredAnchors", []):
        path = ROOT / rel.replace("...", "app/src/main/java/com/escapehatch/assist/sync")
        # allow ellipsis owners in seam list; requiredAnchors must be real paths
        if "..." in rel:
            continue
        if not (ROOT / rel).is_file():
            errors.append(f"required anchor missing: {rel}")

    # Implementation guards — anti-recurrence checks against known bad patterns.
    focus = (ROOT / "scripts/private-sync-focus-operator-browser.ps1").read_text(encoding="utf-8")
    if "Start-Process" in focus and "http://192.168" in focus:
        errors.append("focus helper must not Start-Process LAN IP URLs")
    if "attach_existing_title_match_no_start_process_no_lan_ip" not in focus:
        errors.append("focus helper missing no-lan-ip rule marker")

    session = (ROOT / "scripts/private-sync-start-phone-proof-session.ps1").read_text(encoding="utf-8")
    if re.search(r"Start-Process\s+'http://127\.0\.0\.1:18766/corridor'", session):
        errors.append("session must not Start-Process corridor; use focus helper")
    if "private-sync-focus-operator-browser.ps1" not in session:
        errors.append("session must invoke focus helper")

    corridor = (ROOT / "docs/design/prototypes/auth-sync-handoff.html").read_text(encoding="utf-8")
    if "autoOpenPairSheet" not in corridor and "autoPairWhenSynced" not in corridor:
        errors.append("corridor must auto-open pairing sheet when vault SYNCED")

    strings = (
        ROOT
        / "android/application-assist/app/src/main/res/values/strings.xml"
    ).read_text(encoding="utf-8")
    if "Fetch sealed offer from PC" not in strings and "pairing_fetch_lan" not in strings:
        errors.append("Android strings missing LAN fetch labeling")
    if "Choose EscapeHatchPhoneDrop folder" in strings and "Offline" not in strings:
        # folder may remain but must be demoted in pairing_instructions
        if "LAN" not in strings or "Fetch" not in strings:
            errors.append("Android pairing copy must put LAN ahead of folder")

    pairing_kt = (
        ROOT
        / "android/application-assist/app/src/main/java/com/escapehatch/assist/sync/PairingImportActivity.kt"
    ).read_text(encoding="utf-8")
    if "refreshStepMachine" not in pairing_kt and "updateStepUi" not in pairing_kt:
        errors.append("PairingImportActivity must expose a step-machine UI updater")

    stage = (ROOT / "scripts/private-sync-stage-phone-pack.ps1").read_text(encoding="utf-8")
    for name in (
        "pairing-offer.json",
        "escapehatch-answers.ehsync",
        "PAIRING_CODE.txt",
        "ESCAPE_HATCH_PAIRING_CODE.txt",
    ):
        if name not in stage:
            errors.append(f"stage pack missing fixed name {name}")

    if errors:
        for e in errors:
            fail(e)
        return 1
    print(f"PASS: {CONTRACT.name} ({len(ids)} seams) + implementation anchors")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        assert CONTRACT.is_file()
        print("PASS: self-test contract present")
        raise SystemExit(0)
    raise SystemExit(main())
