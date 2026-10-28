(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EscapeHatchJobBoard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Classification only: never creates a session, clicks, fills, submits, or infers consent.
  const PROVIDERS = Object.freeze({
    "smartapply.indeed.com": "indeed",
    "indeed.com": "indeed",
    "www.indeed.com": "indeed",
    "glassdoor.com": "glassdoor",
    "www.glassdoor.com": "glassdoor",
    "ziprecruiter.com": "ziprecruiter",
    "www.ziprecruiter.com": "ziprecruiter"
  });
  const INDEED_STAGES = Object.freeze({
    "resume-module": "RESUME",
    "questions-module": "EMPLOYER_QUESTIONS",
    "contact-info-module": "CONTACT",
    "review-module": "REVIEW",
    "qualification-module": "EMPLOYER_QUESTIONS"
  });

  function classify(url) {
    let u;
    try { u = new URL(url); } catch (_) { return { provider: "unknown", stage: "UNTRUSTED", supported: false, reason: "invalid_url" }; }
    if (u.protocol !== "https:" || u.username || u.password || u.port) {
      return { provider: "unknown", stage: "UNTRUSTED", supported: false, reason: "untrusted_origin" };
    }
    const provider = PROVIDERS[u.hostname] || "unknown";
    if (provider === "unknown") return { provider, stage: "UNTRUSTED", supported: false, reason: "unrecognized_host" };
    const parts = u.pathname.split("/").filter(Boolean);
    if (u.hostname === "smartapply.indeed.com" &&
        parts[0] === "beta" && parts[1] === "indeedapply" && parts[2] === "form") {
      const stage = INDEED_STAGES[parts[3]] || "UNKNOWN_FORM_STEP";
      return { provider, surface: "job_board_form", stage, supported: true, origin: u.origin,
        requiresOpportunityBinding: true, mayInspect: true, mayPrepareAfterPolicyGate: stage !== "UNKNOWN_FORM_STEP",
        mayAdvance: false, maySubmit: false, reason: stage === "UNKNOWN_FORM_STEP" ? "unclassified_form_step" : "recognized_form_step" };
    }
    if (provider === "indeed" && /^\/(viewjob|rc\/clk)\/?$/.test(u.pathname)) {
      const jobKey = u.searchParams.get("jk");
      return { provider, surface: "job_listing", stage: "DISCOVERY",
        supported: !!jobKey && /^[0-9a-f]{16}$/i.test(jobKey),
        opportunityKey: jobKey && /^[0-9a-f]{16}$/i.test(jobKey) ? "indeed:" + jobKey.toLowerCase() : null,
        mayInspect: true, mayPrepareAfterPolicyGate: false, mayAdvance: false, maySubmit: false,
        reason: "source_listing_only" };
    }
    return { provider, surface: "job_board_unknown", stage: "UNKNOWN_FORM_STEP", supported: false,
      requiresOpportunityBinding: true, mayInspect: true, mayPrepareAfterPolicyGate: false,
      mayAdvance: false, maySubmit: false, reason: "needs_provider_form_archetype" };
  }

  // A SmartApply module URL has no reliable job ID. Never assign it to a queue row by tab,
  // title resemblance, referrer, form percentage, or previous browser session alone.
  function canAttachToOpportunity(classification, selected) {
    if (!classification || classification.surface !== "job_board_form" ||
        !classification.supported || !selected || !selected.operatorSelected ||
        selected.provider !== classification.provider ||
        !/^indeed:[0-9a-f]{16}$/i.test(String(selected.opportunityKey || ""))) {
      return { attached: false, state: "REVIEW_REQUIRED", reason: "opportunity_binding_missing" };
    }
    if (selected.expectedFormOrigin !== classification.origin) {
      return { attached: false, state: "REVIEW_REQUIRED", reason: "unverified_form_origin" };
    }
    // Reusing an Indeed origin does not link two distinct applicant sessions.
    // Only the managed browser's observed, opportunity-bound transition may
    // supply this evidence; a tab URL, job title or referrer is insufficient.
    if (selected.trustedTransitionObserved !== true ||
        !Number.isInteger(selected.formTabId) || selected.formTabId < 0 ||
        !selected.formSessionNonce || selected.formSessionNonce !== selected.expectedSessionNonce) {
      return { attached: false, state: "REVIEW_REQUIRED", reason: "unverified_form_session" };
    }
    return { attached: true, state: "OBSERVE_ONLY", reason: "bound_for_inspection_not_navigation" };
  }

  return Object.freeze({ classify, canAttachToOpportunity, INDEED_STAGES });
});
