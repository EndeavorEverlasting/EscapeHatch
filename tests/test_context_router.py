"""Deterministic negative and positive cases for the EscapeHatch model-context router."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("context_router", BASE / "scripts/context_router.py")
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)


class ContextRoutingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        policy = json.loads((BASE / router.POLICY_PATH).read_text(encoding="utf-8"))
        dest = self.root / router.POLICY_PATH
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(policy), encoding="utf-8")
        for name, entry in policy["sources"].items():
            path = self.root / entry["path"]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("{}" if path.suffix == ".json" else f"# {name}\n## Ownership\nSOURCE_ID={name}\n",
                            encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_general_excludes_application_and_runtime(self):
        value = router.select(self.root, "fix paragraph spacing", "general", 50000)
        self.assertEqual({s["id"] for s in value["selected"]}, {"governance", "harness_skill"})
        self.assertLess(value["candidate_payload_bytes"], value["baseline_unconditional_bytes"])

    def test_application_preserves_parent_and_governance(self):
        result = router.select(self.root, "prepare ATS application", "auto", 50000)
        self.assertEqual(result["lane"], "application")
        ids = {s["id"] for s in result["selected"]}
        self.assertTrue({"governance", "harness_skill", "application_parent",
                         "application_mapping"}.issubset(ids))
        self.assertNotIn("runtime_manager", ids)

    def test_ambiguous_auto_task_fail_closed_to_general(self):
        self.assertEqual(router.resolve_lane("fix startup and application", "auto",
                                             router.load_policy(self.root)), "general")

    def test_missing_governance_blocks(self):
        (self.root / "AGENTS.md").unlink()
        with self.assertRaisesRegex(ValueError, "CONTEXT_BASELINE_SOURCE_MISSING"):
            router.select(self.root, "anything")

    def test_unsafe_path_blocks(self):
        file = self.root / router.POLICY_PATH
        p = json.loads(file.read_text())
        p["sources"]["governance"]["path"] = "../secrets"
        file.write_text(json.dumps(p))
        with self.assertRaisesRegex(ValueError, "CONTEXT_PATH_UNSAFE"):
            router.select(self.root, "anything")

    def test_budget_never_drops_required_governance(self):
        with self.assertRaisesRegex(ValueError, "CONTEXT_BUDGET_EXCEEDED"):
            router.select(self.root, "anything", budget=12)

    def test_sha_reflects_repository_changes(self):
        before = router.select(self.root, "anything")
        (self.root / "AGENTS.md").write_text("# Updated authority")
        after = router.select(self.root, "anything")
        self.assertNotEqual(before["selected"][0]["sha256"], after["selected"][0]["sha256"])

    def test_unmeasured_host_state_is_not_fabricated(self):
        result = router.select(self.root, "anything")
        self.assertTrue(all(x["status"] == "UNMEASURED" for x in result["external_context"].values()))
        self.assertNotIn("tokens", result)

    def test_trace_keeps_decisions_but_never_raw_lines(self):
        text = "\n".join(["noise"] * 100 + ["ERROR: secret private-value", "BLOCKED: no auth",
                           "PASS: ok"] + ["noise"] * 100)
        lines = router.compact_trace(text, 3)
        self.assertEqual(len(lines), 3)
        self.assertTrue(any("BLOCKED" in line for line in lines))
        self.assertFalse(any("private-value" in line for line in lines))
        self.assertFalse(any("noise" in line for line in lines))

    def test_outlines_selective_not_entire_large_documents(self):
        p = self.root / "harness/CODEBASE_MAP.md"
        p.write_text("# Title\n## Relevant\n" + "noisy-text\n" * 1000)
        result = router.select(self.root, "context routing", "context", 50000)
        row = next(r for r in result["selected"] if r["id"] == "codebase_map")
        self.assertIn("## Relevant", row["payload"])
        self.assertNotIn("noisy-text", row["payload"])

    def test_receipt_invalidates_changed_authority(self):
        receipt = router.select(self.root, "anything")
        router.verify_receipt(self.root, receipt)
        (self.root / "AGENTS.md").write_text("Changed")
        with self.assertRaisesRegex(ValueError, "CONTEXT_SOURCE_STALE"):
            router.verify_receipt(self.root, receipt)

    def test_receipt_invalidates_policy_revision(self):
        receipt = router.select(self.root, "anything")
        p = self.root / router.POLICY_PATH
        p.write_text(p.read_text() + " ")
        with self.assertRaisesRegex(ValueError, "CONTEXT_POLICY_STALE"):
            router.verify_receipt(self.root, receipt)

    def test_receipt_rejects_missing_governance(self):
        receipt = router.select(self.root, "anything")
        receipt["selected"] = [e for e in receipt["selected"] if e["id"] != "governance"]
        with self.assertRaisesRegex(ValueError, "CONTEXT_GOVERNANCE_NOT_PRESENT"):
            router.verify_receipt(self.root, receipt)


if __name__ == "__main__":
    unittest.main()
