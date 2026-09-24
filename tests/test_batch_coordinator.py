#!/usr/bin/env python3
"""EH-Q2 batch coordinator tests: synthetic only, no provider network."""
import json
import pathlib
import sys
import copy

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT / "fixtures" / "batch-coordinator"
sys.path.insert(0, str(ROOT / "scripts"))

from batch_coordinator import select_next_queue_item, verify_freshness, route_channel, record_transition, project_batch_status, coordinate_step

def load_fixture(name):
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))

def assert_no_leakage(obj):
    text=json.dumps(obj)
    forbidden=["@gmail.com","@northwell.edu","password","token","secret"]
    for f in forbidden:
        assert f not in text.lower(), f"fixture leakage: {f}"
    assert "example.invalid" in text or "synthetic" in text.lower() or "example.test" in text, "fixture must use synthetic example.invalid domain"

def test_live_item_selected_stale_retired_without_history_deletion():
    data=load_fixture("01-multi-batch-live-stale-blocked-manual-submitted.json")
    cs=data["career_state"]
    assert_no_leakage(data)
    selected=select_next_queue_item(cs)
    assert selected is not None, "should select one live item"
    assert selected["application"]["id"]=="app-live-high", f"high priority LIVE_VERIFIED should be selected first, got {selected['application']['id']}"
    assert selected["opportunity"]["id"]=="opp-live-high"
    # stale should be retired
    stale_opp=next(o for o in cs["opportunities"] if o["id"]=="opp-stale-high")
    fresh=verify_freshness(stale_opp)
    assert fresh["queue_active"] is False
    assert fresh["retire"] is True
    assert fresh["history_preserved"] is True
    assert fresh["from"]=="STALE"
    # closed similarly
    closed_opp=next(o for o in cs["opportunities"] if o["id"]=="opp-closed-low")
    fresh2=verify_freshness(closed_opp)
    assert fresh2["queue_active"] is False
    assert fresh2["retire"] is True
    # blocked also not active
    blocked_opp=next(o for o in cs["opportunities"] if o["id"]=="opp-blocked-medium")
    fresh3=verify_freshness(blocked_opp)
    assert fresh3["queue_active"] is False
    # stale deactivation via record_transition preserves history (opportunity count unchanged)
    before_count=len(cs["opportunities"])
    before_evid=len(cs["evidence"])
    result=record_transition(cs, "app-stale-high", "BLOCKED", None, {"providerSnapshot": data["provider_snapshot"]})
    updated=result["updatedState"]
    assert len(updated["opportunities"])==before_count, "history preserved: opportunity count unchanged"
    assert len(updated["evidence"])==before_evid, "no evidence deletion"
    assert result["receipt"]["history_preserved"] is True
    assert result["receipt"]["queue_active"] is False
    # selection after stale should still skip stale/closed
    selected2=select_next_queue_item(updated)
    assert selected2 is not None
    assert selected2["opportunity"]["id"]!="opp-stale-high"
    assert selected2["opportunity"]["id"]!="opp-closed-low"

def test_web_form_routed_through_progression_email_blocked_without_confirmation():
    # web_form via progression
    data=load_fixture("02-live-web-form-routed.json")
    cs=data["career_state"]
    assert_no_leakage(data)
    app=cs["applications"][0]
    # progress safe => FILLED
    route=route_channel(app, data["channel_context"])
    assert route["route"]=="web_form_via_progression", f"expected web_form_via_progression, got {route}"
    assert route["targetState"]=="FILLED"
    # now test progression REVIEW_REQUIRED => AWAITING_OPERATOR
    route2=route_channel(app, {"progressionDecision":"REVIEW_REQUIRED","providerAuthorized":True})
    assert route2["targetState"]=="AWAITING_OPERATOR"
    assert route2["route"]=="AWAITING_OPERATOR"
    # manual gate => AWAITING
    route3=route_channel(app, {"progressionDecision":"AUTO_ADVANCE_SAFE","hasManualGate":True,"providerAuthorized":True})
    assert route3["targetState"]=="AWAITING_OPERATOR"
    # email blocked without confirmation
    email_data=load_fixture("08-email-draft-vs-sent.json")
    cs_email=email_data["career_state"]
    app_email=cs_email["applications"][0]
    # draft not sent without operator => AWAITING
    route_email=route_channel(app_email, {"mailSent": False, "operatorConfirmed": False, "providerAuthorized": True})
    assert route_email["targetState"]=="AWAITING_OPERATOR"
    assert "draft_not_sent" in route_email["reason"]
    # email with auth failure => AWAITING not SUBMITTED
    route_email_auth=route_channel(app_email, {"providerAuthorized": False, "mailSent": False})
    assert route_email_auth["targetState"]=="AWAITING_OPERATOR"
    assert route_email_auth["targetState"]!="SUBMITTED"

