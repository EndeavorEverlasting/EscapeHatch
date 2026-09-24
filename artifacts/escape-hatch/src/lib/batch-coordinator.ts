// Batch Apply coordinator (EH-Q2) - synthetic only, no provider network, no auto-submit
import { reconcile as companionReconcile } from "./companion-reconciliation";

export const VERIFICATION_STATES = ["SNAPSHOT","LIVE_VERIFIED","STALE","CLOSED","BLOCKED","UNKNOWN"] as const;
export const EXECUTION_STATES = ["READY_TO_APPLY","FILLED","AWAITING_OPERATOR","BLOCKED","SUBMITTED"] as const;
export const CHANNELS = ["web_form","email","external_provider"] as const;
export const QUALIFYING_KINDS = new Set(["submission_receipt","confirmation","correspondence"]);
export const BATCH_RECEIPT_SCHEMA = "escapehatch/batch-coordinator-transition-receipt/v1";
export const BATCH_RUN_SCHEMA = "escapehatch/batch-coordinator-run/v1";

export type VerificationState = typeof VERIFICATION_STATES[number];
export type ExecutionState = typeof EXECUTION_STATES[number];
export type Channel = typeof CHANNELS[number];

export type CareerState = {
  schema_version: string; state_id: string; revision: number; updated_at: string;
  profile: unknown;
  opportunities: Array<{ id: string; status?: string; priority?: string; fit_score?: number; verification?: { state: VerificationState; verified_at: string; detail?: string; source?:string }; [k:string]:unknown }>;
  applications: Array<{ id: string; opportunity_id: string; resume_id: string; status: string; submitted_at: string|null; external_reference?: string|null; execution?: { state: ExecutionState; channel: Channel; last_transition_at: string; evidence_id?: string; block_reason?: string; awaiting_reason?: string; detail?: string }; [k:string]:unknown }>;
  evidence: Array<{ id:string; application_id:string; kind:string; artifact:{owner:string; kind:string; locator:string}; observed_at:string }>;
  [k:string]:unknown
};
export type ProviderSnapshot = { observed_at:string; provider_id:string; read_back:boolean; opportunities?:Array<{opportunity_id:string; verification?:{state:VerificationState; verified_at:string; detail?:string; source?:string}; auth?:{authorized:boolean; reason?:string}}>; applications?:Array<{application_id:string; execution?:{state:ExecutionState; channel:Channel; last_transition_at:string; evidence_id?:string}; evidence?:Array<{id:string; kind:string; observed_at:string}>; mail?:{draft:boolean; sent:boolean; provider_confirmation?:string; outbox?:boolean}; auth?:{authorized:boolean; channel?:string; reason?:string}; operator_confirmed?:boolean}>; [k:string]:unknown };
export type FreshnessCheck = { opportunity_id:string; from:VerificationState|null; to:VerificationState|null; queue_active:boolean; history_preserved:boolean; retire:boolean; reason:string };
export type ChannelRoute = { route:"web_form_via_progression"|"email_via_provider"|"external_via_provider"|"AWAITING_OPERATOR"|"BLOCKED"; targetState:ExecutionState; reason:string; blockReason?:string; awaitingReason?:string };
export type TransitionReceipt = { schema:typeof BATCH_RECEIPT_SCHEMA; application_id:string; opportunity_id:string; channel:Channel; verification_state:VerificationState|null; from:ExecutionState|null; to:ExecutionState|null; evidence_binding:"local"|"provider"|"operator_confirmed"|"none"; reference:string; timestamp:string; reason:string; history_preserved:boolean; conflict_preserved:boolean; queue_active:boolean };

