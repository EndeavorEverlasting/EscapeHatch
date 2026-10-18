"""Privacy and idempotency tests for the user-owned source locator registry."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout

MOD = Path(__file__).resolve().parents[1] / "scripts" / "career_source_directory.py"
spec = importlib.util.spec_from_file_location("career_source_directory", MOD)
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


class CareerSourcesTests(unittest.TestCase):
    def test_local_resume_metadata_without_private_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "Private Resume.pdf").write_bytes(b"CONFIDENTIAL RESUME")
            (root / "Another.docx").write_bytes(b"CONFIDENTIAL WORD")
            path = root / "private" / "config.json"
            self.assertEqual(source.register(path, "resumes", "resume_directory", "local_directory", str(root)), "SOURCE_REGISTERED")
            self.assertEqual(source.register(path, "resumes", "resume_directory", "local_directory", str(root)), "UNCHANGED")
            receipt = source.status(path)
            self.assertEqual(receipt["sources"][0]["file_count"], 2)
            report = json.dumps(receipt)
            for secret in ("CONFIDENTIAL", "Private Resume.pdf", str(root)):
                self.assertNotIn(secret, report)

    def test_google_directory_is_not_false_live_proof(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.json"
            source.register(path, "drive", "resume_directory", "google_drive", "https://drive.google.com/drive/folders/1234567890abcdef")
            self.assertEqual(source.status(path)["sources"][0]["status"], "PROVIDER_READ_UNVERIFIED")

    def test_tracker_google_sheet_identity(self):
        url = "https://docs.google.com/spreadsheets/d/1234567890abcdef/edit"
        self.assertEqual(source.normalize("google_drive", url, "application_tracker"),
                         "https://docs.google.com/spreadsheets/d/1234567890abcdef")
        with self.assertRaises(ValueError):
            source.normalize("google_drive", "https://drive.google.com/drive/folders/1234567890abcdef", "application_tracker")

    def test_existing_drive_sharing_urls_normalize_without_secrets(self):
        url = "https://drive.google.com/drive/folders/1234567890abcdef?usp=drivesdk"
        self.assertEqual(source.normalize("google_drive", url, "resume_directory"),
                         "https://drive.google.com/drive/folders/1234567890abcdef")

    def test_local_tracker_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "tracker.csv"
            ledger.write_text("company,status\nexample,saved\n", encoding="utf-8")
            path = Path(tmp) / "sources.json"
            source.register(path, "tracker", "application_tracker", "local_directory", str(ledger))
            self.assertEqual(source.status(path)["sources"][0]["file_count"], 1)

    def test_no_host_spoofing_and_no_path_override(self):
        for url in ("http://drive.google.com/drive/folders/1234567890abcdef",
                    "https://drive.google.com.evil.test/drive/folders/1234567890abcdef",
                    "https://drive.google.com/drive/folders/1234567890abcdef?token=secret"):
            with self.assertRaises(ValueError):
                source.normalize("google_drive", url, "resume_directory")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.json"
            source.register(path, "x", "resume_directory", "local_directory", tmp)
            with self.assertRaisesRegex(ValueError, "SOURCE_ID_CONFLICT"):
                source.register(path, "x", "application_tracker", "local_directory", tmp)

    def test_invalid_manifest_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.json"
            path.write_text('{"schema":"invalid","sources":[]}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "MANIFEST_INVALID"):
                source.load(path)

    def test_cli_does_not_print_locator(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.json"
            output = io.StringIO()
            with redirect_stdout(output):
                self.assertEqual(source.main(["--manifest", str(path), "register", "--id", "r",
                   "--role", "resume_directory", "--provider", "local_directory", "--locator", tmp]), 0)
            self.assertNotIn(tmp, output.getvalue())


if __name__ == "__main__":
    unittest.main()
