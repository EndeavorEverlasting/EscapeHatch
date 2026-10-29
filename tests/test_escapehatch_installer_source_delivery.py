"""Source-level contract for self-contained mascot distribution and safe updates.

This test cannot prove a user's Windows install; host proof remains mandatory.
"""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SourceDeliveryContract(unittest.TestCase):
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