function deepClone<T>(v:T):T{return JSON.parse(JSON.stringify(v));}
function isDateTime(s:string){
  if(typeof s!=="string") return false;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(s);
  if(!m) return false;
  const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]),hour=Number(m[4]),minute=Number(m[5]),second=Number(m[6]);
  const offsetHour=m[10]===undefined?0:Number(m[10]),offsetMinute=m[11]===undefined?0:Number(m[11]);
  if(year<1||month<1||month>12||hour>23||minute>59||second>59||offsetHour>23||offsetMinute>59) return false;
  const leap=(year%4===0&&year%100!==0)||year%400===0;
  const monthDays=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(day<1||day>monthDays[month-1]) return false;
  return !Number.isNaN(Date.parse(s));
}
function nowIso(){return new Date().toISOString();}
function priorityRank(p?:string){if(p==="high") return 3; if(p==="medium") return 2; if(p==="low") return 1; return 0;}
function isQualifyingKind(k:string){return QUALIFYING_KINDS.has(k);}
function isQualifyingEvidence(evidence:{id?:unknown;kind?:unknown;observed_at?:unknown}|null|undefined){
  return Boolean(evidence && typeof evidence.id==="string" && evidence.id.trim().length>0 && typeof evidence.kind==="string" && isQualifyingKind(evidence.kind) && typeof evidence.observed_at==="string" && isDateTime(evidence.observed_at));
}
function providerMatchingQualifying(
  snapshot:ProviderSnapshot|null|undefined,
  applicationId:string,
  evidence:{id:string; kind:string; observed_at:string; artifact?:{owner:string; kind:string; locator:string}}|null,
  durableCandidates:Array<{id:string; kind:string; observed_at:string}>
):{id:string; kind:string; observed_at:string}|null{
  if(!snapshot || snapshot.read_back!==true || !isDateTime(snapshot.observed_at || "")) return null;
  let candidates=durableCandidates;
  if(evidence!==null){
    if(!isQualifyingEvidence(evidence)) return null;
    candidates=[evidence];
  }
  const providerApp=snapshot.applications?.find(a=>a.application_id===applicationId);
  if(!providerApp) return null;
  for(const candidate of candidates){
    const matched=providerApp.evidence?.some(pe=>pe.id===candidate.id && pe.kind===candidate.kind && isDateTime(pe.observed_at || ""));
    if(matched) return candidate;
  }
  return null;
}

// Select one dependency-ready queue item by priority + freshness (only LIVE_VERIFIED + not BLOCKED/SUBMITTED)
export function selectNextQueueItem(careerState:CareerState):{opportunity:CareerState["opportunities"][number]; application:CareerState["applications"][number]}|null{
  const oppById=new Map(careerState.opportunities.map(o=>[o.id,o]));
  const candidates: Array<{opp:any; app:any; rank:number; fit:number}>=[];
  for(const app of careerState.applications){
    const opp=oppById.get(app.opportunity_id);
    if(!opp) continue;
    const ver=(opp.verification?.state as VerificationState|undefined)??null;
    const exec=(app.execution?.state as ExecutionState|undefined)??null;
    if(ver!=="LIVE_VERIFIED") continue;
    if(exec==="BLOCKED"||exec==="SUBMITTED") continue;
    if(!exec) continue;
    // only READY_TO_APPLY / FILLED / AWAITING_OPERATOR are queue-active; others not
    if(!["READY_TO_APPLY","FILLED","AWAITING_OPERATOR"].includes(exec)) continue;
    candidates.push({opp, app, rank:priorityRank(opp.priority as string), fit: typeof opp.fit_score==="number"? opp.fit_score : 0});
  }
  if(!candidates.length) return null;
  candidates.sort((a,b)=>{
    if(b.rank!==a.rank) return b.rank-a.rank;
    if(b.fit!==a.fit) return b.fit-a.fit;
    return String(a.opp.id).localeCompare(String(b.opp.id));
  });
  return { opportunity:candidates[0].opp, application:candidates[0].app };
}

// Reverify freshness before fill/application effort. STALE/CLOSED immediately retire from routing while preserving evidence.
export function verifyFreshness(opportunity:{id:string; verification?:{state:VerificationState; verified_at:string}}):FreshnessCheck{
  const from=(opportunity.verification?.state as VerificationState|undefined)??null;
  const to=from;
  let queue_active=false; let retire=false; let reason="no_change";
  if(from==="LIVE_VERIFIED"){ queue_active=true; retire=false; reason="live_verified_permits_routing"; }
  else if(from==="STALE"||from==="CLOSED"){ queue_active=false; retire=true; reason=`posting_${from}_retires_from_active_routing_without_erasing_history`; }
  else if(from==="BLOCKED"){ queue_active=false; retire=true; reason="verification_BLOCKED_blocks_active_routing"; }
  else if(from==="SNAPSHOT"||from==="UNKNOWN"||from===null){ queue_active=false; retire=false; reason="snapshot_unknown_not_live_verified"; }
  return { opportunity_id:opportunity.id, from, to, queue_active, history_preserved:true, retire, reason };
}