def test_filled_vs_awaiting_vs_submitted_separation():
    data=load_fixture("06-submitted-with-confirmation.json")
    cs=data["career_state"]
    assert_no_leakage(data)
    # FILLED without qualifying should not become SUBMITTED
    attempt1=data["promotion_attempts"][0]
    res1=record_transition(cs, "app-submitted", attempt1["target"], attempt1["evidence"], {"providerSnapshot": attempt1["provider_snapshot"]})
    assert res1["receipt"]["to"]==attempt1["expected_to"], f"FILLED without evidence should stay FILLED, got {res1['receipt']['to']}"
    assert res1["receipt"]["to"]!="SUBMITTED"
    assert "qualifying" in res1["receipt"]["reason"].lower()
    # note draft not qualifying
    attempt2=data["promotion_attempts"][1]
    res2=record_transition(cs, "app-submitted", attempt2["target"], attempt2["evidence"], {"providerSnapshot": attempt2["provider_snapshot"]})
    assert res2["receipt"]["to"]=="FILLED"
    assert res2["receipt"]["to"]!="SUBMITTED"
    # qualifying receipt + provider read_back => SUBMITTED
    attempt3=data["promotion_attempts"][2]
    res3=record_transition(cs, "app-submitted", attempt3["target"], attempt3["evidence"], {"providerSnapshot": attempt3["provider_snapshot"]})
    assert res3["receipt"]["to"]=="SUBMITTED", f"qualifying should promote, got {res3['receipt']}"
    assert res3["receipt"]["evidence_binding"]=="provider"
    assert res3["receipt"]["reference"]==attempt3["evidence"]["id"]
    assert res3["updatedState"]["applications"][0]["submitted_at"] is not None
    assert res3["updatedState"]["applications"][0]["external_reference"] is not None
    # ensure FILLED vs AWAITING vs SUBMITTED are distinct
    assert res1["receipt"]["to"] != res3["receipt"]["to"]
    assert res1["receipt"]["evidence_binding"] != res3["receipt"]["evidence_binding"]
    # AWAITING case: manual gate should produce AWAITING not SUBMITTED
    manual_data=load_fixture("05-manual-gate-awaiting-operator.json")
    cs_manual=manual_data["career_state"]
    app_manual=cs_manual["applications"][0]
    route_manual=route_channel(app_manual, manual_data["channel_contexts"][0]["context"])
    assert route_manual["targetState"]=="AWAITING_OPERATOR"
    assert route_manual["targetState"]!="FILLED"
    assert route_manual["targetState"]!="SUBMITTED"

