#!/usr/bin/env python3
"""Validate EscapeHatch's local-first application-companion contract and synthetic session fixture."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "application-companion.v1.json"
FIXTURE = ROOT / "fixtures" / "application-companion.v1.example.json"
CAREER_FIXTURE = ROOT / "fixtures" / "career-state.v1.example.json"
CONTRACT_SCHEMA = "escapehatch/application-companion/v1"
SESSION_SCHEMA = "escapehatch-application-companion-session/v1"
CAREER_SCHEMA = "escapehatch-career-state/v1"
SURFACES = {"browser_extension", "windows_store_app", "android_store_app", "local_web_app"}
STATUSES = {"draft", "submitted", "screen", "interview", "offer", "rejected", "withdrawn", "closed"}
SOURCES = {"explicit_user_action", "same_session_page_confirmation", "user_confirmed_external_evidence"}
RECEIPT_METADATA = {"state_id", "local_revision", "remote_revision", "direction", "result", "observed_at"}
SHA256 = re.compile(r"^[a-f0-9]{64}$")


class CompanionError(ValueError):
    pass


def load(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CompanionError(f"{path.relative_to(ROOT)}: {exc}") from exc
    if not isinstance(value, dict):
        raise CompanionError(f"{path.relative_to(ROOT)} must contain an object")
    return value


def require(value: bool, message: str) -> None:
    if not value:
        raise CompanionError(message)


def validate_artifact(value: object, where: str) -> None:
    require(isinstance(value, dict), f"{where} must be an object")
    assert isinstance(value, dict)
    required = {"owner", "kind", "locator"}
    allowed = required | {"sha256"}
    require(required.issubset(value) and set(value).issubset(allowed), f"{where} fields invalid")
    require(value["owner"] in {"user", "escapehatch", "external"}, f"{where}.owner invalid")
    require(value["kind"] in {"inline", "relative_path", "uri", "content_hash"}, f"{where}.kind invalid")
    require(isinstance(value["locator"], str) and bool(value["locator"]), f"{where}.locator invalid")
    if value["kind"] == "relative_path":
        locator = Path(value["locator"])
        require(not locator.is_absolute() and ".." not in locator.parts, f"{where}.locator must be portable")
    if "sha256" in value:
        require(isinstance(value["sha256"], str) and bool(SHA256.fullmatch(value["sha256"])), f"{where}.sha256 invalid")


def validate_contract(contract: dict) -> None:
    require(contract.get("schema") == CONTRACT_SCHEMA, "contract schema mismatch")
    require(contract.get("version") == 1, "contract version mismatch")

    state = contract.get("state")
    require(isinstance(state, dict), "state contract missing")
    assert isinstance(state, dict)
    require(state.get("owner") == "user", "career state must remain user-owned")
    require(state.get("canonical_career_state") == CAREER_SCHEMA, "canonical career-state contract mismatch")
    require(state.get("primary_residence") == "local-first", "companion must remain local-first")
    require(state.get("repository_tracking") == "forbidden", "real user state must not be repository tracked")
    require(state.get("public_hosting_required") is False, "public hosting must remain optional")
    require(state.get("runtime_bundle_contains_user_state") is False, "runtime bundle must not contain user state")
    require(state.get("storage_identity") == "stable_user_owned_logical_store", "stable logical storage identity missing")

    surfaces = contract.get("surfaces")
    require(isinstance(surfaces, list), "surfaces must be an array")
    assert isinstance(surfaces, list)
    by_id = {item.get("id"): item for item in surfaces if isinstance(item, dict)}
    require(set(by_id) == SURFACES and len(by_id) == len(surfaces), "required companion surfaces missing/duplicated")
    for surface_id, surface in by_id.items():
        require(surface.get("public_hosting_required") is False, f"{surface_id} must not require public hosting")
        require(isinstance(surface.get("distribution"), list) and surface["distribution"], f"{surface_id} distribution missing")
        require(isinstance(surface.get("storage_adapter"), str) and surface["storage_adapter"], f"{surface_id} storage adapter missing")
    require("microsoft_store" in by_id["windows_store_app"]["distribution"], "Windows surface must include Microsoft Store")
    require("play_store" in by_id["android_store_app"]["distribution"], "Android surface must include Play Store")
    require("stable_loopback_origin" in by_id["local_web_app"]["distribution"], "local web app must support stable loopback origin")

    privacy = contract.get("profile_privacy")
    require(isinstance(privacy, dict), "profile privacy contract missing")
    assert isinstance(privacy, dict)
    require(privacy.get("visibility") == "private", "profile visibility must default private")
    require(privacy.get("public_profile_required") is False, "public profile must not be required")
    require(privacy.get("public_website_required") is False, "public website must not be required")
    require(privacy.get("build_seed_with_real_profile") == "forbidden", "real profile build seed must be forbidden")
    require(privacy.get("tracked_fixture_with_real_profile") == "forbidden", "real profile fixture must be forbidden")

    progress = contract.get("progress")
    require(isinstance(progress, dict), "progress contract missing")
    assert isinstance(progress, dict)
    require(progress.get("authority") == "assist_and_record_only", "companion authority must be assist-and-record only")
    require(set(progress.get("allowed_application_statuses", [])) == STATUSES, "application status set mismatch")
    require(set(progress.get("observation_sources", [])) == SOURCES, "progress observation source set mismatch")
    write_rules = set(progress.get("write_rules", []))
    for marker in {
        "validate_career_state_before_commit",
        "append_or_link_evidence_with_progress_change",
        "never_infer_status_from_url_alone",
        "never_submit_application",
        "never_navigate_past_submission_boundary",
        "never_accept_or_apply_attestation",
    }:
        require(marker in write_rules, f"progress rule missing: {marker}")
    require(progress.get("submission_boundary") == "user_performs_submission", "submission boundary must remain user-owned")
    require(progress.get("attestation_policy") == "manual_only", "attestation must remain manual")

    sync = contract.get("sync")
    require(isinstance(sync, dict), "sync contract missing")
    assert isinstance(sync, dict)
    require(sync.get("default") == "disabled", "remote sync must default disabled")
    adapters = sync.get("adapters")
    require(isinstance(adapters, list) and len(adapters) == 1, "exactly one remote adapter is defined in v1")
    drive = adapters[0]
    require(drive.get("id") == "google_drive" and drive.get("kind") == "optional_remote_sync", "Google Drive adapter missing")
    require(drive.get("authorization") == "explicit_user_authorization", "Google Drive sync must require explicit authorization")
    require(drive.get("destination") == "user_selected_file_or_folder", "Google Drive destination must be user-selected")
    require(drive.get("credential_in_state") == "forbidden", "credentials must not enter career state")
    require(drive.get("public_sharing") == "never_required", "Google Drive public sharing must never be required")
    conflicts = sync.get("conflict_policy", {})
    require(conflicts.get("divergence") == "preserve_both_and_require_resolution", "divergence must preserve both copies")
    require(conflicts.get("silent_overwrite") == "forbidden", "silent overwrite must be forbidden")
    receipt = sync.get("receipt", {})
    allowed_receipt = set(receipt.get("allowed_metadata", []))
    require(allowed_receipt == RECEIPT_METADATA, "sync receipt metadata allowlist mismatch")
    forbidden_receipt = set(receipt.get("forbidden_content", []))
    for marker in {"profile_values", "application_answers", "resume_content", "provider_tokens", "provider_credentials"}:
        require(marker in forbidden_receipt, f"sync receipt privacy marker missing: {marker}")
    require(not allowed_receipt.intersection(forbidden_receipt), "sync receipt allowlist overlaps forbidden content")

    portability = contract.get("portability")
    require(isinstance(portability, dict), "portability contract missing")
    assert isinstance(portability, dict)
    require(portability.get("explicit_export_import") is True, "explicit export/import must remain available")
    import_rules = set(portability.get("import_rules", []))
    for marker in {
        "validate_schema_before_replace_or_merge",
        "treat_imported_content_as_data_only",
        "preserve_current_state_on_invalid_import",
        "never_silently_delete_current_state",
        "surface_conflicts_for_resolution",
    }:
        require(marker in import_rules, f"import rule missing: {marker}")
    upgrade = set(portability.get("upgrade_invariants", []))
    require("do_not_bind_user_state_to_one_generated_bundle_path" in upgrade, "bundle-path independence missing")
    require("distribution_upgrade_must_not_clear_user_state" in upgrade, "upgrade state-preservation rule missing")

    telemetry = contract.get("telemetry")
    require(isinstance(telemetry, dict), "telemetry contract missing")
    assert isinstance(telemetry, dict)
    require(telemetry.get("default") == "off", "telemetry must default off")
    require(telemetry.get("profile_or_application_content") == "forbidden", "profile/application telemetry must be forbidden")
    require(telemetry.get("sync_is_not_telemetry") is True, "authorized sync must stay distinct from telemetry")


def validate_fixture(fixture: dict, contract: dict, career_fixture: dict) -> None:
    require(fixture.get("schema_version") == SESSION_SCHEMA, "session fixture schema mismatch")
    require(isinstance(fixture.get("session_id"), str) and bool(fixture["session_id"]), "session_id invalid")
    surface_ids = {item["id"] for item in contract["surfaces"]}
    require(fixture.get("surface_id") in surface_ids, "session fixture surface is not registered")

    career = fixture.get("career_state")
    require(isinstance(career, dict), "career_state reference missing")
    assert isinstance(career, dict)
    require(career.get("schema_version") == CAREER_SCHEMA, "session career-state schema mismatch")
    require(isinstance(career.get("state_id"), str) and bool(career["state_id"]), "state_id invalid")
    require(isinstance(career.get("revision"), int) and not isinstance(career["revision"], bool) and career["revision"] >= 1, "revision invalid")
    require(career_fixture.get("schema_version") == CAREER_SCHEMA, "canonical career fixture schema mismatch")
    require(career["state_id"] == career_fixture.get("state_id"), "session state_id must reference canonical career fixture")
    require(career["revision"] == career_fixture.get("revision"), "session revision must reference canonical career fixture")

    event = fixture.get("progress_event")
    require(isinstance(event, dict), "progress event missing")
    assert isinstance(event, dict)
    for key in ("event_id", "opportunity_id", "application_id", "observed_at"):
        require(isinstance(event.get(key), str) and bool(event[key]), f"progress_event.{key} invalid")
    require(event.get("status") in STATUSES, "progress_event.status invalid")
    require(event.get("source") in SOURCES, "progress_event.source invalid")
    validate_artifact(event.get("evidence"), "progress_event.evidence")

    opportunities = {
        item.get("id"): item
        for item in career_fixture.get("opportunities", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    applications = {
        item.get("id"): item
        for item in career_fixture.get("applications", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    require(event["opportunity_id"] in opportunities, "progress_event.opportunity_id must reference canonical career fixture")
    require(event["application_id"] in applications, "progress_event.application_id must reference canonical career fixture")
    require(applications[event["application_id"]].get("opportunity_id") == event["opportunity_id"], "progress event application/opportunity mismatch")

    sync = fixture.get("sync")
    require(isinstance(sync, dict), "sync fixture missing")
    assert isinstance(sync, dict)
    drive = sync.get("google_drive")
    require(isinstance(drive, dict), "Google Drive fixture missing")
    assert isinstance(drive, dict)
    require(drive.get("enabled") is True, "synthetic Google Drive example should exercise enabled sync")
    require(drive.get("authorization") == "explicit_user_authorization", "fixture must show explicit sync authorization")
    validate_artifact(drive.get("destination"), "sync.google_drive.destination")
    require(drive["destination"]["owner"] == "user" and drive["destination"]["kind"] == "uri", "sync destination must be a user-owned URI")
    require(isinstance(drive.get("last_synced_revision"), int) and drive["last_synced_revision"] >= 1, "last_synced_revision invalid")
    require(drive["last_synced_revision"] == career["revision"], "synthetic sync revision must match referenced career-state revision")
    forbidden = {"token", "access_token", "refresh_token", "password", "secret", "credential"}
    require(not any(key.lower() in forbidden for key in drive), "fixture must not contain provider credentials")


def self_tests(contract: dict, fixture: dict, career_fixture: dict) -> int:
    negatives: list[tuple[dict, dict]] = []

    def pair() -> tuple[dict, dict]:
        return json.loads(json.dumps(contract)), json.loads(json.dumps(fixture))

    c, f = pair(); c["state"]["public_hosting_required"] = True; negatives.append((c, f))
    c, f = pair(); c["profile_privacy"]["visibility"] = "public"; negatives.append((c, f))
    c, f = pair(); c["surfaces"] = [item for item in c["surfaces"] if item["id"] != "local_web_app"]; negatives.append((c, f))
    c, f = pair(); c["sync"]["default"] = "enabled"; negatives.append((c, f))
    c, f = pair(); c["sync"]["conflict_policy"]["silent_overwrite"] = "allowed"; negatives.append((c, f))
    c, f = pair(); c["sync"]["receipt"]["allowed_metadata"].append("profile_values"); negatives.append((c, f))
    c, f = pair(); c["progress"]["write_rules"].remove("never_submit_application"); negatives.append((c, f))
    c, f = pair(); c["telemetry"]["profile_or_application_content"] = "allowed"; negatives.append((c, f))
    c, f = pair(); f["career_state"]["revision"] += 1; negatives.append((c, f))
    c, f = pair(); f["progress_event"]["application_id"] = "missing"; negatives.append((c, f))
    c, f = pair(); f["progress_event"]["opportunity_id"] = "missing"; negatives.append((c, f))
    c, f = pair(); f["progress_event"]["evidence"]["locator"] = "../private.json"; negatives.append((c, f))
    c, f = pair(); f["progress_event"]["evidence"]["sha256"] = "bad"; negatives.append((c, f))
    c, f = pair(); f["sync"]["google_drive"]["last_synced_revision"] = f["career_state"]["revision"] - 1; negatives.append((c, f))
    c, f = pair(); f["sync"]["google_drive"]["access_token"] = "example"; negatives.append((c, f))

    passed = 0
    for number, (candidate_contract, candidate_fixture) in enumerate(negatives, 1):
        try:
            validate_contract(candidate_contract)
            validate_fixture(candidate_fixture, candidate_contract, career_fixture)
        except CompanionError:
            passed += 1
            continue
        raise CompanionError(f"negative fixture {number} unexpectedly passed")
    return passed


def main() -> int:
    try:
        contract = load(CONTRACT)
        fixture = load(FIXTURE)
        career_fixture = load(CAREER_FIXTURE)
        validate_contract(contract)
        validate_fixture(fixture, contract, career_fixture)
        negatives = self_tests(contract, fixture, career_fixture)
    except CompanionError as exc:
        print(f"APPLICATION_COMPANION_VALIDATION: FAIL: {exc}", file=sys.stderr)
        return 1
    print("APPLICATION_COMPANION_VALIDATION: PASS")
    print(f"contract={CONTRACT.relative_to(ROOT)}")
    print(f"fixture={FIXTURE.relative_to(ROOT)}")
    print(f"career_fixture={CAREER_FIXTURE.relative_to(ROOT)}")
    print(f"surfaces={len(contract['surfaces'])}")
    print("public_hosting_required=FALSE")
    print("profile_visibility=PRIVATE")
    print("canonical_career_state_binding=PASS")
    print("google_drive_sync=EXPLICIT_OPT_IN")
    print("sync_receipt_allowlist=PASS")
    print("sync_revision_binding=PASS")
    print("silent_overwrite=FORBIDDEN")
    print("submission_boundary=USER")
    print(f"negative_fixtures={negatives}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
