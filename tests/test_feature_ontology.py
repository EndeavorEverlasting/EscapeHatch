#!/usr/bin/env python3
"""Negative controls for exact feature and journey coverage."""
import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from validate_feature_ontology import OntologyError, validate, unique_object, JOURNEY


class FeatureOntologyTest(unittest.TestCase):
    def setUp(self):
        self.paths = {JOURNEY, "src/guide.ts"}
        self.routes = {"/"}
        self.journey = {"scenes": [{"id": "HOME", "wayfinding": {"route": "/"}}],
                        "guide_stops": [{"route": "/"}]}
        self.data = {"schema": "escapehatch/feature-ontology/v1",
                     "features": {"tutorial": {"description": "Guide",
                                                "authority": JOURNEY,
                                                "files": sorted(self.paths)}},
                     "journey": {"authority": JOURNEY, "routes": {"/": ["src/guide.ts"]},
                                 "scenes": {"HOME": {"route": "/", "implementation": ["src/guide.ts"],
                                                     "proof": "static_ownership_only"}}}}

    def check(self, data=None, paths=None, routes=None):
        return validate(self.data if data is None else data,
                        self.paths if paths is None else paths, self.journey,
                        self.routes if routes is None else routes)

    def test_complete(self):
        self.assertEqual(self.check()["unmapped"], 0)

    def test_new_source_and_deleted_source(self):
        for paths in (self.paths | {"src/new.ts"}, self.paths - {"src/guide.ts"}):
            with self.assertRaises(OntologyError):
                self.check(paths=paths)

    def test_duplicate_and_glob(self):
        for path in ("src/guide.ts", "src/*.ts"):
            candidate = copy.deepcopy(self.data)
            candidate["features"]["tutorial"]["files"].append(path)
            with self.assertRaises(OntologyError):
                self.check(candidate)

    def test_scene_route_and_implementation_drift(self):
        for field, value in (("route", "/missing"), ("implementation", ["src/missing.ts"]),
                             ("proof", "live_verified")):
            candidate = copy.deepcopy(self.data)
            candidate["journey"]["scenes"]["HOME"][field] = value
            with self.assertRaises(OntologyError):
                self.check(candidate)
        with self.assertRaises(OntologyError):
            self.check(routes={"/", "/new"})
        candidate = copy.deepcopy(self.data)
        candidate["journey"]["scenes"].clear()
        with self.assertRaises(OntologyError):
            self.check(candidate)

    def test_misowned_authority(self):
        candidate = copy.deepcopy(self.data)
        candidate["features"]["tutorial"]["authority"] = "not-mapped"
        with self.assertRaises(OntologyError):
            self.check(candidate)

    def test_duplicate_json_key(self):
        with self.assertRaises(OntologyError):
            json.loads('{"same": 1, "same": 2}', object_pairs_hook=unique_object)


if __name__ == "__main__":
    unittest.main()
