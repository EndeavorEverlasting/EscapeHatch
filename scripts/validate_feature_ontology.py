#!/usr/bin/env python3
"""Fail closed on unmapped, stale, duplicate or disconnected tracked paths."""
from __future__ import annotations

import argparse
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MAP = "harness/contracts/feature-ontology.v1.json"
SCENES = "contracts/application-journey-scenes.v1.json"
COVERAGE = {
    "inventory": "all_git_tracked_paths",
    "ownership": "exactly_one_primary_feature",
    "unmapped_allowed": 0,
    "stale_allowed": 0,
    "selectors": "literal_paths_only",
}
ROLES = {"source", "test", "contract", "fixture", "asset", "documentation", "evidence"}
KINDS = {"active_cockpit", "workspace_preview", "startup_recovery"}

class OntologyError(ValueError):
    pass

def require(condition, message):
    if not condition:
        raise OntologyError(message)

def literal(path):
    require(isinstance(path, str) and bool(path) and not any(c in path for c in "*?[]\\\x00"),
            f"not a literal tracked path: {path!r}")
    p = PurePosixPath(path)
    require(not p.is_absolute() and ".." not in p.parts and p.as_posix() == path and path != ".",
            f"noncanonical tracked path: {path!r}")
    return path

def unique_strings(values, label):
    require(isinstance(values, list) and bool(values) and
            all(isinstance(x, str) and x.strip() for x in values), f"invalid or empty {label}")
    require(len(set(values)) == len(values), f"duplicate {label}")
    return set(values)

def load_json(path):
    def strict_object(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, f"duplicate JSON key: {key}")
            result[key] = value
        return result
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=strict_object)

def inventory(root, inventory_file=None):
    # Hooks pass exact Git index/tree inventories for their isolated snapshots.
    # No working-directory glob or extension allowlist can hide a new source.
    if inventory_file is None:
        require((root / ".git").exists(), "Git checkout required; use exact Git inventory for archive validation")
        raw = subprocess.check_output(["git", "-C", str(root), "ls-files", "--cached", "-z"])
    else:
        raw = inventory_file.read_bytes()
    require(bool(raw) and raw.endswith(b"\0"), "missing or malformed NUL-delimited Git inventory")
    paths = raw[:-1].decode("utf-8", errors="strict").split("\0")
    require(len(set(paths)) == len(paths), "duplicate Git index paths (unresolved merge?)")
    return {literal(path) for path in paths}

