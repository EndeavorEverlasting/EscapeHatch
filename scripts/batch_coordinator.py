#!/usr/bin/env python3
"""Batch Apply coordinator (EH-Q2) Python helper - synthetic only."""
from __future__ import annotations
import copy
import json
from datetime import datetime, timezone
from typing import Any, Dict, Tuple, Optional

VERIFICATION_STATES = {"SNAPSHOT","LIVE_VERIFIED","STALE","CLOSED","BLOCKED","UNKNOWN"}
EXECUTION_STATES = {"READY_TO_APPLY","FILLED","AWAITING_OPERATOR","BLOCKED","SUBMITTED"}
CHANNELS = {"web_form","email","external_provider"}
QUALIFYING_KINDS = {"submission_receipt","confirmation","correspondence"}
BATCH_RECEIPT_SCHEMA = "escapehatch/batch-coordinator-transition-receipt/v1"

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

def _is_datetime(s: str) -> bool:
    if not isinstance(s, str) or not s:
        return False
    try:
        v = s.replace("Z","+00:00") if s.endswith("Z") else s
        datetime.fromisoformat(v)
        return True
    except Exception:
        return False

def _priority_rank(p: Optional[str]) -> int:
    if p=="high": return 3
    if p=="medium": return 2
    if p=="low": return 1
    return 0

def _is_qualifying(kind: str) -> bool:
    return kind in QUALIFYING_KINDS

def _provider_has_matching_qualifying(snapshot: Optional[Dict[str,Any]], application_id: str, evidence: Optional[Dict[str,Any]]) -> bool:
    if not snapshot or snapshot.get("read_back") is not True or not _is_datetime(snapshot.get("observed_at","")):
        return False
    if not evidence or not _is_qualifying(evidence.get("kind","")) or not _is_datetime(evidence.get("observed_at","")):
        return False
    for provider_app in snapshot.get("applications",[]):
        if provider_app.get("application_id") != application_id:
            continue
        for provider_evidence in provider_app.get("evidence",[]) or []:
            if (
                provider_evidence.get("id") == evidence.get("id")
                and provider_evidence.get("kind") == evidence.get("kind")
                and _is_datetime(provider_evidence.get("observed_at",""))
            ):
                return True
    return False

def select_next_queue_item(career_state: Dict[str,Any]):
    opp_by_id={o["id"]:o for o in career_state.get("opportunities",[])}
    candidates=[]
    for app in career_state.get("applications",[]):
        opp=opp_by_id.get(app.get("opportunity_id"))
        if not opp: continue
        ver=opp.get("verification",{}).get("state") if opp.get("verification") else None
        exec_state=app.get("execution",{}).get("state") if app.get("execution") else None
        if ver!="LIVE_VERIFIED": continue
        if exec_state in ("BLOCKED","SUBMITTED"): continue
        if not exec_state: continue
        if exec_state not in ("READY_TO_APPLY","FILLED","AWAITING_OPERATOR"): continue
        candidates.append((opp, app, _priority_rank(opp.get("priority")), opp.get("fit_score") if isinstance(opp.get("fit_score"), int) else 0))
    if not candidates: return None
    candidates.sort(key=lambda x: (-x[2], -x[3], str(x[0]["id"])))
    return {"opportunity":candidates[0][0], "application":candidates[0][1]}

def verify_freshness(opportunity: Dict[str,Any]) -> Dict[str,Any]:
    frm=opportunity.get("verification",{}).get("state") if opportunity.get("verification") else None
    to=frm
    queue_active=False
    retire=False
    reason="no_change"
    if frm=="LIVE_VERIFIED":
        queue_active=True; retire=False; reason="live_verified_permits_routing"
    elif frm in ("STALE","CLOSED"):
        queue_active=False; retire=True; reason=f"posting_{frm}_retires_from_active_routing_without_erasing_history"
    elif frm=="BLOCKED":
        queue_active=False; retire=True; reason="verification_BLOCKED_blocks_active_routing"
    elif frm in ("SNAPSHOT","UNKNOWN",None):
        queue_active=False; retire=False; reason="snapshot_unknown_not_live_verified"
    return {"opportunity_id": opportunity["id"], "from": frm, "to": to, "queue_active": queue_active, "history_preserved": True, "retire": retire, "reason": reason}

