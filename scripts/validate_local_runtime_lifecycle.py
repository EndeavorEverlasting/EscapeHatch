#!/usr/bin/env python3
"""Validate the EscapeHatch local-runtime lifecycle contract and ownership fixtures."""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "local-runtime-lifecycle.v1.json"
FIXTURE = ROOT / "fixtures" / "local-runtime-lifecycle.v1.example.json"
CONTRACT_SCHEMA = "escapehatch-local-runtime-lifecycle/v1"
FIXTURE_SCHEMA = "escapehatch-local-runtime-lifecycle-fixture/v1"

STATES = {
    "STOPPED",
    "OWNED_HEALTHY",
    "OWNED_ADOPTABLE",
    "OWNED_UNHEALTHY",
    "FOREIGN_CONFLICT",
    "STALE_RECEIPT",
}

INVARIANTS = {
    "port_occupancy_is_evidence_not_identity",
    "never_kill_unknown_listener",
    "terminate_only_after_positive_ownership_reproof",
    "powershell_job_is_not_runtime_identity",
    "single_canonical_lifecycle_manager",
    "graceful_shutdown_preferred",
    "forced_process_tree_is_bounded_fallback",
    "runtime_receipts_and_tokens_never_tracked",
    "browser_never_receives_shutdown_secret",
    "lifecycle_operations_serialized_per_repo_identity",
    "destructive_decision_rechecks_authoritative_state",
}

REQUIRED_CASE_IDS = {
    "positive-matching-healthy-runtime",
    "positive-adoptable-same-repo-no-receipt",
    "positive-owned-unhealthy-same-repo-vite",
    "negative-foreign-listener-never-killable",
    "negative-receipt-pid-reused",
    "negative-mismatched-instance-id",
    "negative-mismatched-repo-fingerprint",
    "negative-stale-receipt-no-process",
}

RECEIPT_FIELDS = {
    "schema",
    "instanceId",
    "repoFingerprint",
    "pid",
    "processStartTimeUtc",
    "host",
    "port",
    "runtimeProtocol",
    "shutdownToken",
    "startedAtUtc",
}


class LifecycleError(ValueError):
    pass