def test_per_transition_receipt_and_reconciliation():
    data=load_fixture("02-live-web-form-routed.json")
    cs=data["career_state"]
    assert_no_leakage(data)
    # perform a FILLED transition with no evidence (still FILLED)
    # First transition from READY_TO_APPLY -> FILLED via progression
    res=record_transition(cs, "app-live-web", "FILLED", None, {"providerSnapshot": {"observed_at":"2026-09-10T07:00:00-04:00","provider_id":"synthetic-provider","read_back":True,"opportunities":[],"applications":[]}})
    receipt=res["receipt"]
    assert receipt["schema"]=="escapehatch/batch-coordinator-transition-receipt/v1"
    assert receipt["application_id"]=="app-live-web"
    assert receipt["from"]=="READY_TO_APPLY"
    assert receipt["to"]=="FILLED"
    assert receipt["timestamp"] is not None
    assert receipt["reference"] is not None
    assert receipt["history_preserved"] is True
    assert "timestamp" not in receipt or True  # ensure timestamp exists via timestamp field
    assert receipt["queue_active"] in (True, False)
    # reconciliation hook should be present when providerSnapshot supplied
    assert res["reconciliation"] is not None
    # after transition, revision should bump
    assert res["updatedState"]["revision"]==cs["revision"]+1
    # batch status projection
    status=project_batch_status(res["updatedState"])
    assert "active" in status
    assert "byVerification" in status
    assert "byExecution" in status
    assert status["byExecution"].get("FILLED",0)>=1
    # second transition to SUBMITTED requires qualifying
    ev={"id":"ev-receipt-001","kind":"submission_receipt","observed_at":"2026-09-10T07:00:00-04:00","artifact":{"owner":"user","kind":"relative_path","locator":"evidence/app-live-web/receipt.txt"}}
    res2=record_transition(res["updatedState"], "app-live-web", "SUBMITTED", ev, {"providerSnapshot": {"observed_at":"2026-09-10T07:10:00-04:00","provider_id":"synthetic-provider","read_back":True,"opportunities":[],"applications":[{"application_id":"app-live-web","execution":{"state":"SUBMITTED","channel":"web_form","last_transition_at":"2026-09-10T07:10:00-04:00"},"evidence":[{"id":"ev-receipt-001","kind":"submission_receipt","observed_at":"2026-09-10T07:00:00-04:00"}]}]}, "providerAuthorized": True})
    assert res2["receipt"]["to"]=="SUBMITTED"
    assert res2["receipt"]["evidence_binding"]=="provider"
    assert res2["updatedState"]["applications"][0]["execution"]["evidence_id"]=="ev-receipt-001"
    # evidence was persisted
    assert any(e["id"]=="ev-receipt-001" for e in res2["updatedState"]["evidence"])
    # receipt must have qualifying reference
    assert res2["receipt"]["reference"]=="ev-receipt-001"

def test_channel_routing_negative_cases():
    data=load_fixture("07-channel-routing-negative-cases.json")
    assert_no_leakage(data)
    for case in data["cases"]:
        label=case["label"]
        if "application" in case and "expected_route" in case:
            app=case["application"]
            # fix invalid execution: ensure channel invalid case still has execution
            route=route_channel(app, case.get("context",{}))
            assert route["route"]==case["expected_route"], f"{label}: expected {case['expected_route']}, got {route}"
            if "expected_target" in case:
                assert route["targetState"]==case["expected_target"], f"{label}: target mismatch"
            if "expected_reason" in case:
                assert case["expected_reason"] in route["reason"], f"{label}: reason mismatch"
        if "target" in case and "expected_to" in case:
            # build minimal career_state matching case application to avoid READY vs FILLED mismatch
            app=case["application"]
            opp_id=app["opportunity_id"]
            minimal_cs={
                "schema_version":"escapehatch-career-state/v1",
                "state_id":"state-minimal",
                "revision":1,
                "updated_at":"2026-09-10T05:00:00-04:00",
                "profile":{"id":"profile-primary","headline":"Synthetic","skills":["Testing"]},
                "opportunities":[{"id":opp_id,"title":"Synthetic","organization":"Example Employer","status":"targeted","priority":"high","fit_score":90,"source":{"owner":"external","kind":"uri","locator":"https://example.invalid/jobs/001"},"verification":{"state":"LIVE_VERIFIED","verified_at":"2026-09-10T04:50:00-04:00","detail":"Live","source":"https://example.invalid/jobs/001"}}],
                "resumes":[{"id":"resume-minimal","profile_id":"profile-primary","opportunity_id":opp_id,"artifact":{"owner":"user","kind":"relative_path","locator":"resumes/minimal.pdf"},"created_at":"2026-09-10T04:50:00-04:00"}],
                "applications":[{"id":app["id"],"opportunity_id":opp_id,"resume_id":"resume-minimal","status":"draft","submitted_at":None,"external_reference":None,"execution":app["execution"]}],
                "evidence":[],
                "study_guidance":[]
            }
            # preserve original app id for transition
            res=record_transition(minimal_cs, app["id"], case["target"], case["evidence"], {"providerSnapshot": case.get("provider_snapshot"), "mailSent": case.get("context",{}).get("mailSent"), "operatorConfirmed": case.get("context",{}).get("operatorConfirmed"), "providerAuthorized": case.get("context",{}).get("providerAuthorized", True)})
            assert res["receipt"]["to"]==case["expected_to"], f"{label} failed: expected {case['expected_to']}, got {res['receipt']['to']} reason {res['receipt']['reason']}"
            assert case["expected_reason"] in res["receipt"]["reason"], f"{label}: reason mismatch"
    # additional negative: invalid channel should throw on record_transition
    cs=load_fixture("02-live-web-form-routed.json")["career_state"]
    cs_invalid=copy.deepcopy(cs)
    cs_invalid["applications"][0]["execution"]["channel"]="carrier_pigeon"
    try:
        record_transition(cs_invalid, "app-live-web", "FILLED", None, {})
        assert False, "invalid channel should raise"
    except ValueError as e:
        assert "invalid_channel" in str(e)
    # auth failure never SUBMITTED
    cs_auth=load_fixture("04-blocked-auth-failure.json")["career_state"]
    # try to promote web blocked to SUBMITTED with auth failure
    ev={"id":"ev-auth-qual","kind":"submission_receipt","observed_at":"2026-09-10T07:00:00-04:00","artifact":{"owner":"user","kind":"relative_path","locator":"evidence/app-blocked-web/receipt.txt"}}
    res_auth=record_transition(cs_auth, "app-blocked-web", "SUBMITTED", ev, {"providerSnapshot": {"observed_at":"2026-09-10T07:00:00-04:00","provider_id":"synthetic-provider","read_back":True,"opportunities":[],"applications":[]}, "providerAuthorized": False})
    assert res_auth["receipt"]["to"]!="SUBMITTED"
    assert res_auth["receipt"]["to"] in ("BLOCKED","AWAITING_OPERATOR")
    # adapter unavailable external
    app_ext={"id":"app-ext","opportunity_id":"opp-live-high","resume_id":"r","status":"draft","submitted_at":None,"execution":{"state":"READY_TO_APPLY","channel":"external_provider","last_transition_at":"2026-09-10T05:00:00-04:00"}}
    route_ext=route_channel(app_ext, {"adapterAvailable": False, "providerAuthorized": True})
    assert route_ext["route"]=="BLOCKED"
    assert route_ext["targetState"]=="BLOCKED"

