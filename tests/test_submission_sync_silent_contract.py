"""Offline guard for EscapeHatch background submission receipt sync."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SubmissionSyncSilenceContract(unittest.TestCase):
    def test_task_settings_and_existing_owner_migration(self):
        ps = (ROOT / "scripts/windows/EscapeHatch-SubmissionSync.ps1").read_text(encoding="utf-8")
        self.assertIn("-DontStopIfGoingOnBatteries -Hidden", ps)
        self.assertIn("Set-ScheduledTask -TaskName $taskName -Settings", ps)
        self.assertIn("Get-OwnedTask", ps)
        self.assertIn("SUBMISSION_SYNC_FOREIGN_TASK", ps)
        self.assertIn("SUBMISSION_SYNC_SILENT_SETTINGS_READBACK_FAILED", ps)

    def test_child_process_prevents_console(self):
        ps = (ROOT / "scripts/windows/EscapeHatch-SubmissionSync.ps1").read_text(encoding="utf-8")
        self.assertIn("$start.UseShellExecute = $false", ps)
        self.assertIn("$start.CreateNoWindow = $true", ps)
        self.assertIn("ProcessWindowStyle]::Hidden", ps)
        self.assertIn("$child.WaitForExit()", ps)
        self.assertIn("exit $child.ExitCode", ps)
        self.assertNotIn("& $toolchain.NodePath --experimental-strip-types", ps)

    def test_owner_worker_remains_receipt_only(self):
        worker = (ROOT / "artifacts/escape-hatch/submission-sync-worker.ts").read_text(encoding="utf-8")
        self.assertIn("runSubmissionSyncOnce", worker)
        self.assertNotIn("page.click(", worker)


if __name__ == "__main__":
    unittest.main()
