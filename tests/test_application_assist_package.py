"""Synthetic Git/package tests; never read or mutate an installed browser profile."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("application_assist_package", ROOT / "scripts/package_application_assist.py")
PACKAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGE)


class ApplicationAssistPackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="eh-package-fixture-")
        self.root = Path(self.temporary.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.git("init", "--initial-branch=main")
        self.git("config", "user.name", "Synthetic Package Fixture")
        self.git("config", "user.email", "synthetic@example.test")
        self.source = self.repo / "browser/application-assist"
        self.source.mkdir(parents=True)
        self.expected = {
            "manifest.json": json.dumps({"manifest_version": 3, "version": "1.0.0", "permissions": ["storage", "activeTab"], "action": {"default_popup": "popup.html"}}).encode(),
            "popup.html": b"<!doctype html><title>Synthetic package</title>",
            "nested/worker.js": b"// Synthetic committed worker\n",
            "asset.bin": bytes(range(256)),
        }
        for name, content in self.expected.items():
            file = self.source / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(content)
        (self.repo / "unrelated.txt").write_text("outside extension prefix", encoding="utf-8")
        self.git("add", ".")
        self.commit()
        self.head = self.git("rev-parse", "HEAD").decode().strip()
        self.output = self.root / "packages"

    def tearDown(self):
        self.temporary.cleanup()

    def git(self, *arguments, input=None):
        return subprocess.run(["git", *arguments], cwd=self.repo, input=input, check=True, capture_output=True).stdout

    def commit(self):
        self.git("-c", "commit.gpgsign=false", "-c", "core.hooksPath=disabled-fixture-hooks", "commit", "-m", "Synthetic package source")

    def build(self, verify=False):
        return PACKAGE.package_extension(self.repo, self.output, verify_only=verify)

    def test_package_uses_committed_bytes_and_deterministic_provenance_only(self):
        (self.source / "popup.html").write_bytes(b"UNCOMMITTED fixture change")
        (self.source / "untracked-private-fixture.json").write_bytes(b"synthetic untracked data")
        target = self.build()
        self.assertEqual(target, self.output / self.head)
        for name, content in self.expected.items():
            self.assertEqual((target / name).read_bytes(), content)
        self.assertFalse((target / "untracked-private-fixture.json").exists())
        self.assertFalse((target / "unrelated.txt").exists())
        receipt = json.loads((target / "release.json").read_text(encoding="utf-8"))
        self.assertEqual(receipt["schema"], "escapehatch/application-assist-package/v1")
        self.assertEqual(receipt["sourceCommit"], self.head)
        self.assertEqual(receipt["sourceRoot"], "browser/application-assist")
        self.assertEqual(receipt["extensionVersion"], "1.0.0")
        self.assertEqual(receipt["permissions"]["permissions"], ["activeTab", "storage"])
        self.assertEqual(receipt["files"], {name: hashlib.sha256(content).hexdigest() for name, content in self.expected.items()})
        self.assertNotIn(str(self.repo), json.dumps(receipt))
        original = {file.relative_to(target).as_posix(): (file.read_bytes(), file.stat().st_mtime_ns) for file in target.rglob("*") if file.is_file()}
        self.assertEqual(self.build(), target)
        self.assertEqual(self.build(verify=True), target)
        self.assertEqual({file.relative_to(target).as_posix(): (file.read_bytes(), file.stat().st_mtime_ns) for file in target.rglob("*") if file.is_file()}, original)
        other = PACKAGE.package_extension(self.repo, self.root / "other-output")
        self.assertEqual((other / "release.json").read_bytes(), (target / "release.json").read_bytes())

    def test_verification_of_missing_package_never_creates_output(self):
        with self.assertRaisesRegex(PACKAGE.PackageError, "missing"):
            self.build(verify=True)
        self.assertFalse(self.output.exists())

    def test_new_head_creates_new_package_and_preserves_the_previous_release(self):
        first = self.build()
        first_receipt = (first / "release.json").read_bytes()
        (self.source / "popup.html").write_bytes(b"<!doctype html><title>Updated synthetic package</title>")
        self.git("add", "browser/application-assist/popup.html")
        self.commit()
        new_head = self.git("rev-parse", "HEAD").decode().strip()
        with self.assertRaisesRegex(PACKAGE.PackageError, "missing"):
            self.build(verify=True)
        self.assertFalse((self.output / new_head).exists())
        second = self.build()
        self.assertNotEqual(first, second)
        self.assertEqual(second.name, new_head)
        self.assertEqual((second / "popup.html").read_bytes(), (self.source / "popup.html").read_bytes())
        self.assertEqual((first / "popup.html").read_bytes(), self.expected["popup.html"])
        self.assertEqual((first / "release.json").read_bytes(), first_receipt)

    def test_tamper_extra_and_incomplete_packages_fail_without_repair(self):
        for case in ("tampered", "extra", "missing", "metadata", "extra-directory"):
            with self.subTest(case=case):
                target = PACKAGE.package_extension(self.repo, self.root / case)
                if case == "tampered":
                    (target / "popup.html").write_bytes(b"changed fixture bytes")
                elif case == "extra":
                    (target / "extra.txt").write_bytes(b"extra fixture")
                elif case == "missing":
                    (target / "asset.bin").unlink()
                elif case == "metadata":
                    (target / "release.json").write_bytes(b"{}")
                else:
                    (target / "unexpected").mkdir()
                before = {file.relative_to(target).as_posix(): file.read_bytes() for file in target.rglob("*") if file.is_file()}
                with self.assertRaises(PACKAGE.PackageError):
                    PACKAGE.package_extension(self.repo, self.root / case)
                self.assertEqual({file.relative_to(target).as_posix(): file.read_bytes() for file in target.rglob("*") if file.is_file()}, before)

    def test_store_archive_is_deterministic_rooted_and_excludes_receipt(self):
        archive = PACKAGE.package_store_archive(self.repo, self.output)
        other = PACKAGE.package_store_archive(self.repo, self.root / "other")
        self.assertEqual(archive.read_bytes(), other.read_bytes())
        with zipfile.ZipFile(archive) as zipped:
            self.assertEqual(set(zipped.namelist()), set(self.expected))
            self.assertIn("manifest.json", zipped.namelist())
            for name, content in self.expected.items():
                self.assertEqual(zipped.read(name), content)
        metadata = json.loads(archive.with_suffix(".zip.release.json").read_text())
        self.assertEqual(metadata["archive"]["sha256"], hashlib.sha256(archive.read_bytes()).hexdigest())
        self.assertEqual(metadata["sourceCommit"], self.head)
        original = archive.stat().st_mtime_ns
        PACKAGE.package_store_archive(self.repo, self.output, verify_only=True)
        self.assertEqual(archive.stat().st_mtime_ns, original)

    def test_store_archive_missing_tampered_and_partial_fail_closed(self):
        with self.assertRaises(PACKAGE.PackageError):
            PACKAGE.package_store_archive(self.repo, self.output, verify_only=True)
        self.assertFalse(self.output.exists())
        archive = PACKAGE.package_store_archive(self.repo, self.output)
        archive.write_bytes(b"tampered")
        with self.assertRaises(PACKAGE.PackageError):
            PACKAGE.package_store_archive(self.repo, self.output)
        self.assertEqual(archive.read_bytes(), b"tampered")
        archive.unlink()
        with self.assertRaises(PACKAGE.PackageError):
            PACKAGE.package_store_archive(self.repo, self.output)
        self.assertFalse(archive.exists())

    def test_store_archive_changed_metadata_is_preserved_and_rejected(self):
        archive = PACKAGE.package_store_archive(self.repo, self.output)
        metadata = archive.with_suffix(".zip.release.json")
        metadata.write_bytes(b"{}")
        with self.assertRaises(PACKAGE.PackageError):
            PACKAGE.package_store_archive(self.repo, self.output, verify_only=True)
        self.assertEqual(metadata.read_bytes(), b"{}")

    def test_enrollment_never_promotes_package_proof_to_browser_installation(self):
        package = self.build()
        diagnostics = PACKAGE.enrollment_diagnostics(package)
        self.assertEqual(diagnostics["packageState"], "PACKAGE_VERIFIED")
        self.assertEqual(diagnostics["enrollmentState"], "ENROLLMENT_REQUIRED")
        self.assertEqual(diagnostics["installationState"], "UNKNOWN")
        self.assertIsNone(diagnostics["storeUploadArchive"])
        self.assertEqual(diagnostics["sourceCommit"], self.head)
        self.assertIn("Chrome Web Store", diagnostics["consumerAction"])

    def test_committed_symlink_is_rejected_before_output_creation(self):
        # Construct a Git symlink without requiring Windows symlink privileges.
        blob = self.git("hash-object", "-w", "--stdin", input=b"../../outside-fixture").decode().strip()
        self.git("update-index", "--add", "--cacheinfo", f"120000,{blob},browser/application-assist/linked")
        self.commit()
        with self.assertRaisesRegex(PACKAGE.PackageError, "symlinks"):
            self.build()
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
