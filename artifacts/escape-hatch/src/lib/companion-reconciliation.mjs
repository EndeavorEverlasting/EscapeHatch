// Provider-agnostic companion reconciliation (EH-Q1) JS ESM version
// Synthetic only, no provider calls
export const VERIFICATION_STATES = ["SNAPSHOT", "LIVE_VERIFIED", "STALE", "CLOSED", "BLOCKED", "UNKNOWN"];
export const EXECUTION_STATES = ["READY_TO_APPLY", "FILLED", "AWAITING_OPERATOR", "BLOCKED", "SUBMITTED"];
export const CHANNELS = ["web_form", "email", "external_provider"];
export const QUALIFYING_KINDS = new Set(["submission_receipt", "confirmation", "correspondence"]);
export const RECONCILIATION_SCHEMA = "escapehatch/application-companion-reconciliation-result/v1";

function deepClone(v) { return JSON.parse(JSON.stringify(v)); }
function isDateTime(s) {
  if (typeof s !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(s);
  if (!m) return false;
  const year=Number(m[1]), month=Number(m[2]), day=Number(m[3]);
  const hour=Number(m[4]), minute=Number(m[5]), second=Number(m[6]);
  const offsetHour=m[10]===undefined ? 0 : Number(m[10]);
  const offsetMinute=m[11]===undefined ? 0 : Number(m[11]);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return false;
  const leap=(year%4===0 && year%100!==0) || year%400===0;
  const monthDays=[31, leap?29:28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > monthDays[month-1]) return false;
  return !Number.isNaN(Date.parse(s));
}

export function reconcile(careerState, providerSnapshot) {
  const now = new Date().toISOString();
  const reconciled = deepClone(careerState);
  const providerReadBack = Boolean(providerSnapshot && providerSnapshot.read_back === true && isDateTime(providerSnapshot.observed_at || ""));
  const freshness = [];
  const execution = [];
  let anyConflict = false;
  const queueActive = {};
  const historyPreserved = true;

  const oppById = new Map(reconciled.opportunities.map(o => [o.id, o]));
  const providerOppMap = new Map((providerSnapshot?.opportunities || []).map(o => [o.opportunity_id, o]));
  const providerAppMap = new Map((providerSnapshot?.applications || []).map(a => [a.application_id, a]));

  for (const opp of reconciled.opportunities) {
    const from = opp.verification?.state ?? null;
    const providerOpp = providerOppMap.get(opp.id);
    let to = from;
    let active = true;
    let history = true;
    if (!providerReadBack) {
      to = from;
      if (["STALE","CLOSED"].includes(from)) active = false;
      else if (["BLOCKED","UNKNOWN","SNAPSHOT"].includes(from)) active = false;
      else if (from === "LIVE_VERIFIED") active = true;
      else active = false;
    } else if (!providerOpp || !providerOpp.verification) {
      to = from;
      if (["STALE","CLOSED"].includes(from)) active = false;
      else if (from === "LIVE_VERIFIED") active = true;
      else active = false;
    } else {
      const pv = providerOpp.verification;
      if (!VERIFICATION_STATES.includes(pv.state) || !isDateTime(pv.verified_at || "")) {
        to = from;
        active = from === "LIVE_VERIFIED";
      } else if (pv.state === "LIVE_VERIFIED") {
        to = "LIVE_VERIFIED";
        active = true;
        opp.verification = { state: "LIVE_VERIFIED", verified_at: pv.verified_at, detail: pv.detail || "Live posting re-observed via provider read-back", source: pv.source || providerSnapshot.provider_id };
      } else if (["STALE","CLOSED"].includes(pv.state)) {
        to = pv.state;
        active = false;
        opp.verification = { state: pv.state, verified_at: pv.verified_at, detail: pv.detail || `Provider reports ${pv.state}`, source: pv.source || providerSnapshot.provider_id };
      } else if (pv.state === "BLOCKED") {
        to = "BLOCKED";
        active = false;
        opp.verification = { state: "BLOCKED", verified_at: pv.verified_at, detail: pv.detail || "Provider authorization blocked", source: pv.source || providerSnapshot.provider_id };
      } else if (["UNKNOWN","SNAPSHOT"].includes(pv.state)) {
        to = from;
        if (from === "LIVE_VERIFIED" && pv.state === "UNKNOWN") anyConflict = true;
        active = to === "LIVE_VERIFIED";
      }
    }
    queueActive[opp.id] = active;
    freshness.push({ opportunity_id: opp.id, from, to, queue_active: active, history_preserved: history });
  }

  for (const app of reconciled.applications) {
    const from = app.execution?.state ?? null;
    const fromChannel = app.execution?.channel ?? "web_form";
    const oppId = app.opportunity_id;
    const opp = oppById.get(oppId);
    const oppVerification = opp?.verification?.state;
    const providerApp = providerAppMap.get(app.id);
    let to = from;
    let evidenceBinding = "none";
    let conflict = false;
    let reason = "no_change";
    const localQual = reconciled.evidence.filter(e => e.application_id === app.id && QUALIFYING_KINDS.has(e.kind) && isDateTime(e.observed_at || ""));
    const hasLocal = localQual.length > 0;
    const providerQual = (providerApp?.evidence || []).filter(e => QUALIFYING_KINDS.has(e.kind) && isDateTime(e.observed_at || ""));
    const hasProvider = providerQual.length > 0;
    const localAny = reconciled.evidence.filter(e => e.application_id === app.id);
    const hasAnyLocal = localAny.length > 0;
    const providerAny = providerApp?.evidence || [];
    const hasAnyProvider = providerAny.length > 0;

    if (!providerReadBack) {
      to = from; evidenceBinding = hasAnyLocal ? "local" : "none"; reason = "provider_read_back_required";
    } else if (!providerApp) {
      to = from; evidenceBinding = hasAnyLocal ? "local" : "none"; reason = "no_provider_application_snapshot";
      if (["STALE","CLOSED"].includes(oppVerification) && ["READY_TO_APPLY","FILLED"].includes(from)) {
        to = "BLOCKED"; reason = `posting_${oppVerification}_deactivates_queue`;
        if (app.execution) { app.execution.state = "BLOCKED"; app.execution.block_reason = `posting_${oppVerification}_without_erasing_history`; app.execution.last_transition_at = now; }
        else app.execution = { state:"BLOCKED", channel: fromChannel, last_transition_at: now, block_reason:`posting_${oppVerification}` };
      }
    } else {
      const authFailure = providerApp.auth && providerApp.auth.authorized === false;
      const oppAuthFailure = providerOppMap.get(oppId)?.auth?.authorized === false;
      if (authFailure || oppAuthFailure) {
        if (from === "SUBMITTED") {
          conflict = true; anyConflict = true; to = "BLOCKED"; evidenceBinding = hasAnyLocal ? "local" : "none"; reason = "provider_authorization_failure_BLOCKED";
          if (app.execution) { app.execution.state = "BLOCKED"; app.execution.block_reason = providerApp.auth?.reason || "provider_authorization_failure"; app.execution.last_transition_at = now; }
        } else {
          const channel = app.execution?.channel || providerApp.auth?.channel || fromChannel;
          if (channel === "email") {
            to = "AWAITING_OPERATOR"; reason = "provider_authorization_failure_AWAITING_OPERATOR";
            if (app.execution) { app.execution.state = "AWAITING_OPERATOR"; app.execution.awaiting_reason = "provider_authorization_failure"; app.execution.last_transition_at = now; }
          } else {
            to = "BLOCKED"; reason = "provider_authorization_failure_BLOCKED";
            if (app.execution) { app.execution.state = "BLOCKED"; app.execution.block_reason = providerApp.auth?.reason || "provider_authorization_failure"; app.execution.last_transition_at = now; }
          }
          evidenceBinding = hasAnyProvider ? "provider" : hasAnyLocal ? "local" : "none";
        }
      } else {
        const providerFreshness = providerOppMap.get(oppId)?.verification?.state ?? oppVerification;
        if (["STALE","CLOSED"].includes(providerFreshness) && ["READY_TO_APPLY","FILLED"].includes(from)) {
          to = "BLOCKED"; reason = `stale_closed_deactivates_queue_${providerFreshness}`; evidenceBinding = hasAnyLocal ? "local":"none";
          if (app.execution) { app.execution.state = "BLOCKED"; app.execution.block_reason = `posting_${providerFreshness}_deactivates_queue_without_erasing_history`; app.execution.last_transition_at = now; }
        } else if (providerFreshness === "BLOCKED" && from === "SUBMITTED") {
          to = "BLOCKED"; reason = "verification_BLOCKED_blocks_SUBMITTED"; conflict=true; anyConflict=true; evidenceBinding = hasAnyProvider ? "provider" : hasAnyLocal ? "local":"none";
          if (app.execution) { app.execution.state="BLOCKED"; app.execution.block_reason="verification_BLOCKED"; app.execution.last_transition_at=now; }
        } else {
          const channel = app.execution?.channel || providerApp.execution?.channel || "web_form";
          const wantsSubmitted = (providerApp.execution?.state === "SUBMITTED") || from === "SUBMITTED";
          const isEmail = channel === "email";
          let emailGuardPassed = true;
          if (isEmail && wantsSubmitted) {
            const mail = providerApp.mail || {};
            const operatorConfirmed = providerApp.operator_confirmed === true;
            const hasSent = mail.sent === true || mail.provider_confirmation === "sent" || mail.outbox === true;
            if (!hasSent && !operatorConfirmed) {
              emailGuardPassed = false;
              if (from === "SUBMITTED") {
                conflict=true; anyConflict=true; to="AWAITING_OPERATOR"; reason="draft_email_requires_sent_confirmation"; evidenceBinding=hasAnyLocal?"local":"none";
                if (app.execution) { app.execution.state="AWAITING_OPERATOR"; app.execution.awaiting_reason="draft_not_sent_requires_provider_confirmation_or_operator"; app.execution.last_transition_at=now; }
              } else {
                to = from==="FILLED" ? "FILLED":"AWAITING_OPERATOR"; reason="email_draft_not_sent_requires_confirmation"; evidenceBinding=hasAnyProvider?"provider":hasAnyLocal?"local":"none";
              }
            }
          }
          if (emailGuardPassed) {
            if (wantsSubmitted) {
              const hasQualifying = hasProvider || hasLocal || providerApp.operator_confirmed === true;
              if (!hasQualifying) {
                if (from==="FILLED") to="FILLED"; else if (from==="READY_TO_APPLY") to="READY_TO_APPLY"; else to="AWAITING_OPERATOR";
                reason="SUBMITTED_requires_qualifying_evidence"; evidenceBinding="none"; if (hasLocal && !hasProvider){conflict=true; anyConflict=true;}
              } else {
                const providerStronger = hasProvider && (!hasLocal || providerQual.length >= localQual.length);
                const localStronger = hasLocal && !hasProvider;
                if (providerStronger) {
                  to="SUBMITTED"; evidenceBinding=providerApp.operator_confirmed ? "operator_confirmed":"provider"; reason="provider_qualifying_evidence_promotes_SUBMITTED";
                  if (hasLocal && providerQual[0]?.id !== localQual[0]?.id){conflict=true; anyConflict=true;}
                  if (app.execution) {
                    app.execution.state="SUBMITTED"; app.execution.evidence_id=providerQual[0]?.id || app.execution.evidence_id || localQual[0]?.id; app.execution.last_transition_at=providerApp.execution?.last_transition_at || now;
                    if (!app.submitted_at) app.submitted_at=now; if (!app.external_reference) app.external_reference=`provider-${providerSnapshot.provider_id}-${app.id}`;
                  } else {
                    app.execution={state:"SUBMITTED", channel, last_transition_at:providerApp.execution?.last_transition_at || now, evidence_id: providerQual[0]?.id || localQual[0]?.id};
                    if (!app.submitted_at) app.submitted_at=now;
                  }
                  for (const pev of providerQual){ if (!reconciled.evidence.some(e=>e.id===pev.id)) reconciled.evidence.push({id:pev.id, application_id:app.id, kind:pev.kind, artifact:{owner:"user",kind:"relative_path",locator:`evidence/${app.id}/${pev.id}.txt`}, observed_at:pev.observed_at||now}); }
                } else if (localStronger) {
                  to = from==="SUBMITTED" ? "SUBMITTED":"FILLED"; evidenceBinding="local"; reason="local_qualifying_preserved_conflict"; if (hasProvider){conflict=true; anyConflict=true;}
                } else {
                  to="SUBMITTED"; evidenceBinding=hasProvider?"provider":"local"; reason="conflict_preserved_keep_stronger"; conflict=true; anyConflict=true;
                }
              }
            } else {
              to=from;
              if (hasAnyLocal && !hasAnyProvider){evidenceBinding="local"; reason="local_export_remains_local_until_reconciled";}
              else if (hasAnyProvider){evidenceBinding="provider"; reason="provider_evidence_available"; if (hasLocal && providerQual[0]?.id !== localQual[0]?.id){conflict=true; anyConflict=true; reason="conflict_preserved_provider_stronger";} else if (hasAnyLocal && providerAny[0]?.id !== localAny[0]?.id){conflict=true; anyConflict=true;}}
              else {evidenceBinding="none"; reason="no_qualifying_evidence";}
              if (["STALE","CLOSED"].includes(oppVerification) && ["READY_TO_APPLY","FILLED"].includes(from)){
                to="BLOCKED"; reason=`freshness_${oppVerification}_deactivates_queue`;
                if (app.execution){app.execution.state="BLOCKED"; app.execution.block_reason=`posting_${oppVerification}`; app.execution.last_transition_at=now;}
              }
            }
          }
        }
      }
    }
    if (providerApp?.operator_confirmed) evidenceBinding="operator_confirmed";
    execution.push({application_id:app.id, from, to, evidence_binding: evidenceBinding, conflict_preserved: conflict, reason});
    if (to!==from && app.execution && app.execution.state!==to) app.execution.state=to;
    if (conflict) anyConflict=true;
  }

  let overall="none";
  if (execution.some(e=>e.evidence_binding==="operator_confirmed")) overall="operator_confirmed";
  else if (execution.some(e=>e.evidence_binding==="provider")) overall="provider";
  else if (execution.some(e=>e.evidence_binding==="local")) overall="local";

  const result={schema:RECONCILIATION_SCHEMA, reconciled_at:now, provider_read_back:providerReadBack, freshness_transition:freshness, execution_transition:execution, evidence_binding:overall, conflict_preserved:anyConflict, queue_active:queueActive, history_preserved:historyPreserved, idempotent:true};
  if (JSON.stringify(careerState)!==JSON.stringify(reconciled)){
    reconciled.revision=(reconciled.revision||0)+1;
    reconciled.updated_at=now;
  }
  return {reconciledState:reconciled, result};
}

export function isIdempotent(careerState, snapshot){
  const first=reconcile(careerState, snapshot);
  const second=reconcile(first.reconciledState, snapshot);
  return JSON.stringify(first.reconciledState)===JSON.stringify(second.reconciledState);
}
export function requiresProviderReadBack(snapshot){ return !snapshot || snapshot.read_back!==true || !isDateTime(snapshot.observed_at || ""); }