def route_channel(application: Dict[str,Any], opts: Dict[str,Any]=None) -> Dict[str,Any]:
    if opts is None: opts={}
    channel=application.get("execution",{}).get("channel") if application.get("execution") else "web_form"
    if channel not in CHANNELS:
        return {"route":"BLOCKED","targetState":"BLOCKED","reason":"invalid_channel","blockReason":f"invalid_channel_{channel}"}
    progressionDecision=opts.get("progressionDecision") or (opts.get("progression") or {}).get("decision")
    providerAuthorized=opts.get("providerAuthorized")
    mailSent=opts.get("mailSent")
    adapterAvailable=opts.get("adapterAvailable")
    hasManualGate=opts.get("hasManualGate") is True
    operatorConfirmed=opts.get("operatorConfirmed") is True

    if channel=="web_form":
        if providerAuthorized is False:
            return {"route":"BLOCKED","targetState":"BLOCKED","reason":"provider_authorization_failure_BLOCKED","blockReason":"provider_authorization_failure"}
        if hasManualGate:
            return {"route":"AWAITING_OPERATOR","targetState":"AWAITING_OPERATOR","reason":"manual_gate_requires_operator","awaitingReason":"manual_upload_or_attestation_or_captcha"}
        if progressionDecision=="AUTO_ADVANCE_SAFE":
            return {"route":"web_form_via_progression","targetState":"FILLED","reason":"progression_AUTO_ADVANCE_SAFE_permits_FILLED"}
        if progressionDecision=="REVIEW_REQUIRED":
            return {"route":"AWAITING_OPERATOR","targetState":"AWAITING_OPERATOR","reason":"progression_REVIEW_REQUIRED","awaitingReason":"progression_gate_blocked"}
        return {"route":"AWAITING_OPERATOR","targetState":"AWAITING_OPERATOR","reason":"progression_context_missing_requires_operator","awaitingReason":"missing_progression_evidence"}
    if channel=="email":
        if providerAuthorized is False:
            return {"route":"AWAITING_OPERATOR","targetState":"AWAITING_OPERATOR","reason":"provider_authorization_failure_AWAITING_OPERATOR_email","awaitingReason":"provider_authorization_failure"}
        if mailSent is False and not operatorConfirmed:
            return {"route":"AWAITING_OPERATOR","targetState":"AWAITING_OPERATOR","reason":"email_draft_not_sent_requires_provider_confirmation_or_operator","awaitingReason":"draft_not_sent"}
        if adapterAvailable is False:
            return {"route":"AWAITING_OPERATOR","targetState":"AWAITING_OPERATOR","reason":"email_adapter_unavailable","awaitingReason":"provider_unavailable"}
        if mailSent is True or operatorConfirmed:
            return {"route":"email_via_provider","targetState":"AWAITING_OPERATOR","reason":"email_sent_requires_qualifying_evidence_before_SUBMITTED","awaitingReason":"needs_qualifying_confirmation"}
        return {"route":"email_via_provider","targetState":"FILLED","reason":"email_routed_via_provider_adapter"}
    if channel=="external_provider":
        if adapterAvailable is False:
            return {"route":"BLOCKED","targetState":"BLOCKED","reason":"external_provider_adapter_unavailable","blockReason":"adapter_unavailable"}
        if providerAuthorized is False:
            return {"route":"BLOCKED","targetState":"BLOCKED","reason":"provider_authorization_failure_BLOCKED","blockReason":"provider_authorization_failure"}
        if hasManualGate:
            return {"route":"AWAITING_OPERATOR","targetState":"AWAITING_OPERATOR","reason":"external_manual_gate","awaitingReason":"manual_gate_external"}
        return {"route":"external_via_provider","targetState":"AWAITING_OPERATOR","reason":"external_provider_requires_provider_confirmation","awaitingReason":"requires_provider_confirmation_or_operator"}
    return {"route":"BLOCKED","targetState":"BLOCKED","reason":"unhandled_channel","blockReason":f"unhandled_{channel}"}

