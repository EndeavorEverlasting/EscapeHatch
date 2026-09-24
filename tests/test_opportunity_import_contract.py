#!/usr/bin/env python3
"""Semantic regression tests for the opportunity-import v1 contract."""
from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("validate_opportunity_import", ROOT/"scripts"/"validate_opportunity_import.py")
mod=importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(mod)

class OpportunityImportContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract=mod.load(mod.CONTRACT)
        cls.valid=mod.load(mod.VALID)
        mod.validate_contract(cls.contract)

    def test_positive_preview(self):
        mod.validate_preview(copy.deepcopy(self.valid), self.contract)

    def test_conflict_cannot_auto_accept(self):
        value=copy.deepcopy(self.valid)
        value["candidates"][1]["review_decision"]="auto_accept"
        with self.assertRaises(mod.ImportContractError):
            mod.validate_preview(value,self.contract)

    def test_unknown_fields_are_preserved_in_preview(self):
        candidate=self.valid["candidates"][0]
        self.assertIn("Custom Column", candidate["unmapped_fields"])
        mod.validate_preview(copy.deepcopy(self.valid),self.contract)

    def test_local_import_contract_forbids_provider_proof(self):
        self.assertEqual("forbidden",self.contract["authority"]["provider_proof_from_local_import"])

    def test_expected_revision_is_required(self):
        value=copy.deepcopy(self.valid)
        del value["expected_revision"]
        with self.assertRaises(mod.ImportContractError):
            mod.validate_preview(value,self.contract)

if __name__=="__main__":
    unittest.main(verbosity=2)
