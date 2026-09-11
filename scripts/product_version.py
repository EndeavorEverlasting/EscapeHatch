#!/usr/bin/env python3
"""EscapeHatch product-release version authority helpers.

Canonical authority: VERSION (single SemVer line).
Policy owner: contracts/product-release.v1.json
Exact freshness: Git commit SHA (and tags that point at that commit).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION_PATH = ROOT / "VERSION"
CONTRACT_PATH = ROOT / "contracts" / "product-release.v1.json"
CHANGELOG_PATH = ROOT / "CHANGELOG.md"

SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$"
)

BUMP_RANK = {"none": 0, "patch": 1, "minor": 2, "major": 3}
VALID_CHANGES = frozenset(BUMP_RANK)


@dataclass(frozen=True)
class SemVer:
    major: int
    minor: int
    patch: int
    prerelease: str | None = None
    build: str | None = None

    def __str__(self) -> str:
        base = f"{self.major}.{self.minor}.{self.patch}"
        if self.prerelease:
            base = f"{base}-{self.prerelease}"
        if self.build:
            base = f"{base}+{self.build}"
        return base

    def bump(self, kind: str) -> SemVer:
        if kind == "none":
            return self
        if self.prerelease and kind in {"major", "minor", "patch"}:
            # Finalizing or advancing from a prerelease base strips prerelease/build.
            pass
        if kind == "major":
            return SemVer(self.major + 1, 0, 0)
        if kind == "minor":
            return SemVer(self.major, self.minor + 1, 0)
        if kind == "patch":
            return SemVer(self.major, self.minor, self.patch + 1)
        raise ValueError(f"unsupported bump kind: {kind}")


class VersionError(ValueError):
    pass


def parse_semver(text: str) -> SemVer:
    raw = text.strip()
    match = SEMVER_RE.fullmatch(raw)
    if not match:
        raise VersionError(f"invalid SemVer: {text!r}")
    return SemVer(
        int(match.group(1)),
        int(match.group(2)),
        int(match.group(3)),
        match.group(4),
        match.group(5),
    )


def read_version(path: Path = VERSION_PATH) -> SemVer:
    if not path.is_file():
        raise VersionError(f"missing canonical authority: {path}")
    lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(lines) != 1:
        raise VersionError("VERSION must contain exactly one non-empty SemVer line")
    return parse_semver(lines[0])


def write_version(version: SemVer, path: Path = VERSION_PATH) -> None:
    path.write_text(f"{version}\n", encoding="utf-8")


def load_contract(path: Path = CONTRACT_PATH) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise VersionError(f"invalid product-release contract: {exc}") from exc
    if data.get("schema") != "escapehatch/product-release/v1":
        raise VersionError("product-release schema mismatch")
    if data.get("version") != 1:
        raise VersionError("product-release contract version mismatch")
    if data.get("canonical_authority") != "VERSION":
        raise VersionError("canonical_authority must be VERSION")
    if data.get("scheme") != "semver":
        raise VersionError("scheme must be semver")
    return data


def _pointer_get(document: object, pointer: str) -> object:
    if not pointer.startswith("/"):
        raise VersionError(f"json_pointer must start with /: {pointer}")
    node: object = document
    for raw in pointer.lstrip("/").split("/"):
        key = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(node, dict):
            if key not in node:
                raise VersionError(f"missing pointer {pointer}")
            node = node[key]
        else:
            raise VersionError(f"cannot traverse pointer {pointer}")
    return node


def _pointer_set(document: dict, pointer: str, value: object) -> None:
    if not pointer.startswith("/"):
        raise VersionError(f"json_pointer must start with /: {pointer}")
    parts = [p.replace("~1", "/").replace("~0", "~") for p in pointer.lstrip("/").split("/")]
    node: object = document
    for key in parts[:-1]:
        if not isinstance(node, dict) or key not in node:
            raise VersionError(f"missing pointer parent {pointer}")
        node = node[key]
    if not isinstance(node, dict):
        raise VersionError(f"cannot set pointer {pointer}")
    node[parts[-1]] = value


def read_mirrors(contract: dict | None = None) -> list[tuple[str, str, str]]:
    data = contract or load_contract()
    mirrors = data.get("synchronized_mirrors")
    if not isinstance(mirrors, list) or not mirrors:
        raise VersionError("synchronized_mirrors must be a non-empty list")
    out: list[tuple[str, str, str]] = []
    for item in mirrors:
        if not isinstance(item, dict):
            raise VersionError("mirror entry must be an object")
        path = item.get("path")
        pointer = item.get("json_pointer")
        kind = item.get("kind")
        if not isinstance(path, str) or not isinstance(pointer, str) or kind != "mirrored":
            raise VersionError("mirror entries require path, json_pointer, kind=mirrored")
        out.append((path, pointer, kind))
    return out


def check_mirrors(version: SemVer | None = None, contract: dict | None = None) -> list[str]:
    expected = str(version or read_version())
    errors: list[str] = []
    for rel, pointer, _kind in read_mirrors(contract):
        path = ROOT / rel
        if not path.is_file():
            errors.append(f"missing mirror file: {rel}")
            continue
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
            actual = _pointer_get(document, pointer)
        except (OSError, json.JSONDecodeError, VersionError) as exc:
            errors.append(f"{rel}: {exc}")
            continue
        if actual != expected:
            errors.append(f"{rel}{pointer}={actual!r} != VERSION {expected!r}")
    return errors


def sync_mirrors(version: SemVer, contract: dict | None = None) -> list[str]:
    updated: list[str] = []
    expected = str(version)
    for rel, pointer, _kind in read_mirrors(contract):
        path = ROOT / rel
        document = json.loads(path.read_text(encoding="utf-8"))
        current = _pointer_get(document, pointer)
        if current == expected:
            continue
        _pointer_set(document, pointer, expected)
        path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
        updated.append(rel)
    return updated


def aggregate_bump(changes: list[str]) -> str:
    if not changes:
        raise VersionError("at least one change classification is required")
    best = "none"
    for change in changes:
        if change not in VALID_CHANGES:
            raise VersionError(f"invalid change classification: {change}")
        if BUMP_RANK[change] > BUMP_RANK[best]:
            best = change
    return best


def next_version(current: SemVer, changes: list[str]) -> SemVer:
    return current.bump(aggregate_bump(changes))


def changelog_has_release(version: SemVer, path: Path = CHANGELOG_PATH) -> bool:
    if not path.is_file():
        return False
    heading = f"## [{version}]"
    return heading in path.read_text(encoding="utf-8")


def prepend_changelog(version: SemVer, notes: str, path: Path = CHANGELOG_PATH) -> None:
    heading = f"## [{version}]"
    body = notes.strip() or "### Changed\n\n- Release notes pending reviewed change evidence."
    entry = f"{heading}\n\n{body}\n\n"
    if path.is_file():
        existing = path.read_text(encoding="utf-8")
        if heading in existing:
            raise VersionError(f"CHANGELOG already contains {heading}")
        # Insert after the first H1 block / intro paragraphs, before the first release heading.
        marker = "\n## ["
        if marker in existing:
            prefix, suffix = existing.split(marker, 1)
            path.write_text(prefix.rstrip() + "\n\n" + entry + "## [" + suffix, encoding="utf-8")
            return
        path.write_text(existing.rstrip() + "\n\n" + entry, encoding="utf-8")
        return
    path.write_text(
        "# Changelog\n\n"
        "All notable EscapeHatch **product** releases are recorded here.\n"
        "Product identity is owned by `VERSION`.\n\n"
        + entry,
        encoding="utf-8",
    )


def git_head_sha() -> str:
    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode:
        raise VersionError(completed.stderr.strip() or "git rev-parse HEAD failed")
    return completed.stdout.strip()


def git_tag_exists(tag: str) -> bool:
    completed = subprocess.run(
        ["git", "tag", "-l", tag],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode:
        raise VersionError(completed.stderr.strip() or "git tag -l failed")
    return bool(completed.stdout.strip())


def tag_name_for(version: SemVer, contract: dict | None = None) -> str:
    data = contract or load_contract()
    fmt = data.get("tag", {}).get("format", "v{release}")
    if not isinstance(fmt, str) or "{release}" not in fmt:
        raise VersionError("tag.format must contain {release}")
    return fmt.replace("{release}", str(version))


def tag_plan(version: SemVer | None = None) -> dict:
    contract = load_contract()
    current = version or read_version()
    errors = check_mirrors(current, contract)
    if errors:
        raise VersionError("; ".join(errors))
    if not changelog_has_release(current):
        raise VersionError(f"CHANGELOG.md missing heading for {current}")
    tag = tag_name_for(current, contract)
    if git_tag_exists(tag):
        raise VersionError(f"refusing to reuse existing tag {tag}")
    sha = git_head_sha()
    return {
        "release": str(current),
        "tag": tag,
        "commit": sha,
        "command": f"git tag -a {tag} {sha} -m \"EscapeHatch {current}\"",
        "publication_boundary": contract["release_mechanics"]["publication_boundary"],
    }


def validate_all() -> dict:
    contract = load_contract()
    version = read_version()
    errors = check_mirrors(version, contract)
    if errors:
        raise VersionError("; ".join(errors))
    cutover = contract.get("cutover", {}).get("release")
    if not cutover:
        raise VersionError("cutover.release missing")
    try:
        parse_semver(str(cutover))
    except VersionError as exc:
        raise VersionError(f"cutover.release must be SemVer: {exc}") from exc
    if not CHANGELOG_PATH.is_file():
        raise VersionError("CHANGELOG.md missing")
    if not changelog_has_release(version):
        raise VersionError(f"CHANGELOG.md missing heading for current release {version}")
    tag = tag_name_for(version, contract)
    return {
        "release": str(version),
        "authority": "VERSION",
        "scheme": "semver",
        "tag": tag,
        "mirrors": [path for path, _pointer, _kind in read_mirrors(contract)],
        "commit": git_head_sha(),
    }


def cmd_show(_: argparse.Namespace) -> int:
    info = validate_all()
    print(f"release={info['release']}")
    print(f"authority={info['authority']}")
    print(f"scheme={info['scheme']}")
    print(f"tag={info['tag']}")
    print(f"commit={info['commit']}")
    for mirror in info["mirrors"]:
        print(f"mirror={mirror}")
    return 0


def cmd_check(_: argparse.Namespace) -> int:
    info = validate_all()
    print("PRODUCT_VERSION: PASS")
    print(f"release={info['release']}")
    print(f"tag={info['tag']}")
    print(f"commit={info['commit']}")
    return 0


def cmd_next(args: argparse.Namespace) -> int:
    current = read_version()
    changes = args.change
    nxt = next_version(current, changes)
    print(f"current={current}")
    print(f"changes={','.join(changes)}")
    print(f"aggregate={aggregate_bump(changes)}")
    print(f"next={nxt}")
    return 0


def cmd_bump(args: argparse.Namespace) -> int:
    contract = load_contract()
    current = read_version()
    changes = args.change
    aggregate = aggregate_bump(changes)
    if aggregate == "none":
        print("PRODUCT_VERSION_BUMP: NOOP")
        print(f"current={current}")
        print("reason=aggregate_none")
        return 0
    nxt = current.bump(aggregate)
    if git_tag_exists(tag_name_for(nxt, contract)):
        raise VersionError(f"refusing bump to reused tag target {tag_name_for(nxt, contract)}")
    write_version(nxt)
    updated = sync_mirrors(nxt, contract)
    prepend_changelog(nxt, args.notes or f"### Changed\n\n- Classified bump: {aggregate} ({', '.join(changes)}).")
    print("PRODUCT_VERSION_BUMP: PASS")
    print(f"previous={current}")
    print(f"release={nxt}")
    print(f"aggregate={aggregate}")
    for path in updated:
        print(f"synced={path}")
    print(f"changelog={CHANGELOG_PATH.relative_to(ROOT)}")
    return 0


def cmd_tag_plan(_: argparse.Namespace) -> int:
    plan = tag_plan()
    print("PRODUCT_VERSION_TAG_PLAN: PASS")
    for key, value in plan.items():
        print(f"{key}={value}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="EscapeHatch product version authority")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("show", help="Show canonical release and mirror status").set_defaults(func=cmd_show)
    sub.add_parser("check", help="Fail on version drift or missing authority").set_defaults(func=cmd_check)

    next_p = sub.add_parser("next", help="Compute next version from change classifications")
    next_p.add_argument(
        "--change",
        action="append",
        required=True,
        choices=sorted(VALID_CHANGES),
        help="Accepted change classification; repeatable; highest wins",
    )
    next_p.set_defaults(func=cmd_next)

    bump_p = sub.add_parser("bump", help="Apply deterministic bump, sync mirrors, update CHANGELOG")
    bump_p.add_argument(
        "--change",
        action="append",
        required=True,
        choices=sorted(VALID_CHANGES),
        help="Accepted change classification; repeatable; highest wins",
    )
    bump_p.add_argument("--notes", default="", help="CHANGELOG body under the new release heading")
    bump_p.set_defaults(func=cmd_bump)

    sub.add_parser(
        "tag-plan",
        help="Dry-run annotated tag command for current VERSION after validation",
    ).set_defaults(func=cmd_tag_plan)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except VersionError as exc:
        print(f"PRODUCT_VERSION: FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
