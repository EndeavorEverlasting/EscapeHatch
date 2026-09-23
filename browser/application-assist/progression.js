(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EscapeHatchProgression = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // EH-A1 Progression Plan + progression_gate.
  // Integration: assist-core owns Fill Plan; progression.js owns Progression Plan.
  // After applyFillPlan, call buildProgressionPlan(pageState,fillState) then
  // progressionGate(plan,livePageState) with live re-scan. Only AUTO_ADVANCE_SAFE
  // may reach navigation_adapter. No generalized click; adapter targets gated candidate.
  const DECISIONS = Object.freeze(["AUTO_ADVANCE_SAFE", "REVIEW_REQUIRED"]);
  const RECOGNIZED_ARCHETYPES = Object.freeze([
    "identity-contact","application-form","intermediate-form","email-probe",
    "existing-account-login","create-account-choice","account-creation","verification-required"
  ]);
  const TERMINAL_KEYWORDS = Object.freeze([
    "submit","apply","finish","send","certify","sign","accept","attestation","captcha","mfa","otp","verification","unknown","manual"
  ]);
  const LOOP_GUARD = Object.freeze({ maxAdvancesPerSession: 20, maxAdvancesPerPage: 3, requirePageTransition: true, detectRepeatedPage: true });
  function normalizeSignal(value) {
    return String(value || "").toLowerCase().replace(/[*:_/\\()[\].,-]+/g, " ").replace(/&/g, " and ").replace(/\s+/g, " ").trim();
  }
  function isTerminalLabel(label) {
    const n = normalizeSignal(label);
    if (!n) return false;
    const tokens = n.split(" ");
    for (const tok of tokens) if (TERMINAL_KEYWORDS.includes(tok)) return true;
    if (n.includes("submit application") || n.includes("apply now")) return true;
    return false;
  }
  function isIntermediateLabel(label) {
    const n = normalizeSignal(label);
    return n === "next" || n === "continue" || n === "save and continue" || n === "save continue" || n === "next continue" || n === "next step";
  }
  function classifyPageArchetype(descriptor) {
    if (!descriptor || typeof descriptor !== "object") return "REVIEW_REQUIRED";
    const hint = descriptor.archetype || descriptor.pageArchetype || descriptor.archetypeHint || descriptor.id;
    if (typeof hint === "string") {
      const h = hint.toLowerCase().trim().replace(/\s+/g, "-");
      if (RECOGNIZED_ARCHETYPES.includes(h)) return h;
      if (RECOGNIZED_ARCHETYPES.includes(hint)) return hint;
    }
    const text = normalizeSignal(descriptor.text || descriptor.pageText || descriptor.title || "");
    const url = String(descriptor.url || "").toLowerCase();
    const controlsText = Array.isArray(descriptor.controls) ? descriptor.controls.map(function(c){return normalizeSignal(c.label||c.text||c.innerText||"");}).join(" ") : normalizeSignal(descriptor.controlsText||"");
    const fieldsText = Array.isArray(descriptor.fields) ? descriptor.fields.map(function(f){return normalizeSignal(f.label||f.name||"");}).join(" ") : normalizeSignal(descriptor.fieldsText||"");
    const combined = [text, controlsText, fieldsText, url].join(" ");
    if (combined.includes("verification") || combined.includes("verify your email") || combined.includes("enter code")) return "verification-required";
    if (combined.includes("email") && (combined.includes("probe") || combined.includes("enter your email") || combined.includes("continue with email") || combined.includes("check your email"))) return "email-probe";
    if ((combined.includes("create account") || combined.includes("sign up")) && combined.includes("password")) return "account-creation";
    if (combined.includes("create account") && combined.includes("choice")) return "create-account-choice";
    if (combined.includes("create account") || combined.includes("new account")) return "account-creation";
    if ((combined.includes("log in") || combined.includes("sign in")) && combined.includes("password")) return "existing-account-login";
    if (combined.includes("login") || combined.includes("sign in")) return "existing-account-login";
    const hasIdentity = fieldsText.includes("first name") || fieldsText.includes("email") || fieldsText.includes("street address") || fieldsText.includes("city") || fieldsText.includes("phone") || fieldsText.includes("postal");
    if (hasIdentity) return "identity-contact";
    if (combined.includes("next") || combined.includes("continue")) return "intermediate-form";
    if (combined.includes("application form") || combined.includes("job application")) return "application-form";
    return "REVIEW_REQUIRED";
  }
  function buildProgressionPlan(pageState, fillState) {
    const descriptor = pageState && pageState.descriptor ? pageState.descriptor : pageState || {};
    const archetype = classifyPageArchetype(descriptor && descriptor.archetype ? descriptor : pageState && pageState.archetype ? pageState : descriptor || pageState);
    const actualArchetype = pageState && typeof pageState.archetype === "string" && RECOGNIZED_ARCHETYPES.includes(pageState.archetype) ? pageState.archetype : archetype;
    const controls = Array.isArray(pageState && pageState.controls) ? pageState.controls : Array.isArray(descriptor && descriptor.controls) ? descriptor.controls : [];
    const candidates = []; const terminals = [];
    for (let i = 0; i < controls.length; i += 1) {
      const c = controls[i]; const label = String(c.label || c.text || c.innerText || "");
      if (isTerminalLabel(label)) terminals.push({label:label,index:i,type:String(c.type||"button")});
      else if (isIntermediateLabel(label)) candidates.push({label:label,index:i,type:String(c.type||"button")});
    }
    let action = null; let reason = ""; let isTerminal = false;
    if (actualArchetype === "REVIEW_REQUIRED") { reason = "page_archetype_not_recognized"; isTerminal = true; }
    else if (candidates.length === 0 && terminals.length > 0) { reason = "terminal_forbidden"; isTerminal = true; }
    else if (candidates.length === 0) { reason = "candidate_not_found"; isTerminal = true; }
    else if (candidates.length > 1) { reason = "ambiguous_progression"; isTerminal = true; }
    else { action = candidates[0]; if (isTerminalLabel(action.label)) { isTerminal = true; reason = "terminal_forbidden"; } else { isTerminal = false; reason = "intermediate_candidate_identified"; } }
    const planFillStable = fillState && typeof fillState.stable === "boolean" ? fillState.stable : fillState && typeof fillState.fillStable === "boolean" ? fillState.fillStable : null;
    return { schema_version:"escapehatch/application-progression/v1", archetype:actualArchetype, action:action, reason:reason, isTerminal:isTerminal, candidateCount:candidates.length, terminalCount:terminals.length, fillStableHint:planFillStable };
  }
  function createLoopGuard() { return { advancesThisSession:0, advancesThisPage:0, lastPageId:null, history:[] }; }
  function checkLoopGuard(loopState, pageId) {
    if (!loopState) return { allowed:true, reason:"no_guard_state" };
    if (loopState.advancesThisSession >= LOOP_GUARD.maxAdvancesPerSession) return { allowed:false, reason:"loop_guard_session_budget_exceeded" };
    if (loopState.lastPageId === pageId && loopState.advancesThisPage >= LOOP_GUARD.maxAdvancesPerPage) return { allowed:false, reason:"loop_guard_page_budget_exceeded" };
    return { allowed:true, reason:"within_budget" };
  }
  function observeTransition(prevPageId, nextPageId, permittedTransitions) {
    if (!prevPageId || !nextPageId) return { matches:false, reason:"missing_page_ids" };
    if (prevPageId === nextPageId) return { matches:false, reason:"repeated_page_without_transition" };
    if (!permittedTransitions) return { matches:true, reason:"no_permitted_list_requires_transition_only" };
    const allowed = permittedTransitions[prevPageId];
    if (!allowed) return { matches:false, reason:"prev_archetype_not_in_permitted_map" };
    return { matches:allowed.includes(nextPageId), reason: allowed.includes(nextPageId) ? "transition_matches_permitted" : "transition_not_permitted" };
  }
  function progressionGate(plan, livePageState) {
    const live = livePageState || {}; const session = live.session || (plan && plan.session) || null;
    const archetype = live.archetype || (plan && plan.archetype) || "REVIEW_REQUIRED";
    if (!session || session.status !== "active") return { decision:"REVIEW_REQUIRED", reason:"session_not_active", failedGate:"session_is_active_and_not_emergency_stopped", diagnostics:"session missing or not active" };
    if (!archetype || archetype === "REVIEW_REQUIRED" || RECOGNIZED_ARCHETYPES.indexOf(archetype) === -1) return { decision:"REVIEW_REQUIRED", reason:"page_archetype_not_recognized", failedGate:"current_page_archetype_is_recognized", diagnostics:"archetype="+String(archetype) };
    if (!plan || !plan.action || plan.candidateCount !== 1 || !isIntermediateLabel(plan.action.label)) return { decision:"REVIEW_REQUIRED", reason: plan ? plan.reason || "candidate_not_unique" : "candidate_not_found", failedGate:"candidate_control_uniquely_identified_as_intermediate_next_or_continue", diagnostics:"candidateCount="+String(plan?plan.candidateCount:0) };
    if (plan.isTerminal || isTerminalLabel(plan.action.label)) return { decision:"REVIEW_REQUIRED", reason:"terminal_forbidden", failedGate:"candidate_is_not_submit_apply_finish_certify_sign_accept_attestation", diagnostics:String(plan.action.label) };
    const fillStable = live.fillStable !== undefined ? live.fillStable : live.deterministicFillStable !== undefined ? live.deterministicFillStable : live.fillState && typeof live.fillState.stable === "boolean" ? live.fillState.stable : null;
    if (fillStable === false) return { decision:"REVIEW_REQUIRED", reason:"fill_not_stable", failedGate:"deterministic_fill_completed_and_stable_after_live_rescan", diagnostics:"fillStable=false" };
    const hasValidationError = live.hasValidationError === true || live.hasVisibleValidationError === true || (Array.isArray(live.validationErrors) && live.validationErrors.length>0) || (Array.isArray(live.validationMessages) && live.validationMessages.length>0);
    if (hasValidationError) return { decision:"REVIEW_REQUIRED", reason:"validation_error_present", failedGate:"no_visible_validation_error_present", diagnostics:"validation error present" };
    const unresolved = Array.isArray(live.unresolvedRequiredFields) ? live.unresolvedRequiredFields : Array.isArray(live.requiredUnknownFields) ? live.requiredUnknownFields : null;
    if (unresolved && unresolved.length>0) return { decision:"REVIEW_REQUIRED", reason:"unresolved_required_field", failedGate:"no_required_unknown_manual_review_control_unresolved", diagnostics:"unresolved="+unresolved.join(",") };
    if (live.hasUnknownManualReview===true || live.hasUnresolvedRequiredUnknown===true) return { decision:"REVIEW_REQUIRED", reason:"unresolved_required_field", failedGate:"no_required_unknown_manual_review_control_unresolved", diagnostics:"unknown manual review" };
    const hasPasswordOutside = live.hasPasswordOutsideBootstrap===true || live.hasPassword===true;
    const bootstrapState = live.accountBootstrapState || live.bootstrapState || live.state || null;
    if (hasPasswordOutside) {
      const isAllowed = ["account-creation"].includes(archetype) && (!bootstrapState || ["ACCOUNT_CREATION"].includes(bootstrapState));
      if (!isAllowed && !["ACCOUNT_CREATION"].includes(bootstrapState)) return { decision:"REVIEW_REQUIRED", reason:"password_outside_account_bootstrap", failedGate:"no_password_requested_outside_explicit_account_bootstrap_state", diagnostics:"password outside "+String(archetype)+"/"+String(bootstrapState) };
    }
    if (live.hasPasswordOutsideBootstrap===true && archetype!=="account-creation" && bootstrapState!=="ACCOUNT_CREATION") return { decision:"REVIEW_REQUIRED", reason:"password_outside_account_bootstrap", failedGate:"no_password_requested_outside_explicit_account_bootstrap_state", diagnostics:"password gate" };
    if (live.hasFileUpload===true) return { decision:"REVIEW_REQUIRED", reason:"file_upload_required", failedGate:"no_file_upload_captcha_mfa_otp_legal_compliance_attestation_demographic_gate_unresolved", diagnostics:"file upload" };
    if (live.hasCaptcha===true) return { decision:"REVIEW_REQUIRED", reason:"captcha_present", failedGate:"no_file_upload_captcha_mfa_otp_legal_compliance_attestation_demographic_gate_unresolved", diagnostics:"captcha" };
    if (live.hasMFA===true || live.hasOTP===true) return { decision:"REVIEW_REQUIRED", reason:"mfa_required", failedGate:"no_file_upload_captcha_mfa_otp_legal_compliance_attestation_demographic_gate_unresolved", diagnostics:"mfa/otp" };
    if (live.hasLegalGate===true || live.hasLegalComplianceGate===true) return { decision:"REVIEW_REQUIRED", reason:"legal_compliance_pending", failedGate:"no_file_upload_captcha_mfa_otp_legal_compliance_attestation_demographic_gate_unresolved", diagnostics:"legal" };
    if (live.hasAttestationGate===true || live.hasAttestation===true) return { decision:"REVIEW_REQUIRED", reason:"attestation_required", failedGate:"no_file_upload_captcha_mfa_otp_legal_compliance_attestation_demographic_gate_unresolved", diagnostics:"attestation" };
    if (live.hasDemographicGate===true) return { decision:"REVIEW_REQUIRED", reason:"demographic_decision_required", failedGate:"no_file_upload_captcha_mfa_otp_legal_compliance_attestation_demographic_gate_unresolved", diagnostics:"demographic" };
    if (Array.isArray(live.controls)) {
      const liveCandidates = []; for (let i=0;i<live.controls.length;i+=1){ const lab=String(live.controls[i].label||live.controls[i].text||""); if(isIntermediateLabel(lab)) liveCandidates.push(live.controls[i]); }
      if (liveCandidates.length !== plan.candidateCount) return { decision:"REVIEW_REQUIRED", reason:"action_identity_changed", failedGate:"action_identity_unchanged_between_plan_construction_and_execution", diagnostics:"candidate count changed" };
      if (liveCandidates.length===1 && normalizeSignal(liveCandidates[0].label||liveCandidates[0].text) !== normalizeSignal(plan.action.label)) return { decision:"REVIEW_REQUIRED", reason:"action_identity_changed", failedGate:"action_identity_unchanged_between_plan_construction_and_execution", diagnostics:"label changed from "+plan.action.label };
    } else if (typeof live.liveActionLabel==="string" && normalizeSignal(live.liveActionLabel) !== normalizeSignal(plan.action.label)) return { decision:"REVIEW_REQUIRED", reason:"action_identity_changed", failedGate:"action_identity_unchanged_between_plan_construction_and_execution", diagnostics:"liveActionLabel mismatch" };
    if (live.archetype && plan.archetype && live.archetype !== plan.archetype) return { decision:"REVIEW_REQUIRED", reason:"archetype_mismatch", failedGate:"action_identity_unchanged_between_plan_construction_and_execution", diagnostics:"archetype changed" };
    const advancesThisSession = live.advancesThisSession !== undefined ? live.advancesThisSession : live.loopState && live.loopState.advancesThisSession;
    const advancesThisPage = live.advancesThisPage !== undefined ? live.advancesThisPage : live.loopState && live.loopState.advancesThisPage;
    if (typeof advancesThisSession==="number" && advancesThisSession>=LOOP_GUARD.maxAdvancesPerSession) return { decision:"REVIEW_REQUIRED", reason:"loop_guard_session_budget_exceeded", failedGate:"advance_budget_loop_guard_not_exceeded", diagnostics:String(advancesThisSession) };
    if (typeof advancesThisPage==="number" && advancesThisPage>=LOOP_GUARD.maxAdvancesPerPage) return { decision:"REVIEW_REQUIRED", reason:"loop_guard_page_budget_exceeded", failedGate:"advance_budget_loop_guard_not_exceeded", diagnostics:String(advancesThisPage) };
    const loopCheck = checkLoopGuard(live.loopState, live.pageId || live.currentPageId);
    if (!loopCheck.allowed) return { decision:"REVIEW_REQUIRED", reason:loopCheck.reason, failedGate:"advance_budget_loop_guard_not_exceeded", diagnostics:loopCheck.reason };
    const transitionMismatch = live.transitionMismatch===true || live.nextObservedPageTransitionMatchesPermittedStateTransition===false;
    if (transitionMismatch) return { decision:"REVIEW_REQUIRED", reason:"transition_mismatch", failedGate:"next_observed_page_transition_matches_permitted_state_transition", diagnostics:"transition mismatch" };
    if (live.observedTransition && live.observedTransition.matchesPermitted===false) return { decision:"REVIEW_REQUIRED", reason:"transition_mismatch", failedGate:"next_observed_page_transition_matches_permitted_state_transition", diagnostics:live.observedTransition.reason||"mismatch" };
    if (live.requireTransition===true && live.hasTransitioned===false) return { decision:"REVIEW_REQUIRED", reason:"transition_mismatch", failedGate:"next_observed_page_transition_matches_permitted_state_transition", diagnostics:"no transition observed" };
    return { decision:"AUTO_ADVANCE_SAFE", reason:"all_gates_passed", failedGate:null, diagnostics:"progression gated" };
  }
  return Object.freeze({
    DECISIONS:DECISIONS, RECOGNIZED_ARCHETYPES:RECOGNIZED_ARCHETYPES, TERMINAL_KEYWORDS:TERMINAL_KEYWORDS, LOOP_GUARD:LOOP_GUARD,
    normalizeSignal:normalizeSignal, isTerminalLabel:isTerminalLabel, isIntermediateLabel:isIntermediateLabel,
    classifyPageArchetype:classifyPageArchetype, buildProgressionPlan:buildProgressionPlan, progressionGate:progressionGate,
    createLoopGuard:createLoopGuard, checkLoopGuard:checkLoopGuard, observeTransition:observeTransition
  });
});
