"""Adversarial parent-outcome checks: no narrowed completion claims."""
from __future__ import annotations
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("application_autofill_parent", ROOT / "scripts/validate_application_autofill_parent.py")
validator = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(validator)
FIXTURE = json.loads((ROOT / "harness/contracts/application-autofill-parent.v1.json").read_text(encoding="utf-8"))


class ParentOutcomeTests(unittest.TestCase):
    def assert_invalid(self, update):
        data = copy.deepcopy(FIXTURE)
        update(data)
        with self.assertRaises(validator.ParentContractError):
            validator.check(data)

    def test_open_parent_valid_without_runtime_claims(self):
        validator.check(FIXTURE)
        self.assertEqual(FIXTURE["parent_status"], "OPEN")

    def test_resume_read_is_not_completion(self):
        def downgrade(data):
            data["parent_status"] = "COMPLETE"
            data["required_gates"][0]["status"] = "PROVEN_LIVE"
            data["required_gates"][0]["receipt"] = "private/real-read.receipt.json"
        self.assert_invalid(downgrade)

    def test_a_green_pr_is_not_completion(self):
        self.assert_invalid(lambda d: d.update(parent_status="COMPLETE"))

    def test_omit_cross_form_gate_fails(self):
        self.assert_invalid(lambda d: d["required_gates"].pop(2))

    def test_no_nonterminal_progression_fails(self):
        self.assert_invalid(lambda d: d["required_gates"].pop(4))

    def test_missing_browser_runtime_fails(self):
        self.assert_invalid(lambda d: d["required_gates"].pop(7))

    def test_removing_final_submit_authority_fails(self):
        self.assert_invalid(lambda d: d["operator_only"].remove("final_submit"))

    def test_credential_creation_cannot_replace_subtask_reuse(self):
        self.assert_invalid(lambda d: d["downstream_dependencies"].clear())

    def test_live_proof_requires_receipt(self):
        def fake(data):
            data["required_gates"][7]["status"] = "PROVEN_LIVE"
        self.assert_invalid(fake)

    def test_mission_narrowed_to_resume_ingestion_fails(self):
        self.assert_invalid(lambda d: d.update(mission="Read résumés into profile."))

    def test_every_gate_live_with_receipt_may_close(self):
        data = copy.deepcopy(FIXTURE)
        for gate in data["required_gates"]:
            gate["status"] = "PROVEN_LIVE"
            gate["receipt"] = "private-local/evidence/" + gate["gate"].lower() + ".json"
        data["parent_status"] = "COMPLETE"
        validator.check(data)

    def test_fake_evidence_without_live_class_fails(self):
        def bogus(data):
            data["required_gates"][0]["receipt"] = "synthetic/test.json"
        self.assert_invalid(bogus)


if __name__ == "__main__":
    unittest.main()
