#!/usr/bin/env python3
"""Validate the portable EscapeHatch career-state v1 contract and reference graph."""
from __future__ import annotations
import json, re, sys
from pathlib import Path
R=Path(__file__).resolve().parents[1]
SCHEMA=R/"contracts/career-state.v1.schema.json"
FIXTURE=R/"fixtures/career-state.v1.example.json"
VERSION="escapehatch-career-state/v1"
SHA=re.compile(r"^[a-f0-9]{64}$")
class ContractError(ValueError): pass
def load(path):
    try:return json.loads(path.read_text(encoding="utf-8"))
    except (OSError,json.JSONDecodeError) as e: raise ContractError(f"{path.relative_to(R)}: {e}") from e
def require_keys(obj, required, allowed, where):
    if not isinstance(obj,dict): raise ContractError(f"{where} must be an object")
    missing=[k for k in required if k not in obj]
    extra=[k for k in obj if k not in allowed]
    if missing: raise ContractError(f"{where} missing: {', '.join(missing)}")
    if extra: raise ContractError(f"{where} unknown fields: {', '.join(extra)}")
def artifact(a, where):
    require_keys(a,("owner","kind","locator"),("owner","kind","locator","sha256"),where)
    if a["owner"] not in {"user","escapehatch","external"}: raise ContractError(f"{where}.owner invalid")
    if a["kind"] not in {"inline","relative_path","uri","content_hash"}: raise ContractError(f"{where}.kind invalid")
    if not isinstance(a["locator"],str) or not a["locator"]: raise ContractError(f"{where}.locator empty")
    if a["kind"]=="relative_path" and (Path(a["locator"]).is_absolute() or ".." in Path(a["locator"]).parts):
        raise ContractError(f"{where}.locator must be portable relative path")
    if "sha256" in a and not SHA.fullmatch(a["sha256"]): raise ContractError(f"{where}.sha256 invalid")
def uniq(items, name):
    ids=[x.get("id") for x in items]
    if any(not isinstance(x,str) or not x for x in ids): raise ContractError(f"{name} ids must be non-empty strings")
    if len(ids)!=len(set(ids)): raise ContractError(f"{name} ids must be unique")
    return set(ids)
