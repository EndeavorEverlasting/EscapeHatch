#!/usr/bin/env python3
"""Unit + contract tests for EH-M1 presence-surface and host-side spike helpers."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "application-assist-presence-surface.v1.json"
FIXTURE = ROOT / "fixtures" / "application-assist-presence-surface.v1.example.json"
SPIKE = ROOT / "scripts" / "run_android_assist_presence_spike.py"
VALIDATOR = ROOT / "scripts" / "validate_application_assist_presence_surface.py"


def load_spike_module():
    name = "android_assist_presence_spike"
    spec = importlib.util.spec_from_file_location(name, SPIKE)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


class PresenceSurfaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
        cls.fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        cls.spike = load_spike_module()

    def test_contract_separates_eh_u1(self) -> None:
        self.assertTrue(self.contract["not_eh_u1"])
        adapters = {a["id"]: a for a in self.contract["adapters"]}
        self.assertEqual(adapters["desktop_in_page_beacon"]["lane"], "EH-U1")
        self.assertEqual(adapters["android_presence_surface"]["lane"], "EH-M1")

    def test_session_key_matches_assist_session_contract(self) -> None:
        session = json.loads((ROOT / "contracts" / "application-assist-session.v1.json").read_text(encoding="utf-8"))
        self.assertEqual(
            self.contract["session_identity"]["storage_key"],
            session["storage"]["session_key"],
        )

    def test_affordance_machine_rejects_illegal_auto_expand_path(self) -> None:
        machine = self.spike.AffordanceMachine("dormant")
        self.assertFalse(machine.transition("expanded"))
        self.assertTrue(machine.transition("available"))
        self.assertTrue(machine.transition("surfaced"))

    def test_deep_link_and_share_handoff(self) -> None:
        deep = self.spike.parse_deep_link(self.fixture["handoff"]["deep_link"])
        self.assertIsNotNone(deep)
        assert deep is not None
        self.assertEqual(deep["session_id"], "sess-fixture-001")
        self.assertEqual(deep["url"], "https://jobs.example.com/apply")
        share = self.spike.parse_share_text(self.fixture["handoff"]["share_text"])
        self.assertEqual(share["url"], "https://jobs.example.com/apply")

    def test_session_resume_after_browser_leave(self) -> None:
        store = self.spike.SessionStore()
        session = self.spike.AssistSession(
            session_id="sess-fixture-001",
            origin="https://jobs.example.com",
            status="active",
            company="Example Co",
            role="Automation Engineer",
        )
        store.save(session)
        # simulate leave browser / reopen companion
        resumed = store.load()
        self.assertIsNotNone(resumed)
        assert resumed is not None
        self.assertEqual(resumed.session_id, session.session_id)
        self.assertEqual(resumed.origin, session.origin)

    def test_dismiss_does_not_erase_session(self) -> None:
        store = self.spike.SessionStore()
        machine = self.spike.AffordanceMachine("available")
        store.save(
            self.spike.AssistSession(
                session_id="sess-fixture-001",
                origin="https://jobs.example.com",
                status="paused",
            )
        )
        self.assertTrue(machine.transition("surfaced"))
        self.assertTrue(machine.transition("temporarily_dismissed"))
        self.assertEqual(store.load().session_id, "sess-fixture-001")

    def test_spike_runner_and_validator(self) -> None:
        spike = subprocess.run([sys.executable, str(SPIKE)], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(spike.returncode, 0, spike.stdout + spike.stderr)
        validator = subprocess.run([sys.executable, str(VALIDATOR)], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(validator.returncode, 0, validator.stdout + validator.stderr)


if __name__ == "__main__":
    unittest.main()
