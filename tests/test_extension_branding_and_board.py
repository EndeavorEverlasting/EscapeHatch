"""Contract-level brand and manifest regression. No private candidate records."""
from pathlib import Path
import json
import hashlib

root = Path(__file__).resolve().parents[1]
asset = root / "artifacts/escape-hatch/public/escapehatch-mascot.webp"
extension_asset = root / "browser/application-assist/escapehatch-mascot.webp"
assert asset.is_file() and extension_asset.is_file(), "First-party mascot missing in extension"
assert hashlib.sha256(asset.read_bytes()).hexdigest() == hashlib.sha256(extension_asset.read_bytes()).hexdigest(), "Extension branding diverged from canonical mascot"
manifest = json.loads((root / "browser/application-assist/manifest.json").read_text())
assert manifest["manifest_version"] == 3
worker = (root / "browser/application-assist/worker.js").read_text()
popup = (root / "browser/application-assist/popup.html").read_text()
assert "chrome.runtime.onInstalled.addListener" in worker
assert "chrome.runtime.onStartup.addListener" in worker
assert "chrome.action.setIcon" in worker
assert "OffscreenCanvas" in worker
assert 'src="escapehatch-mascot.webp"' in popup
assert 'src="job-board-adapter.js"' in popup
assert 'id="jobBoardState"' in popup
print("EXTENSION_BRANDING_AND_PLATFORM_WIRING: PASS (static, not Chrome runtime)")
