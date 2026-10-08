#!/usr/bin/env python3
"""Regression tests: capability promotion, prototype alignment, rank non-authority."""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from p82_evidence import (  # noqa: E402
    aggregate_capabilities,
    capabilities_for,
    missing_capabilities,
    promotion_allowed,
    ranks,
    satisfies,
    validate_experiment,
    validate_prototype_evidence_alignment,
)

NEG = ROOT / "fixtures" / "p82-proof-inflation.negative.json"
POS = ROOT / "fixtures" / "p82-proof-inflation.positive-keep.json"
FIXTURES = {
    "NEG-1": ROOT / "fixtures" / "p82-neg-host-cannot-prove-policy.json",
    "NEG-2": ROOT / "fixtures" / "p82-neg-device-cannot-prove-browser.json",
    "NEG-3": ROOT / "fixtures" / "p82-neg-play-not-universal.json",
    "NEG-4": ROOT / "fixtures" / "p82-neg-target-as-achieved.json",
    "POS-1": ROOT / "fixtures" / "p82-pos-honest-blocked.json",
    "POS-2": ROOT / "fixtures" / "p82-pos-combined-evidence.json",
}


class P82EvidenceTests(unittest.TestCase):
    def test_negative_promotion_inflation_fails(self) -> None:
        record = json.loads(NEG.read_text(encoding="utf-8"))
        errs = validate_experiment(record)
        self.assertTrue(
            any("missing capabilities" in e or "insufficient evidence capabilities" in e for e in errs),
            errs,
        )

    def test_positive_keep_incomplete_passes(self) -> None:
        record = json.loads(POS.read_text(encoding="utf-8"))
        errs = validate_experiment(record)
        self.assertEqual(errs, [])
        self.assertEqual(record["decision"], "KEEP")
        self.assertFalse(record["promotion_allowed"])

    def test_neg1_host_cannot_prove_policy(self) -> None:
        record = json.loads(FIXTURES["NEG-1"].read_text(encoding="utf-8"))
        errs = validate_experiment(record)
        self.assertTrue(any("play_policy_documentation" in e for e in errs), errs)
        self.assertFalse(promotion_allowed(record))

    def test_neg2_device_cannot_prove_browser(self) -> None:
        record = json.loads(FIXTURES["NEG-2"].read_text(encoding="utf-8"))
        errs = validate_experiment(record)
        self.assertTrue(any("browser_integration" in e for e in errs), errs)
        self.assertEqual(
            missing_capabilities(
                aggregate_capabilities(record),
                record["required_capabilities"],
            ),
            ["browser_integration"],
        )

    def test_neg3_play_not_universal(self) -> None:
        record = json.loads(FIXTURES["NEG-3"].read_text(encoding="utf-8"))
        errs = validate_experiment(record)
        self.assertTrue(errs, "PLAY_RELEASE_OBSERVED must not satisfy device/browser requirements")
        self.assertFalse(promotion_allowed(record))

    def test_neg4_target_cannot_masquerade_as_achieved(self) -> None:
        record = json.loads(FIXTURES["NEG-4"].read_text(encoding="utf-8"))
        errs = validate_experiment(record)
        self.assertTrue(any("achieved_prototype_level" in e for e in errs), errs)
        align = validate_prototype_evidence_alignment(record)
        self.assertTrue(align, align)

    def test_pos1_honest_blocked_passes(self) -> None:
        record = json.loads(FIXTURES["POS-1"].read_text(encoding="utf-8"))
        self.assertEqual(validate_experiment(record), [])
        self.assertFalse(record["promotion_allowed"])
        self.assertEqual(record["achieved_prototype_level"], "P0")
        self.assertEqual(record["target_prototype_level"], "P1")

    def test_pos2_combined_evidence_passes(self) -> None:
        record = json.loads(FIXTURES["POS-2"].read_text(encoding="utf-8"))
        self.assertEqual(validate_experiment(record), [])
        self.assertTrue(promotion_allowed(record))
        caps = aggregate_capabilities(record)
        self.assertIn("browser_integration", caps)
        self.assertIn("physical_device", caps)

    def test_rank_never_authorizes_promotion(self) -> None:
        # HOST_SIMULATION has higher display rank than PLAY_POLICY_DOCUMENTED.
        self.assertGreater(ranks()["HOST_SIMULATION"], ranks()["PLAY_POLICY_DOCUMENTED"])
        self.assertFalse(
            satisfies("HOST_SIMULATION", "PLAY_POLICY_DOCUMENTED"),
            "satisfies must use capabilities, not rank",
        )
        self.assertNotIn("play_policy_documentation", capabilities_for("HOST_SIMULATION"))
        self.assertFalse(
            promotion_allowed(
                {
                    "evidence_class": "HOST_SIMULATION",
                    "required_capabilities": ["play_policy_documentation"],
                    "decision": "PROMOTE",
                    "promotion_allowed": True,
                    "achieved_prototype_level": "P0",
                    "target_prototype_level": "P0",
                }
            )
        )
        # PLAY_RELEASE highest display rank still cannot prove browser/device.
        self.assertGreater(ranks()["PLAY_RELEASE_OBSERVED"], ranks()["BROWSER_OBSERVED"])
        self.assertFalse(
            promotion_allowed(
                {
                    "evidence_class": "PLAY_RELEASE_OBSERVED",
                    "required_capabilities": ["browser_integration", "physical_device"],
                }
            )
        )

    def test_validators_and_runners(self) -> None:
        cmds = [
            [sys.executable, str(ROOT / "scripts" / "run_android_assist_presence_spike.py")],
            [sys.executable, str(ROOT / "scripts" / "validate_p82_evidence.py")],
            [sys.executable, str(ROOT / "scripts" / "validate_application_assist_presence_surface.py")],
            [sys.executable, str(ROOT / "scripts" / "run_eh_m2_experiments.py")],
        ]
        for cmd in cmds:
            proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)


if __name__ == "__main__":
    unittest.main()
