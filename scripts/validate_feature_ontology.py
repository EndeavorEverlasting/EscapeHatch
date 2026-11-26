#!/usr/bin/env python3
"""Fail closed on unmapped, stale, duplicate or disconnected tracked paths."""
from __future__ import annotations

import argparse
from functools import lru_cache
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
VOICE = "artifacts/escape-hatch/src/components/tutorial-voice-control.tsx"
VOICE_ROOT = "artifacts/escape-hatch/src/main.tsx"

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

def parse_json(raw):
    def strict_object(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, f"duplicate JSON key: {key}")
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=strict_object)

def load_json(path):
    return parse_json(path.read_text(encoding="utf-8"))

def tree_snapshot(root: Path, tree_sha: str):
    """Read the *actual prospective merge tree*, without changing the index or worktree."""
    require(re.fullmatch(r"[0-9a-f]{40,64}", tree_sha) is not None, "tree must be an exact Git object SHA")
    require((root / ".git").exists(), "Git checkout required for tree validation")
    git = ["git", "-C", str(root)]
    require(subprocess.check_output(git + ["cat-file", "-t", tree_sha]).strip() == b"tree",
            "tree SHA is not a Git tree object")
    raw = subprocess.check_output(git + ["ls-tree", "-r", "-z", "--full-tree", tree_sha])
    require(raw.endswith(b"\0") and bool(raw[:-1]), "empty or malformed Git tree listing")
    entries = {}
    for record in raw[:-1].split(b"\0"):
        metadata, sep, raw_path = record.partition(b"\t")
        require(bool(sep) and bool(raw_path), "malformed Git tree entry")
        parts = metadata.decode("ascii", errors="strict").split(" ")
        require(len(parts) == 3 and parts[1] == "blob" and
                re.fullmatch(r"[0-9a-f]{40,64}", parts[2]) is not None,
                "non-file or invalid Git tree entry")
        path = literal(raw_path.decode("utf-8", errors="strict"))
        require(path not in entries, "duplicate Git tree path: " + path)
        entries[path] = parts[2]
    return entries

def validate_tree(root: Path, tree_sha: str):
    """Fail closed on unmapped paths in a prospective integration result."""
    entries = tree_snapshot(root, tree_sha)
    git = ["git", "-C", str(root)]

    @lru_cache(maxsize=96)
    def tree_text(path):
        require(path in entries, "missing Git tree file: " + path)
        return subprocess.check_output(git + ["cat-file", "blob", entries[path]]).decode("utf-8", errors="strict")

    return validate(parse_json(tree_text(MAP)), parse_json(tree_text(SCENES)),
                    set(entries), tree_text, lambda p: p in entries)

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

    voice = journey.get("tutorial_voice")
    require(voice == {
        "default_enabled": True, "storage_key": "escapehatch.tutorial-voice.v1",
        "copy_authority": "public_canonical_scene_and_stop_text_only",
        "single_owner": VOICE, "root_owner": VOICE_ROOT, "runtime_proof": "not_certified",
    }, "tutorial voice policy, persistence or proof boundary drift")
    require(owners.get(VOICE) == "journey-guidance" and owners.get(VOICE_ROOT) == "cockpit-ui",
            "single voice controller or root is not mapped")
    voice_source = read_text(VOICE)
    require("application-journey-scenes.v1.json" in voice_source and
            "registry.tutorial_voice.storage_key" in voice_source and
            "registry.tutorial_voice.default_enabled" in voice_source and
            "registry.scenes.find" in voice_source and "registry.supplemental_guides.find" in voice_source and
            "speechSynthesis" in voice_source and "TutorialVoiceProvider" in read_text(VOICE_ROOT),
            "voice controller must consume canonical guidance and one mounted provider")

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
        voice_paths = unique_strings(guide.get("voice_paths"), f"voice links for {label}")
        require({VOICE, VOICE_ROOT} <= voice_paths and all(owners.get(literal(p)) in ids for p in voice_paths),
                f"unmapped voice binding: {label}")
        for path in voice_paths - {VOICE, VOICE_ROOT}:
            require("useTutorialGuidance" in read_text(path) or "TutorialVoiceControl" in read_text(path),
                    f"missing voice consumer: {label}: {path}")
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

    decisions = journey.get("opportunity_decision_scenes")
    require(isinstance(decisions, list) and bool(decisions), "missing canonical opportunity decision stages")
    unique_strings([d.get("id") for d in decisions], "opportunity decision IDs")
    for decision in decisions:
        label = "decision:" + decision["id"]
        linked = unique_strings(decision.get("feature_ids"), "feature links for " + label)
        require({"opportunity-tracking", "cockpit-ui"} <= linked and linked <= feature_ids,
                "dangling or missing opportunity decision features: " + label)
        implementations = unique_strings(decision.get("implementation_paths"), "implementation links for " + label)
        require(all(owners.get(literal(path)) in linked for path in implementations),
                "decision implementation outside linked features: " + label)
        require(decision.get("avatar") is True and isinstance(decision.get("coach_prompt"), str)
                and bool(decision["coach_prompt"].strip()), "missing decision avatar coaching: " + label)
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
    supplemental = journey.get("supplemental_guides")
    require(isinstance(supplemental, list), "missing supplemental guides")
    supplemental_ids = unique_strings([s.get("id") for s in supplemental], "supplemental guide IDs")
    require({"workspace-startup", "recorded-outcome"} <= supplemental_ids,
            "startup or recorded-outcome guide missing")
    for row in supplemental:
        check_links(row, "supplemental:" + row["id"])
        require(row["avatar_guide"]["copy_owner"] == "detail" and
                row["avatar_guide"]["next_action_owner"] == "action" and row.get("detail") and row.get("action"),
                f"supplemental guide must use canonical detail/action: {row['id']}")
    return {"tracked": len(tracked), "mapped": len(owners), "unmapped": 0,
            "stale": 0, "features": len(feature_ids), "scenes": len(scene_ids), "decision_scenes": len(decisions), "guide_stops": len(stops), "supplemental_guides": len(supplemental_ids)}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--inventory", type=Path, help="exact NUL-delimited Git index/tree inventory for snapshot hooks")
    parser.add_argument("--tree", help="exact Git TREE SHA for prospective merge admission; checks all tree blobs and their own ontology")
    args = parser.parse_args()
    root = args.root.resolve()
    try:
        require(not (args.tree and args.inventory), "--tree and --inventory are mutually exclusive")
        if args.tree:
            result = validate_tree(root, args.tree)
        else:
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