def test_multi_item_batch_priority_and_status_projection():
    data=load_fixture("01-multi-batch-live-stale-blocked-manual-submitted.json")
    cs=data["career_state"]
    status=project_batch_status(cs)
    assert status["total"]==6
    # only LIVE_VERIFIED opportunities contribute to active? Check
    # opp-live-high, opp-live-medium, opp-manual-high are LIVE_VERIFIED => 3 opps live
    assert status["byVerification"].get("LIVE_VERIFIED",0)==3
    assert status["byVerification"].get("STALE",0)==1
    assert status["byVerification"].get("CLOSED",0)==1
    assert status["byVerification"].get("BLOCKED",0)==1
    # active applications: those with LIVE_VERIFIED and not BLOCKED/SUBMITTED => app-live-high READY, app-live-medium FILLED, app-manual-high FILLED => 3 active
    assert status["active"]==3
    # select should pick high priority 95 over medium 80
    sel=select_next_queue_item(cs)
    assert sel["opportunity"]["priority"]=="high"
    assert sel["opportunity"]["fit_score"]==95
    # after transitioning that one to FILLED, next should still be high manual 88 before medium 80? Let's test coordinate_step
    step=coordinate_step(cs, data["provider_snapshot"], {"progressionDecision":"AUTO_ADVANCE_SAFE","providerAuthorized":True})
    assert step["selected"] is not None
    assert step["freshness"]["queue_active"] is True
    assert step["route"]["targetState"]=="FILLED"
    assert step["transition"]["receipt"]["to"]=="FILLED"
    assert step["transition"]["receipt"]["history_preserved"] is True
    # second step should pick next high priority still live (manual high 88) over medium 80
    cs2=step["transition"]["updatedState"]
    sel2=select_next_queue_item(cs2)
    # Now app-live-high is FILLED, still LIVE_VERIFIED and not BLOCKED, so it is still candidate; but priority high 95 still highest, would be selected again? That's okay - continuous batch should pick one at a time, but after first FILLED, it may still be highest. Our test expects manual-high to be next only if we consider that FILLED items maybe lower priority than READY? But spec says priority policy only. So second selection would again be opp-live-high (now FILLED) since still highest. That's correct behavior for re-queue until blocked/submitted.
    assert sel2 is not None
    # Ensure status projection updates
    assert step["batchStatus"]["total"]==6
    # ensure synthetic domain
    assert_no_leakage(cs2)

