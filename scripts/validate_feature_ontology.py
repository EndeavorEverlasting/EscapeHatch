#!/usr/bin/env python3
"""Fail closed on tracked-file ownership drift and journey implementation links."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
MAP = "harness/contracts/feature-ontology.v1.json"
JOURNEY = "contracts/application-journey-scenes.v1.json"
APP = "artifacts/escape-hatch/src/App.tsx"


class OntologyError(ValueError):
    pass


def inventory(root: Path, snapshot: bool = False) -> set[str]:
    # Hooks explicitly pass --snapshot for an index/archive projection without .git.
    if snapshot:
        return {p.relative_to(root).as_posix() for p in root.rglob("*")
                if p.is_file() or p.is_symlink()}
    result = subprocess.run(["git", "-C", str(root), "ls-files", "-z"],
                            check=True, capture_output=True)
    return {p.decode("utf-8") for p in result.stdout.split(b"\0") if p}


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise OntologyError(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def read_json(root, path):
    return json.loads((root / path).read_text(encoding="utf-8"),
                      object_pairs_hook=unique_object)


def validate(data: dict, actual: set[str], journey: dict, routes: set[str]) -> dict:
    if data.get("schema") != "escapehatch/feature-ontology/v1":
        raise OntologyError("invalid ontology schema")
    owners = {}
    features = data.get("features", {})
    if not isinstance(features, dict) or not features:
        raise OntologyError("no feature definitions")
    for fid, feature in features.items():
        if not fid or not feature.get("description", "").strip():
            raise OntologyError(f"invalid feature: {fid}")
        files = feature.get("files")
        if not isinstance(files, list) or not files:
            raise OntologyError(f"empty feature: {fid}")
        for path in files:
            if not isinstance(path, str) or not path or PurePosixPath(path).is_absolute() or any(
                x in path for x in ("*", "?", "[", "]", "\\")
            ) or any(part in ("", ".", "..") for part in path.split("/")):
                raise OntologyError(f"nonliteral or unsafe path: {path!r}")
            if path in owners:
                raise OntologyError(f"duplicate ownership: {path} ({owners[path]}, {fid})")
            owners[path] = fid
    missing = sorted(actual - owners.keys())
    stale = sorted(owners.keys() - actual)
    if missing or stale:
        raise OntologyError(f"unmapped={len(missing)} {missing}; stale={len(stale)} {stale}")
    for fid, feature in features.items():
        if feature.get("authority") not in actual:
            raise OntologyError(f"missing feature authority: {fid}")
    graph = data.get("journey", {})
    if graph.get("authority") != JOURNEY:
        raise OntologyError("journey authority drift")
    expected = {s["id"]: s["wayfinding"]["route"] for s in journey["scenes"]}
    if len(expected) != len(journey["scenes"]):
        raise OntologyError("duplicate canonical scene")
    bindings = graph.get("scenes", {})
    route_bindings = graph.get("routes", {})
    if set(bindings) != set(expected):
        raise OntologyError("journey scene mapping drift")
    if set(route_bindings) != routes:
        raise OntologyError("public route mapping drift")
    if not {s["route"] for s in journey["guide_stops"]} <= routes:
        raise OntologyError("guide stop points outside public routes")
    def check_paths(label, paths):
        if not isinstance(paths, list) or not paths or len(paths) != len(set(paths)):
            raise OntologyError(f"missing or duplicate implementation: {label}")
        for path in paths:
            if path not in owners or not path.endswith((".tsx", ".ts", ".js", ".ps1", ".py", ".cmd")):
                raise OntologyError(f"invalid implementation link: {label}: {path}")
    for route, paths in route_bindings.items():
        check_paths(route, paths)
    for sid, route in expected.items():
        item = bindings[sid]
        if item.get("route") != route or route not in route_bindings:
            raise OntologyError(f"scene route drift: {sid}")
        check_paths(sid, item.get("implementation"))
        if not set(item["implementation"]) & set(route_bindings[route]):
            raise OntologyError(f"scene lacks route implementation: {sid}")
        if item.get("proof") != "static_ownership_only":
            raise OntologyError(f"unproved scene proof claim: {sid}")
    return {"tracked": len(actual), "mapped": len(owners), "unmapped": 0,
            "features": len(features), "scenes": len(bindings), "routes": len(routes)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", action="store_true",
                        help="validate a clean index/archive projection only")
    args = parser.parse_args()
    try:
        import re
        routes = set(re.findall(r'<Route path="([^"]+)"', (ROOT / APP).read_text(encoding="utf-8")))
        if not routes:
            raise OntologyError("no public routes discovered")
        report = validate(read_json(ROOT, MAP), inventory(ROOT, args.snapshot),
                          read_json(ROOT, JOURNEY), routes)
    except (OntologyError, OSError, subprocess.CalledProcessError, ValueError, KeyError, TypeError) as exc:
        print(f"FEATURE_ONTOLOGY: FAIL: {exc}", file=sys.stderr)
        return 1
    print("FEATURE_ONTOLOGY: PASS " + json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
