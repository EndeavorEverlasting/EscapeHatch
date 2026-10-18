#!/usr/bin/env python3
"""Adversarial contract tests: proving the design cannot silently split/misrepresent the product."""
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_application_source_integration import (  # noqa: E402
    validate, ContractError
)

class IntegratedSourcesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = json.loads((ROOT / "harness/contracts/application-source-integration.v1.json").read_text())
        cls.manifest = json.loads((ROOT / "harness/reports/application-source-ux-p04-dispatch.v1.json").read_text())
        cls.parent = json.loads((ROOT / "harness/contracts/application-autofill-parent.v1.json").read_text())
        cls.doc = (ROOT / "docs/APPLICATION_SOURCE_INTEGRATED_UX_P04_P82_2026-10-18.md").read_text()
        cls.handoffs = (ROOT / "harness/reports/application-source-ux-p04-agent-handoffs.md").read_text()

    def check(self, patch=None, manifest_patch=None, parent_patch=None, document=None, handoffs=None):
        c = copy.deepcopy(self.contract)
        m = copy.deepcopy(self.manifest)
        p = copy.deepcopy(self.parent)
        if patch: patch(c)
        if manifest_patch: manifest_patch(m)
        if parent_patch: parent_patch(p)
        return validate(c, m, self.doc if document is None else document, p,
                        self.handoffs if handoffs is None else handoffs)

    def rejected(self, **kwargs):
        with self.assertRaises(ContractError):
            self.check(**kwargs)

    def test_baseline_passes(self): self.assertIsNone(self.check())

    def test_separate_website_fails(self):
        self.rejected(patch=lambda c: c.update(separate_website_default=True))
        self.rejected(patch=lambda c: c.update(shell="new-standalone-google-app"))

    def test_duplicate_candidate_store_fails(self):
        self.rejected(patch=lambda c: c["views"][0].update(state_owner="separate_google_profile_database"))
        self.rejected(patch=lambda c: c["canonical_authorities"].update(candidate="new_google_profile_store"))

    def test_returning_user_must_not_recreate_google_project(self):
        self.rejected(patch=lambda c: c["connection_modes"][0].update(no_google_cloud_setup=False))

    def test_new_user_must_not_create_developer_oauth_client(self):
        self.rejected(patch=lambda c: c["connection_modes"][1].update(per_user_cloud_project_required=True))

    def test_cross_account_credentials_never_transfer(self):
        self.rejected(patch=lambda c: c["identity"].update(shared_credential_reuse_between_users="ALLOWED"))
        self.rejected(patch=lambda c: c["identity"].update(chatgpt_connector_credentials_transfer="ALLOWED"))

    def test_google_scope_cannot_silently_broaden(self):
        self.rejected(patch=lambda c: c["oauth"].update(preferred_google_scope="https://www.googleapis.com/auth/drive.readonly"))
        self.rejected(patch=lambda c: c["oauth"].update(privileged_broad_drive_scope_default="ALLOWED"))
        self.rejected(patch=lambda c: c["oauth"].update(callback_security=["state"]))

    def test_metadata_is_not_document_content(self):
        self.rejected(patch=lambda c: c["source_pipeline"].remove("EXACT_BYTES_OR_DOC_TEXT_READ"))
        self.rejected(patch=lambda c: c["source_pipeline"].reverse())

    def test_final_submit_and_browser_agent_actions_never_authorized(self):
        self.rejected(patch=lambda c: c["browser_policies"].update(final_submit="AUTOMATIC"))
        self.rejected(patch=lambda c: c["browser_policies"].update(fill="AGENT_BROWSE_AND_TYPE"))

    def test_source_revisions_and_user_review_are_not_optional(self):
        self.rejected(patch=lambda c: c["import_policies"].update(import_idempotent=False))
        self.rejected(patch=lambda c: c["import_policies"].update(conflicting_or_stale_data="LAST_WRITE_WINS"))

    def test_unproven_design_cannot_claim_live(self):
        self.rejected(patch=lambda c: c["verification_gates"][0].update(status="PROVEN_LIVE"))
        self.rejected(patch=lambda c: c.update(release_status="LIVE"))
        self.rejected(manifest_patch=lambda m: m.update(status="DISPATCHED"))

    def test_parent_gates_must_remain_intact(self):
        self.rejected(parent_patch=lambda p: p["required_gates"].pop())
        self.rejected(patch=lambda c: c.update(canonical_owner="docs/DIFFERENT_PLAN.md"))

    def test_dispatch_must_be_complete_ordered_and_acyclic(self):
        self.rejected(manifest_patch=lambda m: m["lanes"].pop())
        self.rejected(manifest_patch=lambda m: m["lanes"][0].update(depends_on=["M1"]))
        self.rejected(manifest_patch=lambda m: m["lanes"][5].update(depends_on=["D1"]))
        self.rejected(manifest_patch=lambda m: m["waves"][1].update(lanes=["A1", "I1"]))

    def test_writers_cannot_collapse_convergence_into_parallel_wave(self):
        self.rejected(manifest_patch=lambda m: m["lanes"][5].update(forbidden=[]))
        self.rejected(manifest_patch=lambda m: m["lanes"][5].update(owned=["some other file"]))

    def test_every_agent_lane_must_have_standalone_handoff(self):
        self.rejected(handoffs=self.handoffs.replace("## D1 —", "## MISSING —"))
        self.rejected(handoffs=self.handoffs.replace("PLANNED_NOT_DISPATCHED", "ALREADY_LAUNCHED"))

    def test_P82_admission_must_remain_falsifiable(self):
        self.rejected(document="We should create a beautiful dashboard and integrate later.")
        self.rejected(document=self.doc.replace("THESIS H1", "FEELING 1"))

if __name__ == "__main__":
    unittest.main()
