#!/usr/bin/env python3
"""Linux Mint EscapeHatch managed loopback runtime.

Shares the existing Vite runtime-control.ts handshake. Never exposes workspace,
managed-browser endpoints, or shutdown controls to a phone/LAN.
"""
from __future__ import annotations

import hashlib
import http.client
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from datetime import datetime, timezone

APP_DIR = Path(__file__).resolve().parents[2] / "artifacts" / "escape-hatch"
REPO_DIR = Path(__file__).resolve().parents[2]
PROTOCOL = 1


def state_dir() -> Path:
    base = Path(os.environ.get("XDG_STATE_HOME") or (Path.home() / ".local" / "state"))
    return base / "escapehatch"


def read_state() -> dict | None:
    path = state_dir() / "runtime.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (ValueError, OSError) as exc:
        raise RuntimeError(f"Managed runtime state is unreadable: {exc}") from exc


def write_state(state: dict) -> None:
    folder = state_dir()
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(folder, 0o700)
    target = folder / "runtime.json"
    pending = folder / f".runtime-{secrets.token_hex(8)}.json"
    descriptor = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(state, output, indent=2)
        os.replace(pending, target)
    finally:
        if pending.exists():
            pending.unlink()


def clear_state(state: dict) -> None:
    # Do not erase another launcher's newly written state.
    if read_state() == state:
        (state_dir() / "runtime.json").unlink(missing_ok=True)


def checked_port() -> int:
    raw = os.environ.get("ESCAPEHATCH_PORT", "5173")
    try:
        port = int(raw)
    except ValueError as exc:
        raise RuntimeError("ESCAPEHATCH_PORT must be an integer") from exc
    if not 1024 <= port <= 65535:
        raise RuntimeError("ESCAPEHATCH_PORT must be between 1024 and 65535")
    return port


def remote_identity(port: int) -> dict | None:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=1.0)
    try:
        connection.request("GET", "/__escapehatch/runtime")
        response = connection.getresponse()
        raw = response.read(16384)
        if response.status != 200:
            return None
        result = json.loads(raw)
        return result if isinstance(result, dict) else None
    except (OSError, ValueError, http.client.HTTPException):
        return None
    finally:
        connection.close()


def verified(state: dict) -> bool:
    identity = remote_identity(state["port"])
    return bool(identity and identity.get("app") == "EscapeHatch" and identity.get("protocol") == PROTOCOL
                and identity.get("instanceId") == state["instance_id"]
                and identity.get("repoFingerprint") == state["repo_fingerprint"]
                and identity.get("pid") == state["pid"])


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def status() -> int:
    state = read_state()
    if state is None:
        print("STOPPED: no managed EscapeHatch instance registered")
        return 1
    if verified(state):
        print(f"RUNNING: managed EscapeHatch at http://127.0.0.1:{state['port']}/ (PID {state['pid']})")
        return 0
    print("UNVERIFIED: stored EscapeHatch instance is not responding with matching identity")
    return 2


def start() -> int:
    existing = read_state()
    if existing:
        if verified(existing):
            status()
            return 0
        if pid_alive(existing["pid"]):
            raise RuntimeError("Previous managed PID is still alive, but identity did not match; refuse to replace it")
        clear_state(existing)
    if not APP_DIR.is_dir():
        raise RuntimeError(f"App source missing: {APP_DIR}")
    if not (APP_DIR / "node_modules").is_dir():
        raise RuntimeError("App dependencies missing; run Get-EscapeHatch.sh --install first")
    port = checked_port()
    if remote_identity(port) is not None:
        raise RuntimeError(f"Port {port} already hosts a runtime; refuse to take it over")
    # Any unknown process on this port will cause the child startup health check to fail closed.
    instance = secrets.token_hex(16)
    repo_fingerprint = hashlib.sha256(str(REPO_DIR.resolve()).encode("utf-8")).hexdigest()
    started_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    env = os.environ.copy()
    env.update({
        "HOST": "127.0.0.1", "PORT": str(port), "ESCAPEHATCH_INSTANCE_ID": instance,
        "ESCAPEHATCH_REPO_FINGERPRINT": repo_fingerprint,
        "ESCAPEHATCH_SHUTDOWN_TOKEN": secrets.token_urlsafe(32),
        "ESCAPEHATCH_STARTED_AT_UTC": started_at,
        "ESCAPEHATCH_RUNTIME_PROTOCOL": str(PROTOCOL),
    })
    folder = state_dir()
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(folder, 0o700)
    descriptor = os.open(folder / "runtime.log", os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(descriptor, "ab", buffering=0) as log:
        process = subprocess.Popen(["npm", "run", "dev"], cwd=APP_DIR, env=env,
                                   stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                   start_new_session=True)
    state = {
        "instance_id": instance, "repo_fingerprint": repo_fingerprint,
        "shutdown_token": env["ESCAPEHATCH_SHUTDOWN_TOKEN"], "pid": 0,
        "runner_pid": process.pid, "port": port, "started_at_utc": started_at,
    }
    write_state(state)
    for _ in range(60):
        identity = remote_identity(port)
        if (identity and identity.get("app") == "EscapeHatch" and identity.get("protocol") == PROTOCOL
                and identity.get("instanceId") == instance
                and identity.get("repoFingerprint") == repo_fingerprint
                and type(identity.get("pid")) is int and identity["pid"] > 0):
            state["pid"] = identity["pid"]
            write_state(state)
            print(f"RUNNING: http://127.0.0.1:{port}/ (PID {state['pid']})")
            if os.environ.get("ESCAPEHATCH_NO_OPEN") != "1" and (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
                try:
                    subprocess.Popen(["xdg-open", f"http://127.0.0.1:{port}/"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except FileNotFoundError:
                    print("Browser not opened automatically; use the URL above")
            return 0
        if process.poll() is not None:
            break
        time.sleep(0.25)
    # Only terminate the process group created by this failed start, never a preexisting PID.
    if process.poll() is None:
        try:
            os.killpg(process.pid, 15)
        except ProcessLookupError:
            pass
    clear_state(state)
    raise RuntimeError(f"Managed startup not verified; inspect {folder / 'runtime.log'}")


def stop() -> int:
    state = read_state()
    if not state:
        print("STOPPED: no managed instance")
        return 0
    if not verified(state):
        raise RuntimeError("Instance identity unverified; refusing to terminate an unrelated process")
    connection = http.client.HTTPConnection("127.0.0.1", state["port"], timeout=2)
    try:
        connection.request("POST", "/__escapehatch/shutdown", headers={
            "x-escapehatch-instance-id": state["instance_id"],
            "x-escapehatch-runtime-protocol": str(PROTOCOL),
            "x-escapehatch-shutdown-token": state["shutdown_token"],
        })
        response = connection.getresponse()
        response.read(16384)
        if response.status != 202:
            raise RuntimeError(f"Server rejected managed shutdown (HTTP {response.status})")
    finally:
        connection.close()
    for _ in range(40):
        if not verified(state):
            clear_state(state)
            print("STOPPED: managed shutdown acknowledged and instance unavailable")
            return 0
        time.sleep(0.25)
    raise RuntimeError("Shutdown acknowledged but instance remains live; refusing to claim stopped")


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"start", "status", "stop"}:
        print("Usage: escapehatch_runtime.py start|status|stop", file=sys.stderr)
        return 2
    try:
        return {"start": start, "status": status, "stop": stop}[sys.argv[1]]()
    except (RuntimeError, OSError, KeyError, TypeError) as exc:
        print(f"EscapeHatch runtime: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
