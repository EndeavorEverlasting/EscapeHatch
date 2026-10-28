#!/usr/bin/env python3
"""Package committed Application Assist source into an immutable unpacked release.

Default output: Outputs/application-assist/<HEAD commit>/
Use --output-root for a stable local installation cache, or --verify to check an
existing package without writing. Changed, extra or incomplete outputs fail closed;
the tool never overwrites or deletes an existing package.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PREFIX = "browser/application-assist/"
SCHEMA = "escapehatch/application-assist-package/v1"


class PackageError(RuntimeError):
    pass


def git_bytes(repo: Path, *arguments: str) -> bytes:
    try:
        return subprocess.run(["git", *arguments], cwd=repo, check=True, capture_output=True).stdout
    except (OSError, subprocess.CalledProcessError) as error:
        raise PackageError("Committed extension source could not be read from Git.") from error


def safe_relative(value: str) -> str:
    path = PurePosixPath(value)
    if not value or path.is_absolute() or "\\" in value or any(part in ("", ".", "..") for part in value.split("/")) or ":" in value:
        raise PackageError("Extension package contains an unsafe relative path.")
    return value


def source_snapshot(repo: Path) -> tuple[str, dict[str, bytes], bytes]:
    commit = git_bytes(repo, "rev-parse", "--verify", "HEAD^{commit}").decode("ascii").strip()
    if not re.fullmatch(r"[a-f0-9]{40,64}", commit):
        raise PackageError("Git did not return a complete source commit.")
    listing = git_bytes(repo, "ls-tree", "-rz", "--full-tree", commit, "--", SOURCE_PREFIX)
    files: dict[str, bytes] = {}
    folded: set[str] = set()
    for entry in listing.split(b"\0"):
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        mode, kind, blob = metadata.decode("ascii").split()
        source_path = name.decode("utf-8")
        if mode not in ("100644", "100755") or kind != "blob":
            raise PackageError("Extension source must contain regular committed files, never symlinks or submodules.")
        if not source_path.startswith(SOURCE_PREFIX):
            raise PackageError("Git source escaped the canonical extension prefix.")
        relative = safe_relative(source_path[len(SOURCE_PREFIX):])
        if relative.casefold() == "release.json" or relative.casefold() in folded:
            raise PackageError("Extension source conflicts with package metadata or another filename.")
        folded.add(relative.casefold())
        files[relative] = git_bytes(repo, "cat-file", "blob", blob)
    if "manifest.json" not in files:
        raise PackageError("Committed extension manifest is missing.")
    try:
        manifest = json.loads(files["manifest.json"])
    except (ValueError, UnicodeDecodeError) as error:
        raise PackageError("Committed extension manifest is invalid JSON.") from error
    if not isinstance(manifest, dict) or manifest.get("manifest_version") != 3 or not isinstance(manifest.get("version"), str) or not manifest["version"]:
        raise PackageError("A versioned Manifest V3 extension is required.")
    permissions = {}
    for field in ("permissions", "host_permissions", "optional_permissions", "optional_host_permissions"):
        value = manifest.get(field, [])
        if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
            raise PackageError("Manifest permissions must be explicit string lists.")
        permissions[field] = sorted(value)
    receipt = {
        "schema": SCHEMA,
        "sourceCommit": commit,
        "sourceRoot": SOURCE_PREFIX.rstrip("/"),
        "extensionVersion": manifest["version"],
        "permissions": permissions,
        "files": {name: hashlib.sha256(content).hexdigest() for name, content in sorted(files.items())},
    }
    encoded = (json.dumps(receipt, sort_keys=True, indent=2) + "\n").encode("utf-8")
    return commit, files, encoded


def assert_no_links(path: Path) -> None:
    for candidate in (path, *path.parents):
        if candidate.is_symlink() or getattr(candidate, "is_junction", lambda: False)():
            raise PackageError("Package paths must not contain symbolic links or directory junctions.")


def verify_package(target: Path, files: dict[str, bytes], receipt: bytes) -> None:
    assert_no_links(target)
    if not target.is_dir():
        raise PackageError("Package is missing; verification made no changes.")
    expected = {**files, "release.json": receipt}
    expected_directories = {str(parent) for name in files for parent in PurePosixPath(name).parents if str(parent) != "."}
    actual_files, actual_directories = set(), set()
    for directory, children, names in os.walk(target, followlinks=False):
        for name in (*children, *names):
            entry = Path(directory) / name
            assert_no_links(entry)
            relative = entry.relative_to(target).as_posix()
            if entry.is_dir():
                actual_directories.add(relative)
            elif entry.is_file():
                actual_files.add(relative)
            else:
                raise PackageError("Package contains a non-regular filesystem entry.")
    if actual_files != set(expected) or actual_directories != expected_directories:
        raise PackageError("Package file inventory differs; existing bytes were preserved.")
    for name, content in expected.items():
        file = target / name
        if file.stat().st_size != len(content) or hashlib.sha256(file.read_bytes()).digest() != hashlib.sha256(content).digest():
            raise PackageError("Package content differs; existing bytes were preserved.")


def package_extension(repo: Path = ROOT, output_root: Path | None = None, verify_only: bool = False) -> Path:
    commit, files, receipt = source_snapshot(repo)
    output_root = (output_root if output_root is not None else repo / "Outputs/application-assist").absolute()
    target = output_root / commit
    assert_no_links(target)
    if target.exists() or verify_only:
        verify_package(target, files, receipt)
        return target
    output_root.mkdir(parents=True, exist_ok=True)
    try:
        target.mkdir()
    except FileExistsError:
        verify_package(target, files, receipt)
        return target
    # Reserve this immutable commit directory first. Interrupted writes remain
    # visible as incomplete; never erase or silently repair an installed package.
    for name, content in {**files, "release.json": receipt}.items():
        file = target / name
        assert_no_links(file.parent)
        file.parent.mkdir(parents=True, exist_ok=True)
        with file.open("xb") as stream:
            stream.write(content)
    verify_package(target, files, receipt)
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--verify", action="store_true", help="Verify this commit's existing package; never create files.")
    args = parser.parse_args()
    try:
        package = package_extension(output_root=args.output_root, verify_only=args.verify)
        print(f"APPLICATION_ASSIST_PACKAGE_VERIFIED={package}")
        return 0
    except (PackageError, OSError, UnicodeError) as error:
        print(f"Application Assist package failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
