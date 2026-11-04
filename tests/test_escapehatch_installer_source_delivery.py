"""Source-level contract for self-contained mascot distribution and safe updates.

This test cannot prove a user's Windows install; host proof remains mandatory.
"""
from pathlib import Path
import json
import os
import shutil
import subprocess
import struct
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SourceDeliveryContract(unittest.TestCase):
    def run_brand_probe(self, temporary, body):
        fixture = Path(temporary)
        source = fixture / 'source with spaces'
        icon_source = source / 'browser/application-assist/icons/mascot-48.png'
        icon_source.parent.mkdir(parents=True)
        icon_source.write_bytes((ROOT / 'browser/application-assist/icons/mascot-48.png').read_bytes())
        probe = fixture / 'brand-probe.ps1'
        probe.write_text(r"""
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($env:EH_INSTALLER_UNDER_TEST, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Installer PowerShell parse failed' }
foreach ($name in @('Ensure-BrandIcon', 'Make-Shortcut')) {
    $function = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if ($null -eq $function) { throw ('Missing installer function: ' + $name) }
    Invoke-Expression $function.Extent.Text
}
$fixture = $env:EH_ICON_TEST_ROOT
$source = Join-Path $fixture 'source with spaces'
$AppDataRoot = Join-Path $fixture 'appdata'
$shortcutPath = Join-Path $fixture 'shortcuts\EscapeHatch.lnk'
""" + body, encoding='utf-8')
        result = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(probe)],
            capture_output=True, text=True, timeout=40,
            env={**os.environ, 'EH_INSTALLER_UNDER_TEST': str(ROOT / 'scripts/windows/EscapeHatch-Install.ps1'),
                 'EH_ICON_TEST_ROOT': str(fixture)})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result.stdout

    @unittest.skipUnless(shutil.which('powershell.exe'), 'Windows PowerShell required')
    def test_brand_icon_payload_and_com_shortcut_readback_preserve_custom_assets(self):
        with tempfile.TemporaryDirectory(prefix='eh-brand-icon-') as temporary:
            output = self.run_brand_probe(temporary, r"""
Make-Shortcut $source
$icon = Join-Path $AppDataRoot 'assets\EscapeHatch.ico'
$shell = New-Object -ComObject WScript.Shell
try {
    $link = $shell.CreateShortcut($shortcutPath)
    if ($link.IconLocation -cne ($icon + ',0')) { throw 'Shortcut does not reference generated mascot icon' }
    if ($link.WorkingDirectory -cne $source) { throw 'Shortcut working directory changed' }
    if ($link.Arguments -cne ('-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $source 'Launch-EscapeHatch.ps1') + '"')) { throw 'Shortcut launcher arguments changed' }
    if ($link.TargetPath -ine (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')) { throw 'Shortcut target changed' }
} finally {
    if ($null -ne $link) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($link) }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
}
$custom = [byte[]](1,3,5,7,9)
$customRoot = Join-Path $fixture 'custom-appdata'
New-Item -ItemType Directory -Path (Join-Path $customRoot 'assets') -Force | Out-Null
$AppDataRoot = $customRoot
$customIcon = Join-Path $AppDataRoot 'assets\EscapeHatch.ico'
[IO.File]::WriteAllBytes($customIcon, $custom)
$source = Join-Path $fixture 'missing-source'
if ((Ensure-BrandIcon $source) -cne $customIcon) { throw 'Existing custom icon was not reused without bundled source' }
if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($customIcon)) -cne [Convert]::ToBase64String($custom)) { throw 'Custom icon was changed' }
$shortcutPath = Join-Path $fixture 'shortcuts\custom-shortcut.lnk'
$customShortcut = [byte[]](2,4,6,8)
[IO.File]::WriteAllBytes($shortcutPath, $customShortcut)
$refused = $false
try { Make-Shortcut $source } catch { $refused = $true }
if (-not $refused) { throw 'Existing shortcut replacement was not refused' }
if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($shortcutPath)) -cne [Convert]::ToBase64String($customShortcut)) { throw 'Custom shortcut changed' }
Write-Output 'BRAND_ICON_AND_SHORTCUT=PASS'
""")
            self.assertIn('BRAND_ICON_AND_SHORTCUT=PASS', output)
            fixture = Path(temporary)
            png = (fixture / 'source with spaces/browser/application-assist/icons/mascot-48.png').read_bytes()
            ico = (fixture / 'appdata/assets/EscapeHatch.ico').read_bytes()
            self.assertEqual(struct.unpack('<HHH', ico[:6]), (0, 1, 1))
            self.assertEqual(struct.unpack('<BBBBHHII', ico[6:22]), (48, 48, 0, 0, 1, 32, len(png), 22))
            self.assertEqual(ico[22:], png)
            self.assertEqual(png, (ROOT / 'browser/application-assist/icons/mascot-48.png').read_bytes())
            self.assertFalse(list(fixture.rglob('EscapeHatch.*.ico')))
            self.assertFalse(list(fixture.rglob('EscapeHatch.*.lnk')))

    @unittest.skipUnless(shutil.which('powershell.exe'), 'Windows PowerShell required')
    def test_brand_icon_missing_invalid_and_collision_inputs_fail_without_output(self):
        with tempfile.TemporaryDirectory(prefix='eh-brand-invalid-') as temporary:
            output = self.run_brand_probe(temporary, r"""
if ($null -ne (Ensure-BrandIcon (Join-Path $fixture 'missing-source'))) { throw 'Missing source should leave default shortcut icon available' }
if (Test-Path -LiteralPath $AppDataRoot) { throw 'Missing source created assets' }
$pngPath = Join-Path $source 'browser\application-assist\icons\mascot-48.png'
$original = [IO.File]::ReadAllBytes($pngPath)
foreach ($case in @('short', 'signature', 'ihdr-length', 'ihdr-type', 'width', 'height')) {
    $invalid = [byte[]]$original.Clone()
    switch ($case) {
        'short' { $invalid = [byte[]](137,80,78,71) }
        'signature' { $invalid[7] = 0 }
        'ihdr-length' { $invalid[11] = 12 }
        'ihdr-type' { $invalid[12] = 0 }
        'width' { $invalid[19] = 32 }
        'height' { $invalid[23] = 32 }
    }
    [IO.File]::WriteAllBytes($pngPath, $invalid)
    $refused = $false
    try { Ensure-BrandIcon $source | Out-Null } catch {
        if ($_.Exception.Message -notlike 'INSTALL_BRAND_ICON_INVALID:*') { throw }
        $refused = $true
    }
    if (-not $refused) { throw ('Malformed PNG accepted: ' + $case) }
    if (Test-Path -LiteralPath $AppDataRoot) { throw 'Invalid source created output assets' }
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($pngPath)) -cne [Convert]::ToBase64String($invalid)) { throw 'Invalid source was mutated' }
}
New-Item -ItemType Directory -Path (Join-Path $AppDataRoot 'assets\EscapeHatch.ico') -Force | Out-Null
$refused = $false
try { Ensure-BrandIcon $source | Out-Null } catch {
    if ($_.Exception.Message -notlike 'INSTALL_BRAND_ICON_COLLISION:*') { throw }
    $refused = $true
}
if (-not $refused) { throw 'Directory collision was not refused' }
if (-not (Test-Path -LiteralPath (Join-Path $AppDataRoot 'assets\EscapeHatch.ico') -PathType Container)) { throw 'Collision was mutated' }
Write-Output 'BRAND_ICON_FAILURES=PASS'
""")
            self.assertIn('INSTALL_BRAND_ICON=SOURCE_UNAVAILABLE', output)
            self.assertIn('BRAND_ICON_FAILURES=PASS', output)

    @unittest.skipUnless(shutil.which('powershell.exe') and shutil.which('npm.cmd'), 'Windows npm and PowerShell required')
    def test_clean_dependency_install_owns_app_cwd_even_inside_npm_lifecycle(self):
        with tempfile.TemporaryDirectory(prefix='eh-clean-deps-') as temporary:
            fixture = Path(temporary) / 'source with spaces'
            app = fixture / 'artifacts/escape-hatch'
            app.mkdir(parents=True)
            (fixture / 'package.json').write_text(json.dumps({'name': 'fixture-root', 'private': True,
                'scripts': {'preinstall': 'node root-guard.cjs'}}))
            (fixture / 'root-guard.cjs').write_text("require('node:fs').writeFileSync('wrong-root-lifecycle.txt','refused');process.exit(55);")
            (app / 'package.json').write_text(json.dumps({'name': 'fixture-app', 'private': True,
                'scripts': {'preinstall': 'node dependency-fixture.cjs',
                    'verify': 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File ../../dependency-probe.ps1'}}))
            (app / 'dependency-fixture.cjs').write_text("""
const fs = require('node:fs');
if (process.env.EH_FAIL_APP_INSTALL === '1') process.exit(17);
fs.mkdirSync('node_modules/vite/bin', {recursive:true});
fs.writeFileSync('node_modules/vite/bin/vite.js', '// synthetic dependency');
fs.appendFileSync('app-lifecycle-ran.txt', '1');
""")
            (fixture / 'dependency-probe.ps1').write_text(r"""
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $env:EH_DEPENDENCY_FIXTURE
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($env:EH_INSTALLER_UNDER_TEST, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Installer parse failed' }
. (Join-Path (Split-Path -Parent $env:EH_INSTALLER_UNDER_TEST) 'EscapeHatch-Toolchain.ps1')
$names = @('File-Hash', 'Ensure-Dependencies')
foreach ($name in $names) {
    $function = $ast.Find({ param($item) $item -is [Management.Automation.Language.FunctionDefinitionAst] -and $item.Name -eq $name }, $true)
    if ($null -eq $function) { throw 'Canonical dependency function missing' }
    Invoke-Expression $function.Extent.Text
}
$SkipDependencies = $false
$npmProbe = Get-Command npm.cmd -CommandType Application | Select-Object -First 1
Write-Output ('NESTED_NPM_VERSION=' + (& $npmProbe.Source --version))
$before = (Get-Location).Path
$beforePrefix = $env:npm_config_prefix
$beforePath = $env:PATH
if ($env:EH_FAIL_APP_INSTALL -eq '1') {
    try { Ensure-Dependencies $env:EH_DEPENDENCY_FIXTURE; throw 'Expected dependency failure' }
    catch { if ($_.Exception.Message -notmatch '^INSTALL_DEPENDENCIES_FAILED:') { throw } }
} else {
    Ensure-Dependencies $env:EH_DEPENDENCY_FIXTURE
    Ensure-Dependencies $env:EH_DEPENDENCY_FIXTURE
}
if ((Get-Location).Path -cne $before) { throw 'Dependency installation changed caller cwd' }
if ($env:npm_config_prefix -cne $beforePrefix) { throw 'Dependency installation changed caller npm prefix' }
if ($env:PATH -cne $beforePath) { throw 'Dependency installation changed caller PATH' }
Write-Output 'DEPENDENCY_FIXTURE=PASS'
""")
            env = {**os.environ, 'EH_DEPENDENCY_FIXTURE': str(fixture),
                'EH_INSTALLER_UNDER_TEST': str(ROOT / 'scripts/windows/EscapeHatch-Install.ps1')}
            # Optional npm CLI path permits the CI npm-10 regression to be run
            # with the exact version independently of the workstation's npm.
            if env.get('ESCAPEHATCH_TEST_NPM_CLI'):
                node = env.get('ESCAPEHATCH_TEST_NODE_EXE') or shutil.which('node')
                tools = Path(temporary) / 'toolchain'
                tools.mkdir()
                # Pin the inner PowerShell-discovered npm as well as the outer
                # lifecycle runner. Testing only the outer CLI can mask a bug.
                (tools / 'npm.cmd').write_text(f'@echo off\n"{node}" "{env["ESCAPEHATCH_TEST_NPM_CLI"]}" %*\n')
                env['PATH'] = str(tools) + os.pathsep + str(Path(node).parent) + os.pathsep + env['PATH']
                npm = [node, env['ESCAPEHATCH_TEST_NPM_CLI']]
            else:
                npm = [shutil.which('npm.cmd')]
            command = [*npm, '--prefix', str(app), 'run', 'verify']
            original_manifest = (app / 'package.json').read_bytes()
            result = subprocess.run(command, cwd=fixture, env=env, capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('DEPENDENCY_FIXTURE=PASS', result.stdout)
            if env.get('ESCAPEHATCH_TEST_NPM_VERSION'):
                self.assertIn('NESTED_NPM_VERSION=' + env['ESCAPEHATCH_TEST_NPM_VERSION'], result.stdout)
            self.assertFalse((fixture / 'wrong-root-lifecycle.txt').exists())
            self.assertEqual((app / 'package.json').read_bytes(), original_manifest, 'Dependency install must not add a self-dependency')
            self.assertEqual((app / 'app-lifecycle-ran.txt').read_text(), '1', result.stdout + result.stderr)
            stamp = app / 'node_modules/.escapehatch-package.sha256'
            self.assertTrue(stamp.is_file())
            stamp.unlink()
            (app / 'node_modules/vite/bin/vite.js').unlink()
            result = subprocess.run(command, cwd=fixture, env={**env, 'EH_FAIL_APP_INSTALL': '1'}, capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('DEPENDENCY_FIXTURE=PASS', result.stdout)
            self.assertFalse(stamp.exists())
            self.assertFalse((fixture / 'wrong-root-lifecycle.txt').exists())

    def test_mascot_is_owned_by_the_repository_not_manual_transport(self):
        mascot = ROOT / "artifacts/escape-hatch/public/escapehatch-mascot.webp"
        self.assertTrue(mascot.is_file(), "Bundled approved mascot must be in Git checkout")
        self.assertEqual(mascot.read_bytes()[0:4], b"RIFF")
        self.assertEqual(mascot.read_bytes()[8:12], b"WEBP")
        guide = (ROOT / "artifacts/escape-hatch/src/components/guided-start.tsx").read_text(encoding="utf-8")
        self.assertIn('src="/escapehatch-mascot.webp"', guide)
        shell = (ROOT / "artifacts/escape-hatch/src/App.tsx").read_text(encoding="utf-8")
        self.assertIn("<BirdsongControl />", shell)
        self.assertIn('focusOpportunity=', shell)

    def test_existing_installation_updater_is_consentful_and_non_destructive(self):
        source = (ROOT / "Get-EscapeHatch.cmd").read_text(encoding="utf-8")
        self.assertIn("call :safe_update_existing", source)
        self.assertIn("symbolic-ref --quiet --short HEAD", source)
        self.assertIn("git -C \"%SOURCE%\" status --porcelain", source)
        self.assertIn("ESCAPEHATCH_STATE=STOPPED", source)
        self.assertIn('choice /C YN /N /M "Check for and install verified source updates?', source)
        self.assertIn("git -C \"%SOURCE%\" merge --ff-only FETCH_HEAD", source)
        for forbidden in ("git reset --hard", "git clean -fd", "git pull --force", "taskkill"):
            self.assertNotIn(forbidden, source.lower())

    def test_birdsound_does_not_need_a_private_asset_or_auto_play(self):
        source = (ROOT / "artifacts/escape-hatch/src/components/birdsong-control.tsx").read_text(encoding="utf-8")
        self.assertIn("new window.AudioContext()", source)
        self.assertIn("createOscillator()", source)
        self.assertIn("aria-pressed={enabled}", source)
        self.assertIn("useState(false)", source)
        self.assertNotIn("localStorage", source)
        self.assertNotIn("autoplay", source.lower())


if __name__ == "__main__":
    unittest.main()
