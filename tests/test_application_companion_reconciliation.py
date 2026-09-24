#!/usr/bin/env python3
"""EH-Q1 reconciliation tests: provider-agnostic, synthetic only."""
import json
import pathlib
import sys
import copy

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from companion_reconciliation import reconcile, is_idempotent

FIXTURE_DIR = ROOT / "fixtures" / "application-companion-reconciliation"

def load_fixture(name):
    p = FIXTURE_DIR / name
    return json.loads(p.read_text(encoding="utf-8"))

def assert_no_leakage(obj):
    text = json.dumps(obj)
    forbidden = ["@gmail.com", "@northwell.edu", "password", "token"]
    for f in forbidden:
        assert f not in text.lower(), f"fixture leakage: {f}"
    assert "example.invalid" in text or "example.test" in text or "synthetic" in text.lower(), "fixture must use synthetic example.invalid domain"

def test_provider_read_back_required():
    data = load_fixture("fixture-01-provider-read-back-required.json")
    cs = data["career_state"]
    ps = data["provider_snapshot"]
    assert_no_leakage(data)
    # provider read_back false should not promote to SUBMITTED
    reconciled, result = reconcile(cs, ps)
    assert result["provider_read_back"] is False
    # execution should remain FILLED, not SUBMITTED
    exec_trans = next(e for e in result["execution_transition"] if e["application_id"] == "app-fixture-001")
    assert exec_trans["from"] == "FILLED"
    assert exec_trans["to"] == "FILLED", f"should not promote without read_back, got {exec_trans}"
    assert exec_trans["evidence_binding"] == "local"
    # freshness should remain SNAPSHOT
    fresh = next(f for f in result["freshness_transition"] if f["opportunity_id"] == "opp-fixture-001")
    assert fresh["from"] == "SNAPSHOT"
    assert fresh["to"] == "SNAPSHOT"
    # validate that reconciled state preserves history (opportunity still exists)
    assert any(o["id"] == "opp-fixture-001" for o in reconciled["opportunities"])

def test_live_verified_promotion():
    data = load_fixture("fixture-02-live-verified-promotion.json")
    cs = data["career_state"]
    ps = data["provider_snapshot"]
    assert_no_leakage(data)
    reconciled, result = reconcile(cs, ps)
    assert result["provider_read_back"] is True
    fresh = next(f for f in result["freshness_transition"] if f["opportunity_id"] == "opp-fixture-001")
    assert fresh["from"] == "SNAPSHOT"
    assert fresh["to"] == "LIVE_VERIFIED", f"expected promotion, got {fresh}"
    assert fresh["queue_active"] is True
    # opportunity verification should be LIVE_VERIFIED now
    opp = next(o for o in reconciled["opportunities"] if o["id"] == "opp-fixture-001")
    assert opp["verification"]["state"] == "LIVE_VERIFIED"
    assert opp["verification"]["source"] == "https://example.invalid/jobs/001"

def test_stale_closed_deactivation_without_history_deletion():
    data = load_fixture("fixture-03-stale-closed-deactivation.json")
    cs = data["career_state"]
    ps = data["provider_snapshot"]
    assert_no_leakage(data)
    # test STALE
    reconciled, result = reconcile(cs, ps)
    fresh = next(f for f in result["freshness_transition"] if f["opportunity_id"] == "opp-fixture-001")
    assert fresh["to"] == "STALE"
    assert fresh["queue_active"] is False
    assert fresh["history_preserved"] is True
    # execution should deactivate from READY_TO_APPLY to BLOCKED
    exec_trans = next(e for e in result["execution_transition"] if e["application_id"] == "app-fixture-001")
    assert exec_trans["from"] == "READY_TO_APPLY"
    assert exec_trans["to"] == "BLOCKED", f"stale should deactivate queue, got {exec_trans}"
    # history preserved: opportunity still exists
    assert len(reconciled["opportunities"]) == len(cs["opportunities"])
    assert reconciled["evidence"] == cs["evidence"]  # no deletion
    # also test CLOSED variant synthetically
    ps_closed = copy.deepcopy(ps)
    ps_closed["opportunities"][0]["verification"]["state"] = "CLOSED"
    ps_closed["opportunities"][0]["verification"]["detail"] = "Provider reports CLOSED"
    reconciled2, result2 = reconcile(cs, ps_closed)
    fresh2 = next(f for f in result2["freshness_transition"] if f["opportunity_id"] == "opp-fixture-001")
    assert fresh2["to"] == "CLOSED"
    assert fresh2["queue_active"] is False
    exec2 = next(e for e in result2["execution_transition"] if e["application_id"] == "app-fixture-001")
    assert exec2["to"] == "BLOCKED"
    assert len(reconciled2["opportunities"]) == len(cs["opportunities"])

