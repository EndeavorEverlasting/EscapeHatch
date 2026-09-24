#!/usr/bin/env node
// EH-Q1 JS reconciliation tests (mirrors Python suite)
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { reconcile, isIdempotent, requiresProviderReadBack } from "../artifacts/escape-hatch/src/lib/companion-reconciliation.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const fixtureDir = join(ROOT, "fixtures/application-companion-reconciliation");

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf-8"));
}
function assertNoLeakage(obj) {
  const text = JSON.stringify(obj);
  const lower = text.toLowerCase();
  for (const f of ["@gmail.com", "@northwell.edu", "password", "token"]) {
    assert(!lower.includes(f), `fixture leakage: ${f}`);
  }
  assert(text.includes("example.invalid") || text.includes("example.test") || lower.includes("synthetic"), "fixture must use synthetic example.invalid domain");
}

function testProviderReadBack() {
  const data = loadFixture("fixture-01-provider-read-back-required.json");
  assertNoLeakage(data);
  const { result, reconciledState } = reconcile(data.career_state, data.provider_snapshot);
  assert.equal(result.provider_read_back, false);
  const exec = result.execution_transition.find(e => e.application_id === "app-fixture-001");
  assert.equal(exec.from, "FILLED");
  assert.equal(exec.to, "FILLED", `should not promote without read_back, got ${JSON.stringify(exec)}`);
  assert.equal(exec.evidence_binding, "local");
  const fresh = result.freshness_transition.find(f => f.opportunity_id === "opp-fixture-001");
  assert.equal(fresh.from, "SNAPSHOT");
  assert.equal(fresh.to, "SNAPSHOT");
  assert(reconciledState.opportunities.some(o => o.id === "opp-fixture-001"));
  console.log("PASS provider_read_back_required (mjs)");
}

function testLiveVerified() {
  const data = loadFixture("fixture-02-live-verified-promotion.json");
  assertNoLeakage(data);
  const { result, reconciledState } = reconcile(data.career_state, data.provider_snapshot);
  assert.equal(result.provider_read_back, true);
  const fresh = result.freshness_transition.find(f => f.opportunity_id === "opp-fixture-001");
  assert.equal(fresh.from, "SNAPSHOT");
  assert.equal(fresh.to, "LIVE_VERIFIED");
  assert.equal(fresh.queue_active, true);
  const opp = reconciledState.opportunities.find(o => o.id === "opp-fixture-001");
  assert.equal(opp.verification.state, "LIVE_VERIFIED");
  console.log("PASS live_verified_promotion (mjs)");
}

function testStaleDeactivation() {
  const data = loadFixture("fixture-03-stale-closed-deactivation.json");
  assertNoLeakage(data);
  const { result, reconciledState } = reconcile(data.career_state, data.provider_snapshot);
  const fresh = result.freshness_transition.find(f => f.opportunity_id === "opp-fixture-001");
  assert.equal(fresh.to, "STALE");
  assert.equal(fresh.queue_active, false);
  assert.equal(fresh.history_preserved, true);
  const exec = result.execution_transition.find(e => e.application_id === "app-fixture-001");
  assert.equal(exec.from, "READY_TO_APPLY");
  assert.equal(exec.to, "BLOCKED");
  assert.equal(reconciledState.opportunities.length, data.career_state.opportunities.length);
  // closed variant
  const psClosed = JSON.parse(JSON.stringify(data.provider_snapshot));
  psClosed.opportunities[0].verification.state = "CLOSED";
  psClosed.opportunities[0].verification.detail = "Provider reports CLOSED";
  const second = reconcile(data.career_state, psClosed);
  const fresh2 = second.result.freshness_transition.find(f => f.opportunity_id === "opp-fixture-001");
  assert.equal(fresh2.to, "CLOSED");
  assert.equal(fresh2.queue_active, false);
  console.log("PASS stale_closed_deactivation (mjs)");
}

