"""Source-level contract for self-contained mascot distribution and safe updates.

This test cannot prove a user's Windows install; host proof remains mandatory.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SourceDeliveryContract(unittest.TestCase):
    def test_mascot_is_owned_by_the_repository_not_manual_transport(self):
        mascot = ROOT / "artifacts/escape-hatch/public/escapehatch-mascot.webp"
        self.assertTrue(mascot.is_file(), "Bundled approved mascot must be in Git checkout")
        self.assertEqual(mascot.read_bytes()[0:4], b"RIFF")
        self.assertEqual(mascot.read_bytes()[8:12], b"WEBP")
        guide = (ROOT / "artifacts/escape-hatch/src/components/guided-start.tsx").read_text(encoding="utf-8")
        self.assertIn('src="/escapehatch-mascot.webp"', guide)
        shell = (ROOT / "artifacts/escape-hatch/src/App.tsx").read_text(encoding="utf-8")
        self.assertIn("<BirdsongControl />", shell)
        self.assertIn('focusOpportunity=', shell)

    def test_existing_installation_updater_is_consentful_and_non_destructive(self):
        source = (ROOT / "Get-EscapeHatch.cmd").read_text(encoding="utf-8")
        self.assertIn("call :safe_update_existing", source)
        self.assertIn("symbolic-ref --quiet --short HEAD", source)
        self.assertIn("git -C \"%SOURCE%\" status --porcelain", source)
        self.assertIn("ESCAPEHATCH_STATE=STOPPED", source)
        self.assertIn('choice /C YN /N /M "Check for and install verified source updates?', source)
        self.assertIn("git -C \"%SOURCE%\" merge --ff-only FETCH_HEAD", source)
        for forbidden in ("git reset --hard", "git clean -fd", "git pull --force", "taskkill"):
            self.assertNotIn(forbidden, source.lower())

    def test_birdsound_does_not_need_a_private_asset_or_auto_play(self):
        source = (ROOT / "artifacts/escape-hatch/src/components/birdsong-control.tsx").read_text(encoding="utf-8")
        self.assertIn("new window.AudioContext()", source)
        self.assertIn("createOscillator()", source)
        self.assertIn("aria-pressed={enabled}", source)
        self.assertIn("useState(false)", source)
        self.assertNotIn("localStorage", source)
        self.assertNotIn("autoplay", source.lower())


if __name__ == "__main__":
    unittest.main()