def test_local_edit_remains_local_until_reconciled():
    data = load_fixture("fixture-04-local-edit-remains-local.json")
    cs = data["career_state"]
    ps = data["provider_snapshot"]
    assert_no_leakage(data)
    reconciled, result = reconcile(cs, ps)
    exec_trans = next(e for e in result["execution_transition"] if e["application_id"] == "app-fixture-001")
    # local note should remain local, not become provider
    assert exec_trans["evidence_binding"] == "local"
    assert exec_trans["to"] == "FILLED"
    # ensure no promotion to SUBMITTED
    assert exec_trans["to"] != "SUBMITTED"
    # also test without read_back
    ps_no_read = copy.deepcopy(ps)
    ps_no_read["read_back"] = False
    reconciled2, result2 = reconcile(cs, ps_no_read)
    exec2 = next(e for e in result2["execution_transition"] if e["application_id"] == "app-fixture-001")
    assert exec2["evidence_binding"] == "local"
    assert exec2["to"] == "FILLED"

def test_auth_failure_blocked_not_submitted():
    data = load_fixture("fixture-05-auth-failure-blocked.json")
    cs = data["career_state"]
    ps = data["provider_snapshot"]
    assert_no_leakage(data)
    reconciled, result = reconcile(cs, ps)
    exec_trans = next(e for e in result["execution_transition"] if e["application_id"] == "app-fixture-001")
    # must be BLOCKED or AWAITING_OPERATOR, never SUBMITTED
    assert exec_trans["to"] in ("BLOCKED", "AWAITING_OPERATOR"), f"auth failure should block, got {exec_trans}"
    assert exec_trans["to"] != "SUBMITTED"
    # also check that reconciled execution is BLOCKED
    app = next(a for a in reconciled["applications"] if a["id"] == "app-fixture-001")
    assert app["execution"]["state"] in ("BLOCKED", "AWAITING_OPERATOR")
    assert app["execution"]["state"] != "SUBMITTED"
    # ensure conflict preserved if local had pending submitted
    # in this fixture local is FILLED, provider wants SUBMITTED but auth fails -> BLOCKED

def test_draft_email_not_sent():
    data = load_fixture("fixture-06-draft-email-not-sent.json")
    cs = data["career_state"]
    ps = data["provider_snapshot"]
    assert_no_leakage(data)
    assert cs["applications"][0]["execution"]["channel"] == "email"
    reconciled, result = reconcile(cs, ps)
    exec_trans = next(e for e in result["execution_transition"] if e["application_id"] == "app-fixture-001")
    assert exec_trans["to"] != "SUBMITTED", f"draft email must not promote to SUBMITTED, got {exec_trans}"
    assert exec_trans["to"] in ("FILLED", "AWAITING_OPERATOR")
    # now test with operator_confirmed true should allow promotion (if qualifying)
    ps_confirmed = copy.deepcopy(ps)
    ps_confirmed["applications"][0]["operator_confirmed"] = True
    # add qualifying evidence
    ps_confirmed["applications"][0]["evidence"] = [{"id":"ev-confirmed-001","kind":"correspondence","observed_at":"2026-09-10T07:00:00-04:00"}]
    reconciled3, result3 = reconcile(cs, ps_confirmed)
    exec3 = next(e for e in result3["execution_transition"] if e["application_id"] == "app-fixture-001")
    # with operator_confirmed and qualifying, should allow SUBMITTED
    assert exec3["to"] == "SUBMITTED"
    assert exec3["evidence_binding"] == "operator_confirmed"

def test_idempotent_preserves_conflicts():
    data = load_fixture("fixture-07-idempotent-conflict-preserved.json")
    cs = data["career_state"]
    ps = data["provider_snapshot"]
    assert_no_leakage(data)
    reconciled, result = reconcile(cs, ps)
    # should flag conflict_preserved because local ev-local-007 vs provider ev-provider-007
    assert result["conflict_preserved"] is True, f"expected conflict preserved, got {result}"
    exec_trans = next(e for e in result["execution_transition"] if e["application_id"] == "app-fixture-001")
    assert exec_trans["conflict_preserved"] is True
    # stronger evidence should be provider (submission_receipt)
    assert exec_trans["evidence_binding"] in ("provider", "operator_confirmed")
    # evidence should preserve both? Provider evidence should be appended, local not overwritten
    assert any(e["id"] == "ev-local-007" for e in reconciled["evidence"])
    # re-run should be idempotent
    reconciled2, result2 = reconcile(reconciled, ps)
    assert json.dumps(reconciled, sort_keys=True) == json.dumps(reconciled2, sort_keys=True), "second run should be identical (idempotent)"
    assert result2["conflict_preserved"] is True
    # also test is_idempotent helper
    assert is_idempotent(cs, ps) is True
    # ensure history preserved
    assert result["history_preserved"] is True
    assert len(reconciled["opportunities"]) == len(cs["opportunities"])

