(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EscapeHatchEventJournal = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const SCHEMA = "escapehatch/application-event-journal/v1";
  const STORAGE_KEY = "escapeHatch.applicationEventJournal.v1";
  const SESSION_KEY = "escapeHatch.applicationAssistSession.v1";
  const MAX_EVENTS = 1000;
  const QUESTION_IDS = new Set([
    "identity.title", "identity.first_name", "identity.last_name",
    "identity.preferred_name", "identity.email", "identity.phone",
    "identity.linkedin", "identity.street_address", "identity.city",
    "identity.region", "identity.postal_code", "identity.country"
  ]);
  const EVENTS = Object.freeze([
    "observation_started", "page_snapshot", "field_completed",
    "field_cleared", "upload_presence_changed", "submit_attempt_observed"
  ]);

  function integer(value) {
    if (!Number.isInteger(value) || value < 0) return 0;
    return Math.min(value, 10000);
  }

  function sanitizePayload(type, payload) {
    const p = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
    if (type === "page_snapshot") {
      return {
        form_count: integer(p.form_count),
        known_field_count: integer(p.known_field_count),
        unknown_field_count: integer(p.unknown_field_count),
        required_unresolved_count: integer(p.required_unresolved_count),
        validation_error_count: integer(p.validation_error_count),
        file_control_count: integer(p.file_control_count),
        submit_control_count: integer(p.submit_control_count)
      };
    }
    if (type === "field_completed" || type === "field_cleared") {
      if (!QUESTION_IDS.has(p.question_id)) throw new Error("Unknown or private field category");
      return { question_id: p.question_id, present: type === "field_completed" };
    }
    if (type === "upload_presence_changed") return { present: p.present === true };
    if (type === "submit_attempt_observed") return { submission_verified: false };
    return { scope: "current_document" };
  }

  function emptyJournal() {
    return { schema: SCHEMA, version: 1, events: [] };
  }

  function keysMatch(value, keys) {
    return value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  }

  // Resolve lazily: the existing evidence owner depends on the journal API.
  // Do not create a second evidence validator for append/export.
  function assertJournal(journal) {
    const review = root.EscapeHatchEventEvidenceReview ||
      (typeof require === "function" ? require("./event-evidence-review.js") : null);
    if (!keysMatch(journal, ["schema", "version", "events"]) ||
        !review || review.review(journal).state === "REJECTED_INVALID_EVIDENCE") {
      throw new Error("Unsupported or corrupted event journal");
    }
  }

  function append(journal, input) {
    if (!journal || journal.schema !== SCHEMA || !Array.isArray(journal.events)) {
      throw new Error("Unsupported or corrupted event journal");
    }
    if (!input || !EVENTS.includes(input.type)) throw new Error("Unsupported event type");
    const sessionId = String(input.session_id || "");
    if (!/^assist-[A-Za-z0-9_-]{1,80}$/.test(sessionId)) {
      throw new Error("Invalid session identity");
    }
    if (journal.events.length >= MAX_EVENTS) {
      throw new Error("Event journal full: export and clear explicitly, no silent loss");
    }
    assertJournal(journal);
    const previous = [...journal.events].reverse().find((event) => event.session_id === sessionId);
    const seq = previous ? previous.sequence + 1 : 1;
    const event = {
      schema: SCHEMA,
      event_id: sessionId + ":" + seq,
      session_id: sessionId,
      sequence: seq,
      caused_by: previous ? previous.event_id : null,
      type: input.type,
      observed_at: new Date().toISOString(),
      evidence_class: "observed_metadata_only",
      payload: sanitizePayload(input.type, input.payload)
    };
    return { journal: { schema: SCHEMA, version: 1, events: journal.events.concat(event) }, event };
  }

  function exportJsonl(journal) {
    assertJournal(journal);
    return journal.events.map((e) => JSON.stringify(e)).join("\n") +
      (journal.events.length ? "\n" : "");
  }

  return Object.freeze({
    SCHEMA, STORAGE_KEY, SESSION_KEY, MAX_EVENTS, EVENTS,
    QUESTION_IDS, sanitizePayload, emptyJournal, append, exportJsonl
  });
});
