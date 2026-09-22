#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, hashlib, io, json, lzma, os, subprocess, tarfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
CARRIER = ROOT / ".migration-carrier"

def safe_member(name: str) -> PurePosixPath:
    p = PurePosixPath(name)
    if p.is_absolute() or not p.parts or ".." in p.parts:
        raise SystemExit(f"unsafe archive path: {name!r}")
    return p

def tracked_files() -> set[str]:
    cp = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    return {p.decode("utf-8") for p in cp.stdout.split(b"\0") if p}

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", type=Path)
    ap.add_argument("--extract", type=Path)
    args = ap.parse_args()

    manifest = json.loads((CARRIER / "manifest.json").read_text(encoding="utf-8"))
    chunks = sorted(CARRIER.glob("payload.*.b64"))
    if len(chunks) != manifest["chunks"]:
        raise SystemExit(f"chunk count mismatch: {len(chunks)} != {manifest['chunks']}")

    encoded = "".join(p.read_text(encoding="ascii").strip() for p in chunks)
    if len(encoded) != manifest["base64_chars"]:
        raise SystemExit(f"base64 length mismatch: {len(encoded)} != {manifest['base64_chars']}")

    payload = base64.b64decode(encoded, validate=True)
    if len(payload) != manifest["payload_bytes"]:
        raise SystemExit(f"payload byte mismatch: {len(payload)} != {manifest['payload_bytes']}")

    digest = hashlib.sha256(payload).hexdigest()
    if digest != manifest["payload_sha256"]:
        raise SystemExit(f"payload sha256 mismatch: {digest}")

    tar_bytes = lzma.decompress(payload)
    files: list[tuple[str, bytes, int]] = []
    with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:") as tf:
        for member in tf.getmembers():
            path = safe_member(member.name)
            if member.issym() or member.islnk() or member.isdev():
                raise SystemExit(f"unsupported archive member type: {member.name}")
            if not member.isfile():
                continue
            src = tf.extractfile(member)
            if src is None:
                raise SystemExit(f"missing archive bytes: {member.name}")
            files.append((path.as_posix(), src.read(), member.mode))

    if len(files) != manifest["files"]:
        raise SystemExit(f"file count mismatch: {len(files)} != {manifest['files']}")

    tracked = tracked_files()
    collisions_identical, collisions_different = [], []
    for rel, data, _mode in files:
        if rel in tracked:
            current = (ROOT / rel).read_bytes()
            (collisions_identical if current == data else collisions_different).append(rel)

    required = [
        "package.json",
        "artifacts/escape-hatch/package.json",
        "artifacts/escape-hatch/vite.config.ts",
        "scripts/src/task-plan-sync.ts",
    ]
    archive_paths = {rel for rel, _, _ in files}
    report = {
        "schema": "escapehatch/migration-carrier-reconstruction-report/v1",
        "donor_commit": manifest["donor_commit"],
        "payload_sha256": digest,
        "payload_bytes": len(payload),
        "files": len(files),
        "top_level": sorted({PurePosixPath(rel).parts[0] for rel, _, _ in files}),
        "required_paths": {p: p in archive_paths for p in required},
        "tracked_collisions": {
            "identical_count": len(collisions_identical),
            "different_count": len(collisions_different),
            "different_paths": collisions_different,
        },
    }

    if args.extract:
        dest = args.extract.resolve()
        dest.mkdir(parents=True, exist_ok=True)
        for rel, data, mode in files:
            out = (dest / Path(*PurePosixPath(rel).parts)).resolve()
            if dest not in out.parents and out != dest:
                raise SystemExit(f"unsafe extraction target: {rel}")
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(data)
            try:
                os.chmod(out, mode & 0o777)
            except OSError:
                pass

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(report, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