def record_transition(career_state: Dict[str,Any], application_id: str, target_state: str, evidence: Optional[Dict[str,Any]], opts: Dict[str,Any]=None):
    if opts is None: opts={}
    now=_now_iso()
    updated=copy.deepcopy(career_state)
    app=next((a for a in updated.get("applications",[]) if a["id"]==application_id), None)
    if app is None:
        raise ValueError(f"application not found: {application_id}")
    opp=next((o for o in updated.get("opportunities",[]) if o["id"]==app["opportunity_id"]), None)
    frm=app.get("execution",{}).get("state") if app.get("execution") else None
    channel=app.get("execution",{}).get("channel") if app.get("execution") else "web_form"
    verification=opp.get("verification",{}).get("state") if opp and opp.get("verification") else None
    if channel not in CHANNELS:
        raise ValueError(f"invalid_channel_{channel}")
    if target_state not in EXECUTION_STATES:
        raise ValueError(f"invalid_execution_state_{target_state}")
    to=target_state
    reason=f"transition_{frm}_to_{target_state}"
    evidence_binding="none"
    conflict=False
    queue_active=verification=="LIVE_VERIFIED" and to not in ("BLOCKED","SUBMITTED")

    provider_snapshot=opts.get("providerSnapshot")
    provider_read_back=bool(provider_snapshot and provider_snapshot.get("read_back") is True and _is_datetime(provider_snapshot.get("observed_at","")))
    provider_authorized=opts.get("providerAuthorized")
    mail_sent=opts.get("mailSent")
    operator_confirmed=opts.get("operatorConfirmed") is True
    existing_evidence=next((e for e in updated.get("evidence",[]) if evidence and e.get("id")==evidence.get("id")), None)
    evidence_id_conflict=bool(existing_evidence and existing_evidence.get("application_id")!=application_id)
    has_qualifying=bool(evidence and not evidence_id_conflict and _is_qualifying(evidence.get("kind","")) and _is_datetime(evidence.get("observed_at","")))
    has_evidence=bool(evidence)
    local_has_qualifying=any(
        e.get("application_id")==application_id and _is_qualifying(e.get("kind","")) and _is_datetime(e.get("observed_at",""))
        for e in updated.get("evidence",[])
    )
    provider_has_qualifying=_provider_has_matching_qualifying(provider_snapshot, application_id, evidence) and not evidence_id_conflict
    if evidence_id_conflict:
        conflict=True

    if to=="SUBMITTED":
        if provider_authorized is False:
            to="AWAITING_OPERATOR" if channel=="email" else "BLOCKED"
            reason="provider_authorization_failure_BLOCKED_never_SUBMITTED"
            evidence_binding="local" if local_has_qualifying else "none"
        elif evidence_id_conflict:
            to="FILLED" if frm=="FILLED" else "AWAITING_OPERATOR"
            reason="evidence_id_bound_to_other_application"
            evidence_binding="none"
        elif channel=="email" and mail_sent is not True and not operator_confirmed:
            to="FILLED" if frm=="FILLED" else "AWAITING_OPERATOR"
            reason="draft_email_requires_sent_confirmation_never_SUBMITTED"
            evidence_binding="local" if has_evidence else "none"
            conflict=True
        elif not provider_has_qualifying and not operator_confirmed:
            if frm=="FILLED": to="FILLED"
            elif frm=="READY_TO_APPLY": to="READY_TO_APPLY"
            else: to="AWAITING_OPERATOR"
            if has_qualifying or local_has_qualifying:
                reason="provider_read_back_or_operator_confirmation_required_before_SUBMITTED"
                evidence_binding="local"
            else:
                reason="SUBMITTED_requires_qualifying_evidence_with_timestamp_and_reference"
                evidence_binding="none"
            if has_evidence and not has_qualifying: conflict=True
        elif verification=="BLOCKED":
            to="BLOCKED"
            reason="verification_BLOCKED_blocks_SUBMITTED"
            evidence_binding="provider" if has_qualifying else "local" if local_has_qualifying else "none"
            conflict=True
        elif not _is_datetime(now):
            to=frm
            reason="missing_timestamp"
        else:
            evidence_binding="operator_confirmed" if operator_confirmed else "provider"
            reason="qualifying_confirmation_promotes_SUBMITTED"
        if to=="SUBMITTED" and verification not in ("LIVE_VERIFIED", None):
            if verification in ("STALE","CLOSED"):
                to="BLOCKED"
                reason=f"posting_{verification}_blocks_SUBMITTED_without_erasing_history"
                queue_active=False
    if not provider_read_back and to=="SUBMITTED" and evidence_binding=="provider":
        evidence_binding="local"
        reason="provider_read_back_required_before_provider_sync_claim"
        if not has_qualifying:
            to="FILLED" if frm=="FILLED" else "AWAITING_OPERATOR"
            reason="local_mutation_not_provider_completion"
    if verification in ("STALE","CLOSED") and to in ("READY_TO_APPLY","FILLED"):
        to="BLOCKED"
        reason=f"freshness_{verification}_deactivates_queue_without_erasing_history"
        queue_active=False
    if verification=="LIVE_VERIFIED" and queue_active:
        queue_active=True
    elif to in ("BLOCKED","SUBMITTED"):
        queue_active=False
    else:
        queue_active=verification=="LIVE_VERIFIED" and verification not in ("STALE","CLOSED","BLOCKED")

    final_to=to
    if app.get("execution"):
        app["execution"]["state"]=final_to
        app["execution"]["last_transition_at"]=now
        if evidence and has_qualifying and not evidence_id_conflict:
            app["execution"]["evidence_id"]=evidence["id"]
        if final_to=="BLOCKED" and "block_reason" not in app["execution"]:
            app["execution"]["block_reason"]=reason
        if final_to=="AWAITING_OPERATOR" and "awaiting_reason" not in app["execution"]:
            app["execution"]["awaiting_reason"]=reason
        if final_to=="SUBMITTED":
            if not app.get("submitted_at"):
                app["submitted_at"]=now
            if not app.get("external_reference"):
                app["external_reference"]=f"batch-{now}-{application_id}"
    else:
        app["execution"]={"state":final_to,"channel":channel,"last_transition_at":now,"detail":reason}
        if evidence and has_qualifying and not evidence_id_conflict:
            app["execution"]["evidence_id"]=evidence["id"]
        if final_to=="SUBMITTED":
            if not app.get("submitted_at"):
                app["submitted_at"]=now
            if not app.get("external_reference"):
                app["external_reference"]=f"batch-{now}-{application_id}"

    if evidence and not evidence_id_conflict and not any(e["id"]==evidence["id"] for e in updated.get("evidence",[])):
        updated.setdefault("evidence",[]).append({
            "id": evidence["id"],
            "application_id": application_id,
            "kind": evidence["kind"],
            "artifact": evidence.get("artifact") or {"owner":"user","kind":"relative_path","locator":f"evidence/{application_id}/{evidence['id']}.txt"},
            "observed_at": evidence["observed_at"]
        })

    has_changed=json.dumps(career_state, sort_keys=True)!=json.dumps(updated, sort_keys=True)
    if has_changed:
        updated["revision"]=(updated.get("revision") or 0)+1
        updated["updated_at"]=now

    reference=(evidence or {}).get("id") if evidence and not evidence_id_conflict else None
    reference=reference or app.get("external_reference") or f"batch-{application_id}-{now}"
    receipt={
        "schema": BATCH_RECEIPT_SCHEMA,
        "application_id": application_id,
        "opportunity_id": app["opportunity_id"],
        "channel": channel,
        "verification_state": verification,
        "from": frm,
        "to": final_to,
        "evidence_binding": evidence_binding,
        "reference": reference,
        "timestamp": now,
        "reason": reason,
        "history_preserved": True,
        "conflict_preserved": conflict,
        "queue_active": queue_active
    }

    reconciliation=None
    if "providerSnapshot" in opts:
        snap=opts.get("providerSnapshot")
        try:
            from companion_reconciliation import reconcile as comp_reconcile
            _, result = comp_reconcile(updated, snap)
            reconciliation=result
        except Exception:
            reconciliation=None

    return {"updatedState": updated, "receipt": receipt, "reconciliation": reconciliation}

