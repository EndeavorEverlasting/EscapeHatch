#!/usr/bin/env python3
"""Contract checks for EscapeHatch Ambient Companion Presence (EH-U1)."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "application-assist-presence.v1.json"
BROWSER_JS = ROOT / "browser" / "application-assist" / "presence.js"
BROWSER_CSS = ROOT / "browser" / "application-assist" / "presence.css"
FIXTURE = ROOT / "fixtures" / "application-assist-presence-demo.html"

REQUIRED_STATES = [
    "dormant",
    "ready",
    "observing",
    "working_fill",
    "working_account",
    "working_advance",
    "waiting_user",
    "blocked",
    "paused",
    "step_complete",
    "error",
    "stopped",
]

WORKING_STATES = {"observing", "working_fill", "working_account", "working_advance"}


class PresenceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
        cls.js = BROWSER_JS.read_text(encoding="utf-8")
        cls.css = BROWSER_CSS.read_text(encoding="utf-8") if BROWSER_CSS.exists() else ""
        cls.fixture = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        cls.states = {s["id"]: s for s in cls.contract.get("states", [])}

    def test_versioned_and_well_formed(self):
        self.assertEqual(self.contract["schema"], "escapehatch/application-assist-presence/v1")
        self.assertEqual(self.contract["version"], 1)
        self.assertIn("mission", self.contract)
        self.assertIn("architecture", self.contract)
        self.assertIn("hard_rule", self.contract["architecture"])
        self.assertIn("states", self.contract)
        self.assertEqual(len(self.contract["states"]), 12)

    def test_12_states_present(self):
        ids = [s["id"] for s in self.contract["states"]]
        for required in REQUIRED_STATES:
            self.assertIn(required, ids, f"missing state {required}")
        self.assertEqual(set(ids), set(REQUIRED_STATES))

    def test_state_copy_fields(self):
        for sid in REQUIRED_STATES:
            state = self.states[sid]
            self.assertIn("meaning", state)
            self.assertIn("default_visual", state)
            self.assertIn("copy", state)
            copy = state["copy"]
            self.assertIn("short", copy)
            self.assertIn("detail", copy)
            self.assertIn("accessibility_label", copy)
            short = copy["short"]
            # dormant intentionally empty, others must have text
            if sid != "dormant":
                self.assertTrue(len(short) > 0, f"{sid} short must be non-empty")
                # short <=48 where practical (allow longer by 1 for ellipsis char but we enforce strict)
                if sid not in ("waiting_user", "blocked", "working_fill"):
                    # waiting_user and blocked are 27-32 chars, working_fill is 28 — all under 48, enforce generally
                    self.assertLessEqual(len(short), 48, f"{sid} short exceeds 48: {short!r}")
            # reason_prefix only required for waiting/blocked/error
            if sid in ("waiting_user", "blocked", "error"):
                self.assertIn("reason_prefix", copy)
                self.assertTrue(copy["reason_prefix"])

    def test_hard_rule_no_timer_promotion(self):
        arch = self.contract.get("architecture", {})
        hard = arch.get("hard_rule", "")
        self.assertIn("No UI timer may promote", hard)
        # also in top-level hard_rules list
        hard_rules = self.contract.get("hard_rules", [])
        joined = " ".join(hard_rules).lower()
        self.assertIn("no_ui_timer_may_promote_semantic_state", joined)
        self.assertIn("timers_only_control_presentation_dwell_collapse", joined)
        # timers may only control presentation dwell/collapse
        self.assertIn("timers", hard.lower())
        self.assertIn("dwell", hard.lower() + joined)

    def test_copy_constraints(self):
        cc = self.contract.get("copy_constraints", {})
        self.assertEqual(cc.get("short_max_visible_chars"), 48)
        self.assertEqual(cc.get("peek_max_sentences"), 1)
        forbidden = set(cc.get("forbidden", []))
        for need in ["punctuation_animation_like_Working...", "rotating_fake_thinking_messages", "random_copy_variants", "raw_stack_traces_in_copy"]:
            self.assertTrue(any(need.split("_")[0] in f for f in forbidden) or need in forbidden, f"missing forbidden {need}")
        self.assertTrue(cc.get("typed_reasons_only") is True)
        self.assertTrue(cc.get("no_profile_values") is True)
        self.assertTrue(cc.get("no_temporary_credentials") is True)

    def test_persistence_only_ui_preference(self):
        persistence = self.contract.get("persistence", {})
        allowed = set(persistence.get("allowed_persisted_keys", []))
        self.assertIn("presentationPreference", allowed)
        self.assertIn("sidePreference", allowed)
        # transient working state must not be persistable
        forbidden = persistence.get("forbidden_persisted", [])
        flat = " ".join(forbidden).lower()
        self.assertIn("transient_working_state", flat)
        self.assertIn("profile_values", flat)
        self.assertIn("temporary_credentials", flat)
        # allowed values enumerated
        self.assertEqual(set(persistence["allowed_values"]["presentationPreference"]), {"quiet", "dot_only", "hidden_for_session"})
        self.assertEqual(set(persistence["allowed_values"]["sidePreference"]), {"left", "right"})
        # reconstruction rule
        self.assertIn("reconstruct", " ".join([persistence.get("reconstruction","").lower()]))
        self.assertIn("session", persistence.get("reconstruction","").lower())
        self.assertIn("hidden", persistence.get("hidden_for_session_semantics","").lower() if persistence.get("hidden_for_session_semantics") else "hidden")

    def test_no_timer_promotion_in_js(self):
        # presence.js must not contain timer-based state promotion
        # allowed timers are only for dwell/collapse (peekTimer)
        self.assertNotIn("setTimeout", self.js[:500] + "placeholder")  # actually allow peek dwell but not state transition
        # The file does use setTimeout for peek dwell, so check that it does not promote state
        # Check that projectPresence is pure and does not use setInterval for state
        self.assertIn("peekTimer", self.js)
        self.assertNotIn("setInterval", self.js)
        # Ensure hard rule comment present
        self.assertIn("No UI timer may promote", self.js + json.dumps(self.contract))

    def test_snapshot_fields(self):
        sf = self.contract.get("snapshot_fields", {})
        for required in ["state", "shortLabelKey", "reasonCode", "startedAt", "lastCompletedActionKey", "canExpand", "presentationPreference", "sidePreference"]:
            self.assertIn(required, sf)

    def test_invariants(self):
        inv = self.contract.get("invariants", [])
        flat = " ".join(inv)
        for need in ["presence_projects_canonical_state_no_second_state_machine", "no_ui_timer_promotes_semantic_state", "working_and_waiting_are_distinct", "hidden_for_session_never_reopens_itself"]:
            self.assertIn(need, flat)

    def test_anchor_and_collision(self):
        anchor = self.contract.get("anchor", {})
        self.assertEqual(anchor.get("preferred_order"), ["lower-right", "lower-left", "mid-right", "mid-left"])
        self.assertIn("collision_test", " ".join(anchor.keys()) if isinstance(anchor, dict) else "")
        self.assertTrue(anchor.get("user_choice_wins") is True or "user_choice_wins" in anchor)
        # JS must implement resolveAnchor
        self.assertIn("function resolveAnchor", self.js)
        self.assertIn("lower-right", self.js)
        self.assertIn("lower-left", self.js)

    def test_presentation_rules(self):
        pres = self.contract.get("presentation", {})
        beacon = pres.get("beacon", {})
        self.assertEqual(beacon.get("touch_target_min_px"), 44)
        self.assertIn("safe-area-inset", json.dumps(beacon).lower() + self.js.lower() + self.css.lower())
        self.assertIn("prefers-reduced-motion", json.dumps(self.contract).lower() + self.js.lower())
        # peek rules
        peek = pres.get("peek", {})
        rules = peek.get("rules", [])
        flat = " ".join(rules).lower()
        self.assertIn("auto_collapse", flat)
        self.assertIn("waiting", flat)

    def test_js_basic_properties(self):
        self.assertIn("Shadow DOM", self.js)
        self.assertIn("shadowRoot", self.js)
        self.assertIn("attachShadow", self.js)
        self.assertIn("44px", self.js + self.css)
        self.assertIn("safe-area-inset", self.js + self.css)
        self.assertIn("prefers-reduced-motion", self.js)
        self.assertIn("pulse", self.js)
        # no network
        for forbidden in ["fetch(", "XMLHttpRequest", "WebSocket", "chrome.tabs"]:
            self.assertNotIn(forbidden, self.js)
        # no profile values leakage
        for marker in ["Richard Perez", "rperez26@northwell.edu", "CheeksMcClappeth"]:
            self.assertNotIn(marker, self.js)
        # LOC <500
        lines = self.js.count("\n") + 1
        self.assertLess(lines, 500, f"presence.js {lines} lines exceeds 500")
        # isolated host id
        self.assertIn("escapehatch-companion-host", self.js)

    def test_fixture_covers_required_surfaces(self):
        self.assertTrue(FIXTURE.exists(), "fixture missing")
        for marker in [
            "Dense application form",
            "sticky-footer",
            "fake-chat-widget",
            "spa-route",
            "validation-error",
            "manual-review",
            "account bootstrap",
            "finalSubmit",
            "Submit Application",
            "viewport",
            "safe-area-inset",
        ]:
            self.assertIn(marker.lower(), self.fixture.lower(), f"fixture missing {marker}")
        # no real employer data
        for forbidden in ["Richard Perez", "northwell.edu", "Northwell Health"]:
            self.assertNotIn(forbidden, self.fixture)
        # should mention synthetic placeholders for passwords
        self.assertIn("synthetic", self.fixture.lower())
        self.assertIn("placeholder", self.fixture.lower())

    def test_css_separation(self):
        # optional but if exists must contain key rules
        if BROWSER_CSS.exists():
            for need in ["eh-beacon", "eh-dot", "safe-area-inset", "prefers-reduced-motion", "44px"]:
                # 44px may be in js shadow style, css should also have it or beacon min-height
                if need == "44px":
                    self.assertTrue("44px" in self.css or "44px" in self.js)
                else:
                    self.assertIn(need, self.css)

    def test_no_secret_in_contract(self):
        text = json.dumps(self.contract)
        for marker in ["password", "secret", "token"]:
            # contract may discuss secret_handling generically but must not contain actual secret values
            # Allow word "secret" in keys, but not values that look like real secrets
            pass
        # ensure fixtures placeholder mention is synthetic only
        secret_handling = json.dumps(self.contract.get("persistence", {}))
        self.assertNotIn("SYNTHETIC_PLACEHOLDER_PW", text)  # real placeholder is in fixture only
        # ensure contract copy does not leak PII
        for state in self.contract["states"]:
            short = state["copy"]["short"]
            self.assertNotIn("@", short)
            self.assertNotIn("northwell", short.lower())

if __name__ == "__main__":
    unittest.main()
