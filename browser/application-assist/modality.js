"use strict";

/**
 * Application Assist modality adapters.
 * Semantic session/profile mutations remain owned by popup handlers + assist-core.
 * This module only resolves mode, routes intent, and prevents dual-dispatch.
 */
(function (root) {
  const ACTIONS = [
    { id: "start_assist", label: "Start Assist", shortcuts: ["s"], phoneHome: true, destructive: false },
    { id: "fill_allowed", label: "Fill Allowed Fields", shortcuts: ["f"], phoneHome: true, destructive: false },
    { id: "pause_session", label: "Pause", shortcuts: ["p"], phoneHome: true, destructive: false },
    { id: "resume_session", label: "Resume", shortcuts: ["r"], phoneHome: true, destructive: false },
    { id: "undo_last_fill", label: "Undo Last Fill", shortcuts: ["u"], phoneHome: true, destructive: false },
    { id: "emergency_stop", label: "Emergency Stop", shortcuts: ["!", "shift+escape"], phoneHome: true, destructive: true },
    { id: "record_confirmation", label: "Record Confirmation Evidence", shortcuts: ["c"], phoneHome: true, destructive: false },
    { id: "open_profile_panel", label: "Edit Profile", shortcuts: ["g"], phoneHome: true, destructive: false },
    { id: "save_profile", label: "Save Profile", shortcuts: [], phoneHome: false, destructive: false },
    { id: "clear_profile", label: "Clear Profile", shortcuts: [], phoneHome: false, destructive: false },
    { id: "export_profile", label: "Export Profile", shortcuts: [], phoneHome: false, destructive: false },
    { id: "import_profile", label: "Import Profile", shortcuts: [], phoneHome: false, destructive: false },
    { id: "sync_from_cockpit", label: "Sync from EscapeHatch", shortcuts: [], phoneHome: true, destructive: false },
    { id: "open_command_palette", label: "Open Command Palette", shortcuts: ["/", "ctrl+k", "?"], phoneHome: false, destructive: false },
    { id: "dismiss_overlay", label: "Dismiss Overlay", shortcuts: ["escape"], phoneHome: false, destructive: false }
  ];

  const handlers = Object.create(null);
  const recentInvokes = Object.create(null);
  const DEDUPE_MS = 700;

  const SURFACE_EXTENSION_ACTION_POPUP = "EXTENSION_ACTION_POPUP";
  const SURFACE_IN_PAGE_COMPANION = "IN_PAGE_COMPANION";
  const SURFACE_COCKPIT = "COCKPIT";
  const COMPACT_VIEWPORT_MAX_PX = 640;

  /**
   * Input modality is independent of layout width.
   * Phone language requires coarse pointer and/or standalone display —
   * a narrow desktop action popup must remain mouse/keyboard.
   */
  function detectMode(env) {
    const coarse = !!(env && env.coarsePointer);
    const standalone = !!(env && env.standalone);
    if (coarse || standalone) return "phone";
    if (env && env.keyboardFirst) return "keyboard";
    return "mouse";
  }

  function detectDensity(env) {
    if (env && env.density) return env.density === "regular" ? "regular" : "compact";
    const narrow = !!(env && env.narrowViewport);
    return narrow ? "compact" : "regular";
  }

  function detectSurface(env) {
    const surface = env && env.surfaceContext;
    if (
      surface === SURFACE_EXTENSION_ACTION_POPUP ||
      surface === SURFACE_IN_PAGE_COMPANION ||
      surface === SURFACE_COCKPIT
    ) {
      return surface;
    }
    return SURFACE_EXTENSION_ACTION_POPUP;
  }

  function readEnvironment(win) {
    const w = win || root;
    const mq = w.matchMedia ? w.matchMedia("(pointer: coarse)").matches : false;
    const narrow = !!(w.matchMedia && w.matchMedia("(max-width: " + COMPACT_VIEWPORT_MAX_PX + "px)").matches);
    const standalone = !!(w.matchMedia && w.matchMedia("(display-mode: standalone)").matches);
    return {
      coarsePointer: mq,
      narrowViewport: narrow,
      standalone: standalone,
      surfaceContext: SURFACE_EXTENSION_ACTION_POPUP
    };
  }

  function registerHandler(actionId, fn) {
    if (typeof fn !== "function") throw new Error("handler must be a function");
    handlers[actionId] = fn;
  }

  function invokeSemantic(actionId, source, detail) {
    const handler = handlers[actionId];
    if (!handler) throw new Error("No handler registered for " + actionId);
    const now = Date.now();
    const prior = recentInvokes[actionId] || 0;
    if (source === "click" && now - prior < DEDUPE_MS) {
      return { ok: false, deduped: true, actionId: actionId, source: source };
    }
    if (source === "pointer" || source === "touch" || source === "keyboard" || source === "sheet") {
      recentInvokes[actionId] = now;
    }
    if (source === "click") {
      recentInvokes[actionId] = now;
    }
    const result = handler(detail || {});
    return { ok: true, actionId: actionId, source: source, result: result };
  }

  function isEditableTarget(target) {
    if (!target || !target.tagName) return false;
    const tag = String(target.tagName).toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function normalizeKey(event) {
    const key = String(event.key || "").toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (key === "k") return "ctrl+k";
      return "ctrl+" + key;
    }
    if (event.shiftKey && key === "escape") return "shift+escape";
    return key;
  }

  function shortcutAction(event) {
    const chord = normalizeKey(event);
    if (chord === "/" || chord === "?" || chord === "ctrl+k") return "open_command_palette";
    if (chord === "escape") return "dismiss_overlay";
    if (chord === "shift+escape" || chord === "!") return "emergency_stop";
    if (isEditableTarget(event.target)) return null;
    const map = {
      s: "start_assist",
      f: "fill_allowed",
      p: "pause_session",
      r: "resume_session",
      u: "undo_last_fill",
      c: "record_confirmation",
      g: "open_profile_panel"
    };
    return map[chord] || null;
  }

  function phoneHomeActions() {
    return ACTIONS.filter((item) => item.phoneHome);
  }

  function paletteActions(query) {
    const q = String(query || "").trim().toLowerCase();
    return ACTIONS.filter((item) => {
      if (item.id === "dismiss_overlay") return false;
      if (!q) return true;
      return item.label.toLowerCase().includes(q) || item.id.includes(q);
    });
  }

  function applyDocumentMode(doc, mode, options) {
    if (!doc || !doc.documentElement) return;
    const density = detectDensity(options || {});
    const surface = detectSurface(options || {});
    doc.documentElement.setAttribute("data-modality", mode);
    doc.documentElement.setAttribute("data-density", density);
    doc.documentElement.setAttribute("data-surface", surface);
    doc.documentElement.classList.toggle("modality-phone", mode === "phone");
    doc.documentElement.classList.toggle("modality-mouse", mode === "mouse");
    doc.documentElement.classList.toggle("modality-keyboard", mode === "keyboard");
    doc.documentElement.classList.toggle("density-compact", density === "compact");
    doc.documentElement.classList.toggle("density-regular", density === "regular");
  }

  function shouldAutofocusText(mode) {
    return mode !== "phone";
  }

  function clearRecentInvokes(actionId) {
    if (actionId) {
      delete recentInvokes[actionId];
      return;
    }
    for (const key of Object.keys(recentInvokes)) {
      delete recentInvokes[key];
    }
  }

  root.EscapeHatchAssistModality = {
    ACTIONS: ACTIONS,
    DEDUPE_MS: DEDUPE_MS,
    COMPACT_VIEWPORT_MAX_PX: COMPACT_VIEWPORT_MAX_PX,
    SURFACE_EXTENSION_ACTION_POPUP: SURFACE_EXTENSION_ACTION_POPUP,
    SURFACE_IN_PAGE_COMPANION: SURFACE_IN_PAGE_COMPANION,
    SURFACE_COCKPIT: SURFACE_COCKPIT,
    detectMode: detectMode,
    detectDensity: detectDensity,
    detectSurface: detectSurface,
    readEnvironment: readEnvironment,
    registerHandler: registerHandler,
    invokeSemantic: invokeSemantic,
    clearRecentInvokes: clearRecentInvokes,
    isEditableTarget: isEditableTarget,
    shortcutAction: shortcutAction,
    phoneHomeActions: phoneHomeActions,
    paletteActions: paletteActions,
    applyDocumentMode: applyDocumentMode,
    shouldAutofocusText: shouldAutofocusText
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.EscapeHatchAssistModality;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
