"""Offline guard for EscapeHatch background submission receipt sync."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SubmissionSyncSilenceContract(unittest.TestCase):
    def test_task_settings_and_pythonw_host(self):
        ps = (ROOT / "scripts/windows/EscapeHatch-SubmissionSync.ps1").read_text(
            encoding="utf-8-sig"
        )
        self.assertIn("-DontStopIfGoingOnBatteries -Hidden", ps)
        self.assertIn("Set-ScheduledTask -TaskName $taskName", ps)
        self.assertIn("Get-OwnedTask", ps)
        self.assertIn("SUBMISSION_SYNC_FOREIGN_TASK", ps)
        self.assertIn("SUBMISSION_SYNC_SILENT_SETTINGS_READBACK_FAILED", ps)
        self.assertIn("RepairSilence", ps)
        self.assertIn("Resolve-Pythonw", ps)
        self.assertIn("submission_sync_silent_host.py", ps)
        self.assertIn("SILENCE_REPAIRED_PYTHONW", ps)

    def test_child_process_prevents_console(self):
        ps = (ROOT / "scripts/windows/EscapeHatch-SubmissionSync.ps1").read_text(
            encoding="utf-8-sig"
        )
        self.assertIn("$start.UseShellExecute = $false", ps)
        self.assertIn("$start.CreateNoWindow = $true", ps)
        self.assertIn("ProcessWindowStyle]::Hidden", ps)
        self.assertIn("submission-sync-silent-launch.cjs", ps)
        self.assertIn("$child.WaitForExit()", ps)
        self.assertIn("exit $child.ExitCode", ps)
        self.assertNotIn("& $toolchain.NodePath --experimental-strip-types", ps)

    def test_silent_host_uses_create_no_window(self):
        host = (
            ROOT / "scripts/windows/submission_sync_silent_host.py"
        ).read_text(encoding="utf-8")
        self.assertIn("CREATE_NO_WINDOW", host)
        self.assertIn("submission-sync-silent-launch.cjs", host)
        self.assertIn("pythonw", host.lower())

    def test_owner_worker_remains_receipt_only(self):
        worker = (
            ROOT / "artifacts/escape-hatch/submission-sync-worker.ts"
        ).read_text(encoding="utf-8")
        self.assertIn("runSubmissionSyncOnce", worker)
        self.assertNotIn("page.click(", worker)


if __name__ == "__main__":
    unittest.main()
