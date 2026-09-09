#!/usr/bin/env python3
"""Validate EscapeHatch application-form harness taxonomy and preference policy."""
from __future__ import annotations
import copy, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAXONOMY = ROOT / "harness/contracts/application-form-taxonomy.v1.json"
PREFERENCES = ROOT / "harness/contracts/application-preference-cache.v1.json"
TAXONOMY_SCHEMA = "escapehatch/application-form-taxonomy/v1"
PREFERENCE_SCHEMA = "escapehatch/application-question-preferences/v1"
ROLE_FIT_IDS = {
    "skills.jira_administration_level",
    "skills.confluence_level",
    "skills.presentation_level",
    "industry.utilities_energy_experience",
    "credentials.relevant_certification_status",
}
REQUIRED_OBSERVED_IDS = {
    "eeo.disability_status", "eeo.veteran_status", "eeo.race_ethnicity", "eeo.gender",
    "employment.prior_employer_relationship", "employment.work_authorization_proof", "employment.sponsorship_required",
    "compensation.desired_annual_salary", "compensation.currency", "education.highest_completed_level",
    "accommodation.reasonable_accommodation_needed", "legal.non_compete_blocking", "legal.debarment_exclusion_status",
    "legal.debarment_investigation_pending", "attestation.truth_accuracy",
} | ROLE_FIT_IDS
FORBIDDEN_VALUE_KEYS = {"answer", "value", "default_answer", "preferred_answer", "selected_answer"}
ALLOWED_AUTOMATION = {"fill_if_explicit_preference", "fill_if_confirmed_current", "manual_only"}
ALLOWED_CONFIRMATION = {"until_changed", "confirm_each_application", "per_opportunity", "manual_each_submission"}

class ContractError(ValueError):
    pass

def load(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"{path.relative_to(ROOT)}: {exc}") from exc
    if not isinstance(data, dict):
        raise ContractError(f"{path.relative_to(ROOT)} must contain an object")
    return data