def project_batch_status(career_state: Dict[str,Any]):
    by_verification={}
    by_execution={}
    by_channel={}
    queue_active={}
    for opp in career_state.get("opportunities",[]):
        v=opp.get("verification",{}).get("state") if opp.get("verification") else "UNKNOWN"
        by_verification[v]=by_verification.get(v,0)+1
        queue_active[opp["id"]]=v=="LIVE_VERIFIED"
    active=0
    for app in career_state.get("applications",[]):
        e=app.get("execution",{}).get("state") if app.get("execution") else "UNKNOWN"
        ch=app.get("execution",{}).get("channel") if app.get("execution") else "web_form"
        by_execution[e]=by_execution.get(e,0)+1
        by_channel[ch]=by_channel.get(ch,0)+1
        opp=next((o for o in career_state.get("opportunities",[]) if o["id"]==app["opportunity_id"]), None)
        ver=opp.get("verification",{}).get("state") if opp and opp.get("verification") else None
        is_active=ver=="LIVE_VERIFIED" and e not in ("BLOCKED","SUBMITTED")
        if is_active: active+=1
    return {"total": len(career_state.get("opportunities",[])), "active": active, "byVerification": by_verification, "byExecution": by_execution, "byChannel": by_channel, "queueActive": queue_active}

def coordinate_step(career_state: Dict[str,Any], provider_snapshot, channel_context=None):
    if channel_context is None: channel_context={}
    selected=select_next_queue_item(career_state)
    if not selected:
        return {"selected": None, "freshness": None, "route": None, "transition": None, "batchStatus": project_batch_status(career_state)}
    freshness=verify_freshness(selected["opportunity"])
    if not freshness["queue_active"]:
        blocked=record_transition(career_state, selected["application"]["id"], "BLOCKED", None, {"providerSnapshot": provider_snapshot})
        return {"selected": selected, "freshness": freshness, "route": {"route":"BLOCKED","targetState":"BLOCKED","reason":freshness["reason"]}, "transition": {"updatedState": blocked["updatedState"], "receipt": blocked["receipt"]}, "batchStatus": project_batch_status(blocked["updatedState"])}
    route=route_channel(selected["application"], channel_context)
    target=route["targetState"]
    evidence_for_promotion=None
    if target=="SUBMITTED":
        evidence_for_promotion={"id": f"ev-{selected['application']['id']}-{int(datetime.now(timezone.utc).timestamp())}", "kind":"submission_receipt","observed_at":_now_iso(),"artifact":{"owner":"user","kind":"relative_path","locator": f"evidence/{selected['application']['id']}/receipt.txt"}}
    transition=record_transition(career_state, selected["application"]["id"], target, evidence_for_promotion, {"providerSnapshot": provider_snapshot, "providerAuthorized": channel_context.get("providerAuthorized"), "mailSent": channel_context.get("mailSent"), "operatorConfirmed": channel_context.get("operatorConfirmed")})
    return {"selected": selected, "freshness": freshness, "route": route, "transition": transition, "batchStatus": project_batch_status(transition["updatedState"])}
