#!/usr/bin/env python3
import importlib.util, json, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("export_study_guidance",ROOT/"scripts/export_study_guidance.py")
mod=importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(mod)
class ExportStudyGuidanceTests(unittest.TestCase):
    def setUp(self): self.state=json.loads((ROOT/"fixtures/career-state.v1.example.json").read_text(encoding="utf-8"))
    def test_exports_studysyndicate_contract_shape(self):
        packet=mod.export_all(self.state)[0]
        self.assertEqual("guidance-opp-example-sql-001",packet["guidanceId"])
        self.assertEqual("requirements-gap",packet["trigger"]["kind"])
        self.assertEqual("sql.joins",packet["concepts"][0]["conceptId"])
    def test_book_metadata_survives_export(self):
        book=mod.export_all(self.state)[0]["resources"][0]
        self.assertEqual("book",book["kind"])
        self.assertEqual("Learning SQL",book["title"])
        self.assertEqual("Alan Beaulieu",book["author"])
        self.assertEqual(["sql.joins"],book["conceptIds"])
    def test_application_origin_is_preserved(self):
        origin=mod.export_all(self.state)[0]["origin"]
        self.assertEqual({"system":"escapehatch","recordType":"application","recordId":"app-example"},origin)
if __name__=="__main__": unittest.main(verbosity=2)
