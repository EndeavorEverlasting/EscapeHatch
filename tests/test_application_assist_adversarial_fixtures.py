#!/usr/bin/env python3
"""Adversarial fixture regression gate for EscapeHatch Application Assist (EH-A4).

Loads the 12 synthetic adversarial fixtures under fixtures/application-assist-adversarial/
and asserts that each encodes the live-run failure it claims to represent, using the
canonical progression contract in contracts/application-assist-session.v1.json as the
oracle. No real employer/profile data may appear in fixtures; synthetic hostnames must
be https://example.invalid/* and emails must be *@example.invalid.
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "application-assist-session.v1.json"
FIXTURE_DIR = ROOT / "fixtures" / "application-assist-adversarial"

EXPECTED_FIXTURES = [
    "01-email-probe-login-create-account.json",
    "02-account-creation-with-temporary-password.json",
    "03-deterministic-identity-page.json",
    "04-safe-intermediate-next.json",
    "05-visible-validation-error.json",
    "06-unknown-required-field-mismatch.json",
    "07-file-upload-manual-gate.json",
    "08-captcha-mfa-manual-gate.json",
    "09-legal-attestation-manual-gate.json",
    "10-final-review-submit-never-auto.json",
    "11-spa-transition-loop-guard.json",
    "12-user-edited-field-preserved.json",
]

# Forbidden real-data markers (must never appear in repo)
FORBIDDEN_MARKERS = [
    "Richard Perez",
    "rperez26@northwell.edu",
    "northwell.edu",
    "CheeksMcClappeth",
    "rperez26",
]

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


class AdversarialFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not CONTRACT.exists():
            raise FileNotFoundError(f"contract missing: {CONTRACT}")
        cls.contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
        prog = cls.contract.get("progression", {})
        cls.decisions = set(prog.get("decisions", []) + prog.get("states", []) + prog.get("decision_enum", []))
        cls.terminal_forbidden = [str(x).lower() for x in prog.get("terminal_forbidden", [])]
        cls.terminal_manual_reasons = [str(x).lower() for x in prog.get("terminal_manual_reasons", [])]
        # allowed_when gates (12)
        cls.allowed_when = prog.get("allowed_when") or prog.get("intermediate_policy", {}).get("allowed_when") or []
        cls.allowed_when_text = " ".join(cls.allowed_when).lower()
        cls.fixtures = {}
        for name in EXPECTED_FIXTURES:
            path = FIXTURE_DIR / name
            if not path.exists():
                raise FileNotFoundError(f"missing adversarial fixture: {path.relative_to(ROOT)}")
            data = json.loads(path.read_text(encoding="utf-8"))
            cls.fixtures[name] = (path, data)

    def test_all_12_fixtures_present_and_valid_json(self) -> None:
        self.assertEqual(len(self.fixtures), 12, "must have exactly 12 adversarial fixtures")
        for name, (path, data) in self.fixtures.items():
            with self.subTest(fixture=name):
                self.assertIsInstance(data, dict, f"{name} must contain an object")
                self.assertTrue(path.exists())

    def test_contract_oracle_sanity(self) -> None:
        # Contract must define progression decisions and gates per EH-A0 floor
        self.assertIn("AUTO_ADVANCE_SAFE", self.decisions)
        self.assertIn("REVIEW_REQUIRED", self.decisions)
        for required in ["submit", "apply", "certify", "captcha", "mfa", "unknown"]:
            self.assertIn(required, self.terminal_forbidden, f"terminal_forbidden must include {required}")
        for required in ["final_submit", "captcha_present", "mfa_required"]:
            self.assertTrue(any(required in r for r in self.terminal_manual_reasons), f"terminal_manual_reasons must include {required}")
        self.assertGreaterEqual(len(self.allowed_when), 8)
        for fragment in ["session_is_active", "page_archetype", "candidate_control", "candidate_is_not_submit", "deterministic_fill", "validation_error", "unknown_manual"]:
            self.assertIn(fragment, self.allowed_when_text)

    def test_fixture_schema_and_synthetic_hostnames(self) -> None:
        for name, (path, data) in self.fixtures.items():
            with self.subTest(fixture=name):
                self.assertEqual(data.get("schema"), "escapehatch/application-assist-adversarial-fixture/v1", f"{name} schema mismatch")
                self.assertIsInstance(data.get("fixture_id"), str)
                self.assertTrue(data["fixture_id"])
                # url or host must contain example.invalid
                raw = path.read_text(encoding="utf-8")
                self.assertIn("example.invalid", raw, f"{name} must use synthetic example.invalid hostnames")
                # url field check
                urls = []
                if "url" in data and isinstance(data["url"], str):
                    urls.append(data["url"])
                if "host" in data and isinstance(data["host"], str):
                    urls.append(data["host"])
                # also collect sequence urls for fixture 01
                if "account_flow" in data and isinstance(data["account_flow"], dict):
                    for step in data["account_flow"].get("sequence", []):
                        if isinstance(step.get("url"), str):
                            urls.append(step["url"])
                for u in urls:
                    self.assertIn("example.invalid", u, f"{name} url must be synthetic example.invalid: {u}")
                    self.assertTrue(u.startswith("https://"), f"{name} url must be https://: {u}")
                # expected_decision must be valid
                self.assertIn(data.get("expected_decision"), {"AUTO_ADVANCE_SAFE", "REVIEW_REQUIRED"}, f"{name} expected_decision invalid")
                # page_archetype present (or for 01 at top-level plus sequence)
                if "page_archetype" in data:
                    self.assertIsInstance(data["page_archetype"], str)
                    self.assertTrue(data["page_archetype"].strip())
                # Fill Plan and Progression Plan present
                self.assertIn("fill_plan", data, f"{name} must contain fill_plan")
                self.assertIn("progression_plan", data, f"{name} must contain progression_plan")
                fp = data["fill_plan"]
                self.assertEqual(fp.get("schema_version"), "escapehatch-application-fill-plan/v1")
                pp = data["progression_plan"]
                self.assertIn("candidate_control", pp)

    def test_no_real_data_leakage(self) -> None:
        for name, (path, data) in self.fixtures.items():
            with self.subTest(fixture=name):
                raw = path.read_text(encoding="utf-8")
                for marker in FORBIDDEN_MARKERS:
                    self.assertNotIn(marker, raw, f"{name} leaks forbidden marker: {marker}")
                # every email must be synthetic example.invalid
                for email in EMAIL_RE.findall(raw):
                    self.assertTrue(
                        email.lower().endswith("@example.invalid"),
                        f"{name} contains non-synthetic email {email}; only @example.invalid allowed",
                    )
                # synthetic placeholder check: password placeholders must not look like real secrets
                if "TEMP_PLACEHOLDER" in raw:
                    self.assertIn("synthetic", raw.lower(), f"{name} placeholder must be marked synthetic")
                # ensure no real employer-like domains sneaked in; synthetic hosts must be *.example.invalid
                hosts = re.findall(r"https://([A-Za-z0-9.\-]+\.[A-Za-z]{2,})", raw)
                for h in hosts:
                    self.assertTrue(
                        h.lower() == "example.invalid" or h.lower().endswith(".example.invalid"),
                        f"{name} contains non-synthetic host https://{h}; only *.example.invalid allowed",
                    )

    def test_fixtures_01_to_04_are_auto_advance_safe(self) -> None:
        for name in EXPECTED_FIXTURES[0:4]:
            path, data = self.fixtures[name]
            with self.subTest(fixture=name):
                self.assertEqual(data.get("expected_decision"), "AUTO_ADVANCE_SAFE", f"{name} must be AUTO_ADVANCE_SAFE")
                self.assertTrue(data.get("all_gates_pass") is True, f"{name} all_gates_pass must be true for AUTO_ADVANCE_SAFE")
                pp = data["progression_plan"]
                # candidate must not be terminal
                cand = pp.get("candidate_control", {})
                self.assertFalse(cand.get("terminal") is True, f"{name} candidate must not be terminal for AUTO_ADVANCE_SAFE")
                # ensure allowed_when gates not failed: check no_visible_validation_error_present true etc
                self.assertTrue(pp.get("no_visible_validation_error_present") is True, f"{name} validation gate must pass")
                self.assertTrue(pp.get("no_required_unknown_manual_review_control_unresolved") is True)
                self.assertTrue(pp.get("no_file_upload_captcha_mfa_otp_legal_compliance_attestation_demographic_gate_unresolved") is True)
                self.assertTrue(pp.get("advance_budget_loop_guard_not_exceeded") is True)
                # terminal_forbidden must not apply
                self.assertFalse(data.get("terminal_forbidden_applies") is True, f"{name} should not be terminal forbidden")

    def test_fixtures_01_sequence_validates_account_states(self) -> None:
        # Special handling for multi-page fixture 01
        name = "01-email-probe-login-create-account.json"
        path, data = self.fixtures[name]
        with self.subTest(fixture=name):
            flow = data.get("account_flow")
            self.assertIsInstance(flow, dict)
            seq = flow.get("sequence")
            self.assertIsInstance(seq, list)
            self.assertGreaterEqual(len(seq), 3)
            # contract account_bootstrap transitions oracle
            transitions = self.contract.get("account_bootstrap", {}).get("transitions", {})
            # verify each step transitions to allowed next state
            for step in seq:
                self.assertIn("state", step)
                self.assertIn("transition_to", step)
                cur = step["state"]
                nxt = step["transition_to"]
                if cur in transitions:
                    self.assertIn(nxt, transitions[cur], f"{name} step {cur} -> {nxt} not allowed by contract transitions {transitions[cur]}")
                self.assertEqual(step.get("expected_decision"), "AUTO_ADVANCE_SAFE")
            # also verify EMAIL_PROBE string appears and is recognized
            self.assertTrue(any(s["state"] == "EMAIL_PROBE" for s in seq))
            self.assertTrue(any(s["state"] == "ACCOUNT_CREATION" for s in seq))

    def test_fixture_02_placeholder_only(self) -> None:
        name = "02-account-creation-with-temporary-password.json"
        path, data = self.fixtures[name]
        with self.subTest(fixture=name):
            self.assertEqual(data.get("account_state"), "ACCOUNT_CREATION")
            secret = data.get("fill_plan", {}).get("secret_placeholder", {})
            self.assertIn("password_placeholder", json.dumps(secret) if isinstance(secret, dict) else str(secret))
            # placeholder must contain TEMP_PLACEHOLDER and be synthetic
            raw = json.dumps(data)
            self.assertIn("TEMP_PLACEHOLDER", raw)
            self.assertIn("synthetic", raw.lower())
            self.assertEqual(data.get("expected_decision"), "AUTO_ADVANCE_SAFE")
            # synthetic_data may contain temporary_password_placeholder key; value must be placeholder
            synth = data.get("synthetic_data", {})
            placeholder_val = str(synth.get("temporary_password_placeholder", ""))
            if placeholder_val:
                self.assertIn("TEMP_PLACEHOLDER", placeholder_val)
                self.assertIn("SYNTHETIC", placeholder_val.upper())

    def test_fixture_05_validation_error_blocks(self) -> None:
        name = "05-visible-validation-error.json"
        path, data = self.fixtures[name]
        with self.subTest(fixture=name):
            self.assertEqual(data.get("expected_decision"), "REVIEW_REQUIRED")
            self.assertEqual(data.get("expected_reason"), "validation_error_present")
            self.assertEqual(data.get("failed_gate"), "no_visible_validation_error_present")
            pp = data["progression_plan"]
            self.assertFalse(pp.get("no_visible_validation_error_present") is True)
            self.assertIn("validation_error_present", [r.lower() for r in self.contract["progression"]["terminal_manual_reasons"]])
            # visible_validation_errors must be present
            self.assertGreaterEqual(len(data.get("visible_validation_errors", [])), 1)

    def test_fixture_06_unknown_field_mismatch(self) -> None:
        name = "06-unknown-required-field-mismatch.json"
        path, data = self.fixtures[name]
        with self.subTest(fixture=name):
            self.assertEqual(data.get("expected_decision"), "REVIEW_REQUIRED")
            self.assertIn(data.get("expected_reason"), ["unknown_control", "manual_review_required", "unknown_required_field", "unknown_fields_stay_blank"])
            self.assertEqual(data.get("failed_gate"), "no_required_unknown_manual_review_control_unresolved")
            pp = data["progression_plan"]
            self.assertFalse(pp.get("no_required_unknown_manual_review_control_unresolved") is True)
            # denied must contain unknown_fields_stay_blank
            denied = data.get("fill_plan", {}).get("denied", [])
            self.assertTrue(any(d.get("decision") == "unknown_fields_stay_blank" for d in denied))
            joined = " ".join([d.get("question_id") or "" for d in denied]).lower() + " " + data.get("expected_reason", "").lower()
            self.assertTrue(
                "unknown" in joined,
                f"{name} should reference unknown control/mismatch: {joined}",
            )

    def test_fixture_07_file_upload_gate(self) -> None:
        name = "07-file-upload-manual-gate.json"
        path, data = self.fixtures[name]
        with self.subTest(fixture=name):
            self.assertEqual(data.get("expected_decision"), "REVIEW_REQUIRED")
            self.assertEqual(data.get("expected_reason"), "file_upload_required")
            pp = data["progression_plan"]
            self.assertFalse(pp.get("no_file_upload_captcha_mfa_otp_legal_compliance_attestation_demographic_gate_unresolved") is True)
            self.assertTrue(data.get("terminal_forbidden_applies") is True or "file_upload_required" in data.get("terminal_manual_reason", ""))
            denied = data.get("fill_plan", {}).get("denied", [])
            self.assertTrue(any("file" in d.get("decision", "").lower() for d in denied))

    def test_fixture_08_captcha_mfa_gate(self) -> None:
        name = "08-captcha-mfa-manual-gate.json"
        path, data = self.fixtures[name]
        with self.subTest(fixture=name):
            self.assertEqual(data.get("expected_decision"), "REVIEW_REQUIRED")
            self.assertIn(data.get("expected_reason"), ["captcha_present", "mfa_required", "verification_required", "otp_required"])
            self.assertTrue(data.get("terminal_forbidden_applies") is True)
            self.assertTrue(data.get("is_terminal") is True)
            pp = data["progression_plan"]
            cand = pp.get("candidate_control", {})
            # terminal forbidden list must block captcha/mfa
            forbidden = set(self.terminal_forbidden)
            self.assertTrue(bool(forbidden.intersection(set([s.lower() for s in cand.get("terminal_forbidden", [])]))))
            self.assertFalse(pp.get("no_file_upload_captcha_mfa_otp_legal_compliance_attestation_demographic_gate_unresolved") is True)

    def test_fixture_09_legal_attestation_gate(self) -> None:
        name = "09-legal-attestation-manual-gate.json"
        path, data = self.fixtures[name]
        with self.subTest(fixture=name):
            self.assertEqual(data.get("expected_decision"), "REVIEW_REQUIRED")
            self.assertIn(data.get("expected_reason"), ["attestation_required", "legal_compliance_pending", "certification_required", "manual_review_required"])
            self.assertTrue(data.get("terminal_forbidden_applies") is True)
            self.assertTrue(data.get("is_terminal") is True)
            denied = data.get("fill_plan", {}).get("denied", [])
            self.assertTrue(any("attestation" in d.get("decision", "").lower() or "manual_only" in d.get("decision", "").lower() for d in denied))
            pp = data["progression_plan"]
            self.assertFalse(pp.get("no_file_upload_captcha_mfa_otp_legal_compliance_attestation_demographic_gate_unresolved") is True)

    def test_fixture_10_never_auto_activate_submit(self) -> None:
        name = "10-final-review-submit-never-auto.json"
        path, data = self.fixtures[name]
        with self.subTest(fixture=name):
            self.assertEqual(data.get("expected_decision"), "REVIEW_REQUIRED")
            self.assertIn(data.get("expected_reason"), ["final_submit", "apply_action", "attestation_required", "certification_required"])
            self.assertTrue(data.get("never_auto_submit") is True, "final_submit_boundary.never_auto_submit must be true")
            self.assertTrue(data.get("is_terminal") is True)
            self.assertTrue(data.get("is_negative_fixture") is True)
            pp = data["progression_plan"]
            cand = pp.get("candidate_control", {})
            self.assertTrue(cand.get("terminal") is True)
            self.assertTrue(cand.get("is_submit_apply_finish") is True)
            # must contain submit/apply in terminal forbidden
            cand_forbidden = [str(x).lower() for x in cand.get("terminal_forbidden", [])]
            self.assertTrue(any(x in cand_forbidden for x in ["submit", "apply"]))
            contract_forbidden = set(self.terminal_forbidden)
            self.assertIn("submit", contract_forbidden)
            self.assertIn("apply", contract_forbidden)
            # progression must have failed gate candidate_is_not_submit...
            self.assertEqual(data.get("failed_gate"), "candidate_is_not_submit_apply_finish_certify_sign_accept_attestation")
            # ensure not AUTO_ADVANCE_SAFE
            self.assertNotEqual(data.get("expected_decision"), "AUTO_ADVANCE_SAFE")
            # loop guard not exceeded for this fixture is okay, but final gate must still block
            self.assertIn("never_auto_submit", json.dumps(data).lower())

    def test_fixture_11_loop_guard(self) -> None:
        name = "11-spa-transition-loop-guard.json"
        path, data = self.fixtures[name]
        with self.subTest(fixture=name):
            self.assertEqual(data.get("expected_decision"), "REVIEW_REQUIRED")
            self.assertIn(data.get("expected_reason"), ["advance_budget_loop_guard_not_exceeded", "loop_guard_exceeded", "repeated_page"])
            self.assertEqual(data.get("failed_gate"), "advance_budget_loop_guard_not_exceeded")
            self.assertTrue(data.get("is_loop_guard_fixture") is True)
            pp = data["progression_plan"]
            self.assertFalse(pp.get("advance_budget_loop_guard_not_exceeded") is True)
            loop = data.get("loop_guard", {})
            self.assertTrue(loop.get("exceeded") is True or loop.get("current_advances_per_session") >= 20 or loop.get("repeated_page_detected") is True)
            self.assertTrue(pp.get("loop_guard_detail", {}).get("budget_exceeded") is True or loop.get("exceeded") is True)
            # check contract loop_guard expectations
            contract_guard = self.contract.get("progression", {}).get("loop_guard", {})
            self.assertEqual(contract_guard.get("max_advances_per_session"), 20)
            self.assertEqual(contract_guard.get("max_advances_per_page"), 3)
            self.assertTrue(contract_guard.get("require_page_transition") is True)
            self.assertTrue(contract_guard.get("detect_repeated_page") is True)

    def test_fixture_12_user_edited_preserved(self) -> None:
        name = "12-user-edited-field-preserved.json"
        path, data = self.fixtures[name]
        with self.subTest(fixture=name):
            self.assertEqual(data.get("expected_decision"), "AUTO_ADVANCE_SAFE")
            self.assertTrue(data.get("user_edited_field_preserved") is True)
            assertions = data.get("assertions", {})
            self.assertTrue(assertions.get("city_field_preserved") is True)
            self.assertTrue(assertions.get("preserve_existing_and_user_edited_values") is True)
            self.assertEqual(assertions.get("re_gate_decision"), "preserve_existing_value")
            # after_user_edit undo should skip edited field
            undo = data.get("undo_assertion", {})
            after = undo.get("after_user_edit_undo", {})
            self.assertEqual(after.get("undone"), 2)
            self.assertEqual(after.get("skipped"), 1)
            self.assertTrue(after.get("city_skipped") is True)
            self.assertEqual(after.get("city_value_stays"), "User Edited City")
            # re_gate check
            re_gate = data.get("fill_plan", {}).get("re_gate_after_user_edit", {})
            city_gate = re_gate.get("index_1_city", {})
            self.assertTrue(city_gate.get("preserved") is True)
            self.assertEqual(city_gate.get("decision"), "preserve_existing_value")
            self.assertFalse(city_gate.get("should_overwrite") is True)

    def test_all_fixtures_have_consistent_contract_references(self) -> None:
        # Ensure each fixture's expected_reason (if present) is a known contract reason or allowed_when gate failure
        allowed_reasons = set(self.terminal_manual_reasons)
        # also allowed_when gates lowercased are valid reasons
        allowed_reasons.update([g.lower() for g in self.allowed_when])
        # add common variations
        allowed_reasons.update(["unknown_control", "validation_error_present", "file_upload_required", "loop_guard_exceeded", "repeated_page"])
        for name, (path, data) in self.fixtures.items():
            with self.subTest(fixture=name):
                reason = data.get("expected_reason")
                if reason is None:
                    continue
                # reasons may be list in expected_reasons
                reasons = []
                if isinstance(reason, str):
                    reasons = [reason]
                if "expected_reasons" in data:
                    reasons.extend(data["expected_reasons"])
                for r in reasons:
                    self.assertIsInstance(r, str)
                    # must be known or be substring of allowed
                    self.assertTrue(
                        r.lower() in allowed_reasons or any(r.lower() in a for a in allowed_reasons) or any(a in r.lower() for a in allowed_reasons),
                        f"{name} reason {r} not in contract allowed reasons",
                    )

    def test_progression_gates_use_allowed_when_and_terminal_forbidden(self) -> None:
        # Spot-check that terminal forbidden controls are correctly classified as REVIEW_REQUIRED
        for name in ["10-final-review-submit-never-auto.json", "08-captcha-mfa-manual-gate.json", "09-legal-attestation-manual-gate.json"]:
            path, data = self.fixtures[name]
            with self.subTest(fixture=name):
                pp = data["progression_plan"]
                cand = pp.get("candidate_control", {})
                # at least one terminal_forbidden entry must be in contract list (not every extra label needs to be)
                contract_forbidden = set(self.terminal_forbidden)
                cand_forbidden = [str(tf).lower() for tf in cand.get("terminal_forbidden", [])]
                has_match = any(tf in contract_forbidden for tf in cand_forbidden)
                self.assertTrue(has_match, f"{name} must have at least one contract terminal_forbidden match; got {cand_forbidden}")
                # and expected decision must be REVIEW_REQUIRED
                self.assertEqual(data.get("expected_decision"), "REVIEW_REQUIRED")


if __name__ == "__main__":
    unittest.main()