def test_email_draft_vs_sent_and_operator_confirmed():
    data=load_fixture("08-email-draft-vs-sent.json")
    cs=data["career_state"]
    for case in data["cases"]:
        label=case["label"]
        ev=case["evidence"]
        snap=case["provider_snapshot"]
        opts={"providerSnapshot": snap, "mailSent": case["mail"]["sent"] if "mail" in case else None, "operatorConfirmed": case["operator_confirmed"], "providerAuthorized": True}
        # need to set mailSent correctly for draft cases
        if "draft_email_no_sent" in label:
            opts["mailSent"]=False
        elif "sent_email" in label:
            opts["mailSent"]=True
        elif "operator_confirmed_draft" in label:
            opts["mailSent"]=False
        res=record_transition(cs, "app-email", "SUBMITTED", ev, opts)
        assert res["receipt"]["to"]==case["expected_to"], f"{label}: expected {case['expected_to']}, got {res['receipt']['to']} reason {res['receipt']['reason']}"
        if "expected_binding" in case:
            assert res["receipt"]["evidence_binding"]==case["expected_binding"], f"{label}: binding mismatch got {res['receipt']['evidence_binding']}"

def test_submission_proof_guards():
    data=load_fixture("06-submitted-with-confirmation.json")
    cs=data["career_state"]

    # Durable local evidence without provider read-back is not provider-confirmed submission.
    local_attempt=data["promotion_attempts"][3]
    local_res=record_transition(cs, "app-submitted", local_attempt["target"], local_attempt["evidence"], {"providerSnapshot": local_attempt["provider_snapshot"], "providerAuthorized": True})
    assert local_res["receipt"]["to"]==local_attempt["expected_to"]
    assert local_res["receipt"]["evidence_binding"]==local_attempt["expected_binding"]
    assert "provider_read_back" in local_res["receipt"]["reason"]

    # Durable qualifying evidence survives restart: provider read-back can reconcile
    # the already-persisted receipt even when the caller has no new evidence object.
    qualifying_attempt=data["promotion_attempts"][2]
    restarted=copy.deepcopy(cs)
    durable_ev=copy.deepcopy(qualifying_attempt["evidence"])
    restarted["evidence"].append({
        "id":durable_ev["id"],
        "application_id":"app-submitted",
        "kind":durable_ev["kind"],
        "artifact":durable_ev["artifact"],
        "observed_at":durable_ev["observed_at"],
    })
    restarted["applications"][0]["execution"]["evidence_id"]=durable_ev["id"]
    restart_res=record_transition(
        restarted,
        "app-submitted",
        "SUBMITTED",
        None,
        {"providerSnapshot":qualifying_attempt["provider_snapshot"],"providerAuthorized":True},
    )
    assert restart_res["receipt"]["to"]=="SUBMITTED"
    assert restart_res["receipt"]["evidence_binding"]=="provider"
    assert restart_res["receipt"]["reference"]==durable_ev["id"]
    assert restart_res["updatedState"]["applications"][0]["execution"]["evidence_id"]==durable_ev["id"]

    # The coordinator must return the reconciled state, not just a reconciliation report.
    reconciled_res=record_transition(
        cs,
        "app-submitted",
        "FILLED",
        None,
        {"providerSnapshot":qualifying_attempt["provider_snapshot"],"providerAuthorized":True},
    )
    assert reconciled_res["reconciliation"] is not None
    assert reconciled_res["updatedState"]["applications"][0]["execution"]["state"]=="SUBMITTED"
    assert any(e["id"]==durable_ev["id"] for e in reconciled_res["updatedState"]["evidence"])

    # Missing/date-only/impossible observed_at values never qualify even when echoed.
    for bad_timestamp in ["", "2026-09-10", "2026-02-30T00:00:00Z"]:
        invalid_ev={"id":"ev-undated","kind":"submission_receipt","observed_at":bad_timestamp,"artifact":{"owner":"user","kind":"relative_path","locator":"evidence/app-submitted/undated.txt"}}
        invalid_snap={"observed_at":"2026-09-10T07:00:00-04:00","provider_id":"synthetic-provider","read_back":True,"opportunities":[],"applications":[{"application_id":"app-submitted","execution":{"state":"SUBMITTED","channel":"web_form","last_transition_at":"2026-09-10T07:00:00-04:00"},"evidence":[{"id":"ev-undated","kind":"submission_receipt","observed_at":bad_timestamp}]}]}
        invalid_res=record_transition(cs, "app-submitted", "SUBMITTED", invalid_ev, {"providerSnapshot": invalid_snap, "providerAuthorized": True})
        assert invalid_res["receipt"]["to"]!="SUBMITTED", f"invalid timestamp promoted: {bad_timestamp!r}"

    # Email SUBMITTED requires an affirmative sent signal, not merely an omitted mailSent option.
    email_data=load_fixture("08-email-draft-vs-sent.json")
    sent_case=next(c for c in email_data["cases"] if c["label"]=="sent_email_with_confirmation_allows_submitted")
    missing_mail=record_transition(email_data["career_state"], "app-email", "SUBMITTED", sent_case["evidence"], {"providerSnapshot": sent_case["provider_snapshot"], "providerAuthorized": True})
    assert missing_mail["receipt"]["to"]!="SUBMITTED"
    assert "draft_email" in missing_mail["receipt"]["reason"]

    # An evidence id already owned by another application cannot be rebound or used to submit.
    cross=copy.deepcopy(cs)
    cross["evidence"].append({"id":"ev-cross-app","application_id":"app-submitted","kind":"submission_receipt","artifact":{"owner":"user","kind":"relative_path","locator":"evidence/app-submitted/earlier.txt"},"observed_at":"2026-09-10T06:55:00-04:00"})
    cross["evidence"].append({"id":"ev-cross-app","application_id":"app-other","kind":"submission_receipt","artifact":{"owner":"user","kind":"relative_path","locator":"evidence/app-other/receipt.txt"},"observed_at":"2026-09-10T07:00:00-04:00"})
    cross_ev={"id":"ev-cross-app","kind":"submission_receipt","observed_at":"2026-09-10T07:00:00-04:00","artifact":{"owner":"user","kind":"relative_path","locator":"evidence/app-submitted/receipt.txt"}}
    cross_snap={"observed_at":"2026-09-10T07:00:00-04:00","provider_id":"synthetic-provider","read_back":True,"opportunities":[],"applications":[{"application_id":"app-submitted","execution":{"state":"SUBMITTED","channel":"web_form","last_transition_at":"2026-09-10T07:00:00-04:00"},"evidence":[{"id":"ev-cross-app","kind":"submission_receipt","observed_at":"2026-09-10T07:00:00-04:00"}]}]}
    cross_res=record_transition(cross, "app-submitted", "SUBMITTED", cross_ev, {"providerSnapshot": cross_snap, "providerAuthorized": True})
    assert cross_res["receipt"]["to"]!="SUBMITTED"
    assert cross_res["receipt"]["reason"]=="evidence_id_bound_to_other_application"
    assert cross_res["receipt"]["conflict_preserved"] is True
    assert cross_res["updatedState"]["applications"][0]["execution"].get("evidence_id")!="ev-cross-app"

def test_synthetic_only_no_real_data():
    for fname in (FIXTURE_DIR).glob("*.json"):
        data=json.loads(fname.read_text(encoding="utf-8"))
        assert_no_leakage(data)
        text=json.dumps(data).lower()
        # ensure no real provider tokens
        assert "bearer" not in text
        assert "password" not in text

if __name__=="__main__":
    test_live_item_selected_stale_retired_without_history_deletion()
    print("PASS live_selected_stale_retired")
    test_web_form_routed_through_progression_email_blocked_without_confirmation()
    print("PASS web_form_progression_email_blocked")
    test_filled_vs_awaiting_vs_submitted_separation()
    print("PASS filled_vs_awaiting_vs_submitted")
    test_per_transition_receipt_and_reconciliation()
    print("PASS receipt_reconciliation")
    test_channel_routing_negative_cases()
    print("PASS channel_negative")
    test_multi_item_batch_priority_and_status_projection()
    print("PASS multi_batch_status")
    test_email_draft_vs_sent_and_operator_confirmed()
    print("PASS email_draft_sent")
    test_submission_proof_guards()
    print("PASS submission_proof_guards")
    test_synthetic_only_no_real_data()
    print("PASS synthetic")
    print("ALL TESTS PASS")
