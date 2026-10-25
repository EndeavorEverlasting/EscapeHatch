from __future__ import annotations
import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_application_journey import validate, SceneContractError

class SceneContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = json.loads((ROOT/"contracts/application-journey-scenes.v1.json").read_text(encoding="utf-8"))
    def test_exact_source_passes(self):
        validate(copy.deepcopy(self.original))
    def test_reordered_or_missing_scene_fails(self):
        data=copy.deepcopy(self.original);data["scenes"].pop(8)
        with self.assertRaises(SceneContractError):validate(data)
    def test_missing_login_resume_arc_fails(self):
        data=copy.deepcopy(self.original)
        data["transitions"]=[x for x in data["transitions"] if not(x["from"]=="AUTH_RECHECK" and x["to"]=="FORM_PREPARATION")]
        with self.assertRaises(SceneContractError):validate(data)
    def test_automated_submission_forbidden(self):
        data=copy.deepcopy(self.original);data["scenes"][-2]["terminal_submit_automated"]=True
        with self.assertRaises(SceneContractError):validate(data)
    def test_missing_recovery_fails(self):
        data=copy.deepcopy(self.original)
        data["transitions"]=[x for x in data["transitions"] if not(x["from"]=="AUTH_HANDOFF" and x["to"]=="RECOVERY")]
        with self.assertRaises(SceneContractError):validate(data)
    def test_login_is_not_single_poll(self):
        data=copy.deepcopy(self.original);data["auth_handoff"]["confirmed_on"]="first_redirect"
        with self.assertRaises(SceneContractError):validate(data)
    def test_missing_user_credential_guard_fails(self):
        data=copy.deepcopy(self.original);data["user_prompts"]["never_request"].remove("password")
        with self.assertRaises(SceneContractError):validate(data)

if __name__ == "__main__":
    unittest.main()
