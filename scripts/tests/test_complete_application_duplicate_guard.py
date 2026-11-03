#!/usr/bin/env python3
"""Static regression guard for the EscapeHatch complete-application entrypoints.

These checks protect source-contract ordering; only actual Windows/Framer tests
can prove live execution. They never open an employer browser or submit a form.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
AGENT = ROOT / "scripts/windows/EscapeHatch-AgentCompleteApplication.ps1"
COMPLETE = ROOT / "scripts/windows/EscapeHatch-CompleteApplication.ps1"


class CompleteApplicationReplayGuardTests(unittest.TestCase):
    def test_agent_does_not_override_duplicate_guard(self):
        code = AGENT.read_text(encoding="utf-8-sig")
        self.assertIn("-ConfirmedComplete", code)
        self.assertNotIn("-AllowDuplicateSubmit", code)
        self.assertIn("EscapeHatch-CompleteApplication.ps1", code)

    def test_synced_guard_runs_before_any_browser_preflight(self):
        code = COMPLETE.read_text(encoding="utf-8-sig")
        self.assertIn("ALREADY_SYNCED_NO_SUBMIT", code)
        self.assertIn("$priorEntry.state -eq 'SYNCED'", code)
        self.assertIn("$priorEntry.receipt.opportunityId -eq $OpportunityId", code)
        self.assertLess(code.index("ALREADY_SYNCED_NO_SUBMIT"), code.index("$status = Assert-Prerequisites"))
        self.assertLess(code.index("ALREADY_SYNCED_NO_SUBMIT"), code.index("Write-Step 'REARM_AND_SUBMIT_VIA_PLAYWRIGHT'"))

    def test_existing_framer_201_is_recovered_not_reclicked(self):
        code = COMPLETE.read_text(encoding="utf-8-sig")
        self.assertIn("if ($null -ne $framer -and -not $AllowDuplicateSubmit)", code)
        self.assertIn("New-ReceiptFromFramerProof $framer.Proof", code)
        self.assertIn("FRAMER_FORMS_HTTP_201", code)
        self.assertLess(code.index("RECOVER_EXISTING_FRAMER_201"), code.index("REARM_AND_SUBMIT_VIA_PLAYWRIGHT"))


if __name__ == "__main__":
    unittest.main()
