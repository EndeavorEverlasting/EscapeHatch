#!/usr/bin/env python3
"""Fail-closed repository contract checks for private application event observation."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BROWSER = ROOT / "browser" / "application-assist"


class JournalContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = json.loads((ROOT / "contracts/application-event-journal.v1.json").read_text())
        cls.manifest = json.loads((BROWSER / "manifest.json").read_text())
        cls.observer = (BROWSER / "event-observer.js").read_text()
        cls.journal = (BROWSER / "event-journal.js").read_text()
        cls.popup = (BROWSER / "popup.js").read_text()
        cls.html = (BROWSER / "popup.html").read_text()
        cls.modality = json.loads((ROOT / "contracts/application-assist-modality.v1.json").read_text())
        cls.workflow = (ROOT / ".github/workflows/application-assist.yml").read_text()

    def test_authorization_and_scope(self):
        self.assertEqual(self.contract["capture"]["start"], "explicit_operator_action")
        self.assertEqual(self.contract["capture"]["scope"], "current_document_only")
        self.assertEqual(self.contract["capture"]["manifest_permission_change"], "none")
        self.assertEqual(set(self.manifest["permissions"]), {"activeTab", "scripting", "storage"})
        self.assertNotIn("host_permissions", self.manifest)
        self.assertNotIn("background", self.manifest)
        self.assertNotIn("content_scripts", self.manifest)
        self.assertIn('files: ["event-observer.js"]', self.popup)
        self.assertIn("listenCurrentPage", self.popup)

    def test_event_and_storage_safety(self):
        self.assertEqual(self.contract["schema"], "escapehatch/application-event-journal/v1")
        self.assertTrue(self.contract["projection"]["never_infer_submitted"])
        self.assertEqual(self.contract["storage"]["max_events"], 1000)
        for value in self.contract["privacy"].values():
            if isinstance(value, bool):
                self.assertFalse(value)
        self.assertIn("no silent loss", self.journal)
        self.assertIn("submission_verified: false", self.journal)
        self.assertIn('chrome.storage.local.set(', self.observer)
        self.assertIn('document.addEventListener("change"', self.observer)
        self.assertIn('document.addEventListener("submit"', self.observer)
        self.assertIn('document.querySelectorAll("input,select,textarea")', self.observer)
        for forbidden in (".submit(", ".requestSubmit(", "fetch(", "XMLHttpRequest",
                          "WebSocket", "sendBeacon(", ".click(", "document.cookie"):
            self.assertNotIn(forbidden, self.observer)
        self.assertNotIn("file.name", self.observer)
        self.assertNotIn("element.outerHTML", self.observer)
        self.assertNotIn("innerHTML", self.observer)

    def test_user_controls_and_canonical_modality(self):
        names = {cap["id"] for cap in self.modality["capabilities"]}
        for semantic, ui in (
            ("listen_current_page", "listenCurrentPage"),
            ("export_event_journal", "exportEventJournal"),
            ("clear_event_journal", "clearEventJournal"),
        ):
            self.assertIn(semantic, names)
            self.assertIn(f'id="{ui}"', self.html)
            self.assertIn(semantic, self.popup)
        self.assertIn('window.confirm(', self.popup)
        self.assertIn("node tests/test_application_event_journal.mjs", self.workflow)

    def test_receipt_health_and_separate_authorities(self):
        self.assertEqual(self.contract["authority"]["listener"], "read_only_observation")
        self.assertFalse(self.contract["authority"]["observed_values_are_answer_authority"])
        self.assertEqual(set(self.contract["runtime_health"]["states"]), {
            "Listening", "Paused", "Disconnected", "User Action Required", "Review Required", "Stopped"
        })
        self.assertIn("persisted_browser_local_receipt", self.contract["runtime_health"]["listening_requires"])
        self.assertIn("persisted_receipt_required", self.popup)
        self.assertIn("page_changed_reactivate_listener", self.popup)
        self.assertIn("await drainObservation(session)", self.popup)
        self.assertIn("min-width: 320px", self.html)
        self.assertIn("event-evidence-review.js", self.html)
        self.assertIn("node tests/test_application_event_observer.mjs", self.workflow)
        self.assertNotIn("application_id: origin", self.popup)


if __name__ == "__main__":
    unittest.main(verbosity=2)
