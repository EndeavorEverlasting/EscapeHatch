import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const journal = require("../browser/application-assist/event-journal.js");

assert.equal(journal.SCHEMA, "escapehatch/application-event-journal/v1");
let state = journal.emptyJournal();
function emit(type, payload) {
  const result = journal.append(state, { session_id: "assist-synthetic_1", type, payload });
  state = result.journal;
  return result.event;
}
const first = emit("observation_started", { unexpected_value: "must_not_persist" });
assert.deepEqual(first.payload, { scope: "current_document" });
assert.equal(first.sequence, 1);
const snapshot = emit("page_snapshot", {
  form_count: 1, known_field_count: 2, unknown_field_count: 4,
  required_unresolved_count: 1, validation_error_count: 0,
  file_control_count: 1, submit_control_count: 1,
  email: "sensitive@example.invalid", extra: "must_not_persist"
});
assert.equal(snapshot.sequence, 2);
assert.equal(snapshot.caused_by, first.event_id);
assert.equal(snapshot.payload.email, undefined);
assert.equal(snapshot.payload.extra, undefined);
const completed = emit("field_completed", { question_id: "identity.email", value: "sensitive@example.invalid" });
assert.deepEqual(completed.payload, { question_id: "identity.email", present: true });
const upload = emit("upload_presence_changed", { present: true, filename: "sensitive.pdf" });
assert.deepEqual(upload.payload, { present: true });
const attempt = emit("submit_attempt_observed", { success: true, submitted: true });
assert.deepEqual(attempt.payload, { submission_verified: false });
assert.equal(state.events.every((event) => event.evidence_class === "observed_metadata_only"), true);
assert.equal(journal.exportJsonl(state).split("\n").filter(Boolean).length, 5);
assert.equal(journal.exportJsonl(state).includes("sensitive@example.invalid"), false);
assert.equal(journal.exportJsonl(state).includes("sensitive.pdf"), false);
assert.throws(() => emit("field_completed", { question_id: "legal.attestation", value: "yes" }), /Unknown or private/);
assert.throws(() => emit("application_submitted", { submitted: true }), /Unsupported event/);
assert.throws(() => journal.append(state, { session_id: "raw.email@example.com", type: "page_snapshot" }), /Invalid session/);
assert.throws(() => journal.append({ schema: "unknown", events: [] }, { session_id: "assist-synthetic_1", type: "page_snapshot" }), /Unsupported or corrupted/);
const full = { schema: journal.SCHEMA, version: 1, events: Array(journal.MAX_EVENTS).fill(first) };
assert.throws(() => journal.append(full, { session_id: "assist-synthetic_1", type: "page_snapshot" }), /full/);
console.log("event journal metadata safety/ordering fixtures passed");
