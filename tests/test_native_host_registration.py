"""Windows native-host registration uses disposable files and an isolated HKCU key."""
from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
import uuid

if sys.platform == 'win32':
    import winreg

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / 'scripts/windows/EscapeHatch-NativeHost.ps1'


@unittest.skipUnless(sys.platform == 'win32', 'Windows registry and cmd required')
class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='eh-native-registration-')
        self.root = Path(self.temp.name)
        self.source = self.root / 'source with spaces \u00e9'
        self.data = self.root / 'appdata'
        self.registry = 'Software\\EscapeHatch\\NativeHostTests\\' + uuid.uuid4().hex
        self.key = 'HKCU:\\' + self.registry
        extension = self.source / 'browser/application-assist/manifest.json'
        extension.parent.mkdir(parents=True)
        self.public_key = bytes(range(1, 65))  # Synthetic public manifest bytes, no private key.
        extension.write_text(json.dumps({'key': base64.b64encode(self.public_key).decode()}))
        host = self.source / 'artifacts/escape-hatch/native-messaging-host.ts'
        host.parent.mkdir(parents=True)
        # A disposable framed-stdio fixture proves cmd preserves bytes and argv.
        host.write_text("const chunks: Buffer[] = []; process.stdin.on('data', c => chunks.push(c));"
                        "process.stdin.on('end', () => { const input = Buffer.concat(chunks);"
                        "const payload = Buffer.from(JSON.stringify({origin:process.argv[2],dataHome:process.env.ESCAPEHATCH_DATA_HOME,"
                        "request:JSON.parse(input.subarray(4).toString('utf8'))}));"
                        "const size=Buffer.alloc(4);size.writeUInt32LE(payload.length);"
                        "process.stdout.write(Buffer.concat([size,payload])); });")

    def tearDown(self):
        # Every key in this subtree was created by this exact test instance.
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, self.registry)
        except FileNotFoundError:
            pass
        self.temp.cleanup()

    def run_helper(self, action, expected=0, extra=()):
        result = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                                 str(HELPER), '-Action', action, '-SourceRoot', str(self.source),
                                 '-AppDataRoot', str(self.data), '-RegistryPath', self.key, '-TestMode', *extra],
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return result.stdout

    def manifest_path(self):
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, self.registry) as key:
            return Path(winreg.QueryValueEx(key, '')[0])

    def test_repeat_register_stdio_and_uninstall_preserve_private_data(self):
        self.assertIn('NOT_REGISTERED', self.run_helper('Inspect'))
        self.assertFalse(self.data.exists())
        self.assertIn('REGISTERED', self.run_helper('Register'))
        manifest_path = self.manifest_path()
        manifest = json.loads(manifest_path.read_text())
        extension_id = ''.join(chr(97 + int(n, 16)) for n in hashlib.sha256(self.public_key).hexdigest()[:32])
        origin = 'chrome-extension://' + extension_id + '/'
        self.assertEqual(manifest['allowed_origins'], [origin])
        self.assertEqual(manifest['name'], 'com.escapehatch.profile')
        launcher = Path(manifest['path'])
        self.assertTrue(launcher.read_bytes().startswith(b'@echo off\r\n'))
        before = {p: p.read_bytes() for p in (launcher, manifest_path)}
        self.run_helper('Register')
        self.assertEqual(self.manifest_path(), manifest_path)
        self.assertEqual(before, {p: p.read_bytes() for p in before})
        request = json.dumps({'text': 'line\nwith non-ASCII \u00e9'}).encode()
        result = subprocess.run(['cmd.exe', '/d', '/c', str(launcher), origin, '--parent-window=0'],
                                input=struct.pack('<I', len(request)) + request,
                                capture_output=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        self.assertEqual(struct.unpack('<I', result.stdout[:4])[0], len(result.stdout) - 4)
        response = json.loads(result.stdout[4:])
        self.assertEqual(response['origin'], origin)
        self.assertEqual(response['request'], json.loads(request))
        self.assertEqual(Path(response['dataHome']).resolve(), self.data.resolve())
        private = self.data / 'workspace.v1.json'
        private.write_text('private synthetic sentinel')
        extra_file = launcher.parent / 'foreign.txt'
        extra_file.write_text('preserve me')
        self.run_helper('Unregister')
        self.assertFalse(launcher.exists())
        self.assertFalse(manifest_path.exists())
        self.assertEqual(private.read_text(), 'private synthetic sentinel')
        self.assertEqual(extra_file.read_text(), 'preserve me')
        self.run_helper('Unregister')

    def test_foreign_registry_is_not_adopted_or_overwritten(self):
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, self.registry) as key:
            winreg.SetValueEx(key, '', 0, winreg.REG_SZ, 'C:\\foreign\\host.json')
        for action in ('Register', 'Unregister', 'Inspect'):
            self.assertIn('NATIVE_HOST_REGISTRY_FOREIGN', self.run_helper(action, 1))
        self.assertEqual(str(self.manifest_path()), 'C:\\foreign\\host.json')
        self.assertFalse(self.data.exists())

    def test_changed_files_and_registry_refuse_uninstall_preserving_both(self):
        self.run_helper('Register')
        manifest = self.manifest_path()
        launcher = Path(json.loads(manifest.read_text())['path'])
        original = launcher.read_bytes()
        launcher.write_bytes(b'foreign changed bytes')
        self.assertIn('FILES_CHANGED', self.run_helper('Unregister', 1))
        self.assertEqual(self.manifest_path(), manifest)
        self.assertEqual(launcher.read_bytes(), b'foreign changed bytes')
        launcher.write_bytes(original)
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, self.registry, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, 'foreign', 0, winreg.REG_SZ, 'preserve')
        self.assertIn('REGISTRY_FOREIGN', self.run_helper('Unregister', 1))
        self.assertTrue(launcher.exists())

    def test_source_upgrade_keeps_ownership_of_both_packages(self):
        self.run_helper('Register')
        first = self.manifest_path()
        moved = self.root / 'second source'
        shutil.copytree(self.source, moved)
        self.source = moved
        self.run_helper('Register')
        second = self.manifest_path()
        self.assertNotEqual(first, second)
        self.assertTrue(first.exists())
        self.run_helper('Unregister')
        self.assertFalse(first.exists())
        self.assertFalse(second.exists())

    def test_missing_host_and_invalid_test_key_fail_without_mutation(self):
        (self.source / 'artifacts/escape-hatch/native-messaging-host.ts').unlink()
        self.assertIn('SOURCE_MISSING', self.run_helper('Register', 1))
        result = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(HELPER),
                                 '-Action', 'Register', '-TestMode', '-AppDataRoot', str(self.data),
                                 '-RegistryPath', 'HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.escapehatch.profile'],
                                capture_output=True, text=True, timeout=15)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('TEST_ROOT_REQUIRED', result.stdout)
        self.assertFalse(self.data.exists())

    def test_missing_extension_key_and_tampered_receipt_fail_closed(self):
        manifest = self.source / 'browser/application-assist/manifest.json'
        original = manifest.read_text()
        manifest.write_text('{}')
        self.assertIn('EXTENSION_KEY_REQUIRED', self.run_helper('Register', 1))
        self.assertFalse(self.data.exists())
        manifest.write_text(original)
        self.run_helper('Register')
        registered = self.manifest_path()
        receipt_path = self.data / 'native-messaging/registration.v1.json'
        receipt = json.loads(receipt_path.read_text())
        receipt['packages'][0]['id'] = '..\\foreign'
        receipt_path.write_text(json.dumps(receipt))
        self.assertIn('RECEIPT_INVALID', self.run_helper('Unregister', 1))
        self.assertEqual(self.manifest_path(), registered)
        self.assertTrue(registered.exists())


if __name__ == '__main__':
    unittest.main()
