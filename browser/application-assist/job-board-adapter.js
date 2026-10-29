(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EscapeHatchJobBoard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Classification never creates a session or infers consent. The explicit writer
  // below is the only mutation entrypoint; it never navigates or submits.
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


  // Typed, read-only plan: a caller must supply the selected applicant, reviewed
  // opportunity-specific paragraphs and a live form inventory. This module never
  // accesses private profile storage. The separate writer consumes this plan.
  function coverLetterParagraphText(paragraphs) {
    if (!Array.isArray(paragraphs) || paragraphs.length === 0 ||
        paragraphs.some(part => typeof part !== "string")) return null;
    const clean = paragraphs.map(part => part.replace(/\r\n?/g, "\n")
      .replace(/[^\S\n]*\n[^\S\n]*/g, " ").replace(/[\t ]+/g, " ").trim())
      .filter(Boolean);
    return clean.length ? clean.join("\n\n") : null;
  }

  function coverLetterReview(reason) {
    return { state: "REVIEW_REQUIRED", mode: "text", reason, maySubmit: false };
  }

  function planIndeedCoverLetterText(classification, selected, artifact, form) {
    if (classification?.provider !== "indeed") return coverLetterReview("unsupported_provider");
    const bound = canAttachToOpportunity(classification, selected);
    if (!bound.attached) return coverLetterReview(bound.reason);
    if (!selected?.workspaceOwnerId || !artifact?.ownerId ||
        selected.workspaceOwnerId !== artifact.ownerId) return coverLetterReview("applicant_owner_unverified");
    if (artifact.kind !== "cover_letter" || artifact.reviewed !== true ||
        artifact.opportunityKey !== selected.opportunityKey) return coverLetterReview("reviewed_role_letter_required");
    const heading = String(form?.heading || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!/^(supporting documents|want to include any supporting documents\??|this employer requests a cover letter for this application|cover letter)$/.test(heading)) {
      return coverLetterReview("supporting_document_section_unverified");
    }
    const fields = Array.isArray(form?.fields) ? form.fields : [];
    const matches = fields.map((field, index) => ({ field, index })).filter(({ field }) => {
      const label = String(field?.label || "").toLowerCase().replace(/[*:]/g, "").replace(/\s+/g, " ").trim();
      return field?.tag === "textarea" && /^cover letter(?: \((?:required|optional)\))?$/.test(label) &&
        field.visible === true && field.disabled !== true && field.readOnly !== true;
    });
    if (matches.length !== 1) return coverLetterReview("unique_editable_cover_letter_textarea_required");
    const { field, index } = matches[0];
    // Preserve content already entered by the applicant, even if whitespace only.
    if (String(field.value ?? "").length > 0) return coverLetterReview("preserve_existing_applicant_edit");
    const text = coverLetterParagraphText(artifact.paragraphs);
    if (!text) return coverLetterReview("approved_paragraphs_missing");
    const max = Math.min(4000, Number.isInteger(field.maxLength) && field.maxLength >= 0 ? field.maxLength : 4000);
    if (text.length > max) return { ...coverLetterReview("text_exceeds_observed_limit"), characters: text.length, limit: max };
    return {
      state: "TEXT_PLAN_READY", mode: "text", maySubmit: false,
      opportunityKey: selected.opportunityKey,
      ownerId: selected.workspaceOwnerId,
      sessionNonce: selected.formSessionNonce,
      origin: classification.origin,
      textareaIndex: index, text, characters: text.length, limit: max,
      expectedExistingValue: "", requiresDomReadback: true,
      employerAcceptance: "UNVERIFIED", userFinalSubmit: "OPERATOR_ONLY"
    };
  }


  // Restricted consumer for a previously approved, current-opportunity packet.
  // Reads the live DOM again immediately before writing. No navigation/Submit.
  function writeIndeedCoverLetterText(documentObject, selected, artifact) {
    const block = reason => ({ state: "REVIEW_REQUIRED", reason, maySubmit: false });
    if (!documentObject?.location?.href || typeof documentObject.querySelectorAll !== "function")
      return block("live_document_unavailable");
    const classification = classify(documentObject.location.href);
    const formUrl = documentObject.location.href;
    if (classification.provider !== "indeed" || classification.surface !== "job_board_form" ||
        classification.stage === "UNKNOWN_FORM_STEP" || !classification.mayPrepareAfterPolicyGate)
      return block("recognized_indeed_form_required");
    const headings = Array.from(documentObject.querySelectorAll("h1,h2,h3,[role=heading]"))
      .filter(node => node && /^(supporting documents|cover letter)$/i.test(String(node.textContent || "").trim()));
    if (headings.length !== 1) return block("unique_supporting_document_heading_required");
    const nodes = Array.from(documentObject.querySelectorAll("textarea"));
    const liveFields = nodes.map(node => {
      const labels = node?.labels ? Array.from(node.labels) : [];
      const label = labels.map(item => String(item?.textContent || "").trim()).filter(Boolean).join(" ") ||
        (typeof node?.getAttribute === "function" ? node.getAttribute("aria-label") || "" : "");
      const rects = typeof node?.getClientRects === "function" ? node.getClientRects() : null;
      const view = documentObject.defaultView;
      const visibility = view?.getComputedStyle ? view.getComputedStyle(node).visibility : "visible";
      return { tag: "textarea", label, value: node?.value ?? "", maxLength: node?.maxLength,
        visible: !!rects && rects.length > 0 && visibility !== "hidden",
        disabled: node?.disabled === true || node?.matches?.(":disabled") === true,
        readOnly: node?.readOnly === true };
    });
    const plan = planIndeedCoverLetterText(classification, selected, artifact, {
      heading: String(headings[0].textContent || ""), fields: liveFields
    });
    if (plan.state !== "TEXT_PLAN_READY") return block(plan.reason || "text_plan_unavailable");
    const target = nodes[plan.textareaIndex], view = documentObject.defaultView;
    const native = view?.HTMLTextAreaElement?.prototype;
    const setter = native && Object.getOwnPropertyDescriptor(native, "value")?.set;
    if (!target || target.isConnected === false || !setter || typeof view?.Event !== "function")
      return block("safe_native_textarea_writer_unavailable");
    // Recheck live value, owner, session and page immediately before the write.
    if (target.value !== "" || selected?.workspaceOwnerId !== plan.ownerId ||
        selected?.opportunityKey !== plan.opportunityKey ||
        selected?.formSessionNonce !== plan.sessionNonce ||
        documentObject.location.href !== formUrl)
      return block("stale_or_edited_form");
    try {
      setter.call(target, plan.text);
      target.dispatchEvent(new view.Event("input", { bubbles: true }));
      target.dispatchEvent(new view.Event("change", { bubbles: true }));
    } catch (_) {
      return block("native_textarea_write_failed_recheck_required");
    }
    // Event handlers may synchronously navigate or replace the selected session.
    // A matching origin alone cannot prove this is still the reviewed form.
    if (target.isConnected === false || target.value !== plan.text ||
        documentObject.location.href !== formUrl ||
        selected.workspaceOwnerId !== plan.ownerId ||
        selected.opportunityKey !== plan.opportunityKey ||
        selected.formSessionNonce !== plan.sessionNonce ||
        !canAttachToOpportunity(classify(formUrl), selected).attached)
      return block("textarea_readback_mismatch");
    return { state: "FIELD_READBACK_ONLY", filled: true, characters: plan.characters,
      opportunityKey: plan.opportunityKey, maySubmit: false, employerAcceptance: "UNVERIFIED",
      nextAction: "Review the employer form; final submission is operator-only." };
  }

  function indeedResumeUploadImpact(classification, kind) {
    if (classification?.provider === "indeed" && kind === "resume") {
      return { effect: "REPLACES_ONE_GLOBAL_INDEED_RESUME", state: "OPERATOR_APPROVAL_REQUIRED",
        localMasterMutation: "FORBIDDEN", employerAcceptance: "UNVERIFIED" };
    }
    return { effect: "UNKNOWN", state: "REVIEW_REQUIRED", employerAcceptance: "UNVERIFIED" };
  }

  return Object.freeze({ classify, canAttachToOpportunity, INDEED_STAGES, coverLetterParagraphText, planIndeedCoverLetterText, writeIndeedCoverLetterText, indeedResumeUploadImpact });
});
