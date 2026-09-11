#!/usr/bin/env python3
"""Contract and safety checks for EscapeHatch Application Assist Session."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BROWSER = ROOT / "browser" / "application-assist"
CONTRACT = ROOT / "contracts" / "application-assist-session.v1.json"
DOCS = ROOT / "docs" / "APPLICATION_ASSIST_SESSION.md"


class ApplicationAssistSessionContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
        cls.manifest = json.loads((BROWSER / "manifest.json").read_text(encoding="utf-8"))
        cls.core = (BROWSER / "assist-core.js").read_text(encoding="utf-8")
        cls.content = (BROWSER / "content.js").read_text(encoding="utf-8")
        cls.popup = (BROWSER / "popup.js").read_text(encoding="utf-8")
        cls.html = (BROWSER / "popup.html").read_text(encoding="utf-8")
        cls.docs = DOCS.read_text(encoding="utf-8")

    def test_contract_pipeline_and_safety(self) -> None:
        self.assertEqual(self.contract["schema"], "escapehatch/application-assist-session/v1")
        self.assertEqual(
            self.contract["architecture"]["pipeline"],
            ["user_owned_state", "canonical_fill_plan", "policy_gate", "dom_writer"],
        )
        self.assertEqual(
            self.contract["architecture"]["invariant"],
            "no_dom_write_may_bypass_canonical_fill_plan",
        )
        forbidden = set(self.contract["policy_gate"]["forbidden_actions"])
        self.assertIn("auto_submit", forbidden)
        self.assertIn("click_next_or_continue", forbidden)
        self.assertIn("auto_attestation", forbidden)
        self.assertEqual(self.contract["session"]["cross_origin_transition"], "pause")
        self.assertTrue(self.contract["session"]["stop_cancels_future_writes"])
        self.assertIn("phone_requires_explicit_user_confirmed_primary_contact_authority", self.contract["policy_gate"]["rules"])
        self.assertEqual(self.contract["contact_authority"]["default"], "unconfirmed")
        self.assertEqual(self.contract["contact_authority"]["fill_requires"], "user_confirmed_primary")

    def test_manifest_permissions_are_minimal(self) -> None:
        self.assertEqual(self.manifest["manifest_version"], 3)
        self.assertEqual(set(self.manifest["permissions"]), {"activeTab", "scripting", "storage"})
        self.assertNotIn("host_permissions", self.manifest)
        self.assertNotIn("content_scripts", self.manifest)
        self.assertNotIn("background", self.manifest)

    def test_controls_exist(self) -> None:
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
        ):
            self.assertIn(f'id="{control_id}"', self.html)
        self.assertIn("chrome.storage.local.remove", self.popup)
        self.assertIn("MAX_IMPORT_BYTES = 65536", self.popup)
        self.assertIn("escapehatch-application-assist-profile/v2", self.popup)
        self.assertIn("escapehatch-application-assist-profile/v1", self.popup)
        self.assertIn('id="phone_authority"', self.html)
        self.assertIn("user_confirmed_primary", self.popup)
        self.assertIn('files: ["assist-core.js"]', self.popup)
        self.assertIn('files: ["content.js"]', self.popup)

    def test_pipeline_owners_exist_in_runtime(self) -> None:
        self.assertIn("function buildFillPlan", self.core)
        self.assertIn("function policyGate", self.core)
        self.assertIn("function applyFillPlan", self.core)
        self.assertIn("canonical Fill Plan", self.core)
        self.assertIn("function undoLastFill", self.core)
        self.assertIn("function stopSession", self.core)
        self.assertIn("cross_origin_transition", self.core)

    def test_page_runtime_never_submits_navigates_or_networks(self) -> None:
        combined = self.content + "\n" + self.core
        for forbidden in (
            ".submit(",
            ".requestSubmit(",
            ".click(",
            "fetch(",
            "XMLHttpRequest",
            "WebSocket",
            "chrome.tabs",
        ):
            self.assertNotIn(forbidden, combined)
        self.assertIn('querySelectorAll("input, select")', self.core)
        self.assertIn("preserve_existing_value", self.core)
        self.assertIn("phone_contact_not_user_confirmed_primary", self.core)

    def test_repository_contains_no_real_profile_seed(self) -> None:
        combined = self.popup + self.content + self.core + self.html + self.docs
        for marker in ("Richard Perez", "rperez26@northwell.edu", "CheeksMcClappeth"):
            self.assertNotIn(marker, combined)

    def test_docs_describe_control_loop(self) -> None:
        for marker in (
            "Start Assist",
            "Fill Allowed Fields",
            "Pause",
            "Resume",
            "Emergency Stop",
            "Undo Last Fill",
            "canonical Fill Plan",
            "user_confirmed_primary",
            "Load unpacked",
        ):
            self.assertIn(marker, self.docs)


if __name__ == "__main__":
    unittest.main()