function testLocalRemainsLocal() {
  const data = loadFixture("fixture-04-local-edit-remains-local.json");
  assertNoLeakage(data);
  const { result } = reconcile(data.career_state, data.provider_snapshot);
  const exec = result.execution_transition.find(e => e.application_id === "app-fixture-001");
  assert.equal(exec.evidence_binding, "local");
  assert.equal(exec.to, "FILLED");
  assert.notEqual(exec.to, "SUBMITTED");
  const psNoRead = JSON.parse(JSON.stringify(data.provider_snapshot));
  psNoRead.read_back = false;
  const second = reconcile(data.career_state, psNoRead);
  const exec2 = second.result.execution_transition.find(e => e.application_id === "app-fixture-001");
  assert.equal(exec2.evidence_binding, "local");
  assert.equal(exec2.to, "FILLED");
  console.log("PASS local_edit_remains_local (mjs)");
}

function testAuthFailure() {
  const data = loadFixture("fixture-05-auth-failure-blocked.json");
  assertNoLeakage(data);
  const { result, reconciledState } = reconcile(data.career_state, data.provider_snapshot);
  const exec = result.execution_transition.find(e => e.application_id === "app-fixture-001");
  assert(["BLOCKED","AWAITING_OPERATOR"].includes(exec.to), `auth failure should block, got ${JSON.stringify(exec)}`);
  assert.notEqual(exec.to, "SUBMITTED");
  const app = reconciledState.applications.find(a=>a.id==="app-fixture-001");
  assert(["BLOCKED","AWAITING_OPERATOR"].includes(app.execution.state));
  console.log("PASS auth_failure_blocked (mjs)");
}

function testDraftEmail() {
  const data = loadFixture("fixture-06-draft-email-not-sent.json");
  assertNoLeakage(data);
  const { result } = reconcile(data.career_state, data.provider_snapshot);
  const exec = result.execution_transition.find(e => e.application_id === "app-fixture-001");
  assert.notEqual(exec.to, "SUBMITTED", `draft email must not promote to SUBMITTED, got ${JSON.stringify(exec)}`);
  assert(["FILLED","AWAITING_OPERATOR"].includes(exec.to));
  // operator_confirmed should allow
  const psConfirmed = JSON.parse(JSON.stringify(data.provider_snapshot));
  psConfirmed.applications[0].operator_confirmed = true;
  psConfirmed.applications[0].evidence = [{id:"ev-confirmed-001", kind:"correspondence", observed_at:"2026-09-10T07:00:00-04:00"}];
  const second = reconcile(data.career_state, psConfirmed);
  const exec2 = second.result.execution_transition.find(e => e.application_id === "app-fixture-001");
  assert.equal(exec2.to, "SUBMITTED");
  assert.equal(exec2.evidence_binding, "operator_confirmed");
  console.log("PASS draft_email_not_sent (mjs)");
}

function testIdempotentConflict() {
  const data = loadFixture("fixture-07-idempotent-conflict-preserved.json");
  assertNoLeakage(data);
  const first = reconcile(data.career_state, data.provider_snapshot);
  assert.equal(first.result.conflict_preserved, true);
  const exec = first.result.execution_transition.find(e => e.application_id === "app-fixture-001");
  assert.equal(exec.conflict_preserved, true);
  assert(["provider","operator_confirmed"].includes(exec.evidence_binding));
  assert(first.reconciledState.evidence.some(e=>e.id==="ev-local-007"));
  const second = reconcile(first.reconciledState, data.provider_snapshot);
  assert.equal(JSON.stringify(first.reconciledState), JSON.stringify(second.reconciledState), "second run should be identical (idempotent)");
  assert.equal(second.result.conflict_preserved, true);
  assert(isIdempotent(data.career_state, data.provider_snapshot) === true);
  assert.equal(first.result.history_preserved, true);
  console.log("PASS idempotent_conflict_preserved (mjs)");
}

