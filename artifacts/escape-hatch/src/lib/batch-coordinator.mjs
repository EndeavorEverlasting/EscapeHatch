// Batch Apply coordinator (EH-Q2) JS ESM - synthetic only
import { reconcile as companionReconcile } from "./companion-reconciliation.mjs";

export const VERIFICATION_STATES = ["SNAPSHOT","LIVE_VERIFIED","STALE","CLOSED","BLOCKED","UNKNOWN"];
export const EXECUTION_STATES = ["READY_TO_APPLY","FILLED","AWAITING_OPERATOR","BLOCKED","SUBMITTED"];
export const CHANNELS = ["web_form","email","external_provider"];
export const QUALIFYING_KINDS = new Set(["submission_receipt","confirmation","correspondence"]);
export const BATCH_RECEIPT_SCHEMA = "escapehatch/batch-coordinator-transition-receipt/v1";
export const BATCH_RUN_SCHEMA = "escapehatch/batch-coordinator-run/v1";

function deepClone(v){return JSON.parse(JSON.stringify(v));}
function isDateTime(s){try{const v=s.endsWith("Z")?s:s.replace("Z","+00:00");return !Number.isNaN(Date.parse(v));}catch{return false;}}
function nowIso(){return new Date().toISOString();}
function priorityRank(p){if(p==="high") return 3; if(p==="medium") return 2; if(p==="low") return 1; return 0;}
function isQualifyingKind(k){return QUALIFYING_KINDS.has(k);}
function providerHasMatchingQualifying(snapshot, applicationId, evidence){
  if(!snapshot || snapshot.read_back!==true || !isDateTime(snapshot.observed_at || "") || !evidence) return false;
  if(!isQualifyingKind(evidence.kind) || !isDateTime(evidence.observed_at || "")) return false;
  const providerApp=(snapshot.applications || []).find(a=>a.application_id===applicationId);
  return Boolean(providerApp && (providerApp.evidence || []).some(pe=>
    pe.id===evidence.id && pe.kind===evidence.kind && isDateTime(pe.observed_at || "")
  ));
}

export function selectNextQueueItem(careerState){
  const oppById=new Map(careerState.opportunities.map(o=>[o.id,o]));
  const candidates=[];
  for(const app of careerState.applications){
    const opp=oppById.get(app.opportunity_id);
    if(!opp) continue;
    const ver=opp.verification?.state ?? null;
    const exec=app.execution?.state ?? null;
    if(ver!=="LIVE_VERIFIED") continue;
    if(exec==="BLOCKED"||exec==="SUBMITTED") continue;
    if(!exec) continue;
    if(!["READY_TO_APPLY","FILLED","AWAITING_OPERATOR"].includes(exec)) continue;
    candidates.push({opp, app, rank:priorityRank(opp.priority), fit: typeof opp.fit_score==="number"? opp.fit_score:0});
  }
  if(!candidates.length) return null;
  candidates.sort((a,b)=>{
    if(b.rank!==a.rank) return b.rank-a.rank;
    if(b.fit!==a.fit) return b.fit-a.fit;
    return String(a.opp.id).localeCompare(String(b.opp.id));
  });
  return { opportunity:candidates[0].opp, application:candidates[0].app };
}

export function verifyFreshness(opportunity){
  const from=opportunity.verification?.state ?? null;
  const to=from;
  let queue_active=false; let retire=false; let reason="no_change";
  if(from==="LIVE_VERIFIED"){ queue_active=true; retire=false; reason="live_verified_permits_routing"; }
  else if(from==="STALE"||from==="CLOSED"){ queue_active=false; retire=true; reason=`posting_${from}_retires_from_active_routing_without_erasing_history`; }
  else if(from==="BLOCKED"){ queue_active=false; retire=true; reason="verification_BLOCKED_blocks_active_routing"; }
  else if(from==="SNAPSHOT"||from==="UNKNOWN"||from===null){ queue_active=false; retire=false; reason="snapshot_unknown_not_live_verified"; }
  return { opportunity_id:opportunity.id, from, to, queue_active, history_preserved:true, retire, reason };
}

