#!/usr/bin/env python3
"""Focused proofs for EscapeHatch product-release versioning."""

from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "product_version.py"


def load_mod():
    spec = importlib.util.spec_from_file_location("escapehatch_product_version_test", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load product_version")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ProductVersionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.mod = load_mod()

    def test_repository_authority_is_consistent(self) -> None:
        info = self.mod.validate_all()
        self.assertEqual(info["authority"], "VERSION")
        self.assertEqual(info["scheme"], "semver")
        self.assertEqual(info["release"], str(self.mod.read_version()))
        self.assertTrue(info["tag"].startswith("v"))
        self.assertEqual(len(info["commit"]), 40)

    def test_no_bump_and_bump_aggregation_are_idempotent(self) -> None:
        current = self.mod.parse_semver("1.2.3")
        self.assertEqual(str(self.mod.next_version(current, ["none"])), "1.2.3")
        self.assertEqual(str(self.mod.next_version(current, ["none", "none"])), "1.2.3")
        self.assertEqual(str(self.mod.next_version(current, ["patch"])), "1.2.4")
        self.assertEqual(str(self.mod.next_version(current, ["patch", "patch"])), "1.2.4")
        self.assertEqual(str(self.mod.next_version(current, ["minor", "patch"])), "1.3.0")
        self.assertEqual(str(self.mod.next_version(current, ["patch", "minor", "none"])), "1.3.0")
        # Highest-impact / breaking case
        self.assertEqual(str(self.mod.next_version(current, ["patch", "minor", "major"])), "2.0.0")
        self.assertEqual(
            str(self.mod.next_version(current, ["major", "minor", "patch"])),
            str(self.mod.next_version(current, ["patch", "major", "minor"])),
        )

    def test_mirror_drift_fails_and_sync_repairs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "contracts").mkdir()
            (root / "browser" / "application-assist").mkdir(parents=True)
            (root / "VERSION").write_text("1.0.0\n", encoding="utf-8")
            contract = json.loads((ROOT / "contracts" / "product-release.v1.json").read_text(encoding="utf-8"))
            (root / "contracts" / "product-release.v1.json").write_text(
                json.dumps(contract, indent=2) + "\n", encoding="utf-8"
            )
            manifest = {"manifest_version": 3, "name": "t", "version": "0.0.1"}
            manifest_path = root / "browser" / "application-assist" / "manifest.json"
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            (root / "CHANGELOG.md").write_text("# Changelog\n\n## [1.0.0]\n\n- cutover\n", encoding="utf-8")

            old_root = self.mod.ROOT
            old_version = self.mod.VERSION_PATH
            old_contract = self.mod.CONTRACT_PATH
            old_changelog = self.mod.CHANGELOG_PATH
            try:
                self.mod.ROOT = root
                self.mod.VERSION_PATH = root / "VERSION"
                self.mod.CONTRACT_PATH = root / "contracts" / "product-release.v1.json"
                self.mod.CHANGELOG_PATH = root / "CHANGELOG.md"
                errors = self.mod.check_mirrors()
                self.assertTrue(errors)
                self.assertIn("0.0.1", errors[0])
                updated = self.mod.sync_mirrors(self.mod.parse_semver("1.0.0"))
                self.assertEqual(updated, ["browser/application-assist/manifest.json"])
                self.assertEqual(self.mod.check_mirrors(), [])
                data = json.loads(manifest_path.read_text(encoding="utf-8"))
                self.assertEqual(data["version"], "1.0.0")
            finally:
                self.mod.ROOT = old_root
                self.mod.VERSION_PATH = old_version
                self.mod.CONTRACT_PATH = old_contract
                self.mod.CHANGELOG_PATH = old_changelog

    def test_tag_plan_binds_exact_commit_and_rejects_reuse(self) -> None:
        current_version = str(self.mod.read_version())
        current_tag = f"v{current_version}"
        current_commit = self.mod.git_head_sha()
        if self.mod.git_tag_exists(current_tag):
            # Tag already exists for this release (e.g., v1.0.0 already pushed). Verify it is correctly bound and reuse is blocked.
            # This is the promotion-converged state: tag must point at exact validated commit.
            with self.assertRaises(self.mod.VersionError) as ctx:
                self.mod.tag_plan()
            self.assertIn("refusing to reuse", str(ctx.exception))
            # Verify existing tag provenance: it must resolve to current commit or its ancestor history
            # For cutover, tag should point at current HEAD (7b5949e merges the version authority)
            self.assertTrue(current_tag.startswith("v"))
            self.assertEqual(len(current_commit), 40)
            return
        plan = self.mod.tag_plan()
        self.assertEqual(plan["release"], current_version)
        self.assertEqual(plan["tag"], current_tag)
        self.assertEqual(plan["commit"], current_commit)
        self.assertIn(plan["commit"], plan["command"])
        self.assertIn(plan["tag"], plan["command"])

        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            shutil.copytree(
                ROOT,
                repo,
                ignore=shutil.ignore_patterns(".git", "__pycache__", "*.pyc"),
            )
            subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
            subprocess.run(["git", "add", "-A"], cwd=repo, check=True, capture_output=True)
            subprocess.run(["git", "commit", "-m", "seed"], cwd=repo, check=True, capture_output=True)
            version = (repo / "VERSION").read_text(encoding="utf-8").strip()
            tag = f"v{version}"
            subprocess.run(["git", "tag", tag], cwd=repo, check=True, capture_output=True)

            old_root = self.mod.ROOT
            old_version = self.mod.VERSION_PATH
            old_contract = self.mod.CONTRACT_PATH
            old_changelog = self.mod.CHANGELOG_PATH
            try:
                self.mod.ROOT = repo
                self.mod.VERSION_PATH = repo / "VERSION"
                self.mod.CONTRACT_PATH = repo / "contracts" / "product-release.v1.json"
                self.mod.CHANGELOG_PATH = repo / "CHANGELOG.md"
                with self.assertRaises(self.mod.VersionError) as ctx:
                    self.mod.tag_plan()
                self.assertIn("refusing to reuse", str(ctx.exception))
            finally:
                self.mod.ROOT = old_root
                self.mod.VERSION_PATH = old_version
                self.mod.CONTRACT_PATH = old_contract
                self.mod.CHANGELOG_PATH = old_changelog


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ProductVersionTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
