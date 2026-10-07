#!/usr/bin/env python3
"""Regression tests: proof inflation fails; honest KEEP with open gate passes."""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from p82_evidence import validate_experiment  # noqa: E402

NEG = ROOT / "fixtures" / "p82-proof-inflation.negative.json"
POS = ROOT / "fixtures" / "p82-proof-inflation.positive-keep.json"


class P82EvidenceTests(unittest.TestCase):
    def test_negative_promotion_inflation_fails(self) -> None:
        record = json.loads(NEG.read_text(encoding="utf-8"))
        errs = validate_experiment(record)
        self.assertTrue(any("insufficient evidence class for promotion" in e for e in errs), errs)

    def test_positive_keep_incomplete_passes(self) -> None:
        record = json.loads(POS.read_text(encoding="utf-8"))
        errs = validate_experiment(record)
        self.assertEqual(errs, [])
        self.assertEqual(record["decision"], "KEEP")
        self.assertFalse(record["promotion_allowed"])

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
