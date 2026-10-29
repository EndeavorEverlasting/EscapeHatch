#!/usr/bin/env python3
"""Deterministic, source-pinned context routing for EscapeHatch repository agents.

This is a repository-agent adapter, not a model API. External host prompts,
tools, memories, latency and token use are UNMEASURED until a host supplies them.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLICY_PATH = "harness/context/sources.v1.json"
LANE_HINTS = {
    "application": ("application", "ats", "resume", "cover letter", "employer", "autofill", "puzzle"),
    "runtime": ("launch", "startup", "windows", "bootstrap", "port", "desktop", "installer"),
    "context": ("context", "prompt", "token", "retrieval", "attention", "agent skill"),
    "harness": ("harness", "governance", "validator", "registry", "workflow"),
}


def load_policy(root: Path) -> dict:
    policy = json.loads((root / POLICY_PATH).read_text(encoding="utf-8"))
    if policy.get("schema") != "escapehatch-model-context/v1":
        raise ValueError("CONTEXT_SCHEMA_UNSUPPORTED")
    sources = policy["sources"]
    if not sources:
        raise ValueError("CONTEXT_SOURCE_IDS_INVALID")
    for name, entry in sources.items():
        path = Path(entry["path"])
        if not name or path.is_absolute() or ".." in path.parts or str(path) in ("", "."):
            raise ValueError(f"CONTEXT_PATH_UNSAFE:{name}")
        if entry["mode"] not in ("full", "outline") or entry["authority"] < 2:
            raise ValueError(f"CONTEXT_AUTHORITY_INVALID:{name}")
        if "encoding" in entry and (entry["encoding"] != "compact_json" or
                                     entry["mode"] != "full" or path.suffix.lower() != ".json"):
            raise ValueError(f"CONTEXT_ENCODING_INVALID:{name}")
        if entry.get("always") and not entry.get("required"):
            raise ValueError(f"CONTEXT_ALWAYS_MUST_BE_REQUIRED:{name}")
    if not set(policy["baseline_unconditional"]).issubset(sources):
        raise ValueError("CONTEXT_BASELINE_UNKNOWN_SOURCE")
    if not set(policy["lanes"]).issuperset(LANE_HINTS):
        raise ValueError("CONTEXT_LANES_INCOMPLETE")
    return policy


def resolve_lane(task: str, requested: str, policy: dict) -> str:
    if requested != "auto":
        if requested not in policy["lanes"]:
            raise ValueError("CONTEXT_UNKNOWN_LANE")
        return requested
    matches = [lane for lane, hints in LANE_HINTS.items()
               if any(re.search(r"\b" + re.escape(hint) + r"\b", task.lower()) for hint in hints)]
    return matches[0] if len(matches) == 1 else "general"


def outline(text: str, suffix: str) -> str:
    if suffix == ".json":
        value = json.loads(text)
        return "JSON keys: " + ", ".join(sorted(value) if isinstance(value, dict) else []) + "\n"
    if suffix in (".md", ".markdown"):
        headings = [line.strip() for line in text.splitlines() if re.match(r"^#{1,4} ", line)]
        return "\n".join(headings[:80]) + ("\n[HEADINGS_TRUNCATED]\n" if len(headings) > 80 else "\n")
    symbols = re.findall(r"(?m)^(?:export )?(?:async )?(?:function|class|def)\s+([A-Za-z_][\w-]*)", text)
    return "Symbols: " + ", ".join(symbols[:80]) + (" [TRUNCATED]" if len(symbols) > 80 else "") + "\n"


def render_source(raw: bytes, path: Path, mode: str, encoding: str | None = None) -> str:
    """Render complete JSON without whitespace; source provenance stays on raw bytes."""
    text = raw.decode("utf-8")
    if encoding == "compact_json":
        return json.dumps(json.loads(text), ensure_ascii=False, separators=(",", ":")) + "\n"
    return text if mode == "full" else outline(text, path.suffix)


def select(root: Path, task: str, lane: str = "auto", budget: int = 32768, require_full: tuple[str, ...] = ()) -> dict:
    policy = load_policy(root)
    picked = resolve_lane(task, lane, policy)
    if budget < 1:
        raise ValueError("CONTEXT_BUDGET_INVALID")
    unknown = sorted(set(require_full) - set(policy["sources"]))
    if unknown:
        raise ValueError("CONTEXT_UNREGISTERED_REQUIRED:" + ",".join(unknown))
    original_bytes = 0
    for key in policy["baseline_unconditional"]:
        path = root / policy["sources"][key]["path"]
        if not path.resolve().is_relative_to(root.resolve()):
            raise ValueError(f"CONTEXT_BASELINE_SOURCE_ESCAPES_REPOSITORY:{key}")
        if not path.is_file():
            raise ValueError(f"CONTEXT_BASELINE_SOURCE_MISSING:{key}")
        original_bytes += len(path.read_bytes())
    entries = []
    for key, spec in policy["sources"].items():
        if not (spec.get("always") or picked in spec["triggers"] or key in require_full):
            continue
        path = root / spec["path"]
        if path.resolve().is_relative_to(root.resolve()) is False:
            raise ValueError(f"CONTEXT_SOURCE_ESCAPES_REPOSITORY:{key}")
        if not path.is_file():
            if spec.get("required") or key in require_full:
                raise ValueError(f"CONTEXT_REQUIRED_SOURCE_MISSING:{key}")
            entries.append({"id": key, "path": spec["path"], "state": "MISSING_REFERENCE",
                            "authority": spec["authority"]})
            continue
        raw = path.read_bytes()
        selected_mode = "full" if key in require_full else spec["mode"]
        payload = render_source(raw, path, selected_mode, spec.get("encoding"))
        entries.append({"id": key, "path": spec["path"], "owner": spec["owner"],
                        "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
                        "authority": spec["authority"], "always": spec.get("always", False),
                        "required": spec.get("required", False) or key in require_full, "mode": selected_mode,
                        "payload": payload, "state": "SELECTED"})
        if "encoding" in spec:
            entries[-1].update(encoding=spec["encoding"], format="json-utf8-compact/v1")
    entries.sort(key=lambda e: (not e.get("always", False), e["authority"], e["id"]))
    used_bytes = sum(len(e.get("payload", "").encode("utf-8")) for e in entries)
    if used_bytes > budget:
        raise ValueError(f"CONTEXT_BUDGET_EXCEEDED:{used_bytes}>{budget}:USE_TARGETED_RETRIEVAL")
    return {"schema": "escapehatch-context-selection/v1", "lane": picked,
            "tool_route": {"recommended": policy["tool_routing"][picked],
                           "deferred": sorted(set(sum(policy["tool_routing"].values(), [])) - set(policy["tool_routing"][picked])),
                           "enforced_by_host": False},
            "explicit_required": sorted(set(require_full)),
            "policy_sha256": hashlib.sha256((root / POLICY_PATH).read_bytes()).hexdigest(),
            "baseline_unconditional_bytes": original_bytes, "candidate_payload_bytes": used_bytes,
            "savings_bytes": original_bytes - used_bytes, "selected": entries,
            "external_context": {key: {**val, "status": "UNMEASURED"}
                                 for key, val in policy["external_context"].items()},
            "warning": "Repository-file payload only; host token/latency/cost and private runtime not measured."}


def verify_receipt(root: Path, receipt: dict) -> None:
    """Invalidate missing, altered or stale authority; this is not a signed receipt."""
    policy = load_policy(root)
    if receipt.get("policy_sha256") != hashlib.sha256((root / POLICY_PATH).read_bytes()).hexdigest():
        raise ValueError("CONTEXT_POLICY_STALE")
    lane = receipt.get("lane")
    if lane not in policy["lanes"]:
        raise ValueError("CONTEXT_RECEIPT_LANE_INVALID")
    explicit = receipt.get("explicit_required", [])
    if not isinstance(explicit, list) or any(x not in policy["sources"] for x in explicit):
        raise ValueError("CONTEXT_RECEIPT_REQUIRED_INVALID")
    found = set()
    for entry in receipt.get("selected", []):
        key = entry.get("id")
        if key not in policy["sources"] or entry.get("path") != policy["sources"][key]["path"]:
            raise ValueError("CONTEXT_RECEIPT_SOURCE_MISMATCH")
        if key in found:
            raise ValueError("CONTEXT_RECEIPT_DUPLICATE_SOURCE")
        found.add(key)
        expected = policy["sources"][key]
        path = root / entry["path"]
        if not path.resolve().is_relative_to(root.resolve()):
            raise ValueError("CONTEXT_RECEIPT_SOURCE_ESCAPES_REPOSITORY")
        if not path.is_file() or entry.get("sha256") != hashlib.sha256(path.read_bytes()).hexdigest():
            raise ValueError(f"CONTEXT_SOURCE_STALE:{key}")
        mode = "full" if key in explicit else expected["mode"]
        if entry.get("mode") != mode:
            raise ValueError(f"CONTEXT_RECEIPT_MODE_MISMATCH:{key}")
        if entry.get("encoding") != expected.get("encoding") or entry.get("format") != (
                "json-utf8-compact/v1" if expected.get("encoding") == "compact_json" else None):
            raise ValueError(f"CONTEXT_RECEIPT_ENCODING_MISMATCH:{key}")
        if entry.get("payload") != render_source(path.read_bytes(), path, mode, expected.get("encoding")):
            raise ValueError(f"CONTEXT_RECEIPT_PAYLOAD_MISMATCH:{key}")
    required = {key for key, source in policy["sources"].items()
                if source.get("always") or (source.get("required") and lane in source["triggers"])}
    required.update(explicit)
    if not required.issubset(found):
        raise ValueError("CONTEXT_RECEIPT_REQUIRED_SOURCE_OMITTED:" + ",".join(sorted(required - found)))



def compact_mission(value: dict) -> dict:
    """Bounded, source-attributed mission facts; never drop required decisions."""
    if not isinstance(value, dict) or value.get("schema") != "escapehatch-mission-brief/v1":
        raise ValueError("CONTEXT_MISSION_SCHEMA_INVALID")
    permitted = {"schema", "objective", "decisions", "constraints", "unresolved", "evidence"}
    if set(value) - permitted:
        raise ValueError("CONTEXT_MISSION_UNBOUNDED_FIELDS")
    objective = value.get("objective")
    if not isinstance(objective, str) or not objective.strip() or len(objective) > 1600:
        raise ValueError("CONTEXT_MISSION_OBJECTIVE_INVALID")
    result = {"schema": "escapehatch-mission-brief/v1", "objective": objective.strip()}
    for field in ("decisions", "constraints", "unresolved", "evidence"):
        items = value.get(field, [])
        if not isinstance(items, list) or len(items) > 32:
            raise ValueError(f"CONTEXT_MISSION_ITEMS_INVALID:{field}")
        output = []
        ids = set()
        for item in items:
            if not isinstance(item, dict) or set(item) != {"id", "text", "source_ref", "source_revision"}:
                raise ValueError(f"CONTEXT_MISSION_PROVENANCE_REQUIRED:{field}")
            if any(not isinstance(item[k], str) or not item[k].strip() or len(item[k]) > (1000 if k == "text" else 256)
                   for k in ("id", "text", "source_ref", "source_revision")):
                raise ValueError(f"CONTEXT_MISSION_FIELD_INVALID:{field}")
            if item["id"] in ids:
                raise ValueError(f"CONTEXT_MISSION_DUPLICATE_ID:{field}")
            ids.add(item["id"])
            output.append({k: item[k].strip() for k in ("id", "text", "source_ref", "source_revision")})
        result[field] = output
    if len(json.dumps(result, ensure_ascii=False).encode("utf-8")) > 16384:
        raise ValueError("CONTEXT_MISSION_BUDGET_EXCEEDED")
    return result

def compact_trace(source: str, maximum_lines: int = 48) -> list[str]:
    """Preserve important decision/failure signatures; never emit raw log contents."""
    if maximum_lines < 1:
        raise ValueError("CONTEXT_TRACE_LIMIT_INVALID")
    critical = {"FATAL", "ERROR", "FAIL", "BLOCKED", "DENIED", "CONFLICT",
                "DECISION", "UNRESOLVED", "NEXT ACTION"}
    labels = tuple(critical) + ("WARNING", "PASS", "COMMIT", "RECEIPT", "SHA256")
    pattern = re.compile(r"\b(" + "|".join(sorted(labels, key=len, reverse=True)) + r")\b", re.I)
    signals = [(number + 1, match.group(1).upper(), line[:320])
               for number, line in enumerate(source.splitlines())
               if (match := pattern.search(line))]
    essential = [s for s in signals if s[1] in critical]
    if len(essential) >= maximum_lines:
        first = maximum_lines // 2
        selected = essential[:first] + essential[-(maximum_lines - first):]
    else:
        space = maximum_lines - len(essential)
        optional = [s for s in signals if s[1] not in critical]
        left = space // 2
        right = space - left
        selected = essential + optional[:left] + (optional[-right:] if right else [])
        selected = list({row[0]: row for row in selected}.values())
    selected.sort(key=lambda row: row[0])
    return [f"L{number}: {kind} sha256={hashlib.sha256(text.encode('utf-8')).hexdigest()[:12]}"
            for number, kind, text in selected]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--task", default="repository maintenance")
    parser.add_argument("--lane", default="auto")
    parser.add_argument("--require", action="append", default=[], metavar="SOURCE_ID", help="Admit exact registered source with full content or block on budget")
    parser.add_argument("--budget-bytes", type=int, default=32768)
    parser.add_argument("--trace", type=Path)
    parser.add_argument("--max-trace-lines", type=int, default=48)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--metrics-only", action="store_true", help="Print measured repository payload without contents")
    parser.add_argument("--verify-receipt", type=Path)
    parser.add_argument("--mission-file", type=Path, help="Operator-owned structured brief outside the repository")
    args = parser.parse_args()
    try:
        if args.verify_receipt:
            verify_receipt(args.root.resolve(), json.loads(args.verify_receipt.read_text(encoding="utf-8")))
        result = select(args.root.resolve(), args.task, args.lane, args.budget_bytes, tuple(args.require))
        if args.mission_file:
            if (not args.output or args.mission_file.resolve().is_relative_to(args.root.resolve())
                    or args.output.resolve().is_relative_to(args.root.resolve())):
                raise ValueError("CONTEXT_PRIVATE_BRIEF_REQUIRES_EXTERNAL_INPUT_OUTPUT")
            result["mission_brief"] = compact_mission(json.loads(args.mission_file.read_text(encoding="utf-8")))
            total = len(json.dumps(result["mission_brief"], ensure_ascii=False).encode("utf-8"))
            if total + result["candidate_payload_bytes"] > args.budget_bytes:
                raise ValueError("CONTEXT_MISSION_PLUS_SOURCE_BUDGET_EXCEEDED")
        if args.trace:
            result["trace_signatures"] = compact_trace(args.trace.read_text(encoding="utf-8"),
                                                       args.max_trace_lines)
        rendered = json.dumps(result, indent=2, ensure_ascii=False)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(rendered + "\n", encoding="utf-8")
        if args.mission_file:
            print("CONTEXT_PRIVATE_RECEIPT_WRITTEN: local operator-owned output")
        elif args.metrics_only:
            summary = {key: result[key] for key in ("lane", "baseline_unconditional_bytes", "candidate_payload_bytes", "savings_bytes")}
            summary["selected_ids"] = [entry["id"] for entry in result["selected"]]
            summary["external_context"] = "UNMEASURED"
            print(json.dumps(summary, sort_keys=True))
        else:
            print(rendered)
        return 0
    except (ValueError, OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"CONTEXT_ROUTING_BLOCKED: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
