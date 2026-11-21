#!/usr/bin/env python3
"""Install a user-owned Linux Mint application-menu shortcut, never system-wide."""
from __future__ import annotations

import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / "scripts" / "linux" / "escapehatch_runtime.py"
ICON = ROOT / "artifacts" / "escape-hatch" / "public" / "favicon.svg"
MARKER = "# Managed by EscapeHatch Linux shortcut v1"


def atomic_owned_file(path: Path, content: str, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise ValueError(f"Refusing to replace symlink: {path}")
    if path.exists() and MARKER not in path.read_text(encoding="utf-8"):
        raise ValueError(f"Refusing to overwrite unrelated file: {path}")
    temp = path.with_name(path.name + f".{os.getpid()}.tmp")
    descriptor = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, mode)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.chmod(temp, mode)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def exec_quoted(path: Path) -> str:
    raw = str(path)
    if any(character in raw for character in "\r\n\0"):
        raise ValueError("Unsupported newline or NUL in shortcut path")
    # Desktop Entry Specification Exec quoting inside a double-quoted argument.
    escaped = raw.replace("\\", "\\\\").replace('"', '\\"').replace("$", "\\$").replace("`", "\\`")
    return '"' + escaped + '"'


def install() -> tuple[Path, Path]:
    if not RUNTIME.is_file():
        raise ValueError("Missing Linux managed runtime in checkout")
    user_home = Path.home()
    launcher = user_home / ".local" / "bin" / "escapehatch"
    menu_home = Path(os.environ.get("XDG_DATA_HOME") or (user_home / ".local" / "share"))
    desktop = menu_home / "applications" / "escapehatch.desktop"
    script = ("#!/usr/bin/env python3\n" + MARKER + "\n"
              + "import subprocess, sys\n"
              + f"sys.exit(subprocess.call([sys.executable, {str(RUNTIME)!r}, 'start']))\n")
    entry = ("[Desktop Entry]\n" + MARKER + "\n"
             + "Type=Application\nName=EscapeHatch\n"
             + "Comment=Private local job-application workspace\n"
             + f"Exec={exec_quoted(launcher)}\n"
             + (f"Icon={ICON}\n" if ICON.is_file() else "")
             + "Terminal=false\nCategories=Office;Utility;\nStartupNotify=true\n")
    atomic_owned_file(launcher, script, 0o700)
    atomic_owned_file(desktop, entry, 0o644)
    return launcher, desktop


if __name__ == "__main__":
    try:
        launcher, desktop = install()
        print(f"Mint app-menu shortcut installed: {desktop} (launcher: {launcher})")
    except (OSError, ValueError) as exc:
        print(f"EscapeHatch shortcut: {exc}", file=sys.stderr)
        raise SystemExit(2)
