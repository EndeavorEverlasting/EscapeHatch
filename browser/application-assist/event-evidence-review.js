(function (root, factory) {
  const api = factory(root.EscapeHatchEventJournal ||
    (typeof require === "function" ? require("./event-journal.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EscapeHatchEventEvidenceReview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (journalApi) {
  "use strict";

  // Cross-repo principle donated by FileSteward's CleanupDisposition vs.
  // AuthorizationState: event evidence never creates mutation authority.
  // This module is read-only. It is NOT a CareerState reducer or a submit API.
  const SNAPSHOT_KEYS = [
    "form_count", "known_field_count", "unknown_field_count",
    "required_unresolved_count", "validation_error_count",
    "file_control_count", "submit_control_count"
  ];
  const TYPE_KEYS = Object.freeze({
    observation_started: ["scope"],
    page_snapshot: SNAPSHOT_KEYS,
    field_completed: ["question_id", "present"],
    field_cleared: ["question_id", "present"],
    upload_presence_changed: ["present"],
    submit_attempt_observed: ["submission_verified"]
  });
  const ENVELOPE_KEYS = [
    "schema", "event_id", "session_id", "sequence", "caused_by",
    "type", "observed_at", "evidence_class", "payload"
  ];

  function keysMatch(input, keys) {
    return input && typeof input === "object" && !Array.isArray(input) &&
      Object.keys(input).length === keys.length &&
      keys.every((key) => Object.prototype.hasOwnProperty.call(input, key));
  }

  function invalid(reason) {
    return Object.freeze({
      state: "REJECTED_INVALID_EVIDENCE",
      reason,
      attempt_observed: false,
      event_count: 0,
      career_state_transition: null,
      submission_authorized: false
    });
  }

  function review(journal) {
    if (!journalApi || !journal || journal.schema !== journalApi.SCHEMA ||
        journal.version !== 1 || !Array.isArray(journal.events) ||
        journal.events.length > journalApi.MAX_EVENTS) {
      return invalid("INVALID_JOURNAL");
    }
    const sessions = new Map();
    const seenIds = new Set();
    let attempts = 0;
    for (const e of journal.events) {
      if (!keysMatch(e, ENVELOPE_KEYS) ||
          e.schema !== journalApi.SCHEMA ||
          !journalApi.EVENTS.includes(e.type) ||
          e.evidence_class !== "observed_metadata_only" ||
          !/^assist-[A-Za-z0-9_-]{1,80}$/.test(e.session_id) ||
          !Number.isSafeInteger(e.sequence) || e.sequence < 1 ||
          e.event_id !== e.session_id + ":" + e.sequence ||
          seenIds.has(e.event_id) ||
          typeof e.observed_at !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T/.test(e.observed_at)) {
        return invalid("INVALID_EVENT_ENVELOPE");
      }
      const previous = sessions.get(e.session_id);
      if (e.sequence !== (previous ? previous.sequence + 1 : 1) ||
          e.caused_by !== (previous ? previous.event_id : null)) {
        return invalid("EVENT_SEQUENCE_OR_CAUSAL_GAP");
      }
      const requiredKeys = TYPE_KEYS[e.type];
      if (!keysMatch(e.payload, requiredKeys)) return invalid("UNAPPROVED_PAYLOAD");
      let sanitized;
      try {
        sanitized = journalApi.sanitizePayload(e.type, e.payload);
      } catch (_error) {
        return invalid("UNAPPROVED_PAYLOAD");
      }
      if (JSON.stringify(sanitized) !== JSON.stringify(e.payload)) {
        return invalid("UNAPPROVED_PAYLOAD");
      }
      seenIds.add(e.event_id);
      sessions.set(e.session_id, { sequence: e.sequence, event_id: e.event_id });
      if (e.type === "submit_attempt_observed") attempts++;
    }
    return Object.freeze({
      state: journal.events.length ? "OBSERVED_METADATA_ONLY" : "NO_OBSERVATION",
      reason: attempts ? "SUBMIT_ATTEMPT_NOT_CONFIRMATION" : "NO_SUBMISSION_RECEIPT",
      attempt_observed: attempts > 0,
      event_count: journal.events.length,
      career_state_transition: null,
      submission_authorized: false
    });
  }

  return Object.freeze({ review });
});
