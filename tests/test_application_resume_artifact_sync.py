import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "validate_application_resume_artifact_sync.py"
spec = importlib.util.spec_from_file_location("resume_sync_validator", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

def load_fixture(name: str) -> dict:
    return json.loads((ROOT / "fixtures" / "application-resume-artifact-sync" / name).read_text(encoding="utf-8"))

def test_positive_control_is_durable_ready():
    assert module.validate_manifest(load_fixture("01-durable-ready-positive.json")) == []

def test_local_only_cannot_claim_durable_ready():
    errors = module.validate_manifest(load_fixture("02-local-only-negative.json"))
    assert errors
    assert any("provider read-back" in error for error in errors)
    assert any("drive.pdf_id" in error for error in errors)
    assert any("tracker.resume_pdf_id" in error for error in errors)

def test_tracker_must_match_drive_identity():
    manifest = load_fixture("01-durable-ready-positive.json")
    manifest["tracker"]["resume_pdf_id"] = "stale-pdf-id"
    errors = module.validate_manifest(manifest)
    assert "tracker resume_pdf_id does not match Drive pdf_id" in errors