// Route web/email/external through converged adapters or stop as AWAITING_OPERATOR/BLOCKED
export function routeChannel(application:CareerState["applications"][number], opts: { progressionDecision?:string; providerAuthorized?:boolean; mailSent?:boolean; adapterAvailable?:boolean; hasManualGate?:boolean; operatorConfirmed?:boolean; progression?:{decision:string} } = {}):ChannelRoute{
  const channel=(application.execution?.channel as Channel|undefined)??"web_form";
  if(! (CHANNELS as readonly string[]).includes(channel)){
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
    // default without progression context: treat as needing operator if fill not yet stable
    return { route:"AWAITING_OPERATOR", targetState:"AWAITING_OPERATOR", reason:"progression_context_missing_requires_operator", awaitingReason:"missing_progression_evidence" };
  }
  if(channel==="email"){
    if(providerAuthorized===false) return { route:"AWAITING_OPERATOR", targetState:"AWAITING_OPERATOR", reason:"provider_authorization_failure_AWAITING_OPERATOR_email", awaitingReason:"provider_authorization_failure" };
    if(mailSent===false && !operatorConfirmed){
      // draft not sent cannot become SUBMITTED; route as awaiting
      return { route:"AWAITING_OPERATOR", targetState:"AWAITING_OPERATOR", reason:"email_draft_not_sent_requires_provider_confirmation_or_operator", awaitingReason:"draft_not_sent" };
    }
    if(adapterAvailable===false) return { route:"AWAITING_OPERATOR", targetState:"AWAITING_OPERATOR", reason:"email_adapter_unavailable", awaitingReason:"provider_unavailable" };
    // email with sent confirmation or operator confirmed can still be routed but not auto-promoted to SUBMITTED
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

// Validate no-promotion invariants and persist smallest safe receipt + reconciliation hook
export function recordTransition(careerState:CareerState, applicationId:string, targetState:ExecutionState, evidence: {id:string; kind:string; observed_at:string; artifact?:{owner:string; kind:string; locator:string}}|null, opts: { providerSnapshot?:ProviderSnapshot|null; mailSent?:boolean; operatorConfirmed?:boolean; providerAuthorized?:boolean } = {}):{ updatedState:CareerState; receipt:TransitionReceipt; reconciliation:ReturnType<typeof companionReconcile>|null }{
  const now=nowIso();
  let updated=deepClone(careerState);
  const app=updated.applications.find(a=>a.id===applicationId);
  if(!app) throw new Error(`application not found: ${applicationId}`);
  const opp=updated.opportunities.find(o=>o.id===app.opportunity_id) ?? null;
  const from=(app.execution?.state as ExecutionState|undefined)??null;
  const channel=(app.execution?.channel as Channel|undefined)??"web_form";
  const verification=(opp?.verification?.state as VerificationState|undefined)??null;
  if(! (CHANNELS as readonly string[]).includes(channel)) throw new Error(`invalid_channel_${channel}`);
  if(! (EXECUTION_STATES as readonly string[]).includes(targetState)) throw new Error(`invalid_execution_state_${targetState}`);

  let to:ExecutionState|null=targetState;
  let reason=`transition_${String(from)}_to_${targetState}`;
  let evidenceBinding:TransitionReceipt["evidence_binding"]="none";
  let conflict=false;
  let queueActive=verification==="LIVE_VERIFIED" && to!=="BLOCKED" && to!=="SUBMITTED";

  // evidence helpers
  const providerSnapshot=opts.providerSnapshot;
  const providerReadBack=Boolean(providerSnapshot && providerSnapshot.read_back===true && isDateTime(providerSnapshot.observed_at || ""));
  const providerAuthorized=opts.providerAuthorized;
  const mailSent=opts.mailSent;
  const operatorConfirmed=opts.operatorConfirmed===true;
  const allEvidence=updated.evidence;
  const matchingEvidence=allEvidence.filter(e=>evidence && e.id===evidence.id);
  const evidenceIdConflict=matchingEvidence.some(e=>e.application_id!==applicationId);
  const hasQualifying=Boolean(evidence && !evidenceIdConflict && isQualifyingEvidence(evidence));
  const hasEvidence=!!evidence;
  const durableLocalQualifying=allEvidence.filter(e=>
    e.application_id===applicationId &&
    isQualifyingEvidence(e) &&
    !allEvidence.some(other=>other.id===e.id && other.application_id!==applicationId)
  );
  const localHasQualifying=durableLocalQualifying.length>0;
  const providerMatchingEvidence=providerMatchingQualifying(providerSnapshot, applicationId, evidence, durableLocalQualifying);
  const providerHasQualifying=Boolean(providerMatchingEvidence) && !evidenceIdConflict;
  if(evidenceIdConflict) conflict=true;

  // no-promotion guards
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
      // SUBMITTED requires provider-matched qualifying evidence or explicit operator confirmation.
      if(from==="FILLED") to="FILLED";
      else if(from==="READY_TO_APPLY") to="READY_TO_APPLY";
      else to="AWAITING_OPERATOR";
      to=to as ExecutionState;
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
      to=from as ExecutionState;
      reason="missing_timestamp";
    }else{
      // valid promotion requires reference
      evidenceBinding=operatorConfirmed?"operator_confirmed":"provider";
      reason="qualifying_confirmation_promotes_SUBMITTED";
      if(hasEvidence && localHasQualifying && evidence && updated.evidence.some(e=>e.id===evidence.id && e.application_id!==applicationId)) conflict=true;
    }
    if(to==="SUBMITTED" && verification!=="LIVE_VERIFIED" && verification!=null){
      // SUBMITTED from LIVE_VERIFIED alone is insufficient already handled, but ensure stale/closed not promoted
      if(verification==="STALE"||verification==="CLOSED"){
        to="BLOCKED";
        reason=`posting_${verification}_blocks_SUBMITTED_without_erasing_history`;
        queueActive=false;
      }
    }
  }

  // FILLED vs AWAITING_OPERATOR vs SUBMITTED separation is preserved above; also ensure local vs provider not masqueraded
  if(!providerReadBack && to==="SUBMITTED" && evidenceBinding==="provider"){
    // local tracker mutation != provider sync: if no read_back, downgrade provider binding to local
    evidenceBinding="local";
    reason="provider_read_back_required_before_provider_sync_claim";
    if(!hasQualifying) {
      to=from==="FILLED"?"FILLED":"AWAITING_OPERATOR";
      reason="local_mutation_not_provider_completion";
    }
  }

  // freshness guard: STALE/CLOSED execution deactivation (should have been handled by verifyFreshness but also here)
  if((verification==="STALE"||verification==="CLOSED") && (to==="READY_TO_APPLY"||to==="FILLED")){
    to="BLOCKED";
    reason=`freshness_${verification}_deactivates_queue_without_erasing_history`;
    queueActive=false;
  }
  if(verification==="LIVE_VERIFIED" && queueActive) queueActive=true; else if(to==="BLOCKED"||to==="SUBMITTED") queueActive=false; else queueActive=verification==="LIVE_VERIFIED" && !["STALE","CLOSED","BLOCKED"].includes(verification as string);

  // persist transition on updated state
  const finalTo=to as ExecutionState;
  if(app.execution){
    app.execution.state=finalTo;
    app.execution.last_transition_at=now;
    if(evidence && hasQualifying && !evidenceIdConflict) app.execution.evidence_id=evidence.id;
    else if(finalTo==="SUBMITTED" && providerMatchingEvidence) app.execution.evidence_id=providerMatchingEvidence.id;
    if(finalTo==="BLOCKED" && !app.execution.block_reason) app.execution.block_reason=reason;
    if(finalTo==="AWAITING_OPERATOR" && !app.execution.awaiting_reason) app.execution.awaiting_reason=reason;
    if(finalTo==="SUBMITTED"){
      if(!app.submitted_at) app.submitted_at=now;
      if(!app.external_reference) app.external_reference=`batch-${now}-${applicationId}`;
    }
  }else{
    app.execution={ state:finalTo, channel, last_transition_at:now, detail:reason } as any;
    if(evidence && hasQualifying && !evidenceIdConflict) (app.execution as any).evidence_id=evidence.id;
    else if(finalTo==="SUBMITTED" && providerMatchingEvidence) (app.execution as any).evidence_id=providerMatchingEvidence.id;
    if(finalTo==="SUBMITTED"){
      if(!app.submitted_at) app.submitted_at=now;
      if(!app.external_reference) app.external_reference=`batch-${now}-${applicationId}`;
    }
  }

  // append evidence if qualifying and not already present (smallest safe receipt)
  if(evidence && !evidenceIdConflict && !updated.evidence.some(e=>e.id===evidence.id)){
    updated.evidence.push({
      id: evidence.id,
      application_id: applicationId,
      kind: evidence.kind,
      artifact: evidence.artifact ?? { owner:"user", kind:"relative_path", locator:`evidence/${applicationId}/${evidence.id}.txt` },
      observed_at: evidence.observed_at
    });
  }

  // revision bump if changed
  const hasChanged=JSON.stringify(careerState)!==JSON.stringify(updated);
  if(hasChanged){
    updated.revision=(updated.revision??0)+1;
    updated.updated_at=now;
  }

  const reference=(!evidenceIdConflict ? evidence?.id : null) ?? providerMatchingEvidence?.id ?? app.external_reference ?? `batch-${applicationId}-${now}`;
  const receipt:TransitionReceipt={
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

  // reconciliation hook into career-state/application-companion (provider-agnostic)
  let reconciliation:ReturnType<typeof companionReconcile>|null=null;
  if(opts.providerSnapshot !== undefined){
    const snap=opts.providerSnapshot ?? null;
    try{
      const r=companionReconcile(updated as any, snap as any);
      updated=r.reconciledState as CareerState;
      reconciliation=r as any;
    }catch(e){
      reconciliation=null;
    }
  }

  return { updatedState:updated, receipt, reconciliation };
}

// Status/control integration: project batched queue status for continuous Batch Apply run
export function projectBatchStatus(careerState:CareerState):{ total:number; active:number; byVerification:Record<string,number>; byExecution:Record<string,number>; byChannel:Record<string,number>; queueActive:Record<string,boolean> }{
  const byVerification:Record<string,number>={};
  const byExecution:Record<string,number>={};
  const byChannel:Record<string,number>={};
  const queueActive:Record<string,boolean>={};
  for(const opp of careerState.opportunities){
    const v=(opp.verification?.state as string)??"UNKNOWN";
    byVerification[v]=(byVerification[v]??0)+1;
    const active=v==="LIVE_VERIFIED";
    queueActive[opp.id]=active;
  }
  let activeCount=0;
  for(const app of careerState.applications){
    const e=(app.execution?.state as string)??"UNKNOWN";
    const ch=(app.execution?.channel as string)??"web_form";
    byExecution[e]=(byExecution[e]??0)+1;
    byChannel[ch]=(byChannel[ch]??0)+1;
    const opp=careerState.opportunities.find(o=>o.id===app.opportunity_id);
    const ver=(opp?.verification?.state as string)??null;
    const isActive=ver==="LIVE_VERIFIED" && !["BLOCKED","SUBMITTED"].includes(e);
    if(isActive) activeCount+=1;
  }
  return { total:careerState.opportunities.length, active:activeCount, byVerification, byExecution, byChannel, queueActive };
}

// One-step orchestration for continuous Batch Apply run (select -> verify -> route -> transition)
export function coordinateStep(careerState:CareerState, providerSnapshot:ProviderSnapshot|null, channelContext: { progressionDecision?:string; providerAuthorized?:boolean; mailSent?:boolean; adapterAvailable?:boolean; hasManualGate?:boolean; operatorConfirmed?:boolean } = {}):{ selected:{opportunity:any; application:any}|null; freshness:FreshnessCheck|null; route:ChannelRoute|null; transition:{updatedState:CareerState; receipt:TransitionReceipt}|null; batchStatus:ReturnType<typeof projectBatchStatus> }{
  let workingState=careerState;
  if(providerSnapshot){
    try{ workingState=companionReconcile(careerState as any,providerSnapshot as any).reconciledState as CareerState; }catch(_e){ workingState=careerState; }
  }
  const selected=selectNextQueueItem(workingState);
  if(!selected) return { selected:null, freshness:null, route:null, transition:null, batchStatus:projectBatchStatus(workingState) };
  const freshness=verifyFreshness(selected.opportunity as any);
  if(!freshness.queue_active){
    // retire stale/closed immediately, preserve evidence: produce BLOCKED transition receipt
    const blocked=recordTransition(workingState, selected.application.id, "BLOCKED", null, { providerSnapshot });
    return { selected, freshness, route:{route:"BLOCKED", targetState:"BLOCKED", reason:freshness.reason, blockReason:freshness.reason}, transition:{updatedState:blocked.updatedState, receipt:blocked.receipt}, batchStatus:projectBatchStatus(blocked.updatedState) };
  }
  const route=routeChannel(selected.application as any, channelContext);
  // For web_form with progression safe, transition to FILLED; for awaiting, to AWAITING_OPERATOR
  const target=route.targetState;
  // Only transition if not already at target; otherwise still produce receipt
  const evidenceForPromotion: any = target==="SUBMITTED" ? { id:`ev-${selected.application.id}-${Date.now()}`, kind:"submission_receipt", observed_at:nowIso(), artifact:{owner:"user", kind:"relative_path", locator:`evidence/${selected.application.id}/receipt.txt`}} : null;
  // Do not auto-promote to SUBMITTED without qualifying; channel routes to FILLED/AWAITING_OPERATOR by default
  const transition=recordTransition(workingState, selected.application.id, target, evidenceForPromotion, { providerSnapshot, providerAuthorized: channelContext.providerAuthorized, mailSent: channelContext.mailSent, operatorConfirmed: channelContext.operatorConfirmed });
  return { selected, freshness, route, transition, batchStatus:projectBatchStatus(transition.updatedState) };
}
