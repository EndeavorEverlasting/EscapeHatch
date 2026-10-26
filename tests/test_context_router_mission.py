"""Source-attributed cross-session brief compaction safety controls."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("context_router", BASE / "scripts/context_router.py")
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)


def example():
    return {
        "schema": "escapehatch-mission-brief/v1",
        "objective": "Prepare an employer application after source verification",
        "decisions": [{"id":"d1","text":"Final Submit stays manual","source_ref":"AGENTS.md",
                       "source_revision":"fixture-commit"}],
        "constraints": [], "unresolved": [], "evidence": []
    }


class MissionTests(unittest.TestCase):
    def test_compact_preserves_provenance(self):
        value = router.compact_mission(example())
        self.assertEqual(value["decisions"][0]["source_revision"], "fixture-commit")
        self.assertEqual(value["objective"], example()["objective"])

    def test_raw_conversation_history_disallowed(self):
        item = example()
        item["raw_transcript"] = "unrelated context"
        with self.assertRaisesRegex(ValueError, "CONTEXT_MISSION_UNBOUNDED_FIELDS"):
            router.compact_mission(item)

    def test_unattributed_facts_rejected(self):
        item = example()
        del item["decisions"][0]["source_ref"]
        with self.assertRaisesRegex(ValueError, "CONTEXT_MISSION_PROVENANCE_REQUIRED"):
            router.compact_mission(item)

    def test_overlong_objective_rejected(self):
        item = example()
        item["objective"] = "x" * 1601
        with self.assertRaisesRegex(ValueError, "CONTEXT_MISSION_OBJECTIVE_INVALID"):
            router.compact_mission(item)

    def test_duplicate_decision_rejected(self):
        item = example()
        item["decisions"].append(dict(item["decisions"][0]))
        with self.assertRaisesRegex(ValueError, "CONTEXT_MISSION_DUPLICATE_ID"):
            router.compact_mission(item)

    def test_full_private_stdout_never_printed(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "repo"
            root.mkdir()
            policy = json.loads((BASE / router.POLICY_PATH).read_text(encoding="utf-8"))
            target = root / router.POLICY_PATH
            target.parent.mkdir(parents=True)
            target.write_text(json.dumps(policy))
            for key, source in policy["sources"].items():
                path = root / source["path"]
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("{}" if path.suffix == ".json" else "# Heading")
            private = Path(d) / "private.json"
            private.write_text(json.dumps(example()))
            output = Path(d) / "receipt.json"
            cmd = [sys.executable, str(BASE / "scripts/context_router.py"), "--root", str(root),
                   "--lane", "general", "--mission-file", str(private), "--output", str(output)]
            result = subprocess.run(cmd, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout)
            self.assertNotIn("Prepare an employer application", result.stdout)
            self.assertEqual(json.loads(output.read_text())["mission_brief"]["objective"],
                             example()["objective"])

if __name__ == "__main__":
    unittest.main()
