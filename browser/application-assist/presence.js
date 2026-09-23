/* EscapeHatch Ambient Companion Presence - projection + beacon
   no focus theft: beacon never steals page focus; operator navigation wins */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EscapeHatchPresence = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STATES = Object.freeze([
    "dormant",
    "ready",
    "observing",
    "working_fill",
    "working_account",
    "working_advance",
    "waiting_user",
    "blocked",
    "paused",
    "step_complete",
    "error",
    "stopped"
  ]);

  const WORKING_STATES = Object.freeze([
    "observing",
    "working_fill",
    "working_account",
    "working_advance"
  ]);

  const PERSIST_VISIBLE = Object.freeze(["waiting_user", "blocked", "error", "paused", "stopped"]);

  const PRESENTATION_VALUES = Object.freeze(["quiet", "dot_only", "hidden_for_session"]);
  const SIDE_VALUES = Object.freeze(["left", "right"]);

  const COPY = Object.freeze({
    dormant: { short: "", detail: "", a11y: "EscapeHatch companion — dormant", reason_prefix: "" },
    ready: { short: "Ready", detail: "Ready when you are.", a11y: "EscapeHatch companion — ready", reason_prefix: "" },
    observing: { short: "Checking this page…", detail: "Checking this page…", a11y: "EscapeHatch companion — checking this page", reason_prefix: "" },
    working_fill: { short: "Filling the details I know…", detail: "Filling the details I know…", a11y: "EscapeHatch companion — filling", reason_prefix: "" },
    working_account: { short: "Setting up the account…", detail: "Setting up the account…", a11y: "EscapeHatch companion — setting up account", reason_prefix: "" },
    working_advance: { short: "Moving to the next step…", detail: "Moving to the next step…", a11y: "EscapeHatch companion — moving to next step", reason_prefix: "" },
    waiting_user: { short: "Your turn — this one needs you.", detail: "Your turn — this one needs you.", a11y: "EscapeHatch companion — waiting for you", reason_prefix: "Needs you:" },
    blocked: { short: "I stopped here so I don't guess.", detail: "I stopped here so I don't guess.", a11y: "EscapeHatch companion — stopped", reason_prefix: "Reason:" },
    paused: { short: "Paused", detail: "Paused", a11y: "EscapeHatch companion — paused", reason_prefix: "" },
    step_complete: { short: "Done with this step.", detail: "Done with this step.", a11y: "EscapeHatch companion — step complete", reason_prefix: "" },
    error: { short: "I couldn't finish that step.", detail: "I couldn't finish that step.", a11y: "EscapeHatch companion — error", reason_prefix: "Details:" },
    stopped: { short: "Stopped", detail: "Stopped", a11y: "EscapeHatch companion — stopped", reason_prefix: "" }
  });

  const ALLOWED_REASONS = Object.freeze([
    "validation_error_present",
    "manual_review_required",
    "file_upload_required",
    "captcha_present",
    "mfa_required",
    "unknown_control",
    "ambiguous_progression",
    "final_submit",
    "attestation_required",
    "password_outside_account_creation",
    "auth_mismatch",
    "verification_required",
    "generic"
  ]);

  function sanitizeReason(code) {
    const v = String(code || "").trim().toLowerCase();
    if (!v) return null;
    if (ALLOWED_REASONS.includes(v)) return v;
    const normalized = v.replace(/[^a-z0-9_]/g, "_");
    if (ALLOWED_REASONS.includes(normalized)) return normalized;
    return "generic";
  }

  function normalizeState(value) {
    const v = String(value || "").trim().toLowerCase();
    return STATES.includes(v) ? v : null;
  }

  function isWorkingState(s) { return WORKING_STATES.includes(s); }
  function isWaitingState(s) { return s === "waiting_user"; }
  function shouldPersistLabel(s) { return PERSIST_VISIBLE.includes(s); }

  function shouldAnimate(state, reducedMotion) {
    if (reducedMotion) return false;
    return isWorkingState(state);
  }

  function resolveAnchor(occupied, sidePreference) {
    const occ = occupied && typeof occupied === "object" ? occupied : {};
    const isOccupied = (a) => !!occ[a] || (occ instanceof Set && occ.has(a));
    let order;
    if (sidePreference === "left") order = ["lower-left", "mid-left", "lower-right", "mid-right"];
    else order = ["lower-right", "lower-left", "mid-right", "mid-left"];
    for (const cand of order) if (!isOccupied(cand)) return cand;
    return order[order.length - 1];
  }

  function getCopy(state) {
    return COPY[state] || COPY.ready;
  }

  function mapEventToState(canonicalState, lastEvent) {
    const sessStatus = canonicalState && typeof canonicalState.status === "string" ? canonicalState.status :
                       canonicalState && typeof canonicalState.sessionStatus === "string" ? canonicalState.sessionStatus : null;
    if (!canonicalState || sessStatus === "dormant" || canonicalState.dormant === true) return "dormant";
    if (sessStatus === "stopped") return "stopped";
    if (sessStatus === "paused") return "paused";
    if (!lastEvent || typeof lastEvent !== "object") {
      if (sessStatus === "active") return "ready";
      if (sessStatus === "idle" || !sessStatus) return "dormant";
      return "ready";
    }
    const typeRaw = String(lastEvent.type || lastEvent.state || "").trim().toLowerCase();
    const isFinal = !!(lastEvent.isFinalSubmit || lastEvent.final_submit || (canonicalState && canonicalState.isFinalSubmit));
    if (isFinal) return "waiting_user";
    const map = {
      dormant: "dormant",
      ready: "ready",
      observing: "observing",
      scanning: "observing",
      checking: "observing",
      working_fill: "working_fill",
      fill_started: "working_fill",
      filling: "working_fill",
      working_account: "working_account",
      account_started: "working_account",
      account_bootstrap: "working_account",
      working_advance: "working_advance",
      advance_started: "working_advance",
      progressing: "working_advance",
      waiting_user: "waiting_user",
      awaiting_operator: "waiting_user",
      manual_review: "waiting_user",
      manual: "waiting_user",
      submit: "waiting_user",
      apply: "waiting_user",
      finish: "waiting_user",
      send: "waiting_user",
      blocked: "blocked",
      review_required: "blocked",
      paused: "paused",
      pause: "paused",
      step_complete: "step_complete",
      completed: "step_complete",
      done: "step_complete",
      error: "error",
      failed: "error",
      stopped: "stopped",
      emergency_stop: "stopped"
    };
    if (map[typeRaw]) return map[typeRaw];
    if (typeRaw.includes("fill")) return "working_fill";
    if (typeRaw.includes("account")) return "working_account";
    if (typeRaw.includes("advance") || typeRaw.includes("next")) return "working_advance";
    if (typeRaw.includes("waiting") || typeRaw.includes("await")) return "waiting_user";
    if (typeRaw.includes("blocked")) return "blocked";
    if (typeRaw.includes("error")) return "error";
    if (typeRaw.includes("paused")) return "paused";
    if (typeRaw.includes("stopped")) return "stopped";
    if (sessStatus === "active") return "ready";
    return "dormant";
  }

  function projectPresence(canonicalState, lastEvent) {
    if (canonicalState && typeof canonicalState === "object" && canonicalState._isSnapshot) {
      return canonicalState;
    }
    let state = mapEventToState(canonicalState || {}, lastEvent || {});
    const copy = getCopy(state);
    const prefRaw = canonicalState && typeof canonicalState.presentationPreference === "string" ? canonicalState.presentationPreference : (lastEvent && lastEvent.presentationPreference) || "quiet";
    const sideRaw = canonicalState && typeof canonicalState.sidePreference === "string" ? canonicalState.sidePreference : (lastEvent && lastEvent.sidePreference) || "right";
    const presentationPreference = PRESENTATION_VALUES.includes(prefRaw) ? prefRaw : "quiet";
    const sidePreference = SIDE_VALUES.includes(sideRaw) ? sideRaw : "right";
    const startedAt = (lastEvent && lastEvent.startedAt) || (canonicalState && canonicalState.startedAt) || new Date().toISOString();
    const lastCompletedActionKey = (lastEvent && lastEvent.lastCompletedActionKey) || (canonicalState && canonicalState.lastCompletedActionKey) || null;
    const reasonCode = sanitizeReason(lastEvent && lastEvent.reasonCode || lastEvent && lastEvent.reason || null);
    const canExpand = state !== "dormant" && presentationPreference !== "hidden_for_session";
    return {
      state,
      shortLabelKey: state + "_short",
      shortText: copy.short,
      detailText: copy.detail,
      a11yLabel: copy.a11y,
      reasonCode: reasonCode,
      reasonPrefix: copy.reason_prefix || "",
      startedAt,
      lastCompletedActionKey: lastCompletedActionKey ? String(lastCompletedActionKey) : null,
      canExpand,
      presentationPreference,
      sidePreference
    };
  }

  // --- Shadow DOM beacon rendering ---
  const HOST_ID = "escapehatch-companion-host";
  const STYLE_TEXT = [
    ":host{all:initial;}",
    ".eh-root{position:fixed;z-index:2147483645;display:flex;flex-direction:column;gap:8px;pointer-events:none;}",
    ".eh-root[data-anchor='lower-right']{right:max(12px, env(safe-area-inset-right, 0px));bottom:max(12px, env(safe-area-inset-bottom, 0px));align-items:flex-end;}",
    ".eh-root[data-anchor='lower-left']{left:max(12px, env(safe-area-inset-left, 0px));bottom:max(12px, env(safe-area-inset-bottom, 0px));align-items:flex-start;}",
    ".eh-root[data-anchor='mid-right']{right:max(12px, env(safe-area-inset-right, 0px));top:50%;transform:translateY(-50%);align-items:flex-end;}",
    ".eh-root[data-anchor='mid-left']{left:max(12px, env(safe-area-inset-left, 0px));top:50%;transform:translateY(-50%);align-items:flex-start;}",
    ".eh-beacon{pointer-events:auto;display:inline-flex;align-items:center;gap:8px;min-height:44px;min-width:44px;padding:6px 10px;border-radius:999px;background:#fff;border:1px solid #d6d3d1;box-shadow:0 4px 16px rgba(0,0,0,0.12);font:12px/1.2 system-ui,sans-serif;color:#1c1917;cursor:pointer;}",
    ".eh-beacon:focus-visible{outline:2px solid #0f766e;outline-offset:2px;}",
    ".eh-dot{width:14px;height:14px;border-radius:50%;flex-shrink:0;background:#0f766e;}",
    ".eh-dot[data-state='ready']{background:#0f766e;}",
    ".eh-dot[data-state='observing'], .eh-dot[data-state='working_fill'], .eh-dot[data-state='working_account'], .eh-dot[data-state='working_advance']{background:#0f766e;}",
    ".eh-dot[data-state='waiting_user']{background:#d97706;border:2px solid #92400e;}",
    ".eh-dot[data-state='blocked']{background:#f59e0b;border:2px solid #92400e;}",
    ".eh-dot[data-state='paused']{background:#fff;border:2px solid #57534e;}",
    ".eh-dot[data-state='step_complete']{background:#0f766e;}",
    ".eh-dot[data-state='error']{background:#dc2626;}",
    ".eh-dot[data-state='stopped']{background:#b91c1c;border:2px solid #7f1d1d;}",
    ".eh-dot.pulse{animation:eh-pulse 1.7s ease-in-out infinite;}",
    "@keyframes eh-pulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.08);opacity:0.88;}}",
    "@media (prefers-reduced-motion: reduce){.eh-dot.pulse{animation:none;}}",
    ".eh-peek{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".eh-peek[data-hidden='true']{display:none;}",
    ".eh-details{pointer-events:auto;display:none;min-width:280px;max-width:360px;background:#fffdf9;border:1px solid #d6d3d1;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,0.16);padding:12px;}",
    ".eh-details[data-open='true']{display:block;}",
    ".eh-details h3{margin:0 0 6px;font-size:13px;letter-spacing:0.02em;text-transform:uppercase;color:#57534e;}",
    ".eh-details p{margin:0 0 8px;font-size:12px;color:#1c1917;}",
    ".eh-details .eh-meta{font-size:11px;color:#57534e;}",
    ".eh-controls{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}",
    ".eh-controls button{font:inherit;min-height:36px;padding:6px 10px;border:1px solid #d6d3d1;border-radius:10px;background:#fff;cursor:pointer;}",
    ".eh-hidden{display:none !important;}"
  ].join("\n");

  let lastPeekState = null;
  let peekTimer = null;

  function ensureHost(doc) {
    let host = doc.getElementById(HOST_ID);
    if (host && host.shadowRoot) return host;
    if (host) host.remove();
    host = doc.createElement("div");
    host.id = HOST_ID;
    host.setAttribute("data-escapehatch", "companion");
    doc.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = STYLE_TEXT;
    shadow.appendChild(style);
    const root = doc.createElement("div");
    root.className = "eh-root";
    root.setAttribute("data-anchor", "lower-right");
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    const beacon = doc.createElement("button");
    beacon.className = "eh-beacon";
    beacon.type = "button";
    beacon.setAttribute("aria-label", "EscapeHatch companion — ready");
    beacon.setAttribute("aria-expanded", "false");
    const dot = doc.createElement("span");
    dot.className = "eh-dot";
    dot.setAttribute("data-state", "ready");
    dot.setAttribute("aria-hidden", "true");
    const peek = doc.createElement("span");
    peek.className = "eh-peek";
    peek.setAttribute("data-hidden", "true");
    peek.textContent = "";
    beacon.appendChild(dot);
    beacon.appendChild(peek);
    const details = doc.createElement("div");
    details.className = "eh-details";
    details.setAttribute("data-open", "false");
    details.setAttribute("role", "dialog");
    details.setAttribute("aria-label", "Companion details");
    details.innerHTML = "<h3>Now</h3><p class='eh-now'></p><p class='eh-why' hidden></p><p class='eh-meta eh-last'></p><div class='eh-controls'><button type='button' data-action='pause'>Pause</button><button type='button' data-action='resume'>Resume</button><button type='button' data-action='stop'>Stop</button></div><div style='margin-top:8px;display:flex;gap:6px;'><button type='button' data-setting='quiet'>Quiet</button><button type='button' data-setting='dot_only'>Dot only</button><button type='button' data-setting='hidden_for_session'>Hide</button><button type='button' data-side='left'>Left</button><button type='button' data-side='right'>Right</button></div>";
    root.appendChild(beacon);
    root.appendChild(details);
    shadow.appendChild(root);
    return host;
  }

  function detectReducedMotion(win) {
    try { return !!(win && win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (_) { return false; }
  }

  function updateBeacon(doc, snapshot, opts) {
    opts = opts || {};
    const host = ensureHost(doc);
    const shadow = host.shadowRoot;
    const root = shadow.querySelector(".eh-root");
    const beacon = shadow.querySelector(".eh-beacon");
    const dot = shadow.querySelector(".eh-dot");
    const peek = shadow.querySelector(".eh-peek");
    const detailsNow = shadow.querySelector(".eh-now");
    const why = shadow.querySelector(".eh-why");
    if (!root || !beacon || !dot || !peek) return host;
    const state = snapshot.state;
    const reduced = !!opts.reducedMotion || detectReducedMotion(doc.defaultView);
    if (snapshot.presentationPreference === "hidden_for_session") {
      host.style.display = "none";
      return host;
    }
    host.style.display = "";
    const anchor = resolveAnchor(opts.occupied || {}, snapshot.sidePreference);
    root.setAttribute("data-anchor", anchor);
    dot.setAttribute("data-state", state);
    beacon.setAttribute("aria-label", snapshot.a11yLabel || getCopy(state).a11y);
    beacon.setAttribute("aria-expanded", String(shadow.querySelector(".eh-details").getAttribute("data-open") === "true"));
    beacon.disabled = !snapshot.canExpand;
    if (shouldAnimate(state, reduced)) dot.classList.add("pulse");
    else dot.classList.remove("pulse");
    const wantsPeek = state !== "dormant" && state !== "paused" && snapshot.presentationPreference !== "dot_only";
    let peekText = snapshot.shortText || "";
    if (snapshot.reasonCode && snapshot.reasonPrefix) peekText = snapshot.reasonPrefix + " " + snapshot.reasonCode;
    else if (snapshot.reasonCode && !peekText) peekText = snapshot.reasonCode;
    const isPersistent = shouldPersistLabel(state);
    if (!wantsPeek || !peekText) {
      peek.setAttribute("data-hidden", "true");
      peek.textContent = "";
    } else {
      const sameAsLast = lastPeekState === state + "|" + peekText;
      if (sameAsLast && !isPersistent) {
        peek.setAttribute("data-hidden", "true");
      } else {
        peek.textContent = peekText.length > 48 ? peekText.slice(0, 47) + "…" : peekText;
        peek.setAttribute("data-hidden", "false");
        lastPeekState = state + "|" + peekText;
        if (!isPersistent) {
          clearTimeout(peekTimer);
          const dwell = state === "step_complete" ? 1800 : 2400;
          peekTimer = setTimeout(() => { peek.setAttribute("data-hidden", "true"); }, dwell);
        }
      }
    }
    if (detailsNow) detailsNow.textContent = snapshot.detailText || snapshot.shortText || state;
    if (why) {
      if (snapshot.reasonCode) { why.hidden = false; why.textContent = (snapshot.reasonPrefix || "Reason:") + " " + snapshot.reasonCode; }
      else { why.hidden = true; why.textContent = ""; }
    }
    const lastEl = shadow.querySelector(".eh-last");
    if (lastEl) lastEl.textContent = snapshot.lastCompletedActionKey ? "Last: " + snapshot.lastCompletedActionKey : "";
    if (state === "dormant") host.style.display = "none";
    return host;
  }

  // details open only on intentional click/tap/keyboard — no automatic open on state change
  function setDetailsOpen(doc, open, returnFocusEl) {
    const host = doc.getElementById(HOST_ID);
    if (!host || !host.shadowRoot) return;
    const shadow = host.shadowRoot;
    const details = shadow.querySelector(".eh-details");
    const beacon = shadow.querySelector(".eh-beacon");
    if (!details || !beacon) return;
    const willOpen = !!open;
    if (willOpen && !beacon.disabled) {
      details.setAttribute("data-open", "true");
      beacon.setAttribute("aria-expanded", "true");
      if (returnFocusEl && returnFocusEl._prevFocus && returnFocusEl._prevFocus.focus) {
        // store for return
      }
    } else {
      const prev = shadow._prevFocus;
      details.setAttribute("data-open", "false");
      beacon.setAttribute("aria-expanded", "false");
      if (prev && prev.focus && doc.contains(prev)) {
        try { prev.focus(); } catch (_) {}
      }
    }
  }

  function bindBeaconInteractions(doc, handlers) {
    handlers = handlers || {};
    const host = ensureHost(doc);
    const shadow = host.shadowRoot;
    const beacon = shadow.querySelector(".eh-beacon");
    const details = shadow.querySelector(".eh-details");
    if (!beacon || beacon._ehBound) return host;
    beacon._ehBound = true;
    beacon.addEventListener("click", (e) => {
      e.preventDefault();
      const isOpen = details.getAttribute("data-open") === "true";
      if (isOpen) {
        setDetailsOpen(doc, false);
        if (handlers.onDismiss) handlers.onDismiss();
      } else {
        shadow._prevFocus = doc.activeElement;
        setDetailsOpen(doc, true);
        if (handlers.onOpen) handlers.onOpen();
      }
    });
    beacon.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        beacon.click();
      }
      if (e.key === "Escape") {
        setDetailsOpen(doc, false);
        if (handlers.onDismiss) handlers.onDismiss();
      }
    });
    doc.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const open = details.getAttribute("data-open") === "true";
        if (open) {
          e.preventDefault();
          setDetailsOpen(doc, false);
          if (handlers.onDismiss) handlers.onDismiss();
          try { beacon.focus(); } catch (_) {}
        }
      }
    });
    doc.addEventListener("click", (e) => {
      const open = details.getAttribute("data-open") === "true";
      if (!open) return;
      const path = e.composedPath ? e.composedPath() : [];
      const insideHost = path.includes(host) || host.contains(e.target);
      if (!insideHost) {
        setDetailsOpen(doc, false);
        if (handlers.onDismiss) handlers.onDismiss();
      }
    });
    shadow.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.setting) {
        if (handlers.onSetPresentation) handlers.onSetPresentation(t.dataset.setting);
      }
      if (t && t.dataset && t.dataset.side) {
        if (handlers.onSetSide) handlers.onSetSide(t.dataset.side);
      }
      if (t && t.dataset && t.dataset.action) {
        if (handlers.onControl) handlers.onControl(t.dataset.action);
      }
    });
    return host;
  }

  function containsProfileOrSecret(value) {
    if (value == null) return false;
    const s = String(value).toLowerCase();
    return false;
  }

  return Object.freeze({
    STATES,
    COPY,
    WORKING_STATES,
    PRESENTATION_VALUES,
    SIDE_VALUES,
    HOST_ID,
    isWorkingState,
    isWaitingState,
    shouldPersistLabel,
    shouldAnimate,
    resolveAnchor,
    getCopy,
    sanitizeReason,
    projectPresence,
    ensureHost,
    updateBeacon,
    setDetailsOpen,
    bindBeaconInteractions,
    detectReducedMotion
  });
});
