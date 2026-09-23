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
        # Progression extension must exist and original pipeline stays sealed
        self.assertIn("pipeline_extension", self.contract["architecture"])
        self.assertEqual(self.contract["architecture"]["pipeline_extension"]["gate"], "progression_gate")
        self.assertIn("progression_plan", self.contract["architecture"]["pipeline_extension"]["full_pipeline"])
        forbidden = set(self.contract["policy_gate"]["forbidden_actions"])
        self.assertIn("auto_submit", forbidden)
        self.assertNotIn("click_next_or_continue", forbidden, "intermediate navigation is now gated via Progression Plan, not globally forbidden")
        self.assertIn("auto_attestation", forbidden)
        self.assertIn("broad_host_permissions", forbidden)
        self.assertIn("page_runtime_network_requests", forbidden)
        self.assertEqual(self.contract["session"]["cross_origin_transition"], "pause")
        self.assertTrue(self.contract["session"]["stop_cancels_future_writes"])
        self.assertIn("phone_requires_explicit_user_confirmed_primary_contact_authority", self.contract["policy_gate"]["rules"])
        self.assertEqual(self.contract["contact_authority"]["default"], "unconfirmed")
        self.assertEqual(self.contract["contact_authority"]["fill_requires"], "user_confirmed_primary")
        # Progression and account_bootstrap must be present for EH-A0 floor
        self.assertIn("progression", self.contract)
        self.assertIn("account_bootstrap", self.contract)

    def test_progression_gate_machine_defined(self) -> None:
        progression = self.contract.get("progression")
        self.assertIsInstance(progression, dict, "progression contract missing")
        # Decisions / states must contain AUTO_ADVANCE_SAFE and REVIEW_REQUIRED (versioned enums)
        decisions = set(progression.get("decisions", []) + progression.get("states", []) + progression.get("decision_enum", []))
        self.assertIn("AUTO_ADVANCE_SAFE", decisions)
        self.assertIn("REVIEW_REQUIRED", decisions)
        # terminal_forbidden must include submit/apply/certify/captcha/mfa/unknown
        terminal = [str(x).lower() for x in progression.get("terminal_forbidden", [])]
        for required in ["submit", "apply", "certify", "captcha", "mfa", "unknown"]:
            self.assertIn(required, terminal, f"terminal_forbidden must include {required}")
        # Also check manual reasons include expected
        manual_reasons = [str(x).lower() for x in progression.get("terminal_manual_reasons", [])]
        for required in ["final_submit", "captcha_present", "mfa_required"]:
            self.assertTrue(any(required in r for r in manual_reasons), f"terminal_manual_reasons must include {required}")
        # allowed_when gates must be >=8 and include core gates
        allowed = progression.get("allowed_when") or progression.get("intermediate_policy", {}).get("allowed_when") or []
        self.assertIsInstance(allowed, list)
        self.assertGreaterEqual(len(allowed), 8, "allowed_when must have >=8 machine gates")
        # Check that at least these gates are represented
        allowed_text = " ".join(allowed).lower()
        for gate_fragment in ["session_is_active", "page_archetype", "candidate_control", "candidate_is_not_submit", "deterministic_fill", "validation_error", "unknown_manual"]:
            self.assertIn(gate_fragment, allowed_text)
        # Also check intermediate_policy allowed_when_gates length
        inter = progression.get("intermediate_policy", {}).get("allowed_when", [])
        self.assertGreaterEqual(len(inter), 8)
        # loop_guard and final_submit_boundary must exist
        self.assertIn("loop_guard", progression)
        self.assertIn("final_submit_boundary", progression)
        self.assertTrue(progression["final_submit_boundary"].get("never_auto_submit") is True)
        self.assertTrue(progression["loop_guard"].get("require_page_transition") is True)

    def test_account_bootstrap_states_and_secret_handling(self) -> None:
        account = self.contract.get("account_bootstrap")
        self.assertIsInstance(account, dict, "account_bootstrap contract missing")
        states = set(account.get("states", []))
        for required in [
            "APPLICATION_ENTRY",
            "EMAIL_PROBE",
            "EXISTING_ACCOUNT_LOGIN",
            "CREATE_ACCOUNT_CHOICE",
            "ACCOUNT_CREATION",
            "VERIFICATION_REQUIRED",
            "APPLICATION_FORM",
            "AUTH_MISMATCH",
            "CAPTCHA_REQUIRED",
            "MFA_REQUIRED",
            "REVIEW_REQUIRED",
        ]:
            self.assertIn(required, states, f"account_bootstrap.states must include {required}")
        self.assertEqual(account.get("version"), 1)
        self.assertEqual(account.get("initial_state"), "APPLICATION_ENTRY")
        # terminal manual states
        terminal_manual = set(account.get("terminal_manual_states", []))
        for required in ["AUTH_MISMATCH", "CAPTCHA_REQUIRED", "MFA_REQUIRED", "REVIEW_REQUIRED"]:
            self.assertIn(required, terminal_manual)
        # secret handling invariants
        secret = account.get("secret_handling")
        self.assertIsInstance(secret, dict)
        self.assertTrue(secret.get("never_commit") is True, "secret_handling.never_commit must be true")
        self.assertTrue(secret.get("never_log") is True or secret.get("never_log_secret") is True)
        self.assertTrue(secret.get("never_export") is True or secret.get("never_export_secret") is True)
        persistence = secret.get("persistence") or secret.get("storage")
        self.assertEqual(persistence, "session_scoped", "secret persistence must be session_scoped")
        self.assertEqual(secret.get("generation_allowed_only_in"), "ACCOUNT_CREATION")
        self.assertIn("ACCOUNT_CREATION", secret.get("generation_states", []))
        self.assertEqual(secret.get("fixtures"), "synthetic_placeholders_only")

    def test_page_runtime_never_automates_final_submit(self) -> None:
        combined = self.content + "\n" + self.core
        # Page runtime must never auto-submit or bypass network
        for forbidden in (
            ".submit(",
            ".requestSubmit(",
            "fetch(",
            "XMLHttpRequest",
            "WebSocket",
            "chrome.tabs",
        ):
            self.assertNotIn(forbidden, combined, f"page runtime must not contain {forbidden}")
        # Progression gate markers must be present in contract/docs (and ideally runtime comment)
        contract_text = json.dumps(self.contract)
        combined_markers = contract_text + "\n" + self.docs
        # Core may not yet implement click progression; contract/docs must carry the gate proof
        for marker in ("Progression Plan", "progression_gate", "AUTO_ADVANCE_SAFE", "REVIEW_REQUIRED", "terminal_forbidden"):
            self.assertTrue(
                marker in combined_markers or marker in combined,
                f"progression gate marker missing: {marker}",
            )
        # Negative fixture: terminal_forbidden must prevent auto-advance of critical controls
        progression = self.contract.get("progression", {})
        terminal = [str(x).lower() for x in progression.get("terminal_forbidden", [])]
        for blocked in ["submit", "apply", "certify", "attestation", "captcha", "mfa", "unknown"]:
            self.assertIn(blocked, terminal, f"terminal_forbidden must block {blocked} auto-advance")

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
        self.assertIn('const runtimeFiles = command === "advance"', self.popup)
        self.assertIn('["assist-core.js", "progression.js", "navigation-adapter.js"]', self.popup)
        self.assertIn(': ["assist-core.js"];', self.popup)
        self.assertIn("files: runtimeFiles", self.popup)
        self.assertIn('files: ["content.js"]', self.popup)

    def test_phone_authority_popup_fails_closed_across_edits_and_imports(self) -> None:
        self.assertIn("function hasProfileValues", self.popup)
        self.assertIn("PROFILE_KEYS.some", self.popup)
        self.assertIn('document.getElementById("phone").addEventListener("input"', self.popup)
        self.assertIn('authority.value = "unconfirmed"', self.popup)
        self.assertIn("!Array.isArray(rawProfile)", self.popup)
        self.assertIn("schema !== EXPORT_SCHEMA", self.popup)
        self.assertIn('incoming.phone_authority = "unconfirmed"', self.popup)
        self.assertNotIn("if (!Object.keys(profile).length)", self.popup)

    def test_pipeline_owners_exist_in_runtime(self) -> None:
        self.assertIn("function buildFillPlan", self.core)
        self.assertIn("function policyGate", self.core)
        self.assertIn("function applyFillPlan", self.core)
        self.assertIn("canonical Fill Plan", self.core)
        self.assertIn("function undoLastFill", self.core)
        self.assertIn("function stopSession", self.core)
        self.assertIn("cross_origin_transition", self.core)
        self.assertIn("QUESTION_AUTOMATION_POLICY", self.core)
        self.assertIn("function taxonomyAllowsFill", self.core)
        self.assertIn("PREFERENCE_STORAGE_KEY", self.core)
        self.assertIn("function resolveFillValue", self.core)
        self.assertIn("function buildCompanionProgressEvent", self.core)
        self.assertIn("projectProfileToPreferenceStore", self.popup)
        self.assertIn("companion_export", self.popup)
        self.assertEqual(
            self.contract["evidence"]["companion_export_schema"],
            "escapehatch-application-companion-session/v1",
        )
        self.assertEqual(
            self.contract["preference_runtime"]["storage_key"],
            "escapeHatch.applicationQuestionPreferences.v1",
        )

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
        # Also ensure progression and account docs are present
        for marker in (
            "Progression Plan",
            "AUTO_ADVANCE_SAFE",
            "REVIEW_REQUIRED",
            "APPLICATION_ENTRY",
            "ACCOUNT_CREATION",
            "session_scoped",
            "never_commit",
        ):
            self.assertIn(marker, self.docs)


if __name__ == "__main__":
    unittest.main()