export function routeChannel(application, opts={}){
  const channel=application.execution?.channel ?? "web_form";
  if(!CHANNELS.includes(channel)){
    return { route:"BLOCKED", targetState:"BLOCKED", reason:"invalid_channel", blockReason:`invalid_channel_${channel}` };
  }
  const progressionDecision=opts.progressionDecision ?? opts.progression?.decision ?? null;
  const providerAuthorized=opts.providerAuthorized;
  const mailSent=opts.mailSent;
  const adapterAvailable=opts.adapterAvailable;
  const hasManualGate=opts.hasManualGate===true;
  const operatorConfirmed=opts.operatorConfirmed===true;

  if(channel==="web_form"){
    if(providerAuthorized===false) return { route:"BLOCKED", targetState:"BLOCKED", reason:"provider_authorization_failure_BLOCKED", blockReason:"provider_authorization_failure" };
    if(hasManualGate) return { route:"AWAITING_OPERATOR", targetState:"AWAITING_OPERATOR", reason:"manual_gate_requires_operator", awaitingReason:"manual_upload_or_attestation_or_captcha" };
    if(progressionDecision==="AUTO_ADVANCE_SAFE") return { route:"web_form_via_progression", targetState:"FILLED", reason:"progression_AUTO_ADVANCE_SAFE_permits_FILLED" };
    if(progressionDecision==="REVIEW_REQUIRED") return { route:"AWAITING_OPERATOR", targetState:"AWAITING_OPERATOR", reason:"progression_REVIEW_REQUIRED", awaitingReason:"progression_gate_blocked" };
    return { route:"AWAITING_OPERATOR", targetState:"AWAITING_OPERATOR", reason:"progression_context_missing_requires_operator", awaitingReason:"missing_progression_evidence" };
  }
  if(channel==="email"){
    if(providerAuthorized===false) return { route:"AWAITING_OPERATOR", targetState:"AWAITING_OPERATOR", reason:"provider_authorization_failure_AWAITING_OPERATOR_email", awaitingReason:"provider_authorization_failure" };
    if(mailSent===false && !operatorConfirmed){
      return { route:"AWAITING_OPERATOR", targetState:"AWAITING_OPERATOR", reason:"email_draft_not_sent_requires_provider_confirmation_or_operator", awaitingReason:"draft_not_sent" };
    }
    if(adapterAvailable===false) return { route:"AWAITING_OPERATOR", targetState:"AWAITING_OPERATOR", reason:"email_adapter_unavailable", awaitingReason:"provider_unavailable" };
    if(mailSent===true || operatorConfirmed){
      return { route:"email_via_provider", targetState:"AWAITING_OPERATOR", reason:"email_sent_requires_qualifying_evidence_before_SUBMITTED", awaitingReason:"needs_qualifying_confirmation" };
    }
    return { route:"email_via_provider", targetState:"FILLED", reason:"email_routed_via_provider_adapter" };
  }
  if(channel==="external_provider"){
    if(adapterAvailable===false) return { route:"BLOCKED", targetState:"BLOCKED", reason:"external_provider_adapter_unavailable", blockReason:"adapter_unavailable" };
    if(providerAuthorized===false) return { route:"BLOCKED", targetState:"BLOCKED", reason:"provider_authorization_failure_BLOCKED", blockReason:"provider_authorization_failure" };
    if(hasManualGate) return { route:"AWAITING_OPERATOR", targetState:"AWAITING_OPERATOR", reason:"external_manual_gate", awaitingReason:"manual_gate_external" };
    return { route:"external_via_provider", targetState:"AWAITING_OPERATOR", reason:"external_provider_requires_provider_confirmation", awaitingReason:"requires_provider_confirmation_or_operator" };
  }
  return { route:"BLOCKED", targetState:"BLOCKED", reason:"unhandled_channel", blockReason:`unhandled_${channel}` };
}

