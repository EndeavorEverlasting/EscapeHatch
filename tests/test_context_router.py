"""Deterministic negative and positive cases for the EscapeHatch model-context router."""
import importlib.util
import copy
import hashlib
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
        with self.assertRaisesRegex(ValueError, "CONTEXT_RECEIPT_REQUIRED_SOURCE_OMITTED:governance"):
            router.verify_receipt(self.root, receipt)

    def test_compact_runtime_preserves_entire_canonical_contract_and_raw_digest(self):
        canonical = BASE / 'contracts/local-runtime-lifecycle.v1.json'
        raw = canonical.read_bytes()
        target = self.root / 'contracts/local-runtime-lifecycle.v1.json'
        target.write_bytes(raw)
        receipt = router.select(self.root, 'Windows startup', 'runtime')
        entry = next(e for e in receipt['selected'] if e['id'] == 'runtime_lifecycle')
        self.assertEqual(entry['mode'], 'full')
        self.assertEqual(entry['encoding'], 'compact_json')
        self.assertEqual(entry['format'], 'json-utf8-compact/v1')
        self.assertEqual(entry['sha256'], hashlib.sha256(raw).hexdigest())
        self.assertEqual(entry['bytes'], len(raw))
        contract = json.loads(entry['payload'])
        self.assertEqual(contract, json.loads(raw))
        self.assertEqual(contract['states']['FOREIGN_CONFLICT']['kill_listener'], 'forbidden')
        self.assertFalse(contract['kill_policy']['port_number_alone_sufficient'])
        self.assertIn('never_kill_unknown_listener', contract['invariants'])
        self.assertLess(len(entry['payload'].encode('utf-8')), len(raw))
        router.verify_receipt(self.root, receipt)

    def test_compact_json_preserves_unicode_and_nested_values(self):
        path = self.root / 'contracts/local-runtime-lifecycle.v1.json'
        value = {'text': 'caf\u00e9', 'nested': [None, True, 42, {'rule': 'preserve'}]}
        path.write_text(json.dumps(value, ensure_ascii=False, indent=4), encoding='utf-8')
        receipt = router.select(self.root, 'startup', 'runtime')
        entry = next(e for e in receipt['selected'] if e['id'] == 'runtime_lifecycle')
        self.assertEqual(json.loads(entry['payload']), value)
        self.assertIn('caf\u00e9', entry['payload'])
        router.verify_receipt(self.root, receipt)

    def test_compact_receipt_rejects_encoding_format_and_payload_tampering(self):
        receipt = router.select(self.root, 'startup', 'runtime')
        for field, value in (('encoding', 'text'), ('format', 'json-utf8-compact/v2'),
                             ('payload', '{"missing":"rules"}')):
            with self.subTest(field=field):
                altered = copy.deepcopy(receipt)
                entry = next(e for e in altered['selected'] if e['id'] == 'runtime_lifecycle')
                entry[field] = value
                with self.assertRaisesRegex(ValueError, 'CONTEXT_RECEIPT_(ENCODING|PAYLOAD)_MISMATCH'):
                    router.verify_receipt(self.root, altered)
        for field in ('encoding', 'format'):
            altered = copy.deepcopy(receipt)
            next(e for e in altered['selected'] if e['id'] == 'runtime_lifecycle').pop(field)
            with self.assertRaisesRegex(ValueError, 'CONTEXT_RECEIPT_ENCODING_MISMATCH'):
                router.verify_receipt(self.root, altered)

    def test_compact_receipt_rejects_source_format_change_even_if_json_equivalent(self):
        receipt = router.select(self.root, 'startup', 'runtime')
        path = self.root / 'contracts/local-runtime-lifecycle.v1.json'
        path.write_text('{\n}\n')
        with self.assertRaisesRegex(ValueError, 'CONTEXT_SOURCE_STALE:runtime_lifecycle'):
            router.verify_receipt(self.root, receipt)

    def test_encoding_policy_rejects_unsupported_non_json_and_outline(self):
        policy_path = self.root / router.POLICY_PATH
        original = json.loads(policy_path.read_text())
        for change in ({'encoding': 'gzip'}, {'encoding': None}, {'mode': 'outline'},
                       {'path': 'docs/WINDOWS_RUNTIME_LIFECYCLE.md'}):
            with self.subTest(change=change):
                policy = copy.deepcopy(original)
                policy['sources']['runtime_lifecycle'].update(change)
                policy_path.write_text(json.dumps(policy))
                with self.assertRaisesRegex(ValueError, 'CONTEXT_ENCODING_INVALID:runtime_lifecycle'):
                    router.load_policy(self.root)

    def test_invalid_json_does_not_fall_back_to_partial_context(self):
        (self.root / 'contracts/local-runtime-lifecycle.v1.json').write_text('{invalid')
        with self.assertRaises(json.JSONDecodeError):
            router.select(self.root, 'startup', 'runtime')


if __name__ == "__main__":
    unittest.main()
