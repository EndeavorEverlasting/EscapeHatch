"""Real committed-source packaging and PS5.1 release-integrity controls."""
from pathlib import Path
import importlib.util
import hashlib
import json
import posixpath
import re
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('windows_package', ROOT / 'scripts/package_windows_preview.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)

class WindowsPreviewPackage(unittest.TestCase):
    def test_node_payload_rejects_digest_paths_collisions_and_missing_notices(self):
        import copy
        import io
        pin = package.load_node_pin((ROOT / package.NODE_PIN).read_bytes())
        base = {'node.exe': b'synthetic executable never executed', 'npm.cmd': b'@echo off',
                'node_modules/npm/bin/npm-cli.js': b'// synthetic npm',
                'node_modules/npm/package.json': b'{}', 'LICENSE': b'Node and third-party notices',
                'node_modules/npm/LICENSE': b'npm notices'}
        with tempfile.TemporaryDirectory() as temporary:
            archive_path = Path(temporary) / 'node.zip'
            def make(entries):
                buffer = io.BytesIO()
                with zipfile.ZipFile(buffer, 'w') as archive:
                    for name, data in entries.items():
                        archive.writestr(pin['archiveRoot'] + '/' + name, data)
                archive_path.write_bytes(buffer.getvalue())
                candidate = copy.deepcopy(pin)
                candidate['archiveSha256'] = package.digest(buffer.getvalue())
                candidate['licenseFiles'] = {name: package.digest(base[name]) for name in pin['licenseFiles']}
                return candidate
            valid = make(base)
            payload = package.node_payload(archive_path, valid)
            self.assertEqual(payload['vendor/node/LICENSE'], base['LICENSE'])
            self.assertEqual(len(payload), len(base))
            wrong = {**valid, 'archiveSha256': '0' * 64}
            with self.assertRaisesRegex(ValueError, 'digest'):
                package.node_payload(archive_path, wrong)
            for extra in ('../escape', 'NODE.EXE', 'CON.txt', 'folder./file'):
                candidate = make({**base, extra: b'unsafe'})
                with self.subTest(extra=extra), self.assertRaises(ValueError):
                    package.node_payload(archive_path, candidate)
            for omitted in ('LICENSE', 'node_modules/npm/LICENSE', 'node.exe'):
                candidate = make({k:v for k,v in base.items() if k != omitted})
                with self.subTest(omitted=omitted), self.assertRaises(ValueError):
                    package.node_payload(archive_path, candidate)
            candidate = make({**base, 'LICENSE': b'changed notices'})
            with self.assertRaisesRegex(ValueError, 'license'):
                package.node_payload(archive_path, candidate)

    @unittest.skipUnless(shutil.which('powershell.exe'), 'Windows PowerShell required')
    def test_declared_bundle_fails_closed_before_system_fallback(self):
        import os
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / 'probe.ps1'
            probe.write_text("""param([string]$SourceRoot)
$ErrorActionPreference='Stop'
. $env:EH_TOOLCHAIN_UNDER_TEST
try { $selected=Get-EscapeHatchToolchain -SourceRoot $SourceRoot -RequireNpm; Write-Output $selected.Kind; exit 0 }
catch { Write-Output $_.Exception.Message; exit 9 }
""")
            runtime_files = {name: b'synthetic bytes never executed' for name in
                ('vendor/node/node.exe','vendor/node/node_modules/npm/bin/npm-cli.js','vendor/node/LICENSE','vendor/node/node_modules/npm/LICENSE')}
            for name,data in runtime_files.items():
                target=root/name; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data)
            hashes={name:package.digest(data) for name,data in runtime_files.items()}
            runtime={'schema':'escapehatch/bundled-node-runtime/v1','version':'22.23.4','platform':'win32','architecture':'x64',
                'archiveUrl':'https://nodejs.org/dist/v22.23.4/node-v22.23.4-win-x64.zip','archiveSha256':'a'*64,'files':hashes}
            manifest={'schema':package.SCHEMA,'nodeBundled':True,'nodeRuntime':runtime,'files':hashes}
            path=root/'windows-release.json'
            env={**os.environ,'EH_TOOLCHAIN_UNDER_TEST':str(ROOT/'scripts/windows/EscapeHatch-Toolchain.ps1')}
            def reject(expected):
                path.write_text(json.dumps(manifest))
                result=subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(probe),'-SourceRoot',str(root)],env=env,capture_output=True,text=True,timeout=30)
                self.assertEqual(result.returncode,9,result.stdout+result.stderr)
                self.assertIn(expected,result.stdout)
                self.assertNotIn('SYSTEM',result.stdout)
            (root/'vendor/node/node.exe').write_bytes(b'changed')
            reject('TOOLCHAIN_BUNDLE_INTEGRITY_FAILED')
            (root/'vendor/node/node.exe').write_bytes(runtime_files['vendor/node/node.exe'])
            (root/'vendor/node/extra.js').write_bytes(b'unlisted')
            reject('TOOLCHAIN_BUNDLE_INTEGRITY_FAILED')
            (root/'vendor/node/extra.js').unlink()
            (root/'vendor/node/LICENSE').unlink()
            reject('TOOLCHAIN_BUNDLE_INTEGRITY_FAILED')
            manifest['nodeRuntime']={}
            reject('TOOLCHAIN_BUNDLE_METADATA_INVALID')

    def test_source_rejects_windows_case_and_file_directory_collisions(self):
        for names in (('scripts/File', 'scripts/file'), ('scripts/node', 'scripts/Node/file'), ('scripts/file.',)):
            listing = b''.join(b'100644 blob ' + b'a' * 40 + b'\t' + name.encode() + b'\0' for name in names)
            with self.subTest(names=names), patch.object(package, 'git', side_effect=[b'b' * 40 + b'\n', listing]):
                with self.assertRaisesRegex(ValueError, 'Windows'):
                    package.snapshot(ROOT)

    @unittest.skipUnless(shutil.which('powershell.exe') and hasattr(Path, 'is_junction'), 'Windows junction support required')
    def test_existing_archive_and_checksum_junctions_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = package.build(ROOT, root / 'output')
            linked_directory = root / 'foreign'
            linked_directory.mkdir()
            for target in (archive, archive.with_suffix('.zip.sha256')):
                original = root / (target.name + '.preserved')
                target.replace(original)
                result = subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(target), str(linked_directory)], capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                try:
                    with self.assertRaisesRegex(ValueError, 'links or junctions'):
                        package.build(ROOT, archive.parent)
                    self.assertTrue(target.is_junction())
                    self.assertEqual(list(linked_directory.iterdir()), [])
                finally:
                    target.rmdir()
                    original.replace(target)

    def test_committed_bundle_is_deterministic_and_ignores_untracked_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            first = package.build(ROOT, output / 'first')
            second = package.build(ROOT, output / 'second')
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with zipfile.ZipFile(first) as archive:
                manifest = json.loads(archive.read('windows-release.json'))
                self.assertEqual(manifest['sourceCommit'], package.git(ROOT, 'rev-parse', 'HEAD').decode().strip())
                self.assertEqual(manifest['channel'], 'UNSIGNED_DEVELOPER_PREVIEW')
                self.assertFalse(manifest['signatureVerified'])
                self.assertFalse(manifest['nodeBundled'])
                self.assertEqual(set(archive.namelist()), set(manifest['files']) | {'windows-release.json'})
                for name, digest in manifest['files'].items():
                    self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), digest)
                self.assertIn('harness/contracts/application-form-taxonomy.v1.json', manifest['files'])
                # Runtime source imports must resolve inside the shipped bundle;
                # checking the checkout alone hides omitted repository contracts.
                for name in manifest['files']:
                    if not name.startswith('artifacts/escape-hatch/') or not name.endswith(('.ts', '.tsx')) or '.test.' in name or '/tests/' in name:
                        continue
                    source = archive.read(name).decode('utf-8-sig')
                    for relative in re.findall(r'''(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]''', source):
                        target = posixpath.normpath(posixpath.join(posixpath.dirname(name), relative))
                        candidates = {target, *(target + suffix for suffix in ('.ts', '.tsx', '.js', '.json', '/index.ts', '/index.tsx'))}
                        if target.endswith('.js'):
                            candidates.add(target[:-3] + '.ts')
                        self.assertTrue(candidates & manifest['files'].keys(), f'{name} imports missing packaged source {relative}')
                self.assertNotIn('.git', archive.namelist())
            first.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'Immutable'):
                package.build(ROOT, output / 'first')

    @unittest.skipUnless(shutil.which('powershell.exe'), 'Windows PowerShell required')
    def test_powershell_verifies_and_rejects_tampered_release_without_installing(self):
        # Tiny synthetic package isolates integrity validation from dependencies,
        # shortcuts, private workspace and process startup.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'source'
            files = {'scripts/windows/EscapeHatch-Toolchain.ps1': (ROOT / 'scripts/windows/EscapeHatch-Toolchain.ps1').read_bytes(), 'VERSION': b'1.3.0', 'Get-EscapeHatch.cmd': b'@echo off', 'Launch-EscapeHatch.ps1': b'# synthetic launcher', 'scripts/windows/EscapeHatch-Install.ps1': (ROOT / 'scripts/windows/EscapeHatch-Install.ps1').read_bytes(), 'scripts/windows/EscapeHatch-Runtime.ps1': b'param([string]$Action)\nif ($Action -eq "Status") { Write-Host "ESCAPEHATCH_STATE=STOPPED" }\nexit 0', 'artifacts/escape-hatch/package.json': b'{}'}
            for name, data in files.items():
                target = source / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            manifest = {'schema': package.SCHEMA, 'sourceCommit': 'a' * 40, 'channel': 'UNSIGNED_DEVELOPER_PREVIEW', 'files': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}}
            receipt = source / 'windows-release.json'
            def run():
                return subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(source / 'scripts/windows/EscapeHatch-Install.ps1'), '-Action', 'ReleaseVerify', '-SourceRoot', str(source)], capture_output=True, text=True, timeout=30)
            receipt.write_text(json.dumps(manifest))
            result = run()
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('PACKAGE_INTEGRITY_VERIFIED', result.stdout)
            (source / 'VERSION').write_bytes(b'tampered')
            result = run()
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('INSTALL_RELEASE_INTEGRITY_FAILED', result.stdout)
            (source / 'VERSION').write_bytes(files['VERSION'])
            manifest['files']['../escape'] = '0' * 64
            receipt.write_text(json.dumps(manifest))
            result = run()
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('INSTALL_RELEASE_PATH_INVALID', result.stdout)
            del manifest['files']['../escape']
            for alias in ('scripts/windows', 'VERSION.'):
                manifest['files'][alias] = '0' * 64
                receipt.write_text(json.dumps(manifest))
                result = run()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('INSTALL_RELEASE_PATH_INVALID', result.stdout)
                del manifest['files'][alias]
            receipt.write_text(json.dumps(manifest))
            app_data = root / 'user-data'
            shortcuts = root / 'shortcuts'
            command = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(source / 'scripts/windows/EscapeHatch-Install.ps1'), '-Action', 'ReleaseInstall', '-SourceRoot', str(source), '-AppDataRoot', str(app_data), '-ShortcutRoot', str(shortcuts), '-TestMode', '-SkipDependencies']
            installed = subprocess.run(command, capture_output=True, text=True, timeout=40)
            self.assertEqual(installed.returncode, 0, installed.stdout + installed.stderr)
            install_receipt = app_data / 'installation/install.v1.json'
            before = install_receipt.read_bytes()
            selected = json.loads(before)['sourceRoot']
            self.assertEqual(Path(selected).resolve(), (app_data / 'releases' / ('a' * 40)).resolve())
            # Repeated downloads resume the existing source instead of replacing it.
            repeated = subprocess.run(command, capture_output=True, text=True, timeout=40)
            self.assertEqual(repeated.returncode, 0, repeated.stdout + repeated.stderr)
            self.assertEqual(install_receipt.read_bytes(), before)
            install_receipt.unlink()
            destination_manifest = Path(selected) / 'windows-release.json'
            conflicting = json.loads(destination_manifest.read_text())
            conflicting['sourceCommit'] = 'b' * 40
            destination_manifest.write_text(json.dumps(conflicting))
            result = subprocess.run(command, capture_output=True, text=True, timeout=40)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('INSTALL_RELEASE_DESTINATION_CONFLICT', result.stdout)
            self.assertEqual(json.loads(destination_manifest.read_text())['sourceCommit'], 'b' * 40)

if __name__ == '__main__':
    unittest.main()
