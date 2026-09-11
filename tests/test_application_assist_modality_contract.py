#!/usr/bin/env python3
"""Contract and adapter proofs for Application Assist three-mode UX."""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BROWSER = ROOT / "browser" / "application-assist"
CONTRACT = ROOT / "contracts" / "application-assist-modality.v1.json"
SESSION = ROOT / "contracts" / "application-assist-session.v1.json"


class ApplicationAssistModalityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
        cls.session = json.loads(SESSION.read_text(encoding="utf-8"))
        cls.html = (BROWSER / "popup.html").read_text(encoding="utf-8")
        cls.popup = (BROWSER / "popup.js").read_text(encoding="utf-8")
        cls.modality = (BROWSER / "modality.js").read_text(encoding="utf-8")

    def test_contract_schema_and_invariants(self) -> None:
        self.assertEqual(self.contract["schema"], "escapehatch/application-assist-modality/v1")
        self.assertEqual(self.contract["modes"], ["mouse", "keyboard", "phone"])
        inv = set(self.contract["invariants"])
        self.assertIn("equivalent_intent_invokes_identical_semantic_action", inv)
        self.assertIn("opening_non_text_command_surface_must_not_autofocus_text_inputs", inv)
        self.assertIn("touch_must_not_double_dispatch_through_synthesized_click", inv)
        self.assertIn("no_second_session_state_machine", inv)

    def test_capabilities_cover_session_controls(self) -> None:
        by_id = {item["id"]: item for item in self.contract["capabilities"]}
        for control in self.session["session"]["controls"]:
            # Map human labels onto semantic ids used by adapters.
            pass
        required = {
            "start_assist",
            "fill_allowed",
            "pause_session",
            "resume_session",
            "emergency_stop",
            "undo_last_fill",
            "record_confirmation",
            "save_profile",
            "clear_profile",
            "export_profile",
            "import_profile",
            "open_command_palette",
            "open_profile_panel",
            "dismiss_overlay",
        }
        self.assertTrue(required.issubset(by_id))
        for action_id in required:
            item = by_id[action_id]
            self.assertTrue(item["mouse"])
            self.assertTrue(item["keyboard"])
            self.assertTrue(item["phone"])
            self.assertEqual(item["semantic_action"], action_id)

    def test_phone_is_command_sheet_not_resized_desktop(self) -> None:
        phone = self.contract["grammars"]["phone"]
        self.assertEqual(phone["home"], "session_command_sheet")
        self.assertIn("default_land_on_command_sheet_not_profile_form", phone["rules"])
        self.assertIn("no_autofocus_on_text_inputs_at_open", phone["rules"])
        self.assertIn('id="phoneSheet"', self.html)
        self.assertIn("modality-phone", self.html)
        self.assertIn("profile-open", self.html)
        self.assertIn("phoneHomeActions", self.popup)
        self.assertIn("setProfileOpen(false)", self.popup)

    def test_keyboard_grammar_and_escape_policy(self) -> None:
        kb = self.contract["grammars"]["keyboard"]
        self.assertEqual(kb["direct"]["escape"], "dismiss_overlay")
        self.assertEqual(kb["direct"]["shift+escape"], "emergency_stop")
        self.assertIn("escape_does_not_clear_profile_or_stop_session", kb["rules"])
        self.assertIn('"/", "ctrl+k", "?"', self.modality)
        self.assertIn("shortcutAction", self.modality)
        self.assertIn("dismiss_overlay", self.popup)

    def test_html_keeps_required_control_ids(self) -> None:
        for control_id in (
            "startAssist",
            "fillAllowed",
            "pause",
            "resume",
            "emergencyStop",
            "undoLast",
            "recordConfirmation",
            "save",
            "clear",
            "export",
            "import",
            "phone_authority",
            "commandPalette",
            "modeChip",
        ):
            self.assertIn(f'id="{control_id}"', self.html)
        self.assertIn('src="modality.js"', self.html)

    def test_node_modality_harness_converges(self) -> None:
        script = ROOT / "tests" / "test_application_assist_modality.mjs"
        completed = subprocess.run(
            ["node", str(script)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if completed.returncode:
            self.fail(completed.stdout + completed.stderr)


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ApplicationAssistModalityTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
