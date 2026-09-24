#!/usr/bin/env python3
"""Validate the deterministic opportunity-import contract and synthetic previews."""
from __future__ import annotations

import copy
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "opportunity-import.v1.json"
VALID = ROOT / "fixtures" / "opportunity-import" / "01-ledger-preview-valid.json"
INVALID = ROOT / "fixtures" / "opportunity-import" / "02-conflict-autoaccept-invalid.json"
SCHEMA = "escapehatch/opportunity-import/v1"
PREVIEW_SCHEMA = "escapehatch-opportunity-import-preview/v1"
SHA256 = re.compile(r"^[a-f0-9]{64}$")
CLASSES = {"NEW", "UPDATE", "DUPLICATE", "CONFLICT", "SKIP"}
REVIEW_CLASSES = {"UPDATE", "CONFLICT"}

class ImportContractError(ValueError):
    pass

def load(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ImportContractError(f"{path.relative_to(ROOT)}: {exc}") from exc
    if not isinstance(value, dict):
        raise ImportContractError(f"{path.relative_to(ROOT)} must contain an object")
    return value

def require(value: bool, message: str) -> None:
    if not value:
        raise ImportContractError(message)

def validate_contract(contract: dict) -> None:
    require(contract.get("schema") == SCHEMA, "contract schema mismatch")
    require(contract.get("version") == 1, "contract version mismatch")
    require(contract.get("canonical_career_state") == "escapehatch-career-state/v1", "canonical career-state mismatch")
    authority = contract.get("authority", {})
    require(authority.get("canonical_domain_model") == "career_state_only", "parallel job schema forbidden")
    require(authority.get("provider_proof_from_local_import") == "forbidden", "local import cannot become provider proof")
    require(authority.get("final_submission") == "outside_contract", "final submission boundary missing")
    pipeline = contract.get("pipeline", [])
    require(pipeline == ["decode","identify","map","normalize","bind_provenance","dedupe","classify","preview","commit","validate","receipt"], "pipeline order mismatch")
    require(set(contract.get("candidate_states", [])) == CLASSES, "candidate state set mismatch")
    mapping = contract.get("field_mapping", {})
    require(mapping.get("unknown_header_policy") == "retain_unmapped_in_preview", "unknown fields must remain visible")
    require(mapping.get("absent_fact_policy") == "do_not_invent", "absent facts must not be invented")
    require(mapping.get("ambiguous_mapping_policy") == "review_required", "ambiguous mapping must require review")
    aliases = mapping.get("aliases", {})
    for canonical in {"organization","title","location","work_mode","employment_type","compensation_text","priority","fit_score","fit_rationale","requirements_gaps","found_on","follow_up_due_on","next_action","apply_link","source","source_guidance","notes"}:
        require(isinstance(aliases.get(canonical), list) and aliases[canonical], f"alias coverage missing: {canonical}")
    require(contract.get("identity_precedence") == ["explicit_canonical_id","exact_apply_or_source_url","normalized_organization_title_location_work_mode_with_corroboration"], "identity precedence mismatch")
    preview = contract.get("preview", {})
    require(preview.get("schema_version") == PREVIEW_SCHEMA, "preview schema mismatch")
    require(preview.get("mutation") == "forbidden", "preview must be side-effect free")
    require(set(preview.get("classifications_requiring_review", [])) == REVIEW_CLASSES, "review classes mismatch")
    commit = contract.get("commit", {})
    for key in ("explicit_acceptance_required","expected_revision_required","compare_and_set","validate_resulting_career_state","transactional","preserve_state_on_failure","recovery_snapshot_before_mutation"):
        require(commit.get(key) is True, f"commit invariant missing: {key}")
    require(commit.get("ambiguous_conflict_auto_merge") == "forbidden", "conflict auto-merge must be forbidden")
    receipt = contract.get("receipt", {})
    allowed = set(receipt.get("allowed_metadata", []))
    forbidden = set(receipt.get("forbidden_content", []))
    require("raw_source_content" not in allowed and "raw_source_content" in forbidden, "receipt must exclude raw source content")
    require(not allowed.intersection(forbidden), "receipt allowlist overlaps forbidden content")
    privacy = contract.get("privacy", {})
    require(privacy.get("repository_real_user_inputs") == "forbidden", "real inputs must stay out of repository")
    require(privacy.get("network_upload_required") is False, "local import must not require upload")

def validate_preview(preview: dict, contract: dict, *, expect_invalid: bool = False) -> None:
    require(preview.get("schema_version") == PREVIEW_SCHEMA, "preview schema mismatch")
    require(isinstance(preview.get("import_id"), str) and preview["import_id"], "import_id invalid")
    source = preview.get("source")
    require(isinstance(source, dict), "source missing")
    require(source.get("type") in set(contract["source_classes"]["v1"]), "source type unsupported in v1")
    require(isinstance(source.get("name"), str) and source["name"], "source name invalid")
    require(isinstance(source.get("content_sha256"), str) and SHA256.fullmatch(source["content_sha256"]) is not None, "content hash invalid")
    require(isinstance(preview.get("expected_revision"), int) and not isinstance(preview["expected_revision"], bool) and preview["expected_revision"] >= 1, "expected revision invalid")
    candidates = preview.get("candidates")
    require(isinstance(candidates, list) and candidates, "candidates must be non-empty")
    ids=set()
    invalid_seen=False
    for idx,c in enumerate(candidates):
        where=f"candidates[{idx}]"
        require(isinstance(c, dict), f"{where} must be object")
        cid=c.get("candidate_id")
        require(isinstance(cid,str) and cid and cid not in ids, f"{where}.candidate_id invalid/duplicate")
        ids.add(cid)
        classification=c.get("classification")
        require(classification in CLASSES, f"{where}.classification invalid")
        require(isinstance(c.get("source_ref"),dict) and c["source_ref"], f"{where}.source_ref missing")
        require(isinstance(c.get("mapped_fields"),dict), f"{where}.mapped_fields invalid")
        require(isinstance(c.get("unmapped_fields"),dict), f"{where}.unmapped_fields invalid")
        conflicts=c.get("conflicts")
        require(isinstance(conflicts,list), f"{where}.conflicts invalid")
        if classification=="CONFLICT":
            require(bool(conflicts), f"{where} conflict classification requires conflict details")
        if classification in REVIEW_CLASSES and conflicts and c.get("review_decision")=="auto_accept":
            invalid_seen=True
            if not expect_invalid:
                raise ImportContractError(f"{where} ambiguous conflict cannot auto-accept")
    if expect_invalid:
        require(invalid_seen, "negative fixture did not exercise forbidden auto-accept")
        raise ImportContractError("negative fixture correctly rejected ambiguous auto-accept")

def self_tests(contract: dict, valid: dict) -> int:
    count=0
    mutated=copy.deepcopy(valid)
    mutated["source"]["content_sha256"]="not-a-hash"
    try:
        validate_preview(mutated, contract)
    except ImportContractError:
        count+=1
    else:
        raise ImportContractError("negative hash mutation unexpectedly passed")

    mutated=copy.deepcopy(valid)
    mutated["candidates"][0]["classification"]="CONFLICT"
    mutated["candidates"][0]["conflicts"]=[]
    try:
        validate_preview(mutated, contract)
    except ImportContractError:
        count+=1
    else:
        raise ImportContractError("empty conflict mutation unexpectedly passed")

    mutated=copy.deepcopy(valid)
    mutated["candidates"][1]["review_decision"]="auto_accept"
    try:
        validate_preview(mutated, contract)
    except ImportContractError:
        count+=1
    else:
        raise ImportContractError("auto-accepted conflict unexpectedly passed")
    return count

def main() -> int:
    try:
        contract=load(CONTRACT)
        valid=load(VALID)
        invalid=load(INVALID)
        validate_contract(contract)
        validate_preview(valid, contract)
        try:
            validate_preview(invalid, contract)
        except ImportContractError:
            pass
        else:
            raise ImportContractError("negative fixture unexpectedly passed")
        negatives=self_tests(contract, valid)
        digest=hashlib.sha256(VALID.read_bytes()).hexdigest()
    except ImportContractError as exc:
        print(f"OPPORTUNITY_IMPORT_VALIDATION: FAIL: {exc}", file=sys.stderr)
        return 1
    print("OPPORTUNITY_IMPORT_VALIDATION: PASS")
    print(f"contract={CONTRACT.relative_to(ROOT)}")
    print(f"preview_fixture={VALID.relative_to(ROOT)}")
    print(f"preview_sha256={digest}")
    print(f"candidate_states={len(CLASSES)}")
    print(f"negative_cases={negatives + 1}")
    print("provider_proof_from_local_import=FORBIDDEN")
    print("final_submission=OUTSIDE_CONTRACT")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
