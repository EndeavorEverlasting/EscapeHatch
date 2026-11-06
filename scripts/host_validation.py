#!/usr/bin/env python3
"""Deterministic local validation receipts, independent of GitHub Actions availability.

This is a read-only proof runner, not a way around repository promotion policy.
Commands are fixed by a committed manifest. Receipts live outside the checkout.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = "escapehatch/host-validation-receipt/v1"
MANIFEST_SCHEMA = "escapehatch/host-validation/v1"
TOKEN = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
HEX = re.compile(r"^[0-9a-f]{40}$")
CHECKPOINT = re.compile(r"(?im)^Entire-Checkpoint: ([0-9A-HJKMNP-TV-Z]{26}|[0-9a-f]{12})\s*$")
RUNNER = Path(__file__).resolve()
ROOT = RUNNER.parents[1]
DEFAULT_MANIFEST = ROOT / "contracts/host-validation.v1.json"


class GateError(RuntimeError):
    pass


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":")) + "\n").encode("utf-8")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(repo: Path, *arguments: str, check: bool = True) -> str:
    try:
        p = subprocess.run(["git", "-C", str(repo), *arguments], capture_output=True, text=True,
                           timeout=15, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise GateError("git_unavailable_or_timed_out") from exc
    if check and p.returncode != 0:
        raise GateError("git_probe_failed:" + arguments[0])
    return p.stdout.strip() if p.returncode == 0 else ""


def source_identity(repo: Path) -> dict[str, Any]:
    repo = repo.resolve()
    if Path(git(repo, "rev-parse", "--show-toplevel")).resolve() != repo:
        raise GateError("not_checkout_root")
    head = git(repo, "rev-parse", "HEAD")
    if not HEX.fullmatch(head):
        raise GateError("invalid_head")
    branch = git(repo, "symbolic-ref", "--quiet", "--short", "HEAD", check=False) or "DETACHED"
    base = git(repo, "rev-parse", "--verify", "refs/remotes/origin/main", check=False) or None
    dirty = bool(git(repo, "status", "--porcelain=v1", "--untracked-files=normal"))
    # Entire CLI uses git trailers to correlate checkpoints. We consume *only*
    # the ID; never read, upload or infer safety of session transcript contents.
    message = git(repo, "log", "-1", "--format=%B")
    matches = CHECKPOINT.findall(message)
    checkpoint_id = matches[-1] if matches else None
    return {"head_sha": head, "branch": branch, "origin_main_sha": base,
            "dirty": dirty, "entire_checkpoint_id": checkpoint_id}


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise GateError("manifest_unreadable") from exc
    if not isinstance(document, dict) or document.get("schema") != MANIFEST_SCHEMA:
        raise GateError("invalid_manifest_schema")
    steps, profiles = document.get("steps"), document.get("profiles")
    if not isinstance(steps, dict) or not isinstance(profiles, dict) or not steps or not profiles:
        raise GateError("invalid_manifest_shape")
    for name, step in steps.items():
        if not isinstance(name, str) or not TOKEN.fullmatch(name) or not isinstance(step, dict):
            raise GateError("invalid_step_name")
        args = step.get("argv")
        if (not isinstance(args, list) or len(args) < 2 or
            any(not isinstance(a, str) or not a or len(a) > 500 for a in args) or
            args[0] not in ("{python}", "{node}", "{npm}")):
            raise GateError("invalid_step_argv")
        timeout = step.get("timeout_seconds")
        if type(timeout) is not int or not 1 <= timeout <= 1800:
            raise GateError("invalid_step_timeout")
    for profile, names in profiles.items():
        if not isinstance(profile, str) or not TOKEN.fullmatch(profile) or not isinstance(names, list) or not names:
            raise GateError("invalid_profile")
        if len(set(names)) != len(names) or any(name not in steps for name in names):
            raise GateError("unknown_or_duplicate_step")
    return document


def default_output_dir() -> Path:
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData/Local")
        return base / "EscapeHatch/proof/host-validation"
    return Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local/state") / "EscapeHatch/proof/host-validation"


def outside_checkout(path: Path, repo: Path) -> None:
    output = path.resolve()
    root = repo.resolve()
    if output == root or root in output.parents:
        raise GateError("receipt_inside_checkout_forbidden")


def command_argv(argv: list[str]) -> list[str]:
    tools = {"{python}": sys.executable, "{node}": shutil.which("node"), "{npm}": shutil.which("npm")}
    path = tools[argv[0]]
    if not path:
        raise GateError("required_local_tool_missing:" + argv[0])
    return [str(path), *argv[1:]]


def run_step(repo: Path, name: str, step: dict[str, Any]) -> dict[str, Any]:
    started = time.monotonic()
    args = step["argv"]
    # No shell, no external CI tokens, and no stdout/stderr or applicant data in receipts.
    try:
        executable = command_argv(args)
    except GateError as exc:
        return {"id": name, "status": "TOOL_MISSING", "exit_code": None,
                "elapsed_ms": int((time.monotonic()-started)*1000), "error": str(exc)}
    env = os.environ.copy()
    env.update({"CI": "1", "GIT_TERMINAL_PROMPT": "0", "PYTHONDONTWRITEBYTECODE": "1"})
    try:
        with tempfile.TemporaryFile() as output:
            result = subprocess.run(executable, cwd=repo, stdout=output, stderr=subprocess.STDOUT,
                                    timeout=step["timeout_seconds"], env=env,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), check=False)
            output.seek(0)
            h = hashlib.sha256()
            while True:
                block = output.read(65536)
                if not block:
                    break
                h.update(block)
        return {"id": name, "status": "PASS" if result.returncode == 0 else "FAIL",
                "exit_code": result.returncode, "output_sha256": h.hexdigest(),
                "elapsed_ms": int((time.monotonic()-started)*1000)}
    except subprocess.TimeoutExpired:
        return {"id": name, "status": "TIMEOUT", "exit_code": None,
                "elapsed_ms": int((time.monotonic()-started)*1000)}
    except OSError:
        return {"id": name, "status": "EXECUTION_ERROR", "exit_code": None,
                "elapsed_ms": int((time.monotonic()-started)*1000)}


def verify_receipt(data: dict[str, Any], repo: Path, manifest_path: Path, profile: str) -> tuple[bool, str]:
    """Receipt checksum is a consistency check, not a signature or provider attestation."""
    try:
        if data.get("schema") != SCHEMA or data.get("profile") != profile:
            return False, "schema_or_profile_mismatch"
        checksum = data.get("receipt_sha256")
        clean = {k: v for k, v in data.items() if k != "receipt_sha256"}
        if checksum != digest(canonical(clean)):
            return False, "receipt_digest_mismatch"
        manifest = load_manifest(manifest_path)
        if manifest_path.resolve() != (repo / "contracts/host-validation.v1.json").resolve():
            return False, "noncanonical_manifest"
        if digest(manifest_path.read_bytes()) != data.get("manifest_sha256"):
            return False, "manifest_changed"
        if digest(RUNNER.read_bytes()) != data.get("runner_sha256"):
            return False, "runner_changed"
        if profile not in manifest["profiles"]:
            return False, "missing_profile"
        current = source_identity(repo)
        if current["dirty"]:
            return False, "dirty_checkout"
        if data.get("source") != {k: current[k] for k in ("head_sha", "branch", "origin_main_sha", "dirty", "entire_checkpoint_id")}:
            return False, "source_moved"
        steps = data.get("steps")
        if not isinstance(steps, list) or len(steps) != len(manifest["profiles"][profile]):
            return False, "incomplete_steps"
        for expected, row in zip(manifest["profiles"][profile], steps):
            if not isinstance(row, dict) or row.get("id") != expected or row.get("status") != "PASS" or row.get("exit_code") != 0:
                return False, "failed_or_unexpected_step"
        return True, "local_exact_head_pass"
    except (GateError, OSError, ValueError, TypeError):
        return False, "receipt_unverifiable"


def run(repo: Path, manifest_path: Path, profile: str, out_dir: Path) -> tuple[int, Path | None]:
    manifest = load_manifest(manifest_path)
    if profile not in manifest["profiles"]:
        raise GateError("unknown_profile")
    if manifest_path.resolve() != (repo / "contracts/host-validation.v1.json").resolve():
        raise GateError("noncanonical_manifest_forbidden")
    outside_checkout(out_dir, repo)
    before = source_identity(repo)
    if before["dirty"]:
        raise GateError("dirty_checkout_no_exact_head_proof")
    steps: list[dict[str, Any]] = []
    for name in manifest["profiles"][profile]:
        step = run_step(repo, name, manifest["steps"][name])
        steps.append(step)
        print(f"{name}: {step['status']}", flush=True)
        if step["status"] != "PASS":
            break  # Fail closed; later gates cannot override the failed gate.
    after = source_identity(repo)
    if after != before:
        raise GateError("source_changed_during_validation")
    document = {
        "schema": SCHEMA, "profile": profile,
        "source": before, "manifest_sha256": digest(manifest_path.read_bytes()),
        "runner_sha256": digest(RUNNER.read_bytes()),
        "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "steps": steps, "scope": "HOST_LOCAL_SOURCE_VALIDATION_ONLY",
        "provider_checks_verified": False, "merged": False,
        "installed_runtime_observed": False, "discord_membership_observed": False,
    }
    document["receipt_sha256"] = digest(canonical(document))
    out_dir.mkdir(parents=True, exist_ok=True)
    receipt_path = out_dir / f"{before['head_sha'][:12]}-{profile}-{document['receipt_sha256'][:12]}.json"
    outside_checkout(receipt_path, repo)
    fd, temporary = tempfile.mkstemp(prefix=".host-gate-", suffix=".tmp", dir=out_dir)
    try:
        os.chmod(temporary, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(canonical(document))
        os.replace(temporary, receipt_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    ok, reason = verify_receipt(document, repo, manifest_path, profile)
    print(f"receipt={receipt_path}\nverified={ok} reason={reason}")
    return (0 if ok else 20), receipt_path


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("command", choices=("plan", "run", "verify"))
    ap.add_argument("--profile", default="core")
    ap.add_argument("--root", type=Path, default=ROOT, help="Repository root; intended for isolated tests/worktrees")
    ap.add_argument("--manifest", type=Path, default=None)
    ap.add_argument("--receipt-dir", type=Path, default=None)
    ap.add_argument("--receipt", type=Path, default=None)
    args = ap.parse_args(argv)
    repo = args.root.resolve()
    manifest_path = args.manifest or (repo / "contracts/host-validation.v1.json")
    try:
        manifest = load_manifest(manifest_path)
        if args.profile not in manifest["profiles"]:
            raise GateError("unknown_profile")
        if args.command == "plan":
            print(json.dumps({"schema": MANIFEST_SCHEMA, "profile": args.profile,
                "commands": [{"id": k, **manifest["steps"][k]} for k in manifest["profiles"][args.profile]]}, indent=2))
            return 0
        if args.command == "verify":
            if not args.receipt:
                raise GateError("receipt_required")
            outside_checkout(args.receipt, repo)
            document = json.loads(args.receipt.read_text(encoding="utf-8"))
            ok, reason = verify_receipt(document, repo, manifest_path, args.profile)
            print(json.dumps({"valid": ok, "reason": reason, "proof": "HOST_LOCAL_ONLY"}))
            return 0 if ok else 20
        return run(repo, manifest_path, args.profile, args.receipt_dir or default_output_dir())[0]
    except (GateError, OSError, ValueError) as exc:
        print(json.dumps({"error": str(exc), "valid": False, "proof": "UNPROVEN"}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
