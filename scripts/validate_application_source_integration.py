#!/usr/bin/env python3
"""P04/P82 fail-closed architecture and lane contract; not runtime/OAuth proof."""
from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "harness/contracts/application-source-integration.v1.json"
DISPATCH = ROOT / "harness/reports/application-source-ux-p04-dispatch.v1.json"
SPEC = ROOT / "docs/APPLICATION_SOURCE_INTEGRATED_UX_P04_P82_2026-10-18.md"
PARENT = ROOT / "harness/contracts/application-autofill-parent.v1.json"

REQUIRED_LANES = ("F0", "A1", "B1", "C1", "D1", "I1", "R1", "M1")
REQUIRED_GATES = {
    "C1_EXISTING_AUTH_RECOVERY", "C2_NEW_USER_ONBOARD", "C3_CANONICAL_IMPORT",
    "C4_TWO_VIEW_UX", "C5_BROWSER_REVIEW", "C6_CROSS_TENANT_NEGATIVE",
    "C7_HOSTED_READINESS",
}

class ContractError(ValueError):
    pass


def require(value: bool, reason: str) -> None:
    if not value:
        raise ContractError(reason)


def validate(contract: dict, manifest: dict, document: str, parent: dict) -> None:
    require(isinstance(contract, dict) and contract.get("schema") == "escapehatch/integrated-career-source-ux/v1",
            "integration schema invalid")
    require(contract.get("canonical_owner") == parent.get("owner") == "docs/APPLICATION_ASSIST_AUTOPILOT_PLAN.md",
            "parent owner displaced")
    require(contract.get("parent_issue") == manifest.get("parent_issue") == parent.get("parent_issue"),
            "parent identity drift")
    require(parent.get("parent_status") == "OPEN" or all(
        x.get("status") == "PROVEN_LIVE" for x in parent.get("required_gates", [])),
        "parent falsely completed")
    require(contract.get("product_decision") == "ONE_PRODUCT_TWO_INTEGRATED_VIEWS"
            and contract.get("separate_website_default") is False,
            "second product or independent website disallowed")
    require(contract.get("shell") == "artifacts/escape-hatch", "existing app shell displaced")
    views = contract.get("views", [])
    require(isinstance(views, list) and len(views) == 2 and {x.get("key") for x in views} == {"sources", "applications"},
            "two views sharing one product are required")
    require(all(x.get("ui_owner") == "EscapeHatch" and x.get("state_owner") == "canonical_career_state" for x in views),
            "UI introduced duplicate state owner")
    route = {v["key"]: v.get("route_proposed") or v.get("route_existing") for v in views}
    require(route == {"sources": "/sources", "applications": "/assist"}, "route/shell integration drift")

    owners = contract.get("canonical_authorities", {})
    require(owners.get("candidate") == "existing_EscapeHatch_reviewed_profile"
            and owners.get("opportunities") == "existing_EscapeHatch_career_state_and_application_tracker_mapping",
            "new candidate or opportunity store")
    require(owners.get("selected_sources", "").startswith("user_private_source_manifest_consumer_of_PR66"),
            "existing PR66 source registry not reused")
    require(owners.get("provider_auth", "").startswith("TokenCorridor_adapter"),
            "existing provider recovery not prioritized")
    identity = contract.get("identity", {})
    for key, expected in (
        ("cross_tenant_source_fallback", "FORBIDDEN"),
        ("chatgpt_connector_credentials_transfer", "FORBIDDEN"),
        ("shared_credential_reuse_between_users", "FORBIDDEN"),
        ("source_credential_boundary", "private_connector_store_only"),
    ):
        require(identity.get(key) == expected, "cross account/secret trust boundary weakened: " + key)
    require(all(identity.get(key) for key in
        ("principal_key", "connection_key", "source_key", "opportunity_key", "document_version_key")),
        "critical identity binding missing")
    modes = {x.get("id"): x for x in contract.get("connection_modes", [])}
    require(set(modes) >= {"existing_local_authorization", "new_user_google_consent", "local_synced_files"},
            "existing/new user recovery modes missing")
    require(modes["existing_local_authorization"].get("no_google_cloud_setup") is True,
            "returning user wrongly forced to recreate OAuth project")
    require(modes["new_user_google_consent"].get("per_user_cloud_project_required") is False,
            "new users wrongly forced into Google Cloud Console")
    oauth = contract.get("oauth", {})
    require(oauth.get("preferred_google_scope") == "https://www.googleapis.com/auth/drive.file"
            and oauth.get("privileged_broad_drive_scope_default") == "FORBIDDEN"
            and oauth.get("preferred_picker") == "Google_Picker",
            "default Drive least privilege lost")
    require("explicit" in oauth.get("broader_scope_exception", "") and
            len(oauth.get("callback_security", [])) >= 7, "OAuth broadened without security gate")
    require(oauth.get("public_hosting_gate", "").startswith("registered_oauth_brand"),
            "unreviewed public OAuth rollout")
    pipeline = contract.get("source_pipeline", [])
    for gate in ("EXACT_BYTES_OR_DOC_TEXT_READ", "IMPORT_PREVIEW", "REVIEWED_AND_APPROVED",
                 "OPPORTUNITY_DOCUMENT_PACKAGE_READY", "REVIEW_READY_NOT_SUBMITTED"):
        require(gate in pipeline, "source/app pipeline lacks " + gate)
    require(pipeline.index("EXACT_BYTES_OR_DOC_TEXT_READ") < pipeline.index("REVIEWED_AND_APPROVED")
            < pipeline.index("DETERMINISTIC_BROWSER_PREPARATION"), "read-before-approve pipeline invalid")
    source = contract.get("import_policies", {})
    require(source.get("minimum_real_resume_reads", 0) >= 2 and source.get("bound_reads_to_verified_user_connection") is True
            and source.get("import_idempotent") is True and
            source.get("conflicting_or_stale_data") == "REVIEW_REQUIRED_NO_SILENT_OVERWRITE",
            "source truth/review invariant weakened")
    browser = contract.get("browser_policies", {})
    require(browser.get("final_submit") == "OPERATOR_ONLY"
            and browser.get("attestations_and_sensitive_confirmations") == "OPERATOR_ONLY"
            and browser.get("fill") == "DETERMINISTIC_CODE_ONLY_NO_AGENT_FORM_MUTATION"
            and browser.get("advance") == "TRUSTED_CONSEQUENCE_EVIDENCE_AND_SCOPED_AUTHORIZATION_ONLY",
            "agent browser mutation, attestation or final click authorized")
    gates = contract.get("verification_gates", [])
    require({g.get("id") for g in gates} == REQUIRED_GATES
            and all(g.get("receipt") and g.get("status") == "UNPROVEN" for g in gates),
            "unproven integration advertised as live")
    require(contract.get("release_status") == "DESIGN_AND_CONTRACT_ONLY"
            and contract.get("tracked_personal_information") == "FORBIDDEN"
            and contract.get("parent_completion_rule") == "ALL_NINE_EXISTING_PARENT_GATES_MUST_BE_PROVEN_LIVE",
            "prototype proof or private content elevated")
    require(len(parent.get("required_gates", [])) == 9, "parent completion gates lost")

    require(isinstance(manifest, dict) and manifest.get("schema") == "escapehatch/application-source-ux-dispatch/v1",
            "dispatch schema invalid")
    require(manifest.get("status") == "PLANNED_NOT_DISPATCHED"
            and manifest.get("owner") == contract.get("canonical_owner")
            and manifest.get("contract") == "harness/contracts/application-source-integration.v1.json",
            "dispatch false launched or authority displaced")
    lanes = manifest.get("lanes", [])
    require(isinstance(lanes, list) and tuple(x.get("id") for x in lanes) == REQUIRED_LANES,
            "lanes missing, reordered or duplicated")
    require(manifest.get("launch_order") == list(REQUIRED_LANES), "launch order divergence")
    lane_map = {l["id"]: l for l in lanes}
    for lane in lanes:
        require(lane.get("repo") in ("EndeavorEverlasting/EscapeHatch", "EndeavorEverlasting/TokenCorridor"),
                "lane routed to unrelated repo")
        require(bool(lane.get("read_first")) and bool(lane.get("owned"))
                and bool(lane.get("forbidden")) and bool(lane.get("proof")),
                "P04 lane lacks executable scope/acceptance")
        require(all(dep in lane_map and REQUIRED_LANES.index(dep) < REQUIRED_LANES.index(lane["id"])
                    for dep in lane.get("depends_on", [])),
                "invalid dependency, possible cycle or unbound lane")
    require(set(lane_map["I1"]["depends_on"]) == {"A1", "B1", "C1", "D1"}
            and set(lane_map["R1"]["depends_on"]) == {"I1"}
            and set(lane_map["M1"]["depends_on"]) == {"I1", "R1"}, "critical convergence/proof dependency broken")
    waves = manifest.get("waves", [])
    require([w.get("lanes") for w in waves] ==
            [["F0"], ["A1", "B1", "C1", "D1"], ["I1"], ["R1"], ["M1"]],
            "unsafe parallelism or missing convergence")
    require("App.tsx" in " ".join(lane_map["I1"]["owned"]) and
            "same shared file" in " ".join(lane_map["I1"]["forbidden"]),
            "shared App route writer not serialized")
    require(all(x in document for x in (
        "THESIS H1", "Prototype #1", "Baseline/comparator",
        "Measurement:", "Decision rule:", "Phase 1", "Phase 2", "Phase 3",
        "OAuth", "Two UIs", "P04", "P82", "not a provider authorization proof"
    )), "P04/P82 experimental or integration specification incomplete")


def main() -> int:
    try:
        validate(json.loads(CONTRACT.read_text(encoding="utf-8")),
                 json.loads(DISPATCH.read_text(encoding="utf-8")),
                 SPEC.read_text(encoding="utf-8"),
                 json.loads(PARENT.read_text(encoding="utf-8")))
        print("PASS P04/P82 integrated source/application UX architecture; not a live Google/browser proof")
        return 0
    except (ValueError, KeyError, TypeError, OSError) as exc:
        print("FAIL P04/P82 integrated source/application UX: " + str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
