#!/usr/bin/env python3
"""Windowless Task Scheduler host for EscapeHatch SubmissionSync.

Task Scheduler must Execute pythonw.exe (not powershell.exe). This host then
starts the Node silent-launch bridge with CREATE_NO_WINDOW / Automation
SILENT_BACKGROUND. Preserves the existing clock; does not mutate Task Scheduler.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


def _discreet(kwargs: dict) -> dict:
    if sys.platform == "win32":
        kwargs["creationflags"] = int(kwargs.get("creationflags") or 0) | getattr(
            subprocess, "CREATE_NO_WINDOW", 0x08000000
        )
        info = kwargs.get("startupinfo") or subprocess.STARTUPINFO()
        info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        info.wShowWindow = subprocess.SW_HIDE
        kwargs["startupinfo"] = info
    return kwargs


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