export function recordTransition(careerState, applicationId, targetState, evidence, opts={}){
  const now=nowIso();
  const updated=deepClone(careerState);
  const app=updated.applications.find(a=>a.id===applicationId);
  if(!app) throw new Error(`application not found: ${applicationId}`);
  const opp=updated.opportunities.find(o=>o.id===app.opportunity_id) ?? null;
  const from=app.execution?.state ?? null;
  const channel=app.execution?.channel ?? "web_form";
  const verification=opp?.verification?.state ?? null;
  if(!CHANNELS.includes(channel)) throw new Error(`invalid_channel_${channel}`);
  if(!EXECUTION_STATES.includes(targetState)) throw new Error(`invalid_execution_state_${targetState}`);

  let to=targetState;
  let reason=`transition_${String(from)}_to_${targetState}`;
  let evidenceBinding="none";
  let conflict=false;
  let queueActive=verification==="LIVE_VERIFIED" && to!=="BLOCKED" && to!=="SUBMITTED";

  const providerSnapshot=opts.providerSnapshot;
  const providerReadBack=Boolean(providerSnapshot && providerSnapshot.read_back===true && isDateTime(providerSnapshot.observed_at || ""));
  const providerAuthorized=opts.providerAuthorized;
  const mailSent=opts.mailSent;
  const operatorConfirmed=opts.operatorConfirmed===true;
  const matchingEvidence=updated.evidence.filter(e=>evidence && e.id===evidence.id);
  const evidenceIdConflict=matchingEvidence.some(e=>e.application_id!==applicationId);
  const hasQualifying=Boolean(evidence && !evidenceIdConflict && isQualifyingKind(evidence.kind) && isDateTime(evidence.observed_at || ""));
  const hasEvidence=!!evidence;
  const localHasQualifying=updated.evidence.some(e=>e.application_id===applicationId && isQualifyingKind(e.kind) && isDateTime(e.observed_at || ""));
  const providerHasQualifying=providerHasMatchingQualifying(providerSnapshot, applicationId, evidence) && !evidenceIdConflict;
  if(evidenceIdConflict) conflict=true;

  if(to==="SUBMITTED"){
    if(providerAuthorized===false){
      to=channel==="email"?"AWAITING_OPERATOR":"BLOCKED";
      reason="provider_authorization_failure_BLOCKED_never_SUBMITTED";
      evidenceBinding=localHasQualifying?"local":"none";
    }else if(evidenceIdConflict){
      to=from==="FILLED"?"FILLED":"AWAITING_OPERATOR";
      reason="evidence_id_bound_to_other_application";
      evidenceBinding="none";
    }else if(channel==="email" && mailSent!==true && !operatorConfirmed){
      to=from==="FILLED"?"FILLED":"AWAITING_OPERATOR";
      reason="draft_email_requires_sent_confirmation_never_SUBMITTED";
      evidenceBinding=hasEvidence?"local":"none";
      conflict=true;
    }else if(!providerHasQualifying && !operatorConfirmed){
      if(from==="FILLED") to="FILLED";
      else if(from==="READY_TO_APPLY") to="READY_TO_APPLY";
      else to="AWAITING_OPERATOR";
      if(hasQualifying || localHasQualifying){
        reason="provider_read_back_or_operator_confirmation_required_before_SUBMITTED";
        evidenceBinding="local";
      }else{
        reason="SUBMITTED_requires_qualifying_evidence_with_timestamp_and_reference";
        evidenceBinding="none";
      }
      if(hasEvidence && !hasQualifying) conflict=true;
    }else if(verification==="BLOCKED"){
      to="BLOCKED";
      reason="verification_BLOCKED_blocks_SUBMITTED";
      evidenceBinding=hasQualifying?"provider":localHasQualifying?"local":"none";
      conflict=true;
    }else if(!isDateTime(now)){
      to=from;
      reason="missing_timestamp";
    }else{
      evidenceBinding=operatorConfirmed?"operator_confirmed":"provider";
      reason="qualifying_confirmation_promotes_SUBMITTED";
      if(hasEvidence && localHasQualifying && evidence && updated.evidence.some(e=>e.id===evidence.id && e.application_id!==applicationId)) conflict=true;
    }
    if(to==="SUBMITTED" && verification!=="LIVE_VERIFIED" && verification!=null){
      if(verification==="STALE"||verification==="CLOSED"){
        to="BLOCKED";
        reason=`posting_${verification}_blocks_SUBMITTED_without_erasing_history`;
        queueActive=false;
      }
    }
  }

  if(!providerReadBack && to==="SUBMITTED" && evidenceBinding==="provider"){
    evidenceBinding="local";
    reason="provider_read_back_required_before_provider_sync_claim";
    if(!hasQualifying) {
      to=from==="FILLED"?"FILLED":"AWAITING_OPERATOR";
      reason="local_mutation_not_provider_completion";
    }
  }

  if((verification==="STALE"||verification==="CLOSED") && (to==="READY_TO_APPLY"||to==="FILLED")){
    to="BLOCKED";
    reason=`freshness_${verification}_deactivates_queue_without_erasing_history`;
    queueActive=false;
  }
  if(verification==="LIVE_VERIFIED" && queueActive) queueActive=true; else if(to==="BLOCKED"||to==="SUBMITTED") queueActive=false; else queueActive=verification==="LIVE_VERIFIED" && !["STALE","CLOSED","BLOCKED"].includes(verification);

  const finalTo=to;
  if(app.execution){
    app.execution.state=finalTo;
    app.execution.last_transition_at=now;
    if(evidence && hasQualifying && !evidenceIdConflict) app.execution.evidence_id=evidence.id;
    if(finalTo==="BLOCKED" && !app.execution.block_reason) app.execution.block_reason=reason;
    if(finalTo==="AWAITING_OPERATOR" && !app.execution.awaiting_reason) app.execution.awaiting_reason=reason;
    if(finalTo==="SUBMITTED"){
      if(!app.submitted_at) app.submitted_at=now;
      if(!app.external_reference) app.external_reference=`batch-${now}-${applicationId}`;
    }
  }else{
    app.execution={ state:finalTo, channel, last_transition_at:now, detail:reason };
    if(evidence && hasQualifying && !evidenceIdConflict) app.execution.evidence_id=evidence.id;
    if(finalTo==="SUBMITTED"){
      if(!app.submitted_at) app.submitted_at=now;
      if(!app.external_reference) app.external_reference=`batch-${now}-${applicationId}`;
    }
  }

  if(evidence && !evidenceIdConflict && !updated.evidence.some(e=>e.id===evidence.id)){
    updated.evidence.push({
      id: evidence.id,
      application_id: applicationId,
      kind: evidence.kind,
      artifact: evidence.artifact ?? { owner:"user", kind:"relative_path", locator:`evidence/${applicationId}/${evidence.id}.txt` },
      observed_at: evidence.observed_at
    });
  }

  const hasChanged=JSON.stringify(careerState)!==JSON.stringify(updated);
  if(hasChanged){
    updated.revision=(updated.revision??0)+1;
    updated.updated_at=now;
  }

  const reference=(!evidenceIdConflict ? evidence?.id : null) ?? app.external_reference ?? `batch-${applicationId}-${now}`;
  const receipt={
    schema:BATCH_RECEIPT_SCHEMA,
    application_id:applicationId,
    opportunity_id:app.opportunity_id,
    channel,
    verification_state:verification,
    from,
    to:finalTo,
    evidence_binding:evidenceBinding,
    reference,
    timestamp:now,
    reason,
    history_preserved:true,
    conflict_preserved:conflict,
    queue_active:queueActive
  };

  let reconciliation=null;
  if(opts.providerSnapshot !== undefined){
    const snap=opts.providerSnapshot ?? null;
    try{
      const r=companionReconcile(updated, snap);
      reconciliation=r;
    }catch(e){
      reconciliation=null;
    }
  }

  return { updatedState:updated, receipt, reconciliation };
}