def validate(d):
    require_keys(d,("schema_version","state_id","revision","updated_at","profile","opportunities","resumes","applications","evidence"),
                 ("schema_version","state_id","revision","updated_at","profile","opportunities","resumes","applications","evidence"),"state")
    if d["schema_version"]!=VERSION: raise ContractError("schema_version mismatch")
    if not isinstance(d["revision"],int) or isinstance(d["revision"],bool) or d["revision"]<1: raise ContractError("revision must be >= 1")
    p=d["profile"]; require_keys(p,("id","headline","skills"),("id","headline","skills","source_artifacts"),"profile")
    if not isinstance(p["id"],str) or not p["id"]: raise ContractError("profile.id invalid")
    if not isinstance(p["skills"],list) or any(not isinstance(x,str) for x in p["skills"]): raise ContractError("profile.skills invalid")
    for i,a in enumerate(p.get("source_artifacts",[])): artifact(a,f"profile.source_artifacts[{i}]")
    for key in ("opportunities","resumes","applications","evidence"):
        if not isinstance(d[key],list): raise ContractError(f"{key} must be an array")
    oids=uniq(d["opportunities"],"opportunity"); rids=uniq(d["resumes"],"resume"); aids=uniq(d["applications"],"application"); uniq(d["evidence"],"evidence")
    for i,o in enumerate(d["opportunities"]):
        allowed=("id","title","organization","status","priority","fit_score","requirements_gaps","next_action","source","apply_link","posting_snapshot","captured_at")
        require_keys(o,("id","title","organization","status","source"),allowed,f"opportunities[{i}]")
        artifact(o["source"],f"opportunities[{i}].source")
        if "priority" in o and o["priority"] not in {"low","medium","high"}: raise ContractError(f"opportunities[{i}].priority invalid")
        if "fit_score" in o and (not isinstance(o["fit_score"],int) or isinstance(o["fit_score"],bool) or not 0<=o["fit_score"]<=100):
            raise ContractError(f"opportunities[{i}].fit_score must be integer 0..100")
        if "requirements_gaps" in o and (not isinstance(o["requirements_gaps"],list) or any(not isinstance(x,str) for x in o["requirements_gaps"])):
            raise ContractError(f"opportunities[{i}].requirements_gaps invalid")
        if "next_action" in o and not isinstance(o["next_action"],str): raise ContractError(f"opportunities[{i}].next_action invalid")
        if "apply_link" in o:
            artifact(o["apply_link"],f"opportunities[{i}].apply_link")
            if o["apply_link"]["kind"]!="uri": raise ContractError(f"opportunities[{i}].apply_link must be uri")
        if "posting_snapshot" in o: artifact(o["posting_snapshot"],f"opportunities[{i}].posting_snapshot")
    for i,r in enumerate(d["resumes"]):
        require_keys(r,("id","profile_id","artifact"),("id","profile_id","opportunity_id","artifact","created_at"),f"resumes[{i}]")
        if r["profile_id"]!=p["id"]: raise ContractError(f"resumes[{i}].profile_id dangling")
        if "opportunity_id" in r and r["opportunity_id"] not in oids: raise ContractError(f"resumes[{i}].opportunity_id dangling")
        artifact(r["artifact"],f"resumes[{i}].artifact")
    for i,a in enumerate(d["applications"]):
        require_keys(a,("id","opportunity_id","resume_id","status","submitted_at"),("id","opportunity_id","resume_id","status","submitted_at","external_reference"),f"applications[{i}]")
        if a["opportunity_id"] not in oids: raise ContractError(f"applications[{i}].opportunity_id dangling")
        if a["resume_id"] not in rids: raise ContractError(f"applications[{i}].resume_id dangling")
    for i,e in enumerate(d["evidence"]):
        require_keys(e,("id","application_id","kind","artifact","observed_at"),("id","application_id","kind","artifact","observed_at"),f"evidence[{i}]")
        if e["application_id"] not in aids: raise ContractError(f"evidence[{i}].application_id dangling")
        artifact(e["artifact"],f"evidence[{i}].artifact")
def self_tests(good):
    tests=[]
    x=json.loads(json.dumps(good)); x["resumes"][0]["profile_id"]="missing"; tests.append(x)
    x=json.loads(json.dumps(good)); x["applications"][0]["resume_id"]="missing"; tests.append(x)
    x=json.loads(json.dumps(good)); x["resumes"][0]["artifact"]["locator"]="../escape.pdf"; tests.append(x)
    x=json.loads(json.dumps(good)); x["opportunities"][0]["fit_score"]=101; tests.append(x)
    x=json.loads(json.dumps(good)); x["opportunities"][0]["apply_link"]={"owner":"external","kind":"relative_path","locator":"apply.html"}; tests.append(x)
    x=json.loads(json.dumps(good)); x["opportunities"][0]["posting_snapshot"]["locator"]="../posting.txt"; tests.append(x)
    for n,x in enumerate(tests,1):
        try: validate(x)
        except ContractError: continue
        raise ContractError(f"negative fixture {n} unexpectedly passed")
    return len(tests)
def main():
    try:
        s=load(SCHEMA)
        if s.get("title")!="EscapeHatch Career State v1" or s.get("properties",{}).get("schema_version",{}).get("const")!=VERSION:
            raise ContractError("schema contract identity mismatch")
        d=load(FIXTURE); validate(d); n=self_tests(d)
    except ContractError as e:
        print(f"CAREER_STATE_VALIDATION: FAIL: {e}",file=sys.stderr); return 1
    print("CAREER_STATE_VALIDATION: PASS"); print(f"schema={SCHEMA.relative_to(R)}"); print(f"fixture={FIXTURE.relative_to(R)}"); print(f"negative_fixtures={n}"); return 0
if __name__=="__main__": raise SystemExit(main())
