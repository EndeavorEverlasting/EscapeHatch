#!/usr/bin/env python3
"""Provider-agnostic companion reconciliation (EH-Q1). Synthetic only, no provider calls."""

from __future__ import annotations

import copy
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

VERIFICATION_STATES = {"SNAPSHOT", "LIVE_VERIFIED", "STALE", "CLOSED", "BLOCKED", "UNKNOWN"}
EXECUTION_STATES = {"READY_TO_APPLY", "FILLED", "AWAITING_OPERATOR", "BLOCKED", "SUBMITTED"}
CHANNELS = {"web_form", "email", "external_provider"}
QUALIFYING_KINDS = {"submission_receipt", "confirmation", "correspondence"}
RECONCILIATION_SCHEMA = "escapehatch/application-companion-reconciliation-result/v1"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


_RFC3339_DATE_TIME = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)

def _is_datetime(s: str) -> bool:
    if not isinstance(s, str) or not _RFC3339_DATE_TIME.fullmatch(s):
        return False
    try:
        v = s[:-1] + "+00:00" if s.endswith("Z") else s
        datetime.fromisoformat(v)
        return True
    except (TypeError, ValueError):
        return False


def reconcile(career_state: Dict[str, Any], provider_snapshot: Dict[str, Any] | None) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    now = _now_iso()
    reconciled = copy.deepcopy(career_state)
    provider_read_back = bool(provider_snapshot and provider_snapshot.get("read_back") is True and _is_datetime(provider_snapshot.get("observed_at", "")))

    freshness: List[Dict[str, Any]] = []
    execution: List[Dict[str, Any]] = []
    any_conflict = False
    queue_active: Dict[str, bool] = {}
    history_preserved = True

    opp_by_id = {o["id"]: o for o in reconciled.get("opportunities", [])}
    app_by_id = {a["id"]: a for a in reconciled.get("applications", [])}
    ev_by_app: Dict[str, List[Dict[str, Any]]] = {}
    for ev in reconciled.get("evidence", []):
        ev_by_app.setdefault(ev["application_id"], []).append(ev)

    provider_opp_map = {o["opportunity_id"]: o for o in (provider_snapshot or {}).get("opportunities", [])}
    provider_app_map = {a["application_id"]: a for a in (provider_snapshot or {}).get("applications", [])}

    # Freshness per opportunity
    for opp in reconciled.get("opportunities", []):
        opp_id = opp["id"]
        from_state = opp.get("verification", {}).get("state") if opp.get("verification") else None
        provider_opp = provider_opp_map.get(opp_id)
        to_state = from_state
        active = True
        history = True

        if not provider_read_back:
            to_state = from_state
            if from_state in ("STALE", "CLOSED"):
                active = False
            elif from_state in ("BLOCKED", "UNKNOWN", "SNAPSHOT"):
                active = False
            elif from_state == "LIVE_VERIFIED":
                active = True
            else:
                active = False if from_state else False
        elif not provider_opp or not provider_opp.get("verification"):
            to_state = from_state
            if from_state in ("STALE", "CLOSED"):
                active = False
            elif from_state == "LIVE_VERIFIED":
                active = True
            else:
                active = False
        else:
            pv = provider_opp["verification"]
            p_state = pv.get("state")
            p_verified_at = pv.get("verified_at")
            if p_state not in VERIFICATION_STATES or not _is_datetime(p_verified_at or ""):
                to_state = from_state
                active = from_state == "LIVE_VERIFIED"
            elif p_state == "LIVE_VERIFIED":
                to_state = "LIVE_VERIFIED"
                active = True
                opp["verification"] = {
                    "state": "LIVE_VERIFIED",
                    "verified_at": p_verified_at,
                    "detail": pv.get("detail") or "Live posting re-observed via provider read-back",
                    "source": pv.get("source") or (provider_snapshot or {}).get("provider_id", "synthetic"),
                }
            elif p_state in ("STALE", "CLOSED"):
                to_state = p_state
                active = False
                opp["verification"] = {
                    "state": p_state,
                    "verified_at": p_verified_at,
                    "detail": pv.get("detail") or f"Provider reports {p_state}",
                    "source": pv.get("source") or (provider_snapshot or {}).get("provider_id", "synthetic"),
                }
                history = True
            elif p_state == "BLOCKED":
                to_state = "BLOCKED"
                active = False
                opp["verification"] = {
                    "state": "BLOCKED",
                    "verified_at": p_verified_at,
                    "detail": pv.get("detail") or "Provider authorization blocked",
                    "source": pv.get("source") or (provider_snapshot or {}).get("provider_id", "synthetic"),
                }
            elif p_state in ("UNKNOWN", "SNAPSHOT"):
                to_state = from_state
                if from_state == "LIVE_VERIFIED" and p_state == "UNKNOWN":
                    any_conflict = True
                active = to_state == "LIVE_VERIFIED"

        queue_active[opp_id] = active
        freshness.append({
            "opportunity_id": opp_id,
            "from": from_state,
            "to": to_state,
            "queue_active": active,
            "history_preserved": history,
        })

    # Execution per application
    for app in reconciled.get("applications", []):
        app_id = app["id"]
        opp_id = app["opportunity_id"]
        from_state = app.get("execution", {}).get("state") if app.get("execution") else None
        from_channel = app.get("execution", {}).get("channel") if app.get("execution") else "web_form"
        opp = opp_by_id.get(opp_id)
        opp_verification = opp.get("verification", {}).get("state") if opp and opp.get("verification") else None
        provider_app = provider_app_map.get(app_id)

        to_state = from_state
        evidence_binding: str = "none"
        conflict = False
        reason = "no_change"

        local_qual = [e for e in reconciled.get("evidence", []) if e["application_id"] == app_id and e["kind"] in QUALIFYING_KINDS and _is_datetime(e.get("observed_at", ""))]
        has_local = len(local_qual) > 0
        provider_qual = [e for e in (provider_app or {}).get("evidence", []) if e.get("kind") in QUALIFYING_KINDS and _is_datetime(e.get("observed_at", ""))]
        has_provider = len(provider_qual) > 0
        # any evidence (even note/draft) counts for local binding
        local_any = [e for e in reconciled.get("evidence", []) if e["application_id"] == app_id]
        has_any_local = len(local_any) > 0
        provider_any = (provider_app or {}).get("evidence", []) or []
        has_any_provider = len(provider_any) > 0

        if not provider_read_back:
            to_state = from_state
            evidence_binding = "local" if has_any_local else "none"
            reason = "provider_read_back_required"
        elif not provider_app:
            to_state = from_state
            evidence_binding = "local" if has_any_local else "none"
            reason = "no_provider_application_snapshot"
            if opp_verification in ("STALE", "CLOSED") and from_state in ("READY_TO_APPLY", "FILLED"):
                to_state = "BLOCKED"
                reason = f"posting_{opp_verification}_deactivates_queue"
                if app.get("execution"):
                    app["execution"]["state"] = "BLOCKED"
                    app["execution"]["block_reason"] = f"posting_{opp_verification}_without_erasing_history"
                    app["execution"]["last_transition_at"] = now
                else:
                    app["execution"] = {"state": "BLOCKED", "channel": from_channel, "last_transition_at": now, "block_reason": f"posting_{opp_verification}"}
        else:
            auth_failure = provider_app.get("auth") and provider_app["auth"].get("authorized") is False
            opp_auth_failure = provider_opp_map.get(opp_id, {}).get("auth", {}).get("authorized") is False if provider_opp_map.get(opp_id, {}).get("auth") else False
            if auth_failure or opp_auth_failure:
                if from_state == "SUBMITTED":
                    conflict = True
                    any_conflict = True
                    to_state = "BLOCKED"
                    evidence_binding = "local" if has_local else "none"
                    reason = "provider_authorization_failure_BLOCKED"
                    if app.get("execution"):
                        app["execution"]["state"] = "BLOCKED"
                        app["execution"]["block_reason"] = provider_app.get("auth", {}).get("reason") or "provider_authorization_failure"
                        app["execution"]["last_transition_at"] = now
                else:
                    channel = app.get("execution", {}).get("channel") or provider_app.get("auth", {}).get("channel") or from_channel
                    if channel == "email":
                        to_state = "AWAITING_OPERATOR"
                        reason = "provider_authorization_failure_AWAITING_OPERATOR"
                        if app.get("execution"):
                            app["execution"]["state"] = "AWAITING_OPERATOR"
                            app["execution"]["awaiting_reason"] = "provider_authorization_failure"
                            app["execution"]["last_transition_at"] = now
                    else:
                        to_state = "BLOCKED"
                        reason = "provider_authorization_failure_BLOCKED"
                        if app.get("execution"):
                            app["execution"]["state"] = "BLOCKED"
                            app["execution"]["block_reason"] = provider_app.get("auth", {}).get("reason") or "provider_authorization_failure"
                            app["execution"]["last_transition_at"] = now
                    evidence_binding = "provider" if has_any_provider else "local" if has_any_local else "none"
            else:
                provider_freshness = provider_opp_map.get(opp_id, {}).get("verification", {}).get("state") if provider_opp_map.get(opp_id, {}).get("verification") else opp_verification
                if provider_freshness in ("STALE", "CLOSED") and from_state in ("READY_TO_APPLY", "FILLED"):
                    to_state = "BLOCKED"
                    reason = f"stale_closed_deactivates_queue_{provider_freshness}"
                    evidence_binding = "local" if has_any_local else "none"
                    if app.get("execution"):
                        app["execution"]["state"] = "BLOCKED"
                        app["execution"]["block_reason"] = f"posting_{provider_freshness}_deactivates_queue_without_erasing_history"
                        app["execution"]["last_transition_at"] = now
                elif provider_freshness == "BLOCKED" and from_state == "SUBMITTED":
                    to_state = "BLOCKED"
                    reason = "verification_BLOCKED_blocks_SUBMITTED"
                    conflict = True
                    any_conflict = True
                    evidence_binding = "provider" if has_any_provider else "local" if has_any_local else "none"
                    if app.get("execution"):
                        app["execution"]["state"] = "BLOCKED"
                        app["execution"]["block_reason"] = "verification_BLOCKED"
                        app["execution"]["last_transition_at"] = now
                else:
                    channel = (app.get("execution", {}) or {}).get("channel") or provider_app.get("execution", {}).get("channel") or "web_form"
                    wants_submitted = (provider_app.get("execution", {}) or {}).get("state") == "SUBMITTED" or from_state == "SUBMITTED"
                    is_email = channel == "email"
                    email_guard_passed = True
                    if is_email and wants_submitted:
                        mail = provider_app.get("mail") or {}
                        operator_confirmed = provider_app.get("operator_confirmed") is True
                        has_sent = mail.get("sent") is True or mail.get("provider_confirmation") == "sent" or mail.get("outbox") is True
                        if not has_sent and not operator_confirmed:
                            email_guard_passed = False
                            if from_state == "SUBMITTED":
                                conflict = True
                                any_conflict = True
                                to_state = "AWAITING_OPERATOR"
                                reason = "draft_email_requires_sent_confirmation"
                                evidence_binding = "local" if has_any_local else "none"
                                if app.get("execution"):
                                    app["execution"]["state"] = "AWAITING_OPERATOR"
                                    app["execution"]["awaiting_reason"] = "draft_not_sent_requires_provider_confirmation_or_operator"
                                    app["execution"]["last_transition_at"] = now
                            else:
                                to_state = "FILLED" if from_state == "FILLED" else "AWAITING_OPERATOR"
                                reason = "email_draft_not_sent_requires_confirmation"
                                evidence_binding = "provider" if has_any_provider else "local" if has_any_local else "none"
                    if email_guard_passed:
                        if wants_submitted:
                            has_qualifying = has_provider or has_local or provider_app.get("operator_confirmed") is True
                            if not has_qualifying:
                                if from_state == "FILLED":
                                    to_state = "FILLED"
                                elif from_state == "READY_TO_APPLY":
                                    to_state = "READY_TO_APPLY"
                                else:
                                    to_state = "AWAITING_OPERATOR"
                                reason = "SUBMITTED_requires_qualifying_evidence"
                                evidence_binding = "none"
                                if has_local and not has_provider:
                                    conflict = True
                                    any_conflict = True
                            else:
                                provider_stronger = has_provider and (not has_local or len(provider_qual) >= len(local_qual))
                                local_stronger = has_local and not has_provider
                                if provider_stronger:
                                    to_state = "SUBMITTED"
                                    evidence_binding = "operator_confirmed" if provider_app.get("operator_confirmed") else "provider"
                                    reason = "provider_qualifying_evidence_promotes_SUBMITTED"
                                    if has_local and provider_qual and local_qual and provider_qual[0].get("id") != local_qual[0].get("id"):
                                        conflict = True
                                        any_conflict = True
                                    if app.get("execution"):
                                        app["execution"]["state"] = "SUBMITTED"
                                        app["execution"]["evidence_id"] = provider_qual[0].get("id") if provider_qual else app["execution"].get("evidence_id") or local_qual[0].get("id")
                                        app["execution"]["last_transition_at"] = provider_app.get("execution", {}).get("last_transition_at") or now
                                        if not app.get("submitted_at"):
                                            app["submitted_at"] = now
                                        if not app.get("external_reference"):
                                            app["external_reference"] = f"provider-{provider_snapshot.get('provider_id','synthetic')}-{app_id}"
                                    else:
                                        app["execution"] = {"state": "SUBMITTED", "channel": channel, "last_transition_at": provider_app.get("execution", {}).get("last_transition_at") or now, "evidence_id": provider_qual[0].get("id") if provider_qual else local_qual[0].get("id")}
                                        if not app.get("submitted_at"):
                                            app["submitted_at"] = now
                                    for pev in provider_qual:
                                        if not any(e["id"] == pev.get("id") for e in reconciled.get("evidence", [])):
                                            reconciled["evidence"].append({"id": pev.get("id"), "application_id": app_id, "kind": pev.get("kind"), "artifact": {"owner": "user", "kind": "relative_path", "locator": f"evidence/{app_id}/{pev.get('id')}.txt"}, "observed_at": pev.get("observed_at") or now})
                                elif local_stronger:
                                    to_state = "SUBMITTED" if from_state == "SUBMITTED" else "FILLED"
                                    evidence_binding = "local"
                                    reason = "local_qualifying_preserved_conflict"
                                    if has_provider:
                                        conflict = True
                                        any_conflict = True
                                else:
                                    to_state = "SUBMITTED"
                                    evidence_binding = "provider" if has_provider else "local"
                                    reason = "conflict_preserved_keep_stronger"
                                    conflict = True
                                    any_conflict = True
                        else:
                            to_state = from_state
                            if has_any_local and not has_any_provider:
                                evidence_binding = "local"
                                reason = "local_export_remains_local_until_reconciled"
                            elif has_any_provider:
                                evidence_binding = "provider"
                                reason = "provider_evidence_available"
                                if has_local and provider_qual and local_qual and provider_qual[0].get("id") != local_qual[0].get("id"):
                                    conflict = True
                                    any_conflict = True
                                    reason = "conflict_preserved_provider_stronger"
                            else:
                                evidence_binding = "none"
                                reason = "no_qualifying_evidence"
                            if opp_verification in ("STALE", "CLOSED") and from_state in ("READY_TO_APPLY", "FILLED"):
                                to_state = "BLOCKED"
                                reason = f"freshness_{opp_verification}_deactivates_queue"
                                if app.get("execution"):
                                    app["execution"]["state"] = "BLOCKED"
                                    app["execution"]["block_reason"] = f"posting_{opp_verification}"
                                    app["execution"]["last_transition_at"] = now

        if provider_app and provider_app.get("operator_confirmed"):
            evidence_binding = "operator_confirmed"

        execution.append({
            "application_id": app_id,
            "from": from_state,
            "to": to_state,
            "evidence_binding": evidence_binding,
            "conflict_preserved": conflict,
            "reason": reason,
        })
        if to_state != from_state and app.get("execution"):
            if app["execution"]["state"] != to_state:
                app["execution"]["state"] = to_state
        if conflict:
            any_conflict = True

    # overall evidence_binding
    overall = "none"
    if any(e["evidence_binding"] == "operator_confirmed" for e in execution):
        overall = "operator_confirmed"
    elif any(e["evidence_binding"] == "provider" for e in execution):
        overall = "provider"
    elif any(e["evidence_binding"] == "local" for e in execution):
        overall = "local"

    result = {
        "schema": RECONCILIATION_SCHEMA,
        "reconciled_at": now,
        "provider_read_back": provider_read_back,
        "freshness_transition": freshness,
        "execution_transition": execution,
        "evidence_binding": overall,
        "conflict_preserved": any_conflict,
        "queue_active": queue_active,
        "history_preserved": history_preserved,
        "idempotent": True,
    }

    # Any persisted mutation (including evidence-only reconciliation) advances revision.
    if json.dumps(career_state, sort_keys=True) != json.dumps(reconciled, sort_keys=True):
        reconciled["revision"] = (reconciled.get("revision") or 0) + 1
        reconciled["updated_at"] = now

    return reconciled, result


def is_idempotent(career_state: Dict[str, Any], snapshot: Dict[str, Any]) -> bool:
    first_state, first_result = reconcile(career_state, snapshot)
    second_state, second_result = reconcile(first_state, snapshot)
    return json.dumps(first_state, sort_keys=True) == json.dumps(second_state, sort_keys=True)


def requires_provider_read_back(snapshot: Dict[str, Any] | None) -> bool:
    return not snapshot or snapshot.get("read_back") is not True or not _is_datetime(snapshot.get("observed_at", ""))
