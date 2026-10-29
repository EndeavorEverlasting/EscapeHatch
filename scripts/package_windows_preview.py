#!/usr/bin/env python3
"""Build an unsigned developer-preview Windows source bundle from committed bytes.

Build-time Git/Python are not destination dependencies. This is an integrity
artifact, not an authenticated/signed consumer installer. Optional Node bundling
uses the committed upstream input pin; --fetch-node-runtime additionally verifies
upstream signed SHASUMS with a pinned keyring, using build-time gpgv only.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import re
import shutil
import stat
import tempfile
import urllib.request
from pathlib import Path, PurePosixPath
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PREFIXES = ('artifacts/escape-hatch/', 'browser/', 'contracts/', 'harness/contracts/', 'scripts/', 'templates/', 'fixtures/')
ROOT_FILES = {'VERSION', 'LICENSE', 'package.json', 'Get-EscapeHatch.cmd', 'Install-EscapeHatch.cmd', 'Uninstall-EscapeHatch.cmd', 'Launch-EscapeHatch.cmd', 'Launch-EscapeHatch.ps1', 'Close-EscapeHatch.cmd', 'Close-EscapeHatch.ps1', 'Status-EscapeHatch.cmd', 'Status-EscapeHatch.ps1'}
SCHEMA = 'escapehatch/windows-preview-package/v1'
NODE_PIN = 'contracts/windows-node-runtime.v1.json'
MAX_ARCHIVE = 80 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_node_pin(raw: bytes) -> dict:
    pin = json.loads(raw)
    if (pin.get('schema') != 'escapehatch/windows-node-runtime-input/v1' or
            pin.get('platform') != 'win32' or pin.get('architecture') != 'x64' or
            not re.fullmatch(r'22\.\d+\.\d+', pin.get('version', ''))):
        raise ValueError('Unsupported Node runtime input pin')
    version = pin['version']
    prefix = f'https://nodejs.org/dist/v{version}/'
    revision = pin.get('releaseKeysRevision', '')
    if not re.fullmatch('[a-f0-9]{40}', revision):
        raise ValueError('Node release-key revision must be immutable')
    keys = f'https://raw.githubusercontent.com/nodejs/release-keys/{revision}/'
    expected = {'archiveUrl': prefix + f'node-v{version}-win-x64.zip',
                'archiveRoot': f'node-v{version}-win-x64',
                'signedShasumsUrl': prefix + 'SHASUMS256.txt.asc',
                'keyringUrl': keys + 'gpg/pubring.kbx', 'releaseKeysLicenseUrl': keys + 'LICENSE.md'}
    if any(pin.get(key) != value for key, value in expected.items()):
        raise ValueError('Node download URL or archive root is not pinned to the official release')
    for key in ('archiveSha256', 'signedShasumsSha256', 'shasumsSha256', 'keyringSha256', 'releaseKeysLicenseSha256'):
        if not re.fullmatch('[a-f0-9]{64}', pin.get(key, '')):
            raise ValueError('Node input digest missing')
    if not re.fullmatch('[A-F0-9]{40}', pin.get('signerFingerprint', '')):
        raise ValueError('Node signer fingerprint missing')
    if (set(pin.get('licenseFiles', {})) != {'LICENSE', 'node_modules/npm/LICENSE'} or
            any(not re.fullmatch('[a-f0-9]{64}', value) for value in pin['licenseFiles'].values()) or
            set(pin.get('requiredFiles', [])) != {'node.exe', 'npm.cmd', 'node_modules/npm/bin/npm-cli.js', 'node_modules/npm/package.json'}):
        raise ValueError('Node runtime or license requirements missing')
    return pin


def node_payload(archive_path: Path, pin: dict) -> dict[str, bytes]:
    if archive_path.stat().st_size > MAX_ARCHIVE or digest(archive_path.read_bytes()) != pin['archiveSha256']:
        raise ValueError('Node runtime archive digest or size mismatch')
    result = {}
    seen = set()
    total = 0
    with zipfile.ZipFile(archive_path) as archive:
        if len(archive.infolist()) > 10000:
            raise ValueError('Node archive has too many entries')
        for info in archive.infolist():
            name = info.filename
            parts = name.rstrip('/').split('/')
            mode = stat.S_IFMT(info.external_attr >> 16)
            if (not parts or parts[0] != pin['archiveRoot'] or '\\' in name or
                    any(not p or p in ('.', '..') or p.endswith(('.', ' ')) or
                        re.search(r'[\x00-\x1f<>:"|?*]', p) or
                        re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)', p, re.I) for p in parts) or
                    mode not in (0, stat.S_IFDIR, stat.S_IFREG) or info.flag_bits & 1):
                raise ValueError('Node archive contains an unsafe path or entry')
            folded = '/'.join(parts).casefold()
            if folded in seen:
                raise ValueError('Node archive contains a Windows filename collision')
            seen.add(folded)
            if info.is_dir():
                continue
            if len(parts) < 2:
                raise ValueError('Node archive root must be a directory')
            total += info.file_size
            if (info.file_size > MAX_EXPANDED or total > MAX_EXPANDED or
                    info.file_size > max(1, info.compress_size) * 200):
                raise ValueError('Node archive exceeds bounded expansion limits')
            relative = '/'.join(parts[1:])
            result['vendor/node/' + relative] = archive.read(info)
    names = {name.casefold() for name in result}
    if any(str(parent).casefold() in names for name in result for parent in PurePosixPath(name).parents):
        raise ValueError('Node archive contains a file/directory collision')
    for name in pin['requiredFiles']:
        if 'vendor/node/' + name not in result:
            raise ValueError('Node archive is missing required runtime files')
    for name, expected in pin['licenseFiles'].items():
        if digest(result.get('vendor/node/' + name, b'')) != expected:
            raise ValueError('Node archive license missing or changed')
    return result


def immutable_file(path: Path, data: bytes) -> None:
    if any(p.is_symlink() or getattr(p, 'is_junction', lambda: False)() for p in (path, *path.parents)):
        raise ValueError('Node cache must not contain links or junctions')
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError('Immutable Node cache differs; existing bytes preserved')
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('xb') as stream:
            stream.write(data)


def fetch_node_runtime(repo: Path, cache: Path, gpgv: str | None = None) -> Path:
    """Fetch official pinned inputs, verify the release signature, and cache atomically."""
    pin = load_node_pin(git(repo, 'show', f'HEAD:{NODE_PIN}'))
    inputs = ((pin['archiveRoot'] + '.zip', 'archiveUrl', 'archiveSha256', MAX_ARCHIVE),
              ('SHASUMS256.txt.asc', 'signedShasumsUrl', 'signedShasumsSha256', 1024 * 1024),
              ('pubring.kbx', 'keyringUrl', 'keyringSha256', 1024 * 1024),
              ('release-keys-LICENSE.md', 'releaseKeysLicenseUrl', 'releaseKeysLicenseSha256', 1024 * 1024))
    with tempfile.TemporaryDirectory(prefix='eh-node-upstream-') as temporary:
        staging = Path(temporary)
        for filename, url_key, hash_key, maximum in inputs:
            cached = cache / filename
            if any(p.is_symlink() or getattr(p, 'is_junction', lambda: False)() for p in (cached, *cached.parents)):
                raise ValueError('Node cache must not contain links or junctions')
            if cached.exists():
                if cached.stat().st_size > maximum:
                    raise ValueError('Node cache exceeds bounded input size')
                data = cached.read_bytes()
            else:
                with urllib.request.urlopen(pin[url_key], timeout=30) as response:
                    if response.geturl() != pin[url_key]:
                        raise ValueError('Node input redirected outside its pinned URL')
                    data = response.read(maximum + 1)
            if len(data) > maximum or digest(data) != pin[hash_key]:
                raise ValueError('Node upstream input digest mismatch')
            (staging / filename).write_bytes(data)
        executable = gpgv or shutil.which('gpgv')
        if not executable and Path('C:/Program Files/Git/usr/bin/gpgv.exe').is_file():
            executable = 'C:/Program Files/Git/usr/bin/gpgv.exe'
        if not executable:
            raise ValueError('Build-time gpgv is required to verify the upstream Node signature')
        (staging / 'gnupg').mkdir()
        # Relative paths also work with the Git-for-Windows MSYS gpgv binary.
        verification = subprocess.run([executable, '--homedir', './gnupg', '--status-fd', '1',
                                       '--keyring', './pubring.kbx', '--output', 'SHASUMS256.txt',
                                       'SHASUMS256.txt.asc'], cwd=staging, capture_output=True, text=True, timeout=30)
        signers = re.findall(r'^\[GNUPG:\] VALIDSIG ([A-F0-9]{40}) ', verification.stdout, re.M)
        if verification.returncode or signers != [pin['signerFingerprint']]:
            raise ValueError('Node upstream signature verification failed')
        sums = (staging / 'SHASUMS256.txt').read_bytes()
        expected_line = pin['archiveSha256'] + '  ' + pin['archiveRoot'] + '.zip'
        if digest(sums) != pin['shasumsSha256'] or sums.decode('utf-8').splitlines().count(expected_line) != 1:
            raise ValueError('Signed Node SHASUMS does not match the pinned archive')
        node_payload(staging / (pin['archiveRoot'] + '.zip'), pin)
        for filename, *_ in inputs:
            immutable_file(cache / filename, (staging / filename).read_bytes())
        receipt = {'schema': 'escapehatch/node-upstream-verification/v1',
                   **{key: pin[key] for key in ('version', 'archiveUrl', 'archiveSha256', 'signedShasumsSha256',
                                                'shasumsSha256', 'signerFingerprint', 'releaseKeysRevision', 'keyringSha256')},
                   'upstreamSignatureVerified': True, 'escapeHatchSignatureVerified': False}
        immutable_file(cache / 'node-upstream-verification.json', (json.dumps(receipt, sort_keys=True, indent=2) + '\n').encode())
    return cache / (pin['archiveRoot'] + '.zip')

def git(repo: Path, *args: str) -> bytes:
    return subprocess.run(['git', *args], cwd=repo, check=True, capture_output=True).stdout

def snapshot(repo: Path) -> tuple[str, dict[str, bytes]]:
    commit = git(repo, 'rev-parse', '--verify', 'HEAD^{commit}').decode().strip()
    entries = []
    windows_names = set()
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
        folded = name.casefold()
        if folded in windows_names or any(part.endswith((' ', '.')) for part in path.parts):
            raise ValueError('Release source contains a Windows filename collision')
        windows_names.add(folded)
        entries.append((name, blob))
    if any(str(parent).casefold() in windows_names for name, _ in entries for parent in PurePosixPath(name).parents if str(parent) != '.'):
        raise ValueError('Release source contains a Windows file/directory collision')
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

def build(repo: Path, output: Path, node_runtime_archive: Path | None = None) -> Path:
    for path in (output, *output.parents):
        if path.is_symlink() or getattr(path, 'is_junction', lambda: False)():
            raise ValueError('Release output must not contain links or junctions')
    commit, files = snapshot(repo)
    runtime = None
    if node_runtime_archive is not None:
        pin = load_node_pin(files[NODE_PIN])
        vendor = node_payload(node_runtime_archive, pin)
        if files.keys() & vendor.keys():
            raise ValueError('Node runtime conflicts with committed release source')
        files.update(vendor)
        runtime = {'schema': 'escapehatch/bundled-node-runtime/v1',
                   **{key: pin[key] for key in ('version', 'platform', 'architecture', 'archiveUrl', 'archiveSha256')},
                   'files': {name: digest(data) for name, data in sorted(vendor.items())}}
    manifest = {'schema': SCHEMA, 'sourceCommit': commit, 'version': files['VERSION'].decode().strip(), 'channel': 'UNSIGNED_DEVELOPER_PREVIEW', 'signatureVerified': False, 'nodeBundled': False, 'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}
    if runtime is not None:
        manifest.update(nodeBundled=True, nodeRuntime=runtime)
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
    suffix = f'-node-{runtime["version"]}-win-x64' if runtime else ''
    target = output / f'EscapeHatch-preview-{commit}{suffix}.zip'
    digest_file = target.with_suffix('.zip.sha256')
    for path in (target, digest_file):
        if path.is_symlink() or getattr(path, 'is_junction', lambda: False)():
            raise ValueError('Release output must not contain links or junctions')
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
    parser.add_argument('--output-root', type=Path)
    node = parser.add_mutually_exclusive_group()
    node.add_argument('--node-runtime-archive', type=Path, help='Exact archive matching the committed, upstream-verified input pin')
    node.add_argument('--fetch-node-runtime', type=Path, metavar='CACHE', help='Fetch and gpgv-verify official Node inputs; optionally build with --output-root')
    args = parser.parse_args()
    try:
        if not args.output_root and not args.fetch_node_runtime:
            parser.error('--output-root or --fetch-node-runtime is required')
        runtime_archive = fetch_node_runtime(ROOT, args.fetch_node_runtime) if args.fetch_node_runtime else args.node_runtime_archive
        if args.output_root is None:
            print(f'NODE_UPSTREAM_SIGNATURE_AND_ARCHIVE_VERIFIED={runtime_archive}')
            return 0
        target = build(ROOT, args.output_root, runtime_archive)
        print(f'WINDOWS_PREVIEW_PACKAGE_VERIFIED={target}')
        print('SIGNATURE=UNSIGNED; CONSUMER_INSTALL=UNPROVEN; NODE_RUNTIME=' + ('BUNDLED' if runtime_archive else 'REQUIRED'))
        return 0
    except (ValueError, OSError, zipfile.BadZipFile, subprocess.SubprocessError) as error:
        print(f'Release package failed: {error}')
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