function testUndatedProviderEvidence() {
  const data = loadFixture("fixture-04-local-edit-remains-local.json");
  for (const badTimestamp of ["", "2026-09-10", "2026-02-30T00:00:00Z"]) {
    const cs = JSON.parse(JSON.stringify(data.career_state));
    const ps = JSON.parse(JSON.stringify(data.provider_snapshot));
    ps.read_back = true;
    ps.observed_at = "2026-09-10T07:00:00-04:00";
    ps.applications = [{
      application_id: "app-fixture-001",
      execution: { state: "SUBMITTED", channel: "web_form", last_transition_at: "2026-09-10T07:00:00-04:00" },
      evidence: [{ id: "ev-undated", kind: "submission_receipt", observed_at: badTimestamp }],
      auth: { authorized: true }
    }];
    const { result, reconciledState } = reconcile(cs, ps);
    const exec = result.execution_transition.find(e => e.application_id === "app-fixture-001");
    assert.notEqual(exec.to, "SUBMITTED", `invalid provider evidence timestamp must not promote: ${badTimestamp}`);
    assert.notEqual(reconciledState.applications[0].execution.state, "SUBMITTED");
  }
  assert.equal(requiresProviderReadBack({read_back:true, observed_at:"2026-09-10"}), true);
  assert.equal(requiresProviderReadBack({read_back:true, observed_at:"2026-02-30T00:00:00Z"}), true);
  assert.equal(requiresProviderReadBack({read_back:true, observed_at:"2026-09-10T07:00:00Z"}), false);
  console.log("PASS undated_provider_evidence (mjs)");
}

function testEvidenceOnlyRevision() {
  const data = loadFixture("fixture-07-idempotent-conflict-preserved.json");
  const cs = JSON.parse(JSON.stringify(data.career_state));
  const ps = JSON.parse(JSON.stringify(data.provider_snapshot));
  const providerApp = ps.applications[0];
  const providerOpp = ps.opportunities[0];
  const app = cs.applications[0];
  const opp = cs.opportunities[0];

  const pv = providerOpp.verification;
  opp.verification = {
    state: pv.state,
    verified_at: pv.verified_at,
    detail: pv.detail || "Live posting re-observed via provider read-back",
    source: pv.source || ps.provider_id
  };
  const pe = providerApp.execution;
  app.execution.state = pe.state;
  app.execution.channel = pe.channel;
  app.execution.last_transition_at = pe.last_transition_at;
  app.execution.evidence_id = providerApp.evidence[0].id;
  app.submitted_at = pe.last_transition_at;
  app.external_reference = `provider-${ps.provider_id}-${app.id}`;
  cs.evidence = [];

  const beforeRevision = cs.revision;
  const first = reconcile(cs, ps);
  assert(first.reconciledState.evidence.some(e => e.id === "ev-provider-007"));
  assert.equal(first.reconciledState.revision, beforeRevision + 1, "evidence-only mutation must bump revision");
  const second = reconcile(first.reconciledState, ps);
  assert.equal(second.reconciledState.revision, first.reconciledState.revision, "idempotent second pass must not bump revision");
  console.log("PASS evidence_only_revision (mjs)");
}

function testSynthetic() {
  const files = readdirSync(fixtureDir).filter(f=>f.endsWith(".json"));
  assert(files.length >= 7, `expected at least 7 fixtures, got ${files.length}`);
  for (const f of files) {
    const data = loadFixture(f);
    assertNoLeakage(data);
  }
  console.log("PASS synthetic (mjs)");
}

testProviderReadBack();
testLiveVerified();
testStaleDeactivation();
testLocalRemainsLocal();
testAuthFailure();
testDraftEmail();
testIdempotentConflict();
testUndatedProviderEvidence();
testEvidenceOnlyRevision();
testSynthetic();
console.log("ALL MJS TESTS PASS");
