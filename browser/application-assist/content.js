(function () {
  "use strict";

  const api = globalThis.EscapeHatchAssist;
  if (!api) {
    return { status: "error", message: "assist core missing" };
  }

  const message = globalThis.__ESCAPEHATCH_ASSIST_COMMAND__ || { type: "fill" };
  const profile = message.profile || {};
  const preferenceStore = message.preferenceStore || null;
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

  if (message.type === "advance") {
    const progression = globalThis.EscapeHatchProgression;
    const navigation = globalThis.EscapeHatchNavigationAdapter;
    if (!progression || !navigation) {
      return { status: "error", message: "progression runtime missing" };
    }
    if (session.status !== "active") {
      return { status: "ok", action: "advance", decision: "REVIEW_REQUIRED", reason: "session_not_active", session };
    }
    const pageState = navigation.describeDocument(document);
    const archetype = progression.classifyPageArchetype(pageState);
    pageState.archetype = archetype;
    const plan = progression.buildProgressionPlan(pageState, { stable: message.fillStable === true });
    const liveState = navigation.buildLiveState(document, {
      session,
      archetype,
      fillStable: message.fillStable === true,
      accountBootstrapState: message.accountBootstrapState || null,
      loopState: message.loopState || null,
      pageId: message.pageId || null
    });
    const execution = navigation.executeGatedNavigation(plan, liveState, document, progression);
    return { status: "ok", action: "advance", plan, execution, decision: execution.decision, reason: execution.reason, session };
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
    const result = api.fillDocument(document, profile, session, preferenceStore);
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
