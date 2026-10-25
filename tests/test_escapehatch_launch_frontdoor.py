"""Guard the one-click Windows launch front door against blank nested PowerShell hangs.

This is a source-level negative regression: it does not certify a Windows launch.
Live owner/process/socket and user-workspace checks remain with Windows runtime tests.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
FRONTDOOR = ROOT / "Launch-EscapeHatch.cmd"


class LaunchFrontdoorContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = FRONTDOOR.read_text(encoding="utf-8")
        cls.lower = cls.source.lower()

    def test_visible_progress_precedes_runtime_invocation(self):
        self.assertIn("echo [1/2] Checking the startup entrypoint", self.source)
        self.assertIn("echo [2/2] Starting through the existing runtime manager", self.source)
        self.assertLess(self.lower.index("echo [1/2]"), self.lower.index("powershell.exe"))

    def test_runs_runtime_directly_not_through_nested_launcher(self):
        self.assertIn('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%EH_MANAGER%" -Action Start', self.source)
        self.assertNotRegex(
            self.source,
            r'(?im)^\s*(?:call\s+)?powershell(?:\.exe)?[^\r\n]*-File\s+"?[^\r\n]*Launch-EscapeHatch\.ps1'
        )

    def test_delegates_to_installer_when_available(self):
        self.assertIn('if exist "%EH_BOOTSTRAP%"', self.source)
        self.assertIn('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%EH_BOOTSTRAP%" -Action Bootstrap', self.source)

    def test_preserves_port_override_and_displays_url(self):
        self.assertIn('if not defined PORT set "PORT=21031"', self.source)
        self.assertIn('http://127.0.0.1:%PORT%/', self.source)

    def test_errors_remain_visible_and_destructive_shortcuts_absent(self):
        self.assertIn('set "EH_RESULT=%ERRORLEVEL%"', self.source)
        self.assertIn('if not "%EH_RESULT%"=="0" goto :failed', self.source)
        self.assertIn(":failed", self.source)
        self.assertRegex(self.source, r"(?s):failed\s+echo \[ERROR\].*?pause")
        for forbidden in ("taskkill", "stop-process", "npm install", "git clean", "force-push"):
            self.assertNotIn(forbidden, self.lower)


if __name__ == "__main__":
    unittest.main()
