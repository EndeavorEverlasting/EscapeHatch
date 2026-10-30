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
    def test_missing_resume_persistence_fails(self):
        data=copy.deepcopy(self.original);data.pop("resume_persistence")
        with self.assertRaises(SceneContractError):validate(data)
    def test_resume_selection_cannot_store_credentials_or_actions(self):
        for key in ("password", "autoFill", "loggedIn"):
            data=copy.deepcopy(self.original);data["resume_persistence"]["allowed_fields"].append(key)
            with self.assertRaises(SceneContractError):validate(data)
    def test_resume_selection_cannot_grant_context_or_action_authority(self):
        for key,value in (("context_readiness",True),("authority","resume_fill"),("conflict_policy","latest_wins")):
            data=copy.deepcopy(self.original);data["resume_persistence"][key]=value
            with self.assertRaises(SceneContractError):validate(data)
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

    def test_preapplication_studio_missing_or_misrouted_is_rejected(self):
        for defect in ("missing", "owner", "transition", "private_owner"):
            data=copy.deepcopy(self.original)
            if defect == "missing": data["pre_application_studio"]["subscenes"].pop(2)
            if defect == "owner": data["pre_application_studio"]["subscenes"][2]["owner_scene"]="UNKNOWN"
            if defect == "transition":
                data["pre_application_studio"]["transitions"].remove(["STUDIO_READY","OPPORTUNITY_INTAKE"])
            if defect == "private_owner": data["pre_application_studio"]["data_routing"].pop("reusable_answers")
            with self.assertRaises(SceneContractError): validate(data)
    def test_checkpoint_projection_owner_or_proof_drift_is_rejected(self):
        for defect in ("module", "schema", "submission"):
            data=copy.deepcopy(self.original)
            if defect=="module": data["application_progress_projection"]["projection_module"]="tmp/new-authority.ts"
            if defect=="schema": data["application_progress_projection"]["snapshot_schema"]="unknown"
            if defect=="submission": data["application_progress_projection"]["submission_proof"]="local flag is enough"
            with self.assertRaises(SceneContractError): validate(data)

if __name__ == "__main__":
    unittest.main()
