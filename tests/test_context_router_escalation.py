"""Negative and positive proof for escalated EscapeHatch context selection."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("context_router", BASE / "scripts/context_router.py")
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)

class EscalationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        policy = json.loads((BASE / router.POLICY_PATH).read_text(encoding="utf-8"))
        target = self.root / router.POLICY_PATH
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(policy))
        for key, source in policy["sources"].items():
            path = self.root / source["path"]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("{}" if path.suffix == ".json" else "# Heading\n## Section\nSOURCE=" + key)

    def tearDown(self):
        self.temp.cleanup()

    def test_source_escalation_retrieves_real_body(self):
        result = router.select(self.root, "context engineering", "context", 50000,
                               require_full=("codebase_map",))
        source = next(s for s in result["selected"] if s["id"] == "codebase_map")
        self.assertEqual(source["mode"], "full")
        self.assertIn("SOURCE=codebase_map", source["payload"])

    def test_unregistered_source_fails(self):
        with self.assertRaisesRegex(ValueError, "CONTEXT_UNREGISTERED_REQUIRED"):
            router.select(self.root, "anything", require_full=("unknown-id",))

    def test_required_missing_source_blocks(self):
        (self.root / "scripts/windows/EscapeHatch-Runtime.ps1").unlink()
        with self.assertRaisesRegex(ValueError, "CONTEXT_REQUIRED_SOURCE_MISSING"):
            router.select(self.root, "anything", require_full=("runtime_manager",))

    def test_full_required_source_never_silently_truncates(self):
        (self.root / "docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md").write_text("example\n" * 15000)
        with self.assertRaisesRegex(ValueError, "CONTEXT_BUDGET_EXCEEDED"):
            router.select(self.root, "application", "application", 32768,
                          require_full=("application_plan",))

    def test_missing_required_application_parent_in_receipt_is_rejected(self):
        receipt = router.select(self.root, "application", "application", 50000)
        receipt["selected"] = [x for x in receipt["selected"] if x["id"] != "application_parent"]
        with self.assertRaisesRegex(ValueError, "CONTEXT_RECEIPT_REQUIRED_SOURCE_OMITTED"):
            router.verify_receipt(self.root, receipt)

    def test_rewriting_selected_payload_breaks_reuse(self):
        receipt = router.select(self.root, "general", "general")
        receipt["selected"][0]["payload"] = "incorrect summary"
        with self.assertRaisesRegex(ValueError, "CONTEXT_RECEIPT_PAYLOAD_MISMATCH"):
            router.verify_receipt(self.root, receipt)

    def test_irrelevant_tool_families_deferred_not_claimed_disabled(self):
        result = router.select(self.root, "Windows startup", "runtime")
        self.assertEqual(result["tool_route"]["recommended"],
                         ["repository.read", "local.runtime.observe"])
        self.assertIn("local.ats.observe", result["tool_route"]["deferred"])
        self.assertFalse(result["tool_route"]["enforced_by_host"])

    def test_duplicate_source_entry_is_rejected(self):
        receipt = router.select(self.root, "general", "general")
        receipt["selected"].append(dict(receipt["selected"][0]))
        with self.assertRaisesRegex(ValueError, "CONTEXT_RECEIPT_DUPLICATE_SOURCE"):
            router.verify_receipt(self.root, receipt)

    def test_baseline_path_symlink_is_rejected_before_read(self):
        external = Path(self.temp.name).parent / (Path(self.temp.name).name + "-baseline-fixture")
        external.write_text("outside fixture")
        path = self.root / "harness/CODEBASE_MAP.md"
        path.unlink()
        try:
            path.symlink_to(external)
            with self.assertRaisesRegex(ValueError, "CONTEXT_BASELINE_SOURCE_ESCAPES_REPOSITORY"):
                router.select(self.root, "general", "general")
        finally:
            external.unlink(missing_ok=True)

    def test_powershell_outline_keeps_hyphenated_names(self):
        src = "function Get-RuntimeState { }\nfunction Start-ColdRuntime { }"
        view = router.outline(src, ".ps1")
        self.assertIn("Get-RuntimeState", view)
        self.assertIn("Start-ColdRuntime", view)

    def test_symlink_escape_blocks(self):
        external = Path(self.temp.name).parent / (Path(self.temp.name).name + "-fixture")
        external.write_text("outside")
        path = self.root / "harness/CODEBASE_MAP.md"
        path.unlink()
        try:
            path.symlink_to(external)
            with self.assertRaisesRegex(ValueError, "CONTEXT_SOURCE_ESCAPES_REPOSITORY"):
                router.select(self.root, "context", "context")
        finally:
            external.unlink(missing_ok=True)

if __name__ == "__main__":
    unittest.main()
