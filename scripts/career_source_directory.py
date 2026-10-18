#!/usr/bin/env python3
"""Private source registry. It does not own OAuth or a second career database."""
from __future__ import annotations
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlparse

SCHEMA = "escapehatch-career-source-directory/v1"
ROLES = {"resume_directory", "cover_letter_directory", "application_tracker"}
PROVIDERS = {"local_directory", "google_drive"}
EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".csv", ".xlsx", ".xls"}
ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}\Z")
GOOGLE_HOSTS = {"drive.google.com", "docs.google.com"}


def default_manifest():
    base = os.environ.get("LOCALAPPDATA")
    return Path(base) / "EscapeHatch/career-sources.v1.json" if base else Path.home() / ".local/share/EscapeHatch/career-sources.v1.json"


def normalize(provider, locator, role):
    if provider not in PROVIDERS or role not in ROLES:
        raise ValueError("UNSUPPORTED_SOURCE_TYPE")
    if not isinstance(locator, str) or not locator.strip() or len(locator) > 4096:
        raise ValueError("SOURCE_LOCATOR_INVALID")
    locator = locator.strip()
    if provider == "google_drive":
        parsed = urlparse(locator)
        if (parsed.scheme != "https" or parsed.netloc.lower() not in GOOGLE_HOSTS
                or parsed.username or parsed.password or parsed.query not in ("", "usp=drivesdk", "usp=sharing") or parsed.fragment):
            raise ValueError("GOOGLE_LOCATOR_INVALID")
        parts = parsed.path.strip("/").split("/")
        expected = ["spreadsheets", "d"] if role == "application_tracker" else ["drive", "folders"]
        if len(parts) < 3 or parts[:2] != expected:
            raise ValueError("GOOGLE_SOURCE_TYPE_MISMATCH")
        if not re.fullmatch(r"[A-Za-z0-9_-]{10,200}", parts[2]) or parts[3:] not in ([], ["edit"], ["view"]):
            raise ValueError("GOOGLE_LOCATOR_INVALID")
        return "https://" + parsed.netloc.lower() + "/" + "/".join(parts[:3])
    path = Path(locator).expanduser()
    if not path.is_absolute():
        raise ValueError("LOCAL_PATH_MUST_BE_ABSOLUTE")
    return str(path)


def load(path):
    if not path.exists():
        return {"schema": SCHEMA, "sources": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        raise ValueError("MANIFEST_INVALID") from None
    if not isinstance(data, dict) or set(data) != {"schema", "sources"} or data["schema"] != SCHEMA or not isinstance(data["sources"], list):
        raise ValueError("MANIFEST_INVALID")
    seen = set()
    for entry in data["sources"]:
        if not isinstance(entry, dict) or set(entry) != {"id", "role", "provider", "locator"}:
            raise ValueError("MANIFEST_INVALID")
        key = entry["id"]
        if not isinstance(key, str) or not ID.fullmatch(key) or key in seen:
            raise ValueError("MANIFEST_INVALID")
        seen.add(key)
        try:
            if normalize(entry["provider"], entry["locator"], entry["role"]) != entry["locator"]:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError("MANIFEST_INVALID") from None
    return data


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".career-sources-", dir=path.parent)
    try:
        if os.name != "nt":
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, sort_keys=True, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        Path(temp).unlink(missing_ok=True)


def register(path, source_id, role, provider, locator):
    if not ID.fullmatch(source_id):
        raise ValueError("SOURCE_ID_INVALID")
    item = {"id": source_id, "role": role, "provider": provider, "locator": normalize(provider, locator, role)}
    data = load(path)
    for old in data["sources"]:
        if old["id"] == source_id:
            if old != item:
                raise ValueError("SOURCE_ID_CONFLICT")
            return "UNCHANGED"
        if all(old[k] == item[k] for k in ("role", "provider", "locator")):
            return "UNCHANGED"
    data["sources"].append(item)
    save(path, data)
    return "SOURCE_REGISTERED"


def scan_local(entry, limit=500):
    report = {"source_id": entry["id"], "provider": "local_directory", "status": "LOCAL_SOURCE_UNAVAILABLE", "file_count": 0, "type_counts": {}}
    root = Path(entry["locator"])
    if not root.exists() or root.is_symlink():
        return report
    allowed = {".csv", ".xlsx", ".xls"} if entry["role"] == "application_tracker" else {".pdf", ".docx", ".txt", ".md"}
    counts = Counter()
    try:
        if root.is_file() and entry["role"] == "application_tracker" and root.suffix.lower() in allowed:
            counts[root.suffix.lower()] = 1
        elif root.is_dir():
            queue = [(root, 0)]
            seen = 0
            while queue:
                folder, depth = queue.pop(0)
                for child in folder.iterdir():
                    seen += 1
                    if seen > limit:
                        report["status"] = "SCAN_LIMIT_EXCEEDED"
                        return report
                    if child.is_symlink() or child.name.startswith("."):
                        continue
                    if child.is_dir() and depth < 3:
                        queue.append((child, depth + 1))
                    elif child.is_file() and child.suffix.lower() in allowed:
                        counts[child.suffix.lower()] += 1
        else:
            return report
    except OSError:
        report["status"] = "LOCAL_READ_FAILED"
        return report
    report.update(status="LOCAL_METADATA_READ", file_count=sum(counts.values()), type_counts=dict(sorted(counts.items())))
    return report


def status(path, source_id=None):
    entries = load(path)["sources"]
    selected = [x for x in entries if not source_id or x["id"] == source_id]
    if source_id and not selected:
        raise ValueError("SOURCE_NOT_REGISTERED")
    reports = [
        scan_local(entry) if entry["provider"] == "local_directory" else
        {"source_id": entry["id"], "provider": "google_drive", "status": "PROVIDER_READ_UNVERIFIED",
         "next_gate": "recover_existing_google_authorization_and_verify_exact_document"}
        for entry in selected
    ]
    return {"schema": SCHEMA, "source_count": len(reports), "sources": reports,
            "integration_state": "SOURCE_LOCATORS_ONLY_NOT_CAREER_IMPORT"}


def main(argv=None):
    parser = argparse.ArgumentParser(description="User-selected private source directory; no OAuth mutation.")
    parser.add_argument("--manifest", type=Path, default=default_manifest())
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("register")
    p.add_argument("--id", required=True)
    p.add_argument("--role", choices=sorted(ROLES), required=True)
    p.add_argument("--provider", choices=sorted(PROVIDERS), required=True)
    p.add_argument("--locator", required=True)
    p = sub.add_parser("status")
    p.add_argument("--id")
    args = parser.parse_args(argv)
    try:
        if args.command == "register":
            result = {"status": register(args.manifest, args.id, args.role, args.provider, args.locator), "source_id": args.id}
        else:
            result = status(args.manifest, args.id)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (ValueError, TypeError) as e:
        print(json.dumps({"status": "BLOCKED", "reason": str(e)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
