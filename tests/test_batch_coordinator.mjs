import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const ROOT=path.resolve(__dirname,"..");
const FIXTURE_DIR=path.join(ROOT,"fixtures","batch-coordinator");

function loadFixture(name){ return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR,name),"utf8")); }
function assertNoLeakage(obj){
  const text=JSON.stringify(obj).toLowerCase();
  for(const f of ["@gmail.com","@northwell.edu","password","token","secret"]) assert.ok(!text.includes(f), "leakage "+f);
  assert.ok(text.includes("example.invalid") || text.includes("synthetic") || text.includes("example.test"), "must use synthetic example.invalid domain");
}

const bc=await import("../artifacts/escape-hatch/src/lib/batch-coordinator.mjs");

// 1 live selected stale retired
{
  const data=loadFixture("01-multi-batch-live-stale-blocked-manual-submitted.json");
  assertNoLeakage(data);
  const sel=bc.selectNextQueueItem(data.career_state);
  assert.ok(sel, "should select");
  assert.equal(sel.application.id,"app-live-high");
  const stale=data.career_state.opportunities.find(o=>o.id==="opp-stale-high");
  const fresh=bc.verifyFreshness(stale);
  assert.equal(fresh.queue_active,false);
  assert.equal(fresh.retire,true);
  assert.equal(fresh.history_preserved,true);
  const before=data.career_state.opportunities.length;
  const res=bc.recordTransition(data.career_state,"app-stale-high","BLOCKED",null,{providerSnapshot:data.provider_snapshot});
  assert.equal(res.updatedState.opportunities.length,before);
  assert.equal(res.receipt.history_preserved,true);
  console.log("PASS mjs live_selected_stale_retired");
}

// 2 web_form progression vs email blocked
{
  const data=loadFixture("02-live-web-form-routed.json");
  const app=data.career_state.applications[0];
  const route=bc.routeChannel(app, data.channel_context);
  assert.equal(route.route,"web_form_via_progression");
  assert.equal(route.targetState,"FILLED");
  const route2=bc.routeChannel(app, {progressionDecision:"REVIEW_REQUIRED", providerAuthorized:true});
  assert.equal(route2.targetState,"AWAITING_OPERATOR");
  const route3=bc.routeChannel(app, {progressionDecision:"AUTO_ADVANCE_SAFE", hasManualGate:true, providerAuthorized:true});
  assert.equal(route3.targetState,"AWAITING_OPERATOR");
  const emailData=loadFixture("08-email-draft-vs-sent.json");
  const appEmail=emailData.career_state.applications[0];
  const rEmail=bc.routeChannel(appEmail, {mailSent:false, operatorConfirmed:false, providerAuthorized:true});
  assert.equal(rEmail.targetState,"AWAITING_OPERATOR");
  console.log("PASS mjs web_form_email");
}

// 3 FILLED vs AWAITING vs SUBMITTED
{
  const data=loadFixture("06-submitted-with-confirmation.json");
  const cs=data.career_state;
  const a1=data.promotion_attempts[0];
  const res1=bc.recordTransition(cs,"app-submitted",a1.target,a1.evidence,{providerSnapshot:a1.provider_snapshot});
  assert.equal(res1.receipt.to, a1.expected_to);
  assert.notEqual(res1.receipt.to,"SUBMITTED");
  const a3=data.promotion_attempts[2];
  const res3=bc.recordTransition(cs,"app-submitted",a3.target,a3.evidence,{providerSnapshot:a3.provider_snapshot});
  assert.equal(res3.receipt.to,"SUBMITTED");
  assert.equal(res3.receipt.evidence_binding,"provider");
  console.log("PASS mjs filled_awaiting_submitted");
}