def reject_value_keys(value, where="root") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key in FORBIDDEN_VALUE_KEYS:
                raise ContractError(f"{where} contains forbidden committed preference key: {key}")
            reject_value_keys(item, f"{where}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            reject_value_keys(item, f"{where}[{index}]")

def validate_taxonomy(data: dict) -> dict:
    if data.get("schema") != TAXONOMY_SCHEMA or data.get("version") != 1:
        raise ContractError("application taxonomy identity mismatch")
    matching = data.get("matching")
    if not isinstance(matching, dict):
        raise ContractError("matching contract missing")
    if matching.get("order_independent") is not True or matching.get("employer_independent") is not True:
        raise ContractError("matching must be order- and employer-independent")
    if matching.get("unknown_question_behavior") != "leave_blank_and_surface_for_mapping":
        raise ContractError("unknown questions must fail closed")
    questions = data.get("questions"); pages = data.get("page_archetypes")
    if not isinstance(questions, list) or not questions or not isinstance(pages, list) or not pages:
        raise ContractError("questions/page_archetypes must be non-empty arrays")
    ids = []; by_id = {}
    for index, question in enumerate(questions):
        if not isinstance(question, dict):
            raise ContractError(f"questions[{index}] must be object")
        required = {"id","family","sensitivity","answer_scope","automation_policy","confirmation_policy","aliases"}
        missing = required - set(question)
        if missing:
            raise ContractError(f"questions[{index}] missing {sorted(missing)}")
        qid = question["id"]
        if not isinstance(qid, str) or "." not in qid:
            raise ContractError(f"questions[{index}].id invalid")
        if question["automation_policy"] not in ALLOWED_AUTOMATION:
            raise ContractError(f"{qid} automation policy invalid")
        if question["confirmation_policy"] not in ALLOWED_CONFIRMATION:
            raise ContractError(f"{qid} confirmation policy invalid")
        aliases = question["aliases"]
        if not isinstance(aliases, list) or not aliases or any(not isinstance(a, str) or not a.strip() for a in aliases):
            raise ContractError(f"{qid} aliases invalid")
        ids.append(qid); by_id[qid] = question
    if len(ids) != len(set(ids)):
        raise ContractError("question IDs must be unique")
    for page in pages:
        if not isinstance(page, dict) or not isinstance(page.get("id"), str) or not isinstance(page.get("question_ids"), list):
            raise ContractError("page archetype invalid")
        missing = [qid for qid in page["question_ids"] if qid not in by_id]
        if missing:
            raise ContractError(f"page archetype {page.get('id')} has unknown questions: {missing}")
    missing_observed = sorted(REQUIRED_OBSERVED_IDS - set(ids))
    if missing_observed:
        raise ContractError(f"observed application questions missing: {missing_observed}")
    if by_id["attestation.truth_accuracy"]["automation_policy"] != "manual_only":
        raise ContractError("truth/accuracy attestation must remain manual")
    for qid, question in by_id.items():
        if question["sensitivity"] == "legal-current" and question["confirmation_policy"] != "confirm_each_application":
            raise ContractError(f"{qid} must be confirmed each application")
        if qid.startswith("compensation.") and question["answer_scope"] != "opportunity":
            raise ContractError(f"{qid} must be opportunity-scoped")
        if question["sensitivity"].startswith("sensitive-") and question["automation_policy"] == "fill_if_confirmed_current":
            raise ContractError(f"{qid} must use explicit-preference semantics, not inferred current status")
        if qid in ROLE_FIT_IDS:
            if question.get("family") != "role-fit-claims" or question.get("sensitivity") != "professional-claim":
                raise ContractError(f"{qid} role-fit claim metadata invalid")
            if question.get("claim_policy") != "evidence_backed":
                raise ContractError(f"{qid} must be evidence-backed")
            if question.get("automation_policy") != "fill_if_explicit_preference":
                raise ContractError(f"{qid} must require an explicit preference")
    if by_id["credentials.relevant_certification_status"]["confirmation_policy"] != "confirm_each_application":
        raise ContractError("credential pursuit/status must be reconfirmed each application")
    reject_value_keys(data, "taxonomy")
    return {"questions": len(ids), "page_archetypes": len(pages), "role_fit_claims": len(ROLE_FIT_IDS)}

def validate_preferences(data: dict) -> None:
    if data.get("schema") != PREFERENCE_SCHEMA or data.get("version") != 1:
        raise ContractError("preference policy identity mismatch")
    storage = data.get("storage", {})
    if storage.get("persistence") != "browser-local" or storage.get("ownership") != "user":
        raise ContractError("preference cache must remain user-owned browser-local state")
    if storage.get("repository_tracking") != "forbidden":
        raise ContractError("real preference cache must never be repository-tracked")
    if storage.get("clear_behavior") != "remove_entire_storage_key":
        raise ContractError("clear behavior must remove the whole stored profile")
    for required in ("Save Preferences","Export Preferences","Import Preferences","Clear Preferences"):
        if required not in storage.get("controls", []):
            raise ContractError(f"missing preference control: {required}")
    portability = data.get("portability", {})
    if portability.get("export_schema") != "escapehatch-application-question-preferences/v1" or portability.get("max_import_bytes") != 65536:
        raise ContractError("preference portability contract mismatch")
    security = set(portability.get("security", []))
    for required in {"reject_oversized_payload","reject_unsupported_schema","accept_only_known_question_ids","never_execute_imported_content","never_log_preference_values"}:
        if required not in security:
            raise ContractError(f"missing preference security control: {required}")
    if data.get("resolution", {}).get("precedence") != ["session_confirmation","opportunity_override","profile_preference"]:
        raise ContractError("preference precedence mismatch")
    if data.get("attestation_policy") != "manual_only":
        raise ContractError("attestation policy must be manual_only")
    claims = data.get("professional_claims", {})
    if claims.get("policy") != "evidence_backed":
        raise ContractError("professional claims must be evidence_backed")
    required_claim_rules = {
        "do_not_upgrade_familiarity_into_experience",
        "do_not_upgrade_adjacent_skill_into_tool_specific_experience",
        "do_not_claim_industry_experience_from_adjacent_work",
        "do_not_claim_certification_or_pursuit_without_current_supporting_evidence",
        "self_rating_may_reflect_demonstrable_capability_even_when_recent_frequency_is_low",
    }
    missing = sorted(required_claim_rules - set(claims.get("rules", [])))
    if missing:
        raise ContractError(f"professional claim rules missing: {missing}")
    reject_value_keys(data, "preferences")

def self_tests(taxonomy: dict, preferences: dict) -> int:
    negatives = []
    item = copy.deepcopy(taxonomy); item["questions"].append(copy.deepcopy(item["questions"][0])); negatives.append((item, preferences))
    item = copy.deepcopy(taxonomy); item["page_archetypes"][0]["question_ids"].append("missing.question"); negatives.append((item, preferences))
    item = copy.deepcopy(taxonomy); next(q for q in item["questions"] if q["id"]=="attestation.truth_accuracy")["automation_policy"]="fill_if_explicit_preference"; negatives.append((item, preferences))
    item = copy.deepcopy(taxonomy); next(q for q in item["questions"] if q["id"]=="legal.non_compete_blocking")["confirmation_policy"]="until_changed"; negatives.append((item, preferences))
    item = copy.deepcopy(taxonomy); item["questions"][0]["preferred_answer"]="synthetic"; negatives.append((item, preferences))
    item = copy.deepcopy(taxonomy); next(q for q in item["questions"] if q["id"]=="skills.confluence_level")["claim_policy"]="assume_capability"; negatives.append((item, preferences))
    item = copy.deepcopy(taxonomy); next(q for q in item["questions"] if q["id"]=="credentials.relevant_certification_status")["confirmation_policy"]="until_changed"; negatives.append((item, preferences))
    pref = copy.deepcopy(preferences); pref["storage"]["controls"].remove("Clear Preferences"); negatives.append((taxonomy, pref))
    pref = copy.deepcopy(preferences); pref["professional_claims"]["policy"]="optimistic"; negatives.append((taxonomy, pref))
    count = 0
    for tax, pref in negatives:
        try:
            validate_taxonomy(tax); validate_preferences(pref)
        except ContractError:
            count += 1
        else:
            raise ContractError("negative fixture unexpectedly passed")
    return count

def main() -> int:
    try:
        taxonomy = load(TAXONOMY); preferences = load(PREFERENCES)
        info = validate_taxonomy(taxonomy); validate_preferences(preferences)
        negatives = self_tests(taxonomy, preferences)
    except ContractError as exc:
        print(f"APPLICATION_HARNESS_VALIDATION: FAIL: {exc}", file=sys.stderr); return 1
    print("APPLICATION_HARNESS_VALIDATION: PASS")
    print(f"taxonomy={TAXONOMY.relative_to(ROOT)}")
    print(f"preferences={PREFERENCES.relative_to(ROOT)}")
    print(f"questions={info['questions']}")
    print(f"page_archetypes={info['page_archetypes']}")
    print(f"role_fit_claims={info['role_fit_claims']}")
    print(f"negative_fixtures={negatives}")
    print("committed_real_preferences=FORBIDDEN")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
