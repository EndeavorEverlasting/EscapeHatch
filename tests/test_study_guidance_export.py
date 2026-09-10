#!/usr/bin/env python3
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("export_study_guidance", ROOT / "scripts/export_study_guidance.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


class ExportStudyGuidanceTests(unittest.TestCase):
    def setUp(self):
        self.state = json.loads((ROOT / "fixtures/career-state.v1.example.json").read_text(encoding="utf-8"))

    def test_exports_studysyndicate_contract_shape(self):
        packet = mod.export_all(self.state)[0]
        self.assertEqual("guidance-opp-example-llm-001", packet["guidanceId"])
        self.assertEqual("requirements-gap", packet["trigger"]["kind"])
        self.assertEqual("llm.api-integration", packet["concepts"][0]["conceptId"])

    def test_book_metadata_survives_export(self):
        book = mod.export_all(self.state)[0]["resources"][0]
        self.assertEqual("book", book["kind"])
        self.assertEqual("AI Engineering", book["title"])
        self.assertEqual("Chip Huyen", book["author"])
        self.assertEqual(["llm.api-integration"], book["conceptIds"])

    def test_application_origin_is_preserved(self):
        origin = mod.export_all(self.state)[0]["origin"]
        self.assertEqual(
            {"system": "escapehatch", "recordType": "application", "recordId": "app-example"},
            origin,
        )

    def test_legacy_v1_without_guidance_exports_empty_list(self):
        legacy = json.loads(json.dumps(self.state))
        legacy.pop("study_guidance")
        self.assertEqual([], mod.export_all(legacy))

    def test_invalid_optional_book_metadata_is_rejected_before_export(self):
        bad = json.loads(json.dumps(self.state))
        bad["study_guidance"][0]["resources"][0]["author"] = 42
        with self.assertRaisesRegex(mod.ExportError, "author must be a non-empty string"):
            mod.export_all(bad)

    def test_cross_opportunity_application_guidance_is_rejected(self):
        bad = json.loads(json.dumps(self.state))
        other = json.loads(json.dumps(bad["opportunities"][0]))
        other["id"] = "opp-other"
        other["requirements_gaps"] = []
        bad["opportunities"].append(other)
        bad["study_guidance"][0]["opportunity_id"] = "opp-other"
        with self.assertRaisesRegex(mod.ExportError, "application opportunity mismatch"):
            mod.export_all(bad)


if __name__ == "__main__":
    unittest.main(verbosity=2)