def load(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LifecycleError(f"{path.relative_to(ROOT)}: {exc}") from exc
    if not isinstance(value, dict):
        raise LifecycleError(f"{path.relative_to(ROOT)} must contain an object")
    return value


def require(value: bool, message: str) -> None:
    if not value:
        raise LifecycleError(message)


def validate_contract(contract: dict) -> None:
    require(contract.get("schema") == CONTRACT_SCHEMA, "contract schema mismatch")
    require(contract.get("version") == 1, "contract version mismatch")
    require(
        contract.get("governing_invariant")
        == "PORT OCCUPANCY IS EVIDENCE, NOT PROCESS IDENTITY.",
        "governing invariant mismatch",
    )

    invariants = set(contract.get("invariants", []))
    require(invariants == INVARIANTS, "contract invariant set mismatch")

    identity = contract.get("identity")
    require(isinstance(identity, dict), "identity contract missing")
    assert isinstance(identity, dict)
    require(
        identity.get("repo_fingerprint_algorithm")
        == "sha256(lowercase(normalized_absolute_repo_root))",
        "repo fingerprint algorithm mismatch",
    )
    require(identity.get("receipt_tracking") == "forbidden", "receipt tracking must be forbidden")
    require(
        set(identity.get("receipt_fields", [])) == RECEIPT_FIELDS,
        "receipt field set mismatch",
    )
    require(
        identity.get("receipt_write") == "atomic_after_successful_spawn_only",
        "receipt write policy mismatch",
    )
    require(
        isinstance(identity.get("lifecycle_lock"), str)
        and "repoFingerprint" in identity["lifecycle_lock"],
        "lifecycle lock key missing",
    )

    control = contract.get("control_plane")
    require(isinstance(control, dict), "control plane contract missing")
    assert isinstance(control, dict)
    require(control.get("identity_endpoint") == "GET /__escapehatch/runtime", "identity endpoint mismatch")
    require(control.get("shutdown_endpoint") == "POST /__escapehatch/shutdown", "shutdown endpoint mismatch")
    require(control.get("loopback_only") is True, "control plane must be loopback only")
    require(control.get("permissive_cors") == "forbidden", "permissive CORS must be forbidden")
    require(control.get("raw_repo_path_in_response") == "forbidden", "raw repo path leak must be forbidden")
    require(
        control.get("shutdown_token_in_logs_or_bodies") == "forbidden",
        "shutdown token leak must be forbidden",
    )
    require(control.get("shutdown_respond_before_close") is True, "shutdown must respond before close")
    require(
        control.get("shutdown_requires_matching_instance_id") is True,
        "shutdown must require matching instance id",
    )
    identity_fields = set(control.get("identity_response_fields", []))
    require(
        identity_fields
        == {
            "app",
            "protocol",
            "instanceId",
            "repoFingerprint",
            "pid",
            "startedAtUtc",
        },
        "identity response field set mismatch",
    )
    require(
        "shutdownToken" not in identity_fields,
        "shutdown token must never appear in identity response",
    )

    states = contract.get("states")
    require(isinstance(states, dict), "states contract missing")
    assert isinstance(states, dict)
    require(set(states) == STATES, "state set mismatch")

    foreign = states.get("FOREIGN_CONFLICT", {})
    require(foreign.get("kill_listener") == "forbidden", "FOREIGN_CONFLICT must forbid kill")
    require(foreign.get("start") == "fail_closed_nonzero", "FOREIGN_CONFLICT start must fail closed")
    behavior = set(foreign.get("required_behavior", []))
    require("do_not_kill" in behavior, "FOREIGN_CONFLICT must include do_not_kill")

    stale = states.get("STALE_RECEIPT", {})
    require(
        stale.get("kill_listener") == "forbidden_from_receipt_identity",
        "STALE_RECEIPT must forbid receipt-PID kill",
    )
    stale_behavior = set(stale.get("required_behavior", []))
    require(
        "never_act_on_receipt_pid" in stale_behavior,
        "STALE_RECEIPT must forbid acting on receipt PID",
    )

    healthy = states.get("OWNED_HEALTHY", {})
    require(
        healthy.get("stop") == "authenticated_graceful_shutdown",
        "OWNED_HEALTHY stop must be graceful",
    )
    require(
        healthy.get("kill_listener") == "forbidden_use_graceful_path_first",
        "OWNED_HEALTHY must prefer graceful path",
    )

    adoptable = states.get("OWNED_ADOPTABLE", {})
    require(
        adoptable.get("start") == "reconstruct_receipt_then_reuse",
        "OWNED_ADOPTABLE start must reconstruct receipt",
    )

    unhealthy = states.get("OWNED_UNHEALTHY", {})
    require(
        unhealthy.get("kill_listener") == "allowed_only_after_immediate_ownership_reproof",
        "OWNED_UNHEALTHY kill must require immediate reproof",
    )

    stopped = states.get("STOPPED", {})
    require(stopped.get("start") == "may_cold_start", "STOPPED start must allow cold start")
    require(stopped.get("stop") == "idempotent_success", "STOPPED stop must be idempotent")

    kill = contract.get("kill_policy")
    require(isinstance(kill, dict), "kill policy missing")
    assert isinstance(kill, dict)
    require(kill.get("default") == "never_kill_unproven_listener", "kill default mismatch")
    require(kill.get("port_number_alone_sufficient") is False, "port number alone must be insufficient")
    require(kill.get("receipt_pid_alone_sufficient") is False, "receipt PID alone must be insufficient")
    require(
        kill.get("powershell_job_alone_sufficient") is False,
        "PowerShell job alone must be insufficient",
    )
    require(
        kill.get("allowed_only_when") == "ownership_reproved_immediately_before_action",
        "kill reproof requirement mismatch",
    )
    require(kill.get("broad_process_name_kill") == "forbidden", "broad process-name kill must be forbidden")
    require(
        kill.get("unconditional_port_owner_kill") == "forbidden",
        "unconditional port-owner kill must be forbidden",
    )

    privacy = contract.get("privacy")
    require(isinstance(privacy, dict), "privacy contract missing")
    assert isinstance(privacy, dict)
    for key in (
        "shutdown_token_in_repository",
        "shutdown_token_in_ci_logs",
        "shutdown_token_in_http_response_body",
        "raw_repo_path_in_control_plane",
        "runtime_receipt_committed",
        "career_or_profile_data_in_runtime_logs",
    ):
        require(privacy.get(key) == "forbidden", f"privacy rule must be forbidden: {key}")
    require(privacy.get("fixture_tokens") == "synthetic_only", "fixture tokens must be synthetic")

    targets = contract.get("implementation_targets")
    require(isinstance(targets, dict), "implementation targets missing")
    assert isinstance(targets, dict)
    require(
        targets.get("canonical_manager") == "scripts/windows/EscapeHatch-Runtime.ps1",
        "canonical manager path mismatch",
    )
    require(
        set(targets.get("manager_actions", [])) == {"Start", "Stop", "Restart", "Status"},
        "manager action set mismatch",
    )
    require(
        targets.get("ownership_mechanism") == "os_process_pid_not_powershell_job",
        "ownership mechanism mismatch",
    )


def classify(case: dict, contract: dict, current_fingerprint: str) -> tuple[str, str, str, str]:
    """Return (state, start, stop, kill) for a synthetic ownership scenario."""
    states = contract["states"]

    def actions(state: str) -> tuple[str, str, str]:
        entry = states[state]
        return entry["start"], entry["stop"], entry["kill_listener"]

    listener = case.get("listener") or {}
    listener_present = bool(listener.get("present"))
    receipt = case.get("receipt")
    health = case.get("health")
    os_process = case.get("os_process")
    socket_owner = case.get("socket_owner_pid")

    if receipt is not None:
        receipt_fingerprint = receipt.get("repoFingerprint")
        if case.get("pid_reused"):
            start, stop, kill = actions("STALE_RECEIPT")
            return "STALE_RECEIPT", start, stop, kill
        if not os_process or os_process.get("pid") != receipt.get("pid"):
            start, stop, kill = actions("STALE_RECEIPT")
            return "STALE_RECEIPT", start, stop, kill
        if os_process.get("startUtc") != receipt.get("processStartTimeUtc"):
            start, stop, kill = actions("STALE_RECEIPT")
            return "STALE_RECEIPT", start, stop, kill
        if case.get("instance_id_mismatch") and health is not None:
            if health.get("instanceId") != receipt.get("instanceId"):
                start, stop, kill = actions("STALE_RECEIPT")
                return "STALE_RECEIPT", start, stop, kill
        if receipt_fingerprint != current_fingerprint:
            if listener_present:
                start, stop, kill = actions("FOREIGN_CONFLICT")
                return "FOREIGN_CONFLICT", start, stop, kill
            start, stop, kill = actions("STALE_RECEIPT")
            return "STALE_RECEIPT", start, stop, kill
        if (
            listener_present
            and health is not None
            and health.get("instanceId") == receipt.get("instanceId")
            and health.get("repoFingerprint") == receipt.get("repoFingerprint") == current_fingerprint
            and health.get("pid") == receipt.get("pid") == socket_owner
            and os_process.get("pid") == receipt.get("pid")
        ):
            start, stop, kill = actions("OWNED_HEALTHY")
            return "OWNED_HEALTHY", start, stop, kill

    if not listener_present:
        if receipt is not None:
            start, stop, kill = actions("STALE_RECEIPT")
            return "STALE_RECEIPT", start, stop, kill
        start, stop, kill = actions("STOPPED")
        return "STOPPED", start, stop, kill

    if health is not None:
        if health.get("repoFingerprint") != current_fingerprint:
            start, stop, kill = actions("FOREIGN_CONFLICT")
            return "FOREIGN_CONFLICT", start, stop, kill
        if (
            receipt is None
            and os_process is not None
            and socket_owner == health.get("pid") == os_process.get("pid")
            and "vite" in (os_process.get("commandLine") or "").lower()
        ):
            start, stop, kill = actions("OWNED_ADOPTABLE")
            return "OWNED_ADOPTABLE", start, stop, kill
        if receipt is not None and health.get("instanceId") != receipt.get("instanceId"):
            start, stop, kill = actions("STALE_RECEIPT")
            return "STALE_RECEIPT", start, stop, kill

    command_line = (os_process or {}).get("commandLine") or ""
    same_repo_signal = "escape-hatch" in command_line.replace("\\", "/").lower() or "vite" in command_line.lower()
    other_repo_signal = "other-checkout" in command_line.lower()
    if os_process is not None and socket_owner == os_process.get("pid") and same_repo_signal and not other_repo_signal:
        if case.get("unhealthy") or health is None:
            start, stop, kill = actions("OWNED_UNHEALTHY")
            return "OWNED_UNHEALTHY", start, stop, kill

    start, stop, kill = actions("FOREIGN_CONFLICT")
    return "FOREIGN_CONFLICT", start, stop, kill


def validate_fixture(contract: dict, fixture: dict) -> int:
    require(fixture.get("schema") == FIXTURE_SCHEMA, "fixture schema mismatch")
    require(fixture.get("contract") == CONTRACT_SCHEMA, "fixture contract binding mismatch")
    require(fixture.get("synthetic_only") is True, "fixture must be synthetic only")

    current_fingerprint = fixture.get("repo_fingerprint")
    require(isinstance(current_fingerprint, str) and len(current_fingerprint) == 64, "repo fingerprint invalid")
    require(
        fixture.get("other_repo_fingerprint") != current_fingerprint,
        "other_repo_fingerprint must differ",
    )

    cases = fixture.get("cases")
    require(isinstance(cases, list) and cases, "fixture cases missing")
    assert isinstance(cases, list)

    by_id = {case.get("id"): case for case in cases if isinstance(case, dict)}
    require(set(by_id) == REQUIRED_CASE_IDS, "fixture case id set mismatch")
    require(len(by_id) == len(cases), "fixture case ids must be unique")

    positive = [case for case in cases if case.get("kind") == "positive"]
    negative = [case for case in cases if case.get("kind") == "negative"]
    require(len(positive) == 3, "expected 3 positive fixtures")
    require(len(negative) == 5, "expected 5 negative fixtures")

    for case in cases:
        state, start, stop, kill = classify(case, contract, current_fingerprint)
        where = case["id"]
        require(state == case.get("expect_state"), f"{where}: state {state} != {case.get('expect_state')}")
        require(start == case.get("expect_start"), f"{where}: start action mismatch")
        require(stop == case.get("expect_stop"), f"{where}: stop action mismatch")
        require(kill == case.get("expect_kill"), f"{where}: kill policy mismatch")
        if case["id"] == "negative-foreign-listener-never-killable":
            require(kill == "forbidden", f"{where}: foreign listener must never be killable")
        if case["id"] == "negative-receipt-pid-reused":
            require(kill == "forbidden_from_receipt_identity", f"{where}: reused PID must not authorize kill")

    return len(cases)


def self_tests(contract: dict, fixture: dict) -> int:
    count = 0
    candidates: list[tuple[dict, dict]] = []

    c = copy.deepcopy(contract)
    c["invariants"].remove("port_occupancy_is_evidence_not_identity")
    candidates.append((c, copy.deepcopy(fixture)))

    c = copy.deepcopy(contract)
    c["states"]["FOREIGN_CONFLICT"]["kill_listener"] = "allowed_after_port_check"
    candidates.append((c, copy.deepcopy(fixture)))

    c = copy.deepcopy(contract)
    c["kill_policy"]["port_number_alone_sufficient"] = True
    candidates.append((c, copy.deepcopy(fixture)))

    c = copy.deepcopy(contract)
    c["control_plane"]["shutdown_token_in_logs_or_bodies"] = "allowed"
    candidates.append((c, copy.deepcopy(fixture)))

    c = copy.deepcopy(contract)
    del c["states"]["STALE_RECEIPT"]
    candidates.append((c, copy.deepcopy(fixture)))

    c = copy.deepcopy(contract)
    c["privacy"]["runtime_receipt_committed"] = "allowed"
    candidates.append((c, copy.deepcopy(fixture)))

    f = copy.deepcopy(fixture)
    f["cases"] = [case for case in f["cases"] if case["id"] != "negative-foreign-listener-never-killable"]
    candidates.append((copy.deepcopy(contract), f))

    f = copy.deepcopy(fixture)
    for case in f["cases"]:
        if case["id"] == "negative-foreign-listener-never-killable":
            case["expect_kill"] = "allowed_only_after_immediate_ownership_reproof"
    candidates.append((copy.deepcopy(contract), f))

    f = copy.deepcopy(fixture)
    for case in f["cases"]:
        if case["id"] == "negative-receipt-pid-reused":
            case["expect_state"] = "OWNED_HEALTHY"
    candidates.append((copy.deepcopy(contract), f))

    f = copy.deepcopy(fixture)
    f["synthetic_only"] = False
    candidates.append((copy.deepcopy(contract), f))

    for cand_contract, cand_fixture in candidates:
        try:
            validate_contract(cand_contract)
            validate_fixture(cand_contract, cand_fixture)
        except LifecycleError:
            count += 1
        else:
            raise LifecycleError("negative lifecycle fixture unexpectedly passed")
    return count


def main() -> int:
    try:
        contract = load(CONTRACT)
        fixture = load(FIXTURE)
        validate_contract(contract)
        cases = validate_fixture(contract, fixture)
        negatives = self_tests(contract, fixture)
    except LifecycleError as exc:
        print(f"LOCAL_RUNTIME_LIFECYCLE_VALIDATION: FAIL: {exc}", file=sys.stderr)
        return 1
    print("LOCAL_RUNTIME_LIFECYCLE_VALIDATION: PASS")
    print(f"contract={CONTRACT.relative_to(ROOT)}")
    print(f"fixture={FIXTURE.relative_to(ROOT)}")
    print(f"schema={CONTRACT_SCHEMA}")
    print(f"states={len(STATES)}")
    print(f"fixture_cases={cases}")
    print(f"positive_fixtures=3")
    print(f"negative_fixtures={5 + negatives}")
    print("governing_invariant=PORT_OCCUPANCY_IS_EVIDENCE_NOT_IDENTITY")
    print("foreign_conflict_kill=FORBIDDEN")
    print("stale_receipt_pid_kill=FORBIDDEN")
    print("proof_ceiling=repository_contract_validator_only")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
