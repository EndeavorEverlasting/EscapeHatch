from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "application-autofill.v1.json"
EXT = ROOT / "browser" / "application-autofill"


class ApplicationAutofillContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
        cls.manifest = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))
        cls.popup = (EXT / "popup.js").read_text(encoding="utf-8")
        cls.content = (EXT / "content.js").read_text(encoding="utf-8")
        cls.core = (EXT / "autofill-core.js").read_text(encoding="utf-8")
        cls.html = (EXT / "popup.html").read_text(encoding="utf-8")

    def test_storage_and_portability_contract(self) -> None:
        storage = self.contract["storage"]
        self.assertEqual(storage["browser_storage_key"], "escapeHatch.applicationAutofillProfile.v1")
        self.assertEqual(storage["export_schema"], "escapehatch-application-autofill-profile/v1")
        self.assertEqual(storage["max_import_bytes"], 65536)
        self.assertEqual(storage["clear_behavior"], "remove_entire_storage_key")
        self.assertIn("Clear Profile", storage["controls"])
        self.assertIn("never_execute_imported_content", self.contract["portability_principles"]["adopted"])

    def test_manifest_is_manual_active_tab_only(self) -> None:
        self.assertEqual(self.manifest["manifest_version"], 3)
        self.assertEqual(set(self.manifest["permissions"]), {"activeTab", "scripting", "storage"})
        self.assertNotIn("host_permissions", self.manifest)
        self.assertNotIn("background", self.manifest)
        self.assertNotIn("content_scripts", self.manifest)

    def test_clear_import_export_and_fill_controls_exist(self) -> None:
        for control_id in ("save", "clear", "fill", "export", "import"):
            self.assertIn(f'id="{control_id}"', self.html)
        self.assertIn("chrome.storage.local.remove(STORAGE_KEY)", self.popup)
        self.assertIn("MAX_IMPORT_BYTES = 65536", self.popup)
        self.assertIn('payload.schema_version !== EXPORT_SCHEMA', self.popup)
        self.assertIn('files: ["autofill-core.js"]', self.popup)
        self.assertIn('files: ["content.js"]', self.popup)

    def test_page_runtime_never_submits_navigates_or_networks(self) -> None:
        combined = self.content + "\n" + self.core
        for forbidden in (".submit(", ".requestSubmit(", ".click(", "fetch(", "XMLHttpRequest", "WebSocket", "chrome.tabs"):
            self.assertNotIn(forbidden, combined)
        self.assertIn('querySelectorAll("input, select")', self.core)
        self.assertIn("currentValue(field)", self.core)

    def test_repository_contains_no_real_profile_seed(self) -> None:
        combined = self.popup + self.content + self.core + self.html
        for marker in ("Richard Perez", "rperez26@northwell.edu", "CheeksMcClappeth"):
            self.assertNotIn(marker, combined)


if __name__ == "__main__":
    unittest.main()