export function projectBatchStatus(careerState){
  const byVerification={};
  const byExecution={};
  const byChannel={};
  const queueActive={};
  for(const opp of careerState.opportunities){
    const v=opp.verification?.state ?? "UNKNOWN";
    byVerification[v]=(byVerification[v]??0)+1;
    queueActive[opp.id]=v==="LIVE_VERIFIED";
  }
  let activeCount=0;
  for(const app of careerState.applications){
    const e=app.execution?.state ?? "UNKNOWN";
    const ch=app.execution?.channel ?? "web_form";
    byExecution[e]=(byExecution[e]??0)+1;
    byChannel[ch]=(byChannel[ch]??0)+1;
    const opp=careerState.opportunities.find(o=>o.id===app.opportunity_id);
    const ver=opp?.verification?.state ?? null;
    const isActive=ver==="LIVE_VERIFIED" && !["BLOCKED","SUBMITTED"].includes(e);
    if(isActive) activeCount+=1;
  }
  return { total:careerState.opportunities.length, active:activeCount, byVerification, byExecution, byChannel, queueActive };
}

export function coordinateStep(careerState, providerSnapshot, channelContext={}){
  const selected=selectNextQueueItem(careerState);
  if(!selected) return { selected:null, freshness:null, route:null, transition:null, batchStatus:projectBatchStatus(careerState) };
  const freshness=verifyFreshness(selected.opportunity);
  if(!freshness.queue_active){
    const blocked=recordTransition(careerState, selected.application.id, "BLOCKED", null, { providerSnapshot });
    return { selected, freshness, route:{route:"BLOCKED", targetState:"BLOCKED", reason:freshness.reason, blockReason:freshness.reason}, transition:{updatedState:blocked.updatedState, receipt:blocked.receipt}, batchStatus:projectBatchStatus(blocked.updatedState) };
  }
  const route=routeChannel(selected.application, channelContext);
  const target=route.targetState;
  const evidenceForPromotion=target==="SUBMITTED" ? { id:`ev-${selected.application.id}-${Date.now()}`, kind:"submission_receipt", observed_at:nowIso(), artifact:{owner:"user", kind:"relative_path", locator:`evidence/${selected.application.id}/receipt.txt`}} : null;
  const transition=recordTransition(careerState, selected.application.id, target, evidenceForPromotion, { providerSnapshot, providerAuthorized: channelContext.providerAuthorized, mailSent: channelContext.mailSent, operatorConfirmed: channelContext.operatorConfirmed });
  return { selected, freshness, route, transition, batchStatus:projectBatchStatus(transition.updatedState) };
}
