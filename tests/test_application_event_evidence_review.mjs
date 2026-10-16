import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const journal = require("../browser/application-assist/event-journal.js");
const projection = require("../browser/application-assist/event-evidence-review.js");

const base = journal.emptyJournal();
function add(state, type, payload = {}) {
  return journal.append(state, { session_id: "assist-synthetic_1", type, payload }).journal;
}
const empty = projection.review(base);
assert.equal(empty.state, "NO_OBSERVATION");
assert.equal(empty.submission_authorized, false);
assert.equal(empty.career_state_transition, null);

let state = add(base, "observation_started");
state = add(state, "page_snapshot", { known_field_count: 2 });
state = add(state, "field_completed", { question_id: "identity.email" });
state = add(state, "submit_attempt_observed", { submitted: true, success: true });
const valid = projection.review(state);
assert.equal(valid.state, "OBSERVED_METADATA_ONLY");
assert.equal(valid.event_count, 4);
assert.equal(valid.attempt_observed, true);
assert.equal(valid.submission_authorized, false);
assert.equal(valid.career_state_transition, null);
assert.equal(valid.reason, "SUBMIT_ATTEMPT_NOT_CONFIRMATION");

// chrome.storage may reorder keys; semantic equality is independent of order.
const reordered = structuredClone(state);
for (const event of reordered.events) {
  event.payload = Object.fromEntries(Object.entries(event.payload).reverse());
}
assert.equal(projection.review(reordered).state, "OBSERVED_METADATA_ONLY");
assert.equal(journal.exportJsonl(reordered).trim().split("\n").length, 4);

function mutate(index, changes) {
  const clone = structuredClone(state);
  clone.events[index] = { ...clone.events[index], ...changes };
  return clone;
}
for (const bad of [
  mutate(3, { payload: { submission_verified: true } }),
  mutate(2, { payload: { question_id: "identity.email", present: true, email: "private@example.invalid" } }),
  mutate(2, { payload: { question_id: "legal.attestation", present: true } }),
  mutate(3, { sequence: 50, event_id: "assist-synthetic_1:50" }),
  mutate(3, { caused_by: null }),
  mutate(1, { evidence_class: "submission_receipt" }),
  mutate(3, { type: "application_submitted" }),
  mutate(1, { observed_at: "2026-99-99Tinvalid" }),
  mutate(0, { session_id: ["assist-synthetic_1"] }),
  { ...state, private_answer: "synthetic-private-sentinel" },
  { ...state, events: [state.events[0], state.events[0]] },
  { ...state, version: 99 }
]) {
  const result = projection.review(bad);
  assert.equal(result.state, "REJECTED_INVALID_EVIDENCE");
  assert.equal(result.submission_authorized, false);
  assert.equal(result.career_state_transition, null);
  assert.throws(() => journal.exportJsonl(bad), /corrupted/);
  assert.throws(() => add(bad, "observation_started"), /corrupted/);
}
assert.equal(projection.review({ submitted: true }).submission_authorized, false);
console.log("cross-repo evidence/authority guard: observation and adversarial attempts passed");
