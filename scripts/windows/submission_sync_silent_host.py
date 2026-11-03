#!/usr/bin/env python3
"""Windowless Task Scheduler host for EscapeHatch SubmissionSync.

Task Scheduler must Execute pythonw.exe (not powershell.exe). This host then
starts the Node silent-launch bridge with CREATE_NO_WINDOW / Automation
SILENT_BACKGROUND. Preserves the existing clock; does not mutate Task Scheduler.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def _discreet(kwargs: dict) -> dict:
    if sys.platform == "win32":
        kwargs["creationflags"] = int(kwargs.get("creationflags") or 0) | getattr(
            subprocess, "CREATE_NO_WINDOW", 0x08000000
        )
        startupinfo_cls = getattr(subprocess, "STARTUPINFO", None)
        if startupinfo_cls is not None:
            info = kwargs.get("startupinfo") or startupinfo_cls()
            info.dwFlags |= getattr(subprocess, "STARTF_USESHOWWINDOW", 1)
            info.wShowWindow = getattr(subprocess, "SW_HIDE", 0)
            kwargs["startupinfo"] = info
    return kwargs



def _private_data_root() -> Path:
    """Match the installed Node user's data root without resolving another checkout."""
    explicit = os.environ.get("ESCAPEHATCH_DATA_HOME")
    if explicit:
        return Path(explicit)
    local = os.environ.get("LOCALAPPDATA")
    return Path(local) / "EscapeHatch" if local else Path.home() / "AppData" / "Local" / "EscapeHatch"


def _read_private_json(file: Path) -> object | None:
    try:
        if file.stat().st_size > 2 * 1024 * 1024:
            raise ValueError("oversized private state")
        with file.open("r", encoding="utf-8") as stream:
            return json.load(stream)
    except FileNotFoundError:
        return None


def needs_sync_worker(data_root: Path) -> bool:
    """Fail active on unknown state; only verified quiescence skips the Node worker.

    CONFLICT needs operator reconciliation, not repeated writes. A new receipt,
    even while a prior attempt is SYNCED or CONFLICT, wakes the worker.
    """
    try:
        outbox = _read_private_json(data_root / "submission-tracker-outbox.v1.json")
        receipts = _read_private_json(data_root / "managed-submission-receipts.json")
        if outbox is not None and (not isinstance(outbox, dict) or
                                    outbox.get("schema") != "escapehatch/submission-tracker-outbox/v1"):
            return True
        entries = [] if outbox is None else outbox.get("entries")
        if not isinstance(entries, list) or len(entries) > 1000:
            return True
        if receipts is None:
            receipts = []
        if not isinstance(receipts, list) or len(receipts) > 1000:
            return True
        queued: set[str] = set()
        for entry in entries:
            if not isinstance(entry, dict) or not isinstance(entry.get("receipt"), dict):
                return True
            attempt = entry["receipt"].get("attemptId")
            if not isinstance(attempt, str) or not attempt or attempt in queued:
                return True
            queued.add(attempt)
            if entry.get("state") not in ("SYNCED", "CONFLICT"):
                return True  # PENDING, AUTH_REQUIRED, RETRY_REQUIRED or unknown.
        for receipt in receipts:
            if not isinstance(receipt, dict) or not isinstance(receipt.get("attemptId"), str):
                return True
            if receipt["attemptId"] not in queued:
                return True
        return False
    except (OSError, ValueError, TypeError, UnicodeError):
        return True  # Malformed/unreadable state must never be mistaken for IDLE.


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--node", required=True, help="Absolute path to node.exe")
    args = parser.parse_args(argv)

    root = Path(args.source_root).resolve()
    node = Path(args.node)
    bridge = Path(__file__).resolve().parent / "submission-sync-silent-launch.cjs"
    worker = root / "artifacts" / "escape-hatch" / "submission-sync-worker.ts"
    if not bridge.is_file():
        print("SUBMISSION_SYNC_SILENT_BRIDGE_MISSING", file=sys.stderr)
        return 2
    if not worker.is_file():
        print("SUBMISSION_SYNC_WORKER_MISSING", file=sys.stderr)
        return 2
    if not node.is_file():
        print("SUBMISSION_SYNC_NODE_MISSING", file=sys.stderr)
        return 2

    # The registered Windows clock remains owned and intact. A genuinely empty
    # durable queue must not start Node or ask an agent to unregister the task.
    if not needs_sync_worker(_private_data_root()):
        return 0

    cmd = [
        str(node),
        str(bridge),
        "--root",
        str(root),
        "--node",
        str(node),
        "--worker",
        str(worker),
    ]
    # Host is already windowless (pythonw). Child node bridge must also hide.
    proc = subprocess.run(
        cmd,
        cwd=str(root),
        shell=False,
        stdin=subprocess.DEVNULL,
        **_discreet({}),
    )
    return int(proc.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
