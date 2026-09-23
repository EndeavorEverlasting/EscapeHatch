(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EscapeHatchNavigationAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function labelOf(control) {
    if (!control) return "";
    return String(
      control.getAttribute && control.getAttribute("aria-label") ||
      control.innerText ||
      control.textContent ||
      control.value ||
      ""
    ).trim();
  }

  function collectControls(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return [];
    return Array.from(doc.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]'));
  }

  function describeDocument(doc) {
    const controls = collectControls(doc).map(function (el, index) {
      return {
        label: labelOf(el),
        index: index,
        type: String(el.type || (el.getAttribute && el.getAttribute("role")) || "button")
      };
    });
    const fields = doc && typeof doc.querySelectorAll === "function"
      ? Array.from(doc.querySelectorAll("input, select, textarea")).map(function (el) {
          return { label: String(el.name || el.id || el.type || ""), name: String(el.name || ""), type: String(el.type || el.tagName || "") };
        })
      : [];
    return {
      title: doc && doc.title ? String(doc.title) : "",
      text: doc && doc.body && doc.body.innerText ? String(doc.body.innerText).slice(0, 12000) : "",
      controls: controls,
      fields: fields
    };
  }

  function buildLiveState(doc, options) {
    const opts = options || {};
    const descriptor = describeDocument(doc);
    const fields = doc && typeof doc.querySelectorAll === "function" ? Array.from(doc.querySelectorAll("input, select, textarea")) : [];
    const unresolvedRequiredFields = fields.filter(function (el) {
      if (!el.required || el.disabled || String(el.type || "").toLowerCase() === "hidden") return false;
      if (String(el.type || "").toLowerCase() === "checkbox" || String(el.type || "").toLowerCase() === "radio") return !el.checked;
      return String(el.value || "").trim() === "";
    }).map(function (el) { return String(el.name || el.id || el.type || "required"); });
    const bodyText = descriptor.text.toLowerCase();
    return {
      session: opts.session || null,
      archetype: opts.archetype || null,
      controls: descriptor.controls,
      fillStable: opts.fillStable === true,
      unresolvedRequiredFields: unresolvedRequiredFields,
      hasValidationError: Boolean(doc && typeof doc.querySelector === "function" && doc.querySelector('[aria-invalid="true"], [role="alert"], .field-error, .validation-error')),
      hasPassword: fields.some(function (el) { return String(el.type || "").toLowerCase() === "password"; }),
      accountBootstrapState: opts.accountBootstrapState || null,
      hasFileUpload: fields.some(function (el) { return String(el.type || "").toLowerCase() === "file"; }),
      hasCaptcha: /\bcaptcha\b|recaptcha|hcaptcha/.test(bodyText),
      hasMFA: /multi[- ]factor|two[- ]factor|authenticator code|\bmfa\b/.test(bodyText),
      hasOTP: /one[- ]time pass|one[- ]time code|\botp\b/.test(bodyText),
      hasLegalGate: /certif(y|ication)|legal compliance|terms and conditions/.test(bodyText),
      hasAttestationGate: /attest|i certify|i confirm.*accurate/.test(bodyText),
      hasDemographicGate: /voluntary self.identification|race|ethnicity|disability status|veteran status/.test(bodyText),
      loopState: opts.loopState || null,
      pageId: opts.pageId || null
    };
  }

  function executeGatedNavigation(plan, liveState, doc, progressionApi) {
    if (!progressionApi || typeof progressionApi.progressionGate !== "function") {
      return { status: "blocked", decision: "REVIEW_REQUIRED", reason: "progression_api_missing" };
    }
    const gate = progressionApi.progressionGate(plan, liveState);
    if (!gate || gate.decision !== "AUTO_ADVANCE_SAFE") {
      return { status: "blocked", decision: "REVIEW_REQUIRED", reason: gate && gate.reason || "progression_gate_failed", gate: gate || null };
    }
    const controls = collectControls(doc);
    const action = plan && plan.action;
    if (!action || !Number.isInteger(action.index) || action.index < 0 || action.index >= controls.length) {
      return { status: "blocked", decision: "REVIEW_REQUIRED", reason: "candidate_not_resolvable" };
    }
    const target = controls[action.index];
    const liveLabel = labelOf(target);
    if (
      progressionApi.normalizeSignal(liveLabel) !== progressionApi.normalizeSignal(action.label) ||
      progressionApi.isTerminalLabel(liveLabel) ||
      target.disabled === true ||
      typeof target.click !== "function"
    ) {
      return { status: "blocked", decision: "REVIEW_REQUIRED", reason: "action_identity_changed" };
    }
    target.click();
    return { status: "dispatched", decision: "AUTO_ADVANCE_SAFE", reason: "single_intermediate_action_dispatched", label: liveLabel, index: action.index };
  }

  return Object.freeze({
    labelOf,
    collectControls,
    describeDocument,
    buildLiveState,
    executeGatedNavigation
  });
});
