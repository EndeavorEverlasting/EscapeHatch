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

  function isVisibleControl(control) {
    if (!control) return false;
    if (control.hidden === true || control.disabled === true) return false;
    if (String(control.type || "").toLowerCase() === "hidden") return false;
    if (control.getAttribute && String(control.getAttribute("aria-hidden") || "").toLowerCase() === "true") return false;
    if (control.style && (control.style.display === "none" || control.style.visibility === "hidden")) return false;
    const view = control.ownerDocument && control.ownerDocument.defaultView;
    if (view && typeof view.getComputedStyle === "function") {
      const style = view.getComputedStyle(control);
      if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    }
    if (typeof control.getClientRects === "function" && control.getClientRects().length === 0) return false;
    return true;
  }

  function collectControls(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return [];
    return Array.from(doc.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')).filter(isVisibleControl);
  }

  function pageFingerprint(doc) {
    const href = String((doc && doc.location && doc.location.href) || (typeof location !== "undefined" && location.href) || "");
    const title = String(doc && doc.title || "");
    const controls = collectControls(doc).map(labelOf).join("|");
    const fields = doc && typeof doc.querySelectorAll === "function"
      ? Array.from(doc.querySelectorAll("input, select, textarea")).map(function (el) {
          return [el.name || "", el.id || "", el.type || el.tagName || ""].join(":");
        }).join("|")
      : "";
    const source = [href,title,controls,fields].join("||");
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return "page-" + (hash >>> 0).toString(16);
  }

  function describeDocument(doc) {
    const controls = collectControls(doc).map(function (el, index) {
      return { label: labelOf(el), index, type: String(el.type || (el.getAttribute && el.getAttribute("role")) || "button") };
    });
    const fields = doc && typeof doc.querySelectorAll === "function"
      ? Array.from(doc.querySelectorAll("input, select, textarea")).map(function (el) {
          return { label: String(el.getAttribute && el.getAttribute("aria-label") || el.name || el.id || el.type || ""), name: String(el.name || ""), type: String(el.type || el.tagName || "") };
        })
      : [];
    return {
      url: String((doc && doc.location && doc.location.href) || (typeof location !== "undefined" && location.href) || ""),
      title: String(doc && doc.title || ""),
      controls,
      fields
    };
  }

  function requiredFieldUnresolved(el, fields) {
    if (!el || !el.required || el.disabled || String(el.type || "").toLowerCase() === "hidden") return false;
    const type = String(el.type || "").toLowerCase();
    if (type === "radio") {
      const name = String(el.name || "");
      const group = name ? fields.filter(function (candidate) {
        return String(candidate.type || "").toLowerCase() === "radio" && String(candidate.name || "") === name;
      }) : [el];
      return !group.some(function (candidate) { return candidate.checked === true; });
    }
    if (type === "checkbox") return el.checked !== true;
    return String(el.value || "").trim() === "";
  }

  function fieldSignal(el) {
    if (!el) return "";
    return [
      el.getAttribute && el.getAttribute("aria-label") || "",
      el.name || "",
      el.id || "",
      el.placeholder || "",
      el.type || ""
    ].join(" ").toLowerCase();
  }

  function buildLiveState(doc, options) {
    const opts = options || {};
    const descriptor = describeDocument(doc);
    const fields = doc && typeof doc.querySelectorAll === "function" ? Array.from(doc.querySelectorAll("input, select, textarea")) : [];
    const unresolvedRequired = fields.filter(function (el) { return requiredFieldUnresolved(el, fields); });
    const unresolvedRequiredFields = unresolvedRequired.map(function (el) { return String(el.name || el.id || el.type || "required"); });
    const requiredSignals = unresolvedRequired.map(fieldSignal).join(" ");
    const allFieldSignals = fields.map(fieldSignal).join(" ");
    const controlSignals = collectControls(doc).map(labelOf).join(" ").toLowerCase();
    const hasCaptchaNode = Boolean(doc && typeof doc.querySelector === "function" && doc.querySelector('[data-sitekey], .g-recaptcha, iframe[src*="recaptcha"], iframe[src*="hcaptcha"]'));
    const hasVisibleValidation = Boolean(doc && typeof doc.querySelector === "function" && doc.querySelector('[aria-invalid="true"], .field-error, .validation-error'));
    return {
      session: opts.session || null,
      archetype: opts.archetype || null,
      controls: descriptor.controls,
      fillStable: opts.fillStable === true,
      unresolvedRequiredFields,
      hasValidationError: hasVisibleValidation,
      hasPassword: fields.some(function (el) { return String(el.type || "").toLowerCase() === "password"; }),
      accountBootstrapState: opts.accountBootstrapState || null,
      hasFileUpload: fields.some(function (el) { return String(el.type || "").toLowerCase() === "file"; }),
      hasCaptcha: hasCaptchaNode || /\bcaptcha\b|recaptcha|hcaptcha/.test(allFieldSignals + " " + controlSignals),
      hasMFA: /multi[- ]factor|two[- ]factor|authenticator|\bmfa\b/.test(allFieldSignals + " " + controlSignals),
      hasOTP: /one[- ]time|\botp\b|verification code/.test(allFieldSignals + " " + controlSignals),
      hasLegalGate: /certif(y|ication)|legal compliance|terms and conditions/.test(requiredSignals),
      hasAttestationGate: /attest|i certify|i confirm.*accurate/.test(requiredSignals),
      hasDemographicGate: /voluntary self.identification|race|ethnicity|disability status|veteran status/.test(requiredSignals),
      loopState: opts.loopState || null,
      pageId: opts.pageId || pageFingerprint(doc),
      transitionObserverReady: opts.transitionObserverReady === true
    };
  }

  async function executeGatedNavigation(plan, liveState, doc, progressionApi, options) {
    const opts = options || {};
    if (!progressionApi || typeof progressionApi.progressionGate !== "function") {
      return { status:"blocked", decision:"REVIEW_REQUIRED", reason:"progression_api_missing" };
    }
    const gate = progressionApi.progressionGate(plan, liveState);
    if (!gate || gate.decision !== "AUTO_ADVANCE_SAFE") {
      return { status:"blocked", decision:"REVIEW_REQUIRED", reason:gate && gate.reason || "progression_gate_failed", gate:gate || null };
    }
    const controls = collectControls(doc);
    const action = plan && plan.action;
    if (!action || !Number.isInteger(action.index) || action.index < 0 || action.index >= controls.length) {
      return { status:"blocked", decision:"REVIEW_REQUIRED", reason:"candidate_not_resolvable" };
    }
    const target = controls[action.index];
    const liveLabel = labelOf(target);
    if (
      progressionApi.normalizeSignal(liveLabel) !== progressionApi.normalizeSignal(action.label) ||
      progressionApi.isTerminalLabel(liveLabel) ||
      !isVisibleControl(target) ||
      typeof target.click !== "function"
    ) return { status:"blocked", decision:"REVIEW_REQUIRED", reason:"action_identity_changed" };

    const pageId = liveState.pageId || pageFingerprint(doc);
    const loopState = progressionApi.recordAdvance(liveState.loopState, pageId, {
      archetype: liveState.archetype || plan.archetype,
      label: liveLabel,
      observedAt: new Date().toISOString()
    });
    const pendingTransition = {
      fromPageId: pageId,
      fromArchetype: liveState.archetype || plan.archetype,
      expectedArchetypes: progressionApi.expectedArchetypesAfter(liveState.archetype || plan.archetype),
      actionLabel: liveLabel,
      dispatchedAt: new Date().toISOString()
    };
    if (typeof opts.beforeDispatch !== "function") {
      return { status:"blocked", decision:"REVIEW_REQUIRED", reason:"transition_state_not_persisted" };
    }
    await opts.beforeDispatch({ loopState, pendingTransition });
    target.click();
    return { status:"dispatched", decision:"AUTO_ADVANCE_SAFE", reason:"single_intermediate_action_dispatched", label:liveLabel, index:action.index, loopState, pendingTransition };
  }

  return Object.freeze({
    labelOf,
    isVisibleControl,
    collectControls,
    pageFingerprint,
    describeDocument,
    requiredFieldUnresolved,
    buildLiveState,
    executeGatedNavigation
  });
});
