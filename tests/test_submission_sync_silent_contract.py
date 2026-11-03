"""Offline guard for EscapeHatch background submission receipt sync."""
from pathlib import Path
import json
import tempfile
import unittest

from scripts.windows.submission_sync_silent_host import needs_sync_worker

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


class SubmissionSyncIdleAdmission(unittest.TestCase):
    """A scheduled clock stays installed; only actionable private work starts Node."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="eh-silent-idle-")
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def store(self, file, value):
        (self.root / file).write_text(json.dumps(value), encoding="utf-8")

    def receipt(self, attempt_id):
        return {
            "opportunityId": "synthetic-opportunity",
            "sessionId": "synthetic-session",
            "attemptId": attempt_id,
            "applicationOrigin": "https://example.test",
            "applicationPath": "/apply",
            "observedAt": "2026-11-02T00:00:00Z",
            "source": "same_session_page_confirmation",
            "evidenceCode": "APPLICATION_RECEIVED_AFTER_USER_SUBMIT",
        }

    def outbox(self, *states):
        self.store("submission-tracker-outbox.v1.json", {
            "schema": "escapehatch/submission-tracker-outbox/v1",
            "entries": [
                {"receipt": self.receipt(f"attempt-{index}"), "state": state}
                for index, state in enumerate(states)
            ],
        })

    def test_empty_synced_or_conflict_only_skips_node(self):
        self.assertFalse(needs_sync_worker(self.root))
        self.outbox("SYNCED", "CONFLICT")
        self.assertFalse(needs_sync_worker(self.root))
        self.store("managed-submission-receipts.json", [
            self.receipt("attempt-0"), self.receipt("attempt-1"),
        ])
        self.assertFalse(needs_sync_worker(self.root))

    def test_active_and_unqueued_receipts_wake_node(self):
        for state in ("PENDING", "AUTH_REQUIRED", "RETRY_REQUIRED"):
            with self.subTest(state=state):
                self.outbox(state)
                self.assertTrue(needs_sync_worker(self.root))
        self.outbox("SYNCED")
        self.store("managed-submission-receipts.json", [
            self.receipt("attempt-0"), self.receipt("new-attempt"),
        ])
        self.assertTrue(needs_sync_worker(self.root))

    def test_corrupt_unknown_or_duplicate_state_never_looks_idle(self):
        self.store("submission-tracker-outbox.v1.json", [])
        self.assertTrue(needs_sync_worker(self.root))
        self.store("submission-tracker-outbox.v1.json", {"schema": "wrong", "entries": []})
        self.assertTrue(needs_sync_worker(self.root))
        self.outbox("UNRECOGNIZED")
        self.assertTrue(needs_sync_worker(self.root))
        (self.root / "submission-tracker-outbox.v1.json").write_text("{malformed", encoding="utf-8")
        self.assertTrue(needs_sync_worker(self.root))
        (self.root / "submission-tracker-outbox.v1.json").write_bytes(b"x" * (2 * 1024 * 1024 + 1))
        self.assertTrue(needs_sync_worker(self.root))
        self.outbox("SYNCED", "SYNCED")
        self.store("managed-submission-receipts.json", [self.receipt("attempt-0")])
        self.assertFalse(needs_sync_worker(self.root))
        self.store("submission-tracker-outbox.v1.json", {
            "schema": "escapehatch/submission-tracker-outbox/v1",
            "entries": [
                {"receipt": self.receipt("attempt-0"), "state": "SYNCED"},
                {"receipt": self.receipt("attempt-0"), "state": "SYNCED"},
            ],
        })
        self.assertTrue(needs_sync_worker(self.root))
        self.outbox("SYNCED")
        self.store("managed-submission-receipts.json", [self.receipt("attempt-0"), {"bad": "receipt"}])
        self.assertTrue(needs_sync_worker(self.root))


if __name__ == "__main__":
    unittest.main()
