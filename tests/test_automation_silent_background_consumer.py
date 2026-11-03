"""Offline pin + silence bridge guards for Automation PR #40 consumption."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIN = "3254c7fa946f91617e1f651784c4be33c3232e7e"


class AutomationSilentBackgroundConsumer(unittest.TestCase):
    def test_consumer_contract_pins_pr40(self):
        path = ROOT / "contracts/automation-silent-background-consumer.v1.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(data["upstream"]["commit_sha"], PIN)
        self.assertEqual(data["upstream"]["pr"], 40)
        self.assertFalse(
            data["current_consumer"]["unregister_on_silence_repair"]
        )
        self.assertEqual(
            data["current_consumer"]["preserve_interval_minutes"], 5
        )
        self.assertEqual(
            data["current_consumer"]["scheduled_execute"], "pythonw.exe"
        )
        self.assertEqual(
            data["current_consumer"]["scheduled_host"],
            "scripts/windows/submission_sync_silent_host.py",
        )

    def test_scheduler_contract_points_at_automation_consumer(self):
        data = json.loads(
            (ROOT / "contracts/submission-sync-scheduler.v1.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(
            data["owner_surfaces"]["automation_consumer"],
            "contracts/automation-silent-background-consumer.v1.json",
        )
        self.assertTrue(data["silence_policy"]["preserve_existing_clock"])

    def test_ps1_prefers_silent_launch_bridge(self):
        ps = (
            ROOT / "scripts/windows/EscapeHatch-SubmissionSync.ps1"
        ).read_text(encoding="utf-8")
        self.assertIn("submission-sync-silent-launch.cjs", ps)
        self.assertIn("$start.CreateNoWindow = $true", ps)
        self.assertIn("ProcessWindowStyle]::Hidden", ps)
        self.assertNotIn("& $toolchain.NodePath --experimental-strip-types", ps)

    def test_resolver_and_bridge_exist(self):
        self.assertTrue(
            (
                ROOT
                / "scripts/windows/lib/resolve-automation-silent-background.cjs"
            ).is_file()
        )
        bridge = (
            ROOT / "scripts/windows/submission-sync-silent-launch.cjs"
        ).read_text(encoding="utf-8")
        self.assertIn("spawnBackground", bridge)
        self.assertIn("SILENT_BACKGROUND", bridge)
        self.assertIn("windowsHide: true", bridge)


if __name__ == "__main__":
    unittest.main()