def test_no_promotion_without_qualifying_evidence():
    # FILLED without qualifying should not become SUBMITTED
    cs = load_fixture("fixture-04-local-edit-remains-local.json")["career_state"]
    cs = copy.deepcopy(cs)
    # ensure FILLED with note (non-qualifying)
    assert cs["applications"][0]["execution"]["state"] == "FILLED"
    assert cs["evidence"][0]["kind"] == "note"
    ps = {
        "observed_at": "2026-09-10T07:00:00-04:00",
        "provider_id": "synthetic-provider",
        "read_back": True,
        "opportunities": [],
        "applications": [{"application_id":"app-fixture-001","execution":{"state":"SUBMITTED","channel":"web_form","last_transition_at":"2026-09-10T07:00:00-04:00"},"evidence":[],"auth":{"authorized": True}}]
    }
    reconciled, result = reconcile(cs, ps)
    exec_trans = next(e for e in result["execution_transition"] if e["application_id"] == "app-fixture-001")
    assert exec_trans["to"] != "SUBMITTED", "FILLED without qualifying evidence must not promote to SUBMITTED"
    assert exec_trans["reason"] == "SUBMITTED_requires_qualifying_evidence"

def test_undated_provider_evidence_does_not_promote():
    data = load_fixture("fixture-04-local-edit-remains-local.json")
    cs = copy.deepcopy(data["career_state"])
    ps = copy.deepcopy(data["provider_snapshot"])
    ps["read_back"] = True
    ps["observed_at"] = "2026-09-10T07:00:00-04:00"
    ps["applications"] = [{
        "application_id": "app-fixture-001",
        "execution": {
            "state": "SUBMITTED",
            "channel": "web_form",
            "last_transition_at": "2026-09-10T07:00:00-04:00",
        },
        "evidence": [{"id": "ev-undated", "kind": "submission_receipt"}],
        "auth": {"authorized": True},
    }]
    reconciled, result = reconcile(cs, ps)
    exec_trans = next(e for e in result["execution_transition"] if e["application_id"] == "app-fixture-001")
    assert exec_trans["to"] != "SUBMITTED", f"undated provider evidence must not promote: {exec_trans}"
    assert reconciled["applications"][0]["execution"]["state"] != "SUBMITTED"

def test_evidence_only_reconciliation_bumps_revision():
    data = load_fixture("fixture-07-idempotent-conflict-preserved.json")
    cs = copy.deepcopy(data["career_state"])
    ps = copy.deepcopy(data["provider_snapshot"])
    provider_app = ps["applications"][0]
    provider_opp = ps["opportunities"][0]
    app = cs["applications"][0]
    opp = cs["opportunities"][0]

    # Pre-align all non-evidence provider projections so provider evidence append is
    # the only durable mutation exercised by this regression.
    pv = provider_opp["verification"]
    opp["verification"] = {
        "state": pv["state"],
        "verified_at": pv["verified_at"],
        "detail": pv.get("detail") or "Live posting re-observed via provider read-back",
        "source": pv.get("source") or ps["provider_id"],
    }
    pe = provider_app["execution"]
    app["execution"]["state"] = pe["state"]
    app["execution"]["channel"] = pe["channel"]
    app["execution"]["last_transition_at"] = pe["last_transition_at"]
    app["execution"]["evidence_id"] = provider_app["evidence"][0]["id"]
    app["submitted_at"] = pe["last_transition_at"]
    app["external_reference"] = f"provider-{ps['provider_id']}-{app['id']}"
    cs["evidence"] = []

    before_revision = cs["revision"]
    reconciled, result = reconcile(cs, ps)
    assert any(e["id"] == "ev-provider-007" for e in reconciled["evidence"])
    assert reconciled["revision"] == before_revision + 1, "evidence-only persisted mutation must bump revision"

    reconciled2, _ = reconcile(reconciled, ps)
    assert reconciled2["revision"] == reconciled["revision"], "idempotent second reconciliation must not bump revision again"

def test_provider_snapshot_synthetic_only():
    # ensure provider snapshot uses example.invalid and no secrets
    all_fixtures = list(FIXTURE_DIR.glob("*.json"))
    assert len(all_fixtures) >= 7, f"expected at least 7 fixtures, got {len(all_fixtures)}"
    for p in all_fixtures:
        data = json.loads(p.read_text(encoding="utf-8"))
        assert_no_leakage(data)
        assert "career_state" in data and "provider_snapshot" in data

if __name__ == "__main__":
    test_provider_read_back_required()
    print("PASS provider_read_back_required")
    test_live_verified_promotion()
    print("PASS live_verified_promotion")
    test_stale_closed_deactivation_without_history_deletion()
    print("PASS stale_closed")
    test_local_edit_remains_local_until_reconciled()
    print("PASS local_edit")
    test_auth_failure_blocked_not_submitted()
    print("PASS auth_failure")
    test_draft_email_not_sent()
    print("PASS draft_email")
    test_idempotent_preserves_conflicts()
    print("PASS idempotent_conflict")
    test_no_promotion_without_qualifying_evidence()
    print("PASS no_promotion")
    test_undated_provider_evidence_does_not_promote()
    print("PASS undated_provider_evidence")
    test_evidence_only_reconciliation_bumps_revision()
    print("PASS evidence_only_revision")
    test_provider_snapshot_synthetic_only()
    print("PASS synthetic")
    print("ALL TESTS PASS")
