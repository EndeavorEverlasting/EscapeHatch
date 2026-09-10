#!/usr/bin/env python3
"""Validate the portable EscapeHatch career-state v1 contract and reference graph."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

R = Path(__file__).resolve().parents[1]
SCHEMA = R / "contracts" / "career-state.v1.schema.json"
FIXTURE = R / "fixtures" / "career-state.v1.example.json"
VERSION = "escapehatch-career-state/v1"
GUIDANCE_CONTRACT = "study-syndicate/study-guidance/v1"
SHA = re.compile(r"^[a-f0-9]{64}$")
LEGACY_REQUIRED = (
    "schema_version",
    "state_id",
    "revision",
    "updated_at",
    "profile",
    "opportunities",
    "resumes",
    "applications",
    "evidence",
)
TOP_ALLOWED = LEGACY_REQUIRED + ("study_guidance",)


class ContractError(ValueError):
    pass


def load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        try:
            label = path.relative_to(R)
        except ValueError:
            label = path
        raise ContractError(f"{label}: {exc}") from exc


def require_keys(obj, required, allowed, where):
    if not isinstance(obj, dict):
        raise ContractError(f"{where} must be an object")
    missing = [key for key in required if key not in obj]
    extra = [key for key in obj if key not in allowed]
    if missing:
        raise ContractError(f"{where} missing: {', '.join(missing)}")
    if extra:
        raise ContractError(f"{where} unknown fields: {', '.join(extra)}")


def artifact(value, where):
    require_keys(value, ("owner", "kind", "locator"), ("owner", "kind", "locator", "sha256"), where)
    if value["owner"] not in {"user", "escapehatch", "external"}:
        raise ContractError(f"{where}.owner invalid")
    if value["kind"] not in {"inline", "relative_path", "uri", "content_hash"}:
        raise ContractError(f"{where}.kind invalid")
    if not isinstance(value["locator"], str) or not value["locator"]:
        raise ContractError(f"{where}.locator empty")
    if value["kind"] == "relative_path" and (
        Path(value["locator"]).is_absolute() or ".." in Path(value["locator"]).parts
    ):
        raise ContractError(f"{where}.locator must be portable relative path")
    if "sha256" in value and not SHA.fullmatch(value["sha256"]):
        raise ContractError(f"{where}.sha256 invalid")


def string_list(value, where, *, min_items=0):
    if (
        not isinstance(value, list)
        or len(value) < min_items
        or any(not isinstance(item, str) or not item for item in value)
        or len(value) != len(set(value))
    ):
        requirement = f" with at least {min_items} item(s)" if min_items else ""
        raise ContractError(f"{where} must be a unique non-empty string array{requirement}")


def uniq(items, name):
    ids = [item.get("id") for item in items]
    if any(not isinstance(item_id, str) or not item_id for item_id in ids):
        raise ContractError(f"{name} ids must be non-empty strings")
    if len(ids) != len(set(ids)):
        raise ContractError(f"{name} ids must be unique")
    return set(ids)


def validate_guidance(record, where, opportunity_ids, applications):
    allowed = (
        "id",
        "opportunity_id",
        "application_id",
        "contract",
        "trigger_kind",
        "reason",
        "cascade_concept_ids",
        "iteration",
        "concepts",
        "resources",
        "status",
        "created_at",
    )
    require_keys(
        record,
        ("id", "opportunity_id", "contract", "trigger_kind", "reason", "iteration", "concepts", "resources", "status"),
        allowed,
        where,
    )
    if record["opportunity_id"] not in opportunity_ids:
        raise ContractError(f"{where}.opportunity_id dangling")
    application_id = record.get("application_id")
    if application_id:
        application = applications.get(application_id)
        if application is None:
            raise ContractError(f"{where}.application_id dangling")
        if application["opportunity_id"] != record["opportunity_id"]:
            raise ContractError(f"{where}.application opportunity mismatch")
    if record["contract"] != GUIDANCE_CONTRACT:
        raise ContractError(f"{where}.contract mismatch")
    if record["trigger_kind"] not in {
        "requirements-gap",
        "application-iteration",
        "interview-feedback",
        "learning-event",
        "cascade",
        "manual",
    }:
        raise ContractError(f"{where}.trigger_kind invalid")
    if not isinstance(record["reason"], str) or not record["reason"]:
        raise ContractError(f"{where}.reason invalid")
    if not isinstance(record["iteration"], int) or isinstance(record["iteration"], bool) or record["iteration"] < 1:
        raise ContractError(f"{where}.iteration invalid")
    if record["status"] not in {"queued", "active", "completed", "superseded"}:
        raise ContractError(f"{where}.status invalid")

    cascade_ids = record.get("cascade_concept_ids", [])
    if not isinstance(cascade_ids, list) or any(not isinstance(item, str) or not item for item in cascade_ids):
        raise ContractError(f"{where}.cascade_concept_ids invalid")

    if not isinstance(record["concepts"], list) or not record["concepts"]:
        raise ContractError(f"{where}.concepts must be non-empty")
    concept_ids = set()
    for index, concept in enumerate(record["concepts"]):
        concept_where = f"{where}.concepts[{index}]"
        require_keys(concept, ("concept_id", "reason", "priority"), ("concept_id", "reason", "priority"), concept_where)
        concept_id = concept["concept_id"]
        if not isinstance(concept_id, str) or not concept_id or concept_id in concept_ids:
            raise ContractError(f"{concept_where}.concept_id invalid/duplicate")
        concept_ids.add(concept_id)
        if not isinstance(concept["reason"], str) or not concept["reason"]:
            raise ContractError(f"{concept_where}.reason invalid")
        if not isinstance(concept["priority"], int) or isinstance(concept["priority"], bool) or not 1 <= concept["priority"] <= 5:
            raise ContractError(f"{concept_where}.priority invalid")

    if not isinstance(record["resources"], list):
        raise ContractError(f"{where}.resources invalid")
    for index, resource in enumerate(record["resources"]):
        resource_where = f"{where}.resources[{index}]"
        require_keys(
            resource,
            ("kind", "title", "relation"),
            ("kind", "title", "relation", "author", "locator", "concept_ids", "note"),
            resource_where,
        )
        if resource["kind"] not in {"book", "documentation", "article", "course", "video", "repository", "problem-set"}:
            raise ContractError(f"{resource_where}.kind invalid")
        if resource["relation"] not in {"primary", "reference", "remediation", "stretch"}:
            raise ContractError(f"{resource_where}.relation invalid")
        if not isinstance(resource["title"], str) or not resource["title"]:
            raise ContractError(f"{resource_where}.title invalid")
        for key in ("author", "locator", "note"):
            if key in resource and (not isinstance(resource[key], str) or not resource[key]):
                raise ContractError(f"{resource_where}.{key} must be a non-empty string")
        linked_ids = resource.get("concept_ids", [])
        if not isinstance(linked_ids, list) or any(
            not isinstance(item, str) or not item or item not in concept_ids for item in linked_ids
        ):
            raise ContractError(f"{resource_where}.concept_ids dangling")


def validate(state):
    require_keys(state, LEGACY_REQUIRED, TOP_ALLOWED, "state")
    if state["schema_version"] != VERSION:
        raise ContractError("schema_version mismatch")
    if not isinstance(state["revision"], int) or isinstance(state["revision"], bool) or state["revision"] < 1:
        raise ContractError("revision must be >= 1")

    profile = state["profile"]
    require_keys(
        profile,
        ("id", "headline", "skills"),
        ("id", "headline", "skills", "source_artifacts", "career_objective"),
        "profile",
    )
    if not isinstance(profile["id"], str) or not profile["id"]:
        raise ContractError("profile.id invalid")
    if not isinstance(profile["headline"], str):
        raise ContractError("profile.headline invalid")
    if not isinstance(profile["skills"], list) or any(not isinstance(item, str) for item in profile["skills"]):
        raise ContractError("profile.skills invalid")
    for index, source in enumerate(profile.get("source_artifacts", [])):
        artifact(source, f"profile.source_artifacts[{index}]")

    objective = profile.get("career_objective")
    if objective is not None:
        require_keys(
            objective,
            ("target_lane", "target_roles", "lead_capabilities"),
            ("target_lane", "target_roles", "deprioritized_roles", "lead_capabilities", "proof_artifacts"),
            "profile.career_objective",
        )
        if not isinstance(objective["target_lane"], str) or not objective["target_lane"]:
            raise ContractError("profile.career_objective.target_lane invalid")
        string_list(objective["target_roles"], "profile.career_objective.target_roles", min_items=1)
        string_list(objective.get("deprioritized_roles", []), "profile.career_objective.deprioritized_roles")
        string_list(objective["lead_capabilities"], "profile.career_objective.lead_capabilities", min_items=1)
        for index, proof in enumerate(objective.get("proof_artifacts", [])):
            artifact(proof, f"profile.career_objective.proof_artifacts[{index}]")

    for key in ("opportunities", "resumes", "applications", "evidence"):
        if not isinstance(state[key], list):
            raise ContractError(f"{key} must be an array")
    guidance_items = state.get("study_guidance", [])
    if not isinstance(guidance_items, list):
        raise ContractError("study_guidance must be an array")

    opportunity_ids = uniq(state["opportunities"], "opportunity")
    resume_ids = uniq(state["resumes"], "resume")
    application_ids = uniq(state["applications"], "application")
    guidance_ids = uniq(guidance_items, "study_guidance")
    uniq(state["evidence"], "evidence")

    for index, opportunity in enumerate(state["opportunities"]):
        where = f"opportunities[{index}]"
        allowed = (
            "id", "title", "organization", "status", "priority", "fit_score", "requirements_gaps",
            "next_action", "source", "apply_link", "posting_snapshot", "captured_at",
        )
        require_keys(opportunity, ("id", "title", "organization", "status", "source"), allowed, where)
        artifact(opportunity["source"], f"{where}.source")
        if "priority" in opportunity and opportunity["priority"] not in {"low", "medium", "high"}:
            raise ContractError(f"{where}.priority invalid")
        if "fit_score" in opportunity and (
            not isinstance(opportunity["fit_score"], int)
            or isinstance(opportunity["fit_score"], bool)
            or not 0 <= opportunity["fit_score"] <= 100
        ):
            raise ContractError(f"{where}.fit_score must be integer 0..100")
        if "requirements_gaps" in opportunity and (
            not isinstance(opportunity["requirements_gaps"], list)
            or any(not isinstance(item, str) for item in opportunity["requirements_gaps"])
        ):
            raise ContractError(f"{where}.requirements_gaps invalid")
        if "next_action" in opportunity and not isinstance(opportunity["next_action"], str):
            raise ContractError(f"{where}.next_action invalid")
        if "apply_link" in opportunity:
            artifact(opportunity["apply_link"], f"{where}.apply_link")
            if opportunity["apply_link"]["kind"] != "uri":
                raise ContractError(f"{where}.apply_link must be uri")
        if "posting_snapshot" in opportunity:
            artifact(opportunity["posting_snapshot"], f"{where}.posting_snapshot")

    for index, resume in enumerate(state["resumes"]):
        where = f"resumes[{index}]"
        require_keys(resume, ("id", "profile_id", "artifact"), ("id", "profile_id", "opportunity_id", "artifact", "created_at"), where)
        if resume["profile_id"] != profile["id"]:
            raise ContractError(f"{where}.profile_id dangling")
        if "opportunity_id" in resume and resume["opportunity_id"] not in opportunity_ids:
            raise ContractError(f"{where}.opportunity_id dangling")
        artifact(resume["artifact"], f"{where}.artifact")

    for index, application in enumerate(state["applications"]):
        where = f"applications[{index}]"
        require_keys(
            application,
            ("id", "opportunity_id", "resume_id", "status", "submitted_at"),
            ("id", "opportunity_id", "resume_id", "status", "submitted_at", "external_reference"),
            where,
        )
        if application["opportunity_id"] not in opportunity_ids:
            raise ContractError(f"{where}.opportunity_id dangling")
        if application["resume_id"] not in resume_ids:
            raise ContractError(f"{where}.resume_id dangling")

    applications = {item["id"]: item for item in state["applications"]}
    for index, guidance_record in enumerate(guidance_items):
        validate_guidance(guidance_record, f"study_guidance[{index}]", opportunity_ids, applications)

    # Backward compatibility: legacy v1 records without the extension remain readable.
    # Once a state opts into study_guidance, recorded requirement gaps must remain actionable.
    if "study_guidance" in state:
        for opportunity in state["opportunities"]:
            if opportunity.get("requirements_gaps") and not any(
                item["opportunity_id"] == opportunity["id"]
                and item["trigger_kind"] == "requirements-gap"
                and item["status"] != "superseded"
                for item in guidance_items
            ):
                raise ContractError(f"opportunity {opportunity['id']} has requirements_gaps without active study guidance")

    for index, evidence in enumerate(state["evidence"]):
        where = f"evidence[{index}]"
        require_keys(evidence, ("id", "application_id", "kind", "artifact", "observed_at"), ("id", "application_id", "kind", "artifact", "observed_at"), where)
        if evidence["application_id"] not in application_ids:
            raise ContractError(f"{where}.application_id dangling")
        artifact(evidence["artifact"], f"{where}.artifact")

    return {
        "opportunities": len(opportunity_ids),
        "applications": len(application_ids),
        "guidance": len(guidance_ids),
        "career_objective": objective is not None,
    }


def self_tests(good):
    negatives = []
    item = json.loads(json.dumps(good)); item["resumes"][0]["profile_id"] = "missing"; negatives.append(item)
    item = json.loads(json.dumps(good)); item["applications"][0]["resume_id"] = "missing"; negatives.append(item)
    item = json.loads(json.dumps(good)); item["resumes"][0]["artifact"]["locator"] = "../escape.pdf"; negatives.append(item)
    item = json.loads(json.dumps(good)); item["opportunities"][0]["fit_score"] = 101; negatives.append(item)
    item = json.loads(json.dumps(good)); item["study_guidance"][0]["opportunity_id"] = "missing"; negatives.append(item)
    item = json.loads(json.dumps(good)); item["study_guidance"][0]["resources"][0]["kind"] = "magazine"; negatives.append(item)
    item = json.loads(json.dumps(good)); item["study_guidance"][0]["resources"][0]["concept_ids"] = ["llm.missing"]; negatives.append(item)
    item = json.loads(json.dumps(good)); item["study_guidance"] = []; negatives.append(item)
    item = json.loads(json.dumps(good)); item["study_guidance"][0]["resources"][0]["author"] = 42; negatives.append(item)
    item = json.loads(json.dumps(good)); item["profile"]["career_objective"]["target_roles"] = []; negatives.append(item)
    item = json.loads(json.dumps(good)); item["profile"]["career_objective"]["lead_capabilities"].append(item["profile"]["career_objective"]["lead_capabilities"][0]); negatives.append(item)
    item = json.loads(json.dumps(good)); item["profile"]["career_objective"]["proof_artifacts"][1]["locator"] = "../private-proof.md"; negatives.append(item)
    item = json.loads(json.dumps(good)); item["profile"]["career_objective"]["unknown"] = "value"; negatives.append(item)

    item = json.loads(json.dumps(good))
    other = json.loads(json.dumps(item["opportunities"][0]))
    other["id"] = "opp-other"
    other["requirements_gaps"] = []
    item["opportunities"].append(other)
    item["study_guidance"][0]["opportunity_id"] = "opp-other"
    negatives.append(item)

    for number, candidate in enumerate(negatives, 1):
        try:
            validate(candidate)
        except ContractError:
            continue
        raise ContractError(f"negative fixture {number} unexpectedly passed")

    legacy = json.loads(json.dumps(good))
    legacy.pop("study_guidance")
    validate(legacy)

    legacy_without_objective = json.loads(json.dumps(good))
    legacy_without_objective["profile"].pop("career_objective")
    validate(legacy_without_objective)
    return len(negatives)


def main():
    try:
        schema = load(SCHEMA)
        if schema.get("title") != "EscapeHatch Career State v1" or schema.get("properties", {}).get("schema_version", {}).get("const") != VERSION:
            raise ContractError("schema contract identity mismatch")
        if "study_guidance" not in schema.get("properties", {}):
            raise ContractError("schema must expose the optional study_guidance extension")
        if "study_guidance" in schema.get("required", []):
            raise ContractError("career-state v1 study_guidance must remain backward-compatible")
        profile_schema = schema.get("$defs", {}).get("profile", {})
        if "career_objective" not in profile_schema.get("properties", {}):
            raise ContractError("profile schema must expose the optional career_objective extension")
        if "career_objective" in profile_schema.get("required", []):
            raise ContractError("career-state v1 career_objective must remain backward-compatible")
        state = load(FIXTURE)
        counts = validate(state)
        negative_count = self_tests(state)
    except ContractError as exc:
        print(f"CAREER_STATE_VALIDATION: FAIL: {exc}", file=sys.stderr)
        return 1
    print("CAREER_STATE_VALIDATION: PASS")
    print(f"schema={SCHEMA.relative_to(R)}")
    print(f"fixture={FIXTURE.relative_to(R)}")
    print(f"career_objective={'PASS' if counts['career_objective'] else 'ABSENT'}")
    print(f"guidance_records={counts['guidance']}")
    print("legacy_v1_without_guidance=PASS")
    print("legacy_v1_without_career_objective=PASS")
    print(f"negative_fixtures={negative_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
