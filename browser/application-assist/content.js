(function () {
  "use strict";

  const api = globalThis.EscapeHatchAssist;
  if (!api) {
    return { status: "error", message: "assist core missing" };
  }

  const message = globalThis.__ESCAPEHATCH_ASSIST_COMMAND__ || { type: "fill" };
  const profile = message.profile || {};
  let session = message.session;

  if (!session) {
    return { status: "error", message: "assist session missing" };
  }

  session = api.observeOrigin(session, location.origin);

  if (message.type === "observe") {
    return { status: "ok", action: "observe", session };
  }

  if (message.type === "undo") {
    const result = api.undoLastFill(document, session);
    return {
      status: "ok",
      action: "undo",
      undone: result.undone,
      skipped: result.skipped,
      session: result.session,
      reason: result.reason || null
    };
  }

  if (message.type === "fill") {
    if (session.status !== "active") {
      return {
        status: "ok",
        action: "fill",
        filled: 0,
        matched_fields: [],
        inspected: 0,
        session,
        skipped_reason: session.status === "stopped" ? "emergency_stop" : "session_not_active"
      };
    }
    const result = api.fillDocument(document, profile, session);
    return {
      status: "ok",
      action: "fill",
      filled: result.filled,
      matched_fields: result.matched_fields,
      inspected: result.inspected,
      session: result.session,
      plan_revision: result.plan_revision,
      plan_item_count: result.plan ? result.plan.items.length : 0
    };
  }

  return { status: "error", message: "unsupported assist command" };
})();
