#!/usr/bin/env python3
"""Export EscapeHatch study_guidance records as StudySyndicate guidance packets."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DEFAULT=ROOT/"fixtures/career-state.v1.example.json"
CONTRACT="study-syndicate/study-guidance/v1"

class ExportError(ValueError): pass

def load(path):
    try:return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError,json.JSONDecodeError) as e: raise ExportError(str(e)) from e

def export_record(state, record):
    if record.get("contract")!=CONTRACT: raise ExportError("guidance contract mismatch")
    app_id=record.get("application_id")
    origin={"system":"escapehatch","recordType":"application" if app_id else "opportunity","recordId":app_id or record["opportunity_id"]}
    trigger={"kind":record["trigger_kind"],"reason":record["reason"]}
    if record.get("cascade_concept_ids"): trigger["cascadeConceptIds"]=record["cascade_concept_ids"]
    concepts=[{"conceptId":c["concept_id"],"reason":c["reason"],"priority":c["priority"]} for c in record["concepts"]]
    resources=[]
    for r in record["resources"]:
        out={"kind":r["kind"],"title":r["title"],"relation":r["relation"]}
        for src,dst in (("author","author"),("locator","locator"),("note","note"),("concept_ids","conceptIds")):
            if src in r: out[dst]=r[src]
        resources.append(out)
    return {"guidanceId":record["id"],"origin":origin,"trigger":trigger,"iteration":record["iteration"],"concepts":concepts,"resources":resources,"status":record["status"]}

def export_all(state):
    return [export_record(state,g) for g in state.get("study_guidance",[])]

def main():
    p=argparse.ArgumentParser(); p.add_argument("state",nargs="?",default=str(DEFAULT)); p.add_argument("--guidance-id"); args=p.parse_args()
    try:
        state=load(args.state); packets=export_all(state)
        if args.guidance_id:
            packets=[x for x in packets if x["guidanceId"]==args.guidance_id]
            if not packets: raise ExportError(f"guidance id not found: {args.guidance_id}")
        print(json.dumps(packets[0] if args.guidance_id else packets,indent=2,sort_keys=True))
        return 0
    except (ExportError,KeyError,TypeError) as e:
        print(f"STUDY_GUIDANCE_EXPORT: FAIL: {e}",file=sys.stderr); return 1
if __name__=="__main__": raise SystemExit(main())