def validate(ontology, journey, tracked, read_text, exists):
    require(ontology.get("schema") == "escapehatch/feature-ontology/v1", "wrong ontology schema")
    require(ontology.get("coverage") == COVERAGE, "coverage policy must remain exact and zero-tolerance")
    require(ontology.get("scene_authority") == SCENES and journey.get("feature_ontology") == MAP,
            "scene and feature authorities must link to each other")
    features = ontology.get("features")
    require(isinstance(features, list) and bool(features), "missing features")
    owners = {}
    feature_ids = set()
    for feature in features:
        require(isinstance(feature, dict), "invalid feature")
        fid = feature.get("id")
        require(isinstance(fid, str) and re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)+", fid) and
                fid not in feature_ids, f"invalid or duplicate feature: {fid!r}")
        require(fid not in {"unmapped-source", "other-files", "miscellaneous-files", "unknown-owner"},
                f"placeholder feature forbidden: {fid}")
        feature_ids.add(fid)
        require(all(isinstance(feature.get(key), str) and feature[key].strip() for key in ("title", "description")),
                f"feature lacks meaning: {fid}")
        files = feature.get("files")
        require(isinstance(files, list) and bool(files), f"feature has no files: {fid}")
        for entry in files:
            require(isinstance(entry, dict) and set(entry) == {"path", "role"}, f"invalid file entry in {fid}")
            path = literal(entry["path"])
            require(entry["role"] in ROLES, f"invalid file role: {path}")
            require(path not in owners, f"duplicate primary ownership: {path}")
            owners[path] = fid
        for anchor in unique_strings(feature.get("anchors"), f"anchors for {fid}"):
            require(owners.get(literal(anchor)) == fid, f"anchor is not owned by {fid}: {anchor}")
    missing = tracked - owners.keys()
    stale = owners.keys() - tracked
    require(not missing and not stale,
            "unmapped=" + str(len(missing)) + " " + ", ".join(sorted(missing)) +
            "; stale=" + str(len(stale)) + " " + ", ".join(sorted(stale)))
    absent = sorted(path for path in tracked if not exists(path))
    require(not absent, "tracked paths absent from snapshot: " + ", ".join(absent))

    def check_links(row, label):
        ids = unique_strings(row.get("feature_ids"), f"feature links for {label}")
        require(ids <= feature_ids and "journey-guidance" in ids, f"dangling or missing journey feature link: {label}")
        implementations = unique_strings(row.get("implementation_paths"), f"implementation links for {label}")
        require(all(owners.get(literal(p)) in ids for p in implementations),
                f"implementation outside linked features: {label}")
        guide = row.get("avatar_guide", {})
        require(isinstance(guide, dict) and guide.get("copy_owner") and guide.get("next_action_owner"),
                f"missing avatar guidance semantics: {label}")
        require(guide.get("native_runtime_proof") in {"not_certified", "certified"},
                f"missing separate runtime proof state: {label}")
        # Structural bindings are not runtime certification. No promotion by map alone.
        require(guide.get("native_runtime_proof") == "not_certified",
                f"runtime certification requires separate evidence, not this ontology: {label}")
        surfaces = guide.get("surfaces")
        require(isinstance(surfaces, list) and bool(surfaces), f"missing avatar surface: {label}")
        seen = set()
        for surface in surfaces:
            require(isinstance(surface, dict) and set(surface) == {"path", "marker", "kind"},
                    f"invalid avatar surface: {label}")
            path = literal(surface["path"])
            require(owners.get(path) in ids and surface["kind"] in KINDS, f"unmapped avatar surface: {label}: {path}")
            marker = surface["marker"]
            require(isinstance(marker, str) and bool(marker.strip()), f"empty avatar marker: {label}")
            require((path, marker) not in seen, f"duplicate avatar surface: {label}")
            seen.add((path, marker))
            body = read_text(path)
            require(marker in body and "escapehatch-mascot.webp" in body,
                    f"avatar surface no longer present: {label}: {path}")
    scenes = journey.get("scenes")
    require(isinstance(scenes, list) and bool(scenes), "missing canonical scenes")
    scene_ids = unique_strings([s.get("id") for s in scenes], "canonical scene IDs")
    for row in scenes:
        check_links(row, row["id"])
        require(row["avatar_guide"]["copy_owner"] == "coach_prompt" and
                row["avatar_guide"]["next_action_owner"] == "wayfinding.action" and
                row.get("coach_prompt") and row.get("wayfinding", {}).get("action"),
                f"scene guide must use canonical copy/action: {row['id']}")
    stops = journey.get("guide_stops")
    require(isinstance(stops, list) and bool(stops), "missing workspace guide stops")
    unique_strings([s.get("id") for s in stops], "guide stop IDs")
    for row in stops:
        check_links(row, "stop:" + row["id"])
        require(row["avatar_guide"]["copy_owner"] == "detail" and
                row["avatar_guide"]["next_action_owner"] == "action" and row.get("detail") and row.get("action"),
                f"guide stop must use canonical detail/action: {row['id']}")
        require(row.get("host_scene") is None or row["host_scene"] in scene_ids,
                f"unknown host scene: {row['id']}")
    return {"tracked": len(tracked), "mapped": len(owners), "unmapped": 0,
            "stale": 0, "features": len(feature_ids), "scenes": len(scene_ids), "guide_stops": len(stops)}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--inventory", type=Path, help="exact NUL-delimited Git index/tree inventory for snapshot hooks")
    args = parser.parse_args()
    root = args.root.resolve()
    try:
        tracked = inventory(root, args.inventory)
        result = validate(load_json(root / MAP), load_json(root / SCENES), tracked,
                          lambda p: (root / p).read_text(encoding="utf-8"),
                          lambda p: (root / p).is_file())
    except (OntologyError, OSError, ValueError, TypeError, KeyError, AttributeError, subprocess.SubprocessError) as exc:
        print(f"FEATURE_ONTOLOGY: FAIL: {exc}", file=sys.stderr)
        return 1
    print("FEATURE_ONTOLOGY: PASS " + json.dumps(result, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
