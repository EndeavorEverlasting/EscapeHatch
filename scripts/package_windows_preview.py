#!/usr/bin/env python3
"""Build an unsigned developer-preview Windows source bundle from committed bytes.

Build-time Git/Python are not destination dependencies. This is an integrity
artifact, not an authenticated/signed consumer installer or bundled Node runtime.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PREFIXES = ('artifacts/escape-hatch/', 'browser/', 'contracts/', 'scripts/', 'templates/', 'fixtures/')
ROOT_FILES = {'VERSION', 'LICENSE', 'package.json', 'Get-EscapeHatch.cmd', 'Install-EscapeHatch.cmd', 'Uninstall-EscapeHatch.cmd', 'Launch-EscapeHatch.cmd', 'Launch-EscapeHatch.ps1', 'Close-EscapeHatch.cmd', 'Close-EscapeHatch.ps1', 'Status-EscapeHatch.cmd', 'Status-EscapeHatch.ps1'}
SCHEMA = 'escapehatch/windows-preview-package/v1'

def git(repo: Path, *args: str) -> bytes:
    return subprocess.run(['git', *args], cwd=repo, check=True, capture_output=True).stdout

def snapshot(repo: Path) -> tuple[str, dict[str, bytes]]:
    commit = git(repo, 'rev-parse', '--verify', 'HEAD^{commit}').decode().strip()
    entries = []
    for record in git(repo, 'ls-tree', '-rz', '--full-tree', commit).split(b'\0'):
        if not record:
            continue
        metadata, raw_name = record.split(b'\t', 1)
        name = raw_name.decode('utf-8')
        if name not in ROOT_FILES and not name.startswith(PREFIXES):
            continue
        mode, kind, blob = metadata.decode().split()
        path = PurePosixPath(name)
        if mode not in ('100644', '100755') or kind != 'blob' or path.is_absolute() or any(part in ('.', '..') for part in path.parts) or ':' in name or '\\' in name:
            raise ValueError('Release source contains an unsupported path or entry')
        if any(part in ('node_modules', '.env', 'private', 'test-results') for part in path.parts):
            raise ValueError('Release source contains a forbidden private/runtime path')
        entries.append((name, blob))
    # Read raw committed blobs in one process; archive export attributes must
    # never transform the bytes represented by this source identity.
    request = ''.join(blob + '\n' for _, blob in entries).encode('ascii')
    result = subprocess.run(['git', 'cat-file', '--batch'], cwd=repo, input=request, check=True, capture_output=True).stdout
    stream = io.BytesIO(result)
    files = {}
    for name, blob in entries:
        object_id, kind, size = stream.readline().decode('ascii').split()
        if object_id != blob or kind != 'blob':
            raise ValueError('Git returned an unexpected release object')
        data = stream.read(int(size))
        if len(data) != int(size) or stream.read(1) != b'\n':
            raise ValueError('Git returned an incomplete release blob')
        files[name] = data
    required = {'VERSION', 'Get-EscapeHatch.cmd', 'scripts/windows/EscapeHatch-Install.ps1', 'scripts/windows/EscapeHatch-Runtime.ps1', 'artifacts/escape-hatch/package.json'}
    if not required <= files.keys():
        raise ValueError('Release source is incomplete')
    return commit, files

def build(repo: Path, output: Path) -> Path:
    for path in (output, *output.parents):
        if path.is_symlink() or getattr(path, 'is_junction', lambda: False)():
            raise ValueError('Release output must not contain links or junctions')
    commit, files = snapshot(repo)
    manifest = {'schema': SCHEMA, 'sourceCommit': commit, 'version': files['VERSION'].decode().strip(), 'channel': 'UNSIGNED_DEVELOPER_PREVIEW', 'signatureVerified': False, 'nodeBundled': False, 'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}
    files['windows-release.json'] = (json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode()
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    payload = buffer.getvalue()
    output.mkdir(parents=True, exist_ok=True)
    target = output / f'EscapeHatch-preview-{commit}.zip'
    digest_file = target.with_suffix('.zip.sha256')
    for path, data in ((target, payload), (digest_file, (hashlib.sha256(payload).hexdigest() + '  ' + target.name + '\n').encode())):
        if path.exists():
            if path.read_bytes() != data:
                raise ValueError('Immutable release output differs; existing bytes preserved')
        else:
            with path.open('xb') as stream:
                stream.write(data)
    return target

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-root', type=Path, required=True)
    args = parser.parse_args()
    try:
        target = build(ROOT, args.output_root)
        print(f'WINDOWS_PREVIEW_PACKAGE_VERIFIED={target}')
        print('SIGNATURE=UNSIGNED; CONSUMER_INSTALL=UNPROVEN; NODE_RUNTIME=REQUIRED')
        return 0
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Release package failed: {error}')
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