// 4 receipt + reconciliation
{
  const data=loadFixture("02-live-web-form-routed.json");
  const cs=data.career_state;
  const res=bc.recordTransition(cs,"app-live-web","FILLED",null,{providerSnapshot:{observed_at:"2026-09-10T07:00:00-04:00",provider_id:"synthetic-provider",read_back:true,opportunities:[],applications:[]}});
  assert.equal(res.receipt.schema,"escapehatch/batch-coordinator-transition-receipt/v1");
  assert.ok(res.receipt.timestamp);
  assert.ok(res.receipt.reference);
  assert.equal(res.receipt.history_preserved,true);
  assert.ok(res.reconciliation!==null);
  assert.equal(res.updatedState.revision, cs.revision+1);
  const status=bc.projectBatchStatus(res.updatedState);
  assert.ok(status.active>=0);
  const ev={id:"ev-receipt-001",kind:"submission_receipt",observed_at:"2026-09-10T07:00:00-04:00",artifact:{owner:"user",kind:"relative_path",locator:"evidence/app-live-web/receipt.txt"}};
  const res2=bc.recordTransition(res.updatedState,"app-live-web","SUBMITTED",ev,{providerSnapshot:{observed_at:"2026-09-10T07:10:00-04:00",provider_id:"synthetic-provider",read_back:true,opportunities:[],applications:[{application_id:"app-live-web",execution:{state:"SUBMITTED",channel:"web_form",last_transition_at:"2026-09-10T07:10:00-04:00"},evidence:[{id:"ev-receipt-001",kind:"submission_receipt",observed_at:"2026-09-10T07:00:00-04:00"}]}]},providerAuthorized:true});
  assert.equal(res2.receipt.to,"SUBMITTED");
  console.log("PASS mjs receipt_reconciliation");
}

// 5 channel negative cases
{
  const data=loadFixture("07-channel-routing-negative-cases.json");
  for(const c of data.cases){
    if(c.application && c.expected_route){
      const route=bc.routeChannel(c.application, c.context||{});
      assert.equal(route.route,c.expected_route, c.label);
    }
  }
  const cs=loadFixture("02-live-web-form-routed.json").career_state;
  const csInvalid=JSON.parse(JSON.stringify(cs));
  csInvalid.applications[0].execution.channel="carrier_pigeon";
  let threw=false;
  try{ bc.recordTransition(csInvalid,"app-live-web","FILLED",null,{});}catch(e){ threw=true; assert.ok(String(e.message).includes("invalid_channel")); }
  assert.ok(threw, "should throw invalid channel");
  const csAuth=loadFixture("04-blocked-auth-failure.json").career_state;
  const ev={id:"ev-auth-qual",kind:"submission_receipt",observed_at:"2026-09-10T07:00:00-04:00",artifact:{owner:"user",kind:"relative_path",locator:"evidence/app-blocked-web/receipt.txt"}};
  const resAuth=bc.recordTransition(csAuth,"app-blocked-web","SUBMITTED",ev,{providerSnapshot:{observed_at:"2026-09-10T07:00:00-04:00",provider_id:"synthetic-provider",read_back:true,opportunities:[],applications:[]},providerAuthorized:false});
  assert.notEqual(resAuth.receipt.to,"SUBMITTED");
  console.log("PASS mjs channel_negative");
}

// 6 multi batch status
{
  const data=loadFixture("01-multi-batch-live-stale-blocked-manual-submitted.json");
  const status=bc.projectBatchStatus(data.career_state);
  assert.equal(status.total,6);
  assert.equal(status.byVerification["LIVE_VERIFIED"],3);
  const sel=bc.selectNextQueueItem(data.career_state);
  assert.equal(sel.opportunity.priority,"high");
  const step=bc.coordinateStep(data.career_state,data.provider_snapshot,{progressionDecision:"AUTO_ADVANCE_SAFE",providerAuthorized:true});
  assert.ok(step.selected);
  assert.equal(step.route.targetState,"FILLED");
  console.log("PASS mjs multi_batch");
}

// 7 email draft vs sent
{
  const data=loadFixture("08-email-draft-vs-sent.json");
  const cs=data.career_state;
  for(const c of data.cases){
    const opts={providerSnapshot:c.provider_snapshot, mailSent:c.mail.sent, operatorConfirmed:c.operator_confirmed, providerAuthorized:true};
    if(c.label.includes("draft_email_no_sent")) opts.mailSent=false;
    if(c.label.includes("sent_email")) opts.mailSent=true;
    if(c.label.includes("operator_confirmed")) opts.mailSent=false;
    const res=bc.recordTransition(cs,"app-email","SUBMITTED",c.evidence,opts);
    assert.equal(res.receipt.to,c.expected_to, c.label);
  }
  console.log("PASS mjs email_draft_sent");
}

// synthetic check
{
  const files=fs.readdirSync(FIXTURE_DIR);
  for(const f of files){ const d=JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR,f),"utf8")); assertNoLeakage(d); }
  console.log("PASS mjs synthetic");
}

console.log("ALL MJS TESTS PASS");
