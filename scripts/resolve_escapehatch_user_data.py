#!/usr/bin/env python3
"""Resolve the canonical EscapeHatch OS-private user-data root and preference store.

Prints paths and presence only. Never prints preference values.
Deterministic for every workstation user; no per-operator hardcoding.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "harness/contracts/application-preference-cache.v1.json"
FILENAME = "application-question-preferences.json"


def user_data_root() -> Path:
    override = os.environ.get("ESCAPEHATCH_DATA_HOME", "").strip()
    if override:
        return Path(override)
    local = os.environ.get("LOCALAPPDATA", "").strip()
    if local:
        return Path(local) / "EscapeHatch"
    xdg = os.environ.get("XDG_DATA_HOME", "").strip()
    if xdg:
        return Path(xdg) / "EscapeHatch"
    return Path.home() / ".local" / "share" / "EscapeHatch"


def preference_store() -> tuple[Path, str]:
    exact = os.environ.get("ESCAPEHATCH_PREFERENCES_FILE", "").strip()
    if exact:
        return Path(exact), "ESCAPEHATCH_PREFERENCES_FILE"
    if os.environ.get("ESCAPEHATCH_DATA_HOME", "").strip():
        return user_data_root() / FILENAME, "ESCAPEHATCH_DATA_HOME"
    return user_data_root() / FILENAME, "platform_default"


def main() -> int:
    if not CONTRACT.is_file():
        print("RESOLVE_ESCAPEHATCH_USER_DATA: FAIL missing preference-cache contract", file=sys.stderr)
        return 1
    try:
        data = json.loads(CONTRACT.read_text(encoding="utf-8"))
        store = data["storage"]["canonical_store"]
        if store.get("filename") != FILENAME:
            raise ValueError("canonical_store.filename mismatch")
        if "os_private_user_data" != store.get("owner"):
            raise ValueError("canonical_store.owner mismatch")
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        print(f"RESOLVE_ESCAPEHATCH_USER_DATA: FAIL contract={exc}", file=sys.stderr)
        return 1

    root = user_data_root()
    prefs, source = preference_store()
    print("RESOLVE_ESCAPEHATCH_USER_DATA: PASS")
    print(f"DATA_HOME={root}")
    print(f"DATA_HOME_EXISTS={str(root.is_dir()).lower()}")
    print(f"PREFERENCE_STORE={prefs}")
    print(f"PREFERENCE_STORE_SOURCE={source}")
    print(f"PREFERENCE_STORE_EXISTS={str(prefs.is_file()).lower()}")
    print("PREFERENCE_VALUES=redacted")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
