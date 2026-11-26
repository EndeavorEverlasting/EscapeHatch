"""Regression checks for strict source ownership and linked avatar scenes."""
from copy import deepcopy
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_feature_ontology import MAP, SCENES, OntologyError, inventory, load_json, validate, validate_tree

class FeatureOntologyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ontology = load_json(ROOT / MAP)
        cls.journey = load_json(ROOT / SCENES)
        cls.tracked = inventory(ROOT)

    def check(self, ontology=None, journey=None, tracked=None, reader=None):
        return validate(ontology if ontology is not None else self.ontology,
                        journey if journey is not None else self.journey,
                        tracked if tracked is not None else self.tracked,
                        reader or (lambda p: (ROOT / p).read_text(encoding="utf-8")),
                        lambda p: (ROOT / p).is_file())

    def test_current_tree_and_every_scene(self):
        result = self.check()
        self.assertEqual(result["tracked"], result["mapped"])
        self.assertEqual(result["unmapped"], 0)
        self.assertEqual(result["stale"], 0)
        self.assertEqual(result["scenes"], len(self.journey["scenes"]))


    def test_exact_head_tree_uses_committed_feature_ontology(self):
        tree = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD^{tree}"]).decode().strip()
        result = validate_tree(ROOT, tree)
        self.assertEqual(result["mapped"], len(self.tracked))
        self.assertEqual(result["unmapped"], 0)

    def test_prospective_merge_tree_rejects_unowned_addition(self):
        """A branch can be green before main changes; the merged tree must still fail."""
        with tempfile.TemporaryDirectory() as temporary:
            env = {**os.environ, "GIT_INDEX_FILE": str(Path(temporary) / "git-index")}
            git = ["git", "-C", str(ROOT)]
            subprocess.check_call(git + ["read-tree", "HEAD"], env=env)
            blob = subprocess.check_output(git + ["hash-object", "-w", "--stdin"],
                                           input=b"synthetic candidate with new unowned path").decode().strip()
            subprocess.check_call(git + ["update-index", "--add", "--cacheinfo",
                                         "100644", blob, "scripts/unmapped-during-merge"], env=env)
            merged_tree = subprocess.check_output(git + ["write-tree"], env=env).decode().strip()
            with self.assertRaisesRegex(OntologyError, "unmapped=1"):
                validate_tree(ROOT, merged_tree)

    def test_tree_lookup_must_use_exact_object_id(self):
        with self.assertRaisesRegex(OntologyError, "exact Git object SHA"):
            validate_tree(ROOT, "HEAD")

    def test_unknown_file_in_already_mapped_directory(self):
        with self.assertRaisesRegex(OntologyError, "unmapped=1"):
            self.check(tracked=self.tracked | {"artifacts/escape-hatch/src/components/new-step.tsx"})

    def test_new_extensionless_source(self):
        with self.assertRaisesRegex(OntologyError, "unmapped=1"):
            self.check(tracked=self.tracked | {"scripts/new-entrypoint"})

    def test_deleted_or_renamed_source(self):
        path = "artifacts/escape-hatch/src/components/guided-start.tsx"
        with self.assertRaisesRegex(OntologyError, "stale=1"):
            self.check(tracked=self.tracked - {path})
        with self.assertRaisesRegex(OntologyError, "unmapped=1"):
            self.check(tracked=(self.tracked - {path}) | {"artifacts/escape-hatch/src/components/renamed-start.tsx"})

    def test_duplicate_ownership(self):
        candidate = deepcopy(self.ontology)
        candidate["features"][1]["files"].append(candidate["features"][0]["files"][0])
        with self.assertRaisesRegex(OntologyError, "duplicate primary"):
            self.check(ontology=candidate)

    def test_wildcard_forbidden(self):
        candidate = deepcopy(self.ontology)
        candidate["features"][0]["files"].append({"path": "scripts/*", "role": "source"})
        with self.assertRaisesRegex(OntologyError, "literal tracked path"):
            self.check(ontology=candidate)

    def test_invalid_anchor(self):
        candidate = deepcopy(self.ontology)
        candidate["features"][0]["anchors"].append("not-present.py")
        with self.assertRaisesRegex(OntologyError, "anchor is not owned"):
            self.check(ontology=candidate)

    def test_dangling_scene_feature(self):
        candidate = deepcopy(self.journey)
        candidate["scenes"][0]["feature_ids"].append("nonexistent-feature")
        with self.assertRaisesRegex(OntologyError, "dangling"):
            self.check(journey=candidate)

    def test_disconnected_scene_implementation(self):
        candidate = deepcopy(self.journey)
        candidate["scenes"][0]["implementation_paths"] = ["AGENTS.md"]
        with self.assertRaisesRegex(OntologyError, "outside linked"):
            self.check(journey=candidate)

    def test_missing_scene_avatar(self):
        candidate = deepcopy(self.journey)
        candidate["scenes"][0]["avatar_guide"]["surfaces"] = []
        with self.assertRaisesRegex(OntologyError, "missing avatar surface"):
            self.check(journey=candidate)

    def test_removed_avatar_render_marker(self):
        surface = self.journey["scenes"][0]["avatar_guide"]["surfaces"][0]
        def without_avatar(path):
            body = (ROOT / path).read_text(encoding="utf-8")
            return body.replace("escapehatch-mascot.webp", "removed.png") if path == surface["path"] else body
        with self.assertRaisesRegex(OntologyError, "avatar surface no longer present"):
            self.check(reader=without_avatar)

    def test_missing_guide_stop_binding(self):
        candidate = deepcopy(self.journey)
        del candidate["guide_stops"][0]["implementation_paths"]
        with self.assertRaisesRegex(OntologyError, "implementation links"):
            self.check(journey=candidate)

    def test_tutorial_voice_cannot_be_disconnected(self):
        candidate = deepcopy(self.journey)
        candidate["scenes"][0]["avatar_guide"]["voice_paths"].remove(candidate["tutorial_voice"]["single_owner"])
        with self.assertRaisesRegex(OntologyError, "unmapped voice binding"):
            self.check(journey=candidate)

    def test_missing_supplemental_surface_fails(self):
        candidate = deepcopy(self.journey)
        candidate["supplemental_guides"].pop()
        with self.assertRaisesRegex(OntologyError, "startup or recorded-outcome"):
            self.check(journey=candidate)

    def test_voice_default_cannot_drift(self):
        candidate = deepcopy(self.journey)
        candidate["tutorial_voice"]["default_enabled"] = False
        with self.assertRaisesRegex(OntologyError, "voice policy"):
            self.check(journey=candidate)


    def test_every_opportunity_decision_has_semantic_owner(self):
        result = self.check()
        self.assertEqual(result["decision_scenes"], 3)
        candidate = deepcopy(self.journey)
        del candidate["opportunity_decision_scenes"][0]["implementation_paths"]
        with self.assertRaisesRegex(OntologyError, "implementation links for decision"):
            self.check(journey=candidate)

    def test_unowned_decision_implementation_fails(self):
        candidate = deepcopy(self.journey)
        candidate["opportunity_decision_scenes"][0]["implementation_paths"] = ["AGENTS.md"]
        with self.assertRaisesRegex(OntologyError, "outside linked features"):
            self.check(journey=candidate)

    def test_no_runtime_proof_inflation(self):
        candidate = deepcopy(self.journey)
        candidate["scenes"][0]["avatar_guide"]["native_runtime_proof"] = "certified"
        with self.assertRaisesRegex(OntologyError, "separate evidence"):
            self.check(journey=candidate)

if __name__ == "__main__":
    unittest.main()
