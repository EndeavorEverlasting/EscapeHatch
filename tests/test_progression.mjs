import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const prog = require("../browser/application-assist/progression.js");

function makeSession(status = "active") {
  return { status, origin: "https://jobs.example.invalid", session_id: "test-session" };
}

function safePageState() {
  return {
    archetype: "identity-contact",
    descriptor: { archetype: "identity-contact", text: "identity contact form", fields: [{ label: "First Name" }, { label: "Email" }] },
    controls: [{ label: "Continue", type: "button" }],
    session: makeSession("active")
  };
}

function safeLiveState(overrides = {}) {
  return {
    session: makeSession("active"),
    archetype: "identity-contact",
    controls: [{ label: "Continue" }],
    fillStable: true,
    hasValidationError: false,
    unresolvedRequiredFields: [],
    hasPasswordOutsideBootstrap: false,
    hasFileUpload: false,
    hasCaptcha: false,
    hasMFA: false,
    hasLegalGate: false,
    hasAttestationGate: false,
    hasDemographicGate: false,
    advancesThisSession: 0,
    advancesThisPage: 0,
    ...overrides
  };
}

// 1. classifyPageArchetype
assert.equal(prog.classifyPageArchetype({ archetype: "identity-contact" }), "identity-contact", "explicit archetype");
assert.equal(prog.classifyPageArchetype({ text: "Enter your email to continue with email probe", fields: [], controls: [{ label: "Continue" }], url: "" }), "email-probe", "email probe detection");
assert.equal(prog.classifyPageArchetype({ text: "Sign in to your account password", fields: [{ label: "Password" }], controls: [{ label: "Sign in" }] }), "existing-account-login", "login detection");
assert.equal(prog.classifyPageArchetype({ text: "Create account sign up password", fields: [{ label: "Password" }] }), "account-creation", "account creation detection");
assert.equal(prog.classifyPageArchetype({ fields: [{ label: "First Name" }, { label: "Email" }], controls: [] }), "identity-contact", "identity-contact via fields");
assert.equal(prog.classifyPageArchetype({ text: "unknown gibberish page", fields: [] }), "REVIEW_REQUIRED", "unknown -> REVIEW_REQUIRED");
assert.equal(prog.classifyPageArchetype(null), "REVIEW_REQUIRED", "null descriptor");

// email probe -> login -> create account chain
const emailProbeDescriptor = { text: "Enter your email to continue probe email", url: "https://jobs.example.invalid/email-probe", fields: [{ label: "Email" }], controls: [{ label: "Continue" }] };
assert.equal(prog.classifyPageArchetype(emailProbeDescriptor), "email-probe");
const loginDescriptor = { text: "Sign in password login", fields: [{ label: "Password" }], controls: [{ label: "Sign in" }] };
assert.equal(prog.classifyPageArchetype(loginDescriptor), "existing-account-login");
const createChoiceDescriptor = { text: "Create account choice", fields: [], controls: [{ label: "Create account" }] };
// generic create account with password should be account-creation
assert.equal(prog.classifyPageArchetype({ text: "Create account password sign up", fields: [{ label: "Password" }] }), "account-creation");

// 2. buildProgressionPlan - safe Next
let plan = prog.buildProgressionPlan({ archetype: "identity-contact", controls: [{ label: "Continue" }] });
assert.equal(plan.archetype, "identity-contact");
assert.ok(plan.action, "safe plan has action");
assert.equal(plan.action.label, "Continue");
assert.equal(plan.isTerminal, false);
assert.equal(plan.candidateCount, 1);
assert.equal(plan.reason, "intermediate_candidate_identified");

// safe Next variant "Next"
let planNext = prog.buildProgressionPlan({ archetype: "intermediate-form", controls: [{ label: "Next" }] });
assert.equal(planNext.action.label, "Next");
assert.equal(planNext.isTerminal, false);

// Save & Continue
let planSave = prog.buildProgressionPlan({ archetype: "intermediate-form", controls: [{ label: "Save & Continue" }] });
assert.equal(planSave.action.label, "Save & Continue");

// terminal blocked
let planSubmit = prog.buildProgressionPlan({ archetype: "identity-contact", controls: [{ label: "Submit Application" }] });
assert.equal(planSubmit.isTerminal, true);
assert.equal(planSubmit.reason, "terminal_forbidden");
assert.equal(planSubmit.action, null);

// ambiguous
let planAmbiguous = prog.buildProgressionPlan({ archetype: "intermediate-form", controls: [{ label: "Next" }, { label: "Continue" }] });
assert.equal(planAmbiguous.isTerminal, true);
assert.equal(planAmbiguous.reason, "ambiguous_progression");

// unknown archetype -> REVIEW_REQUIRED (no next/continue candidate, no identity)
let planUnknown = prog.buildProgressionPlan({ text: "gibberish", controls: [{ label: "FooBar" }] });
assert.equal(planUnknown.archetype, "REVIEW_REQUIRED");
assert.equal(planUnknown.isTerminal, true);
// intermediate-form via next/continue with identity context should be recognized even without explicit hint
let planUnknownIntermediate = prog.buildProgressionPlan({ text: "please continue to next step", controls: [{ label: "Continue" }] });
assert.equal(planUnknownIntermediate.archetype, "intermediate-form");

// 3. progressionGate - 12 gates
// Gate 1: session active
let g1Plan = prog.buildProgressionPlan({ archetype: "identity-contact", controls: [{ label: "Continue" }] });
let g1Fail = prog.progressionGate(g1Plan, { ...safeLiveState(), session: { status: "paused" } });
assert.equal(g1Fail.decision, "REVIEW_REQUIRED");
assert.equal(g1Fail.failedGate, "session_is_active_and_not_emergency_stopped");
let g1Stopped = prog.progressionGate(g1Plan, { ...safeLiveState(), session: { status: "stopped" } });
assert.equal(g1Stopped.decision, "REVIEW_REQUIRED");

// Gate 2: archetype recognized
let g2Plan = prog.buildProgressionPlan({ archetype: "REVIEW_REQUIRED", controls: [{ label: "Continue" }] });
// force plan with REVIEW_REQUIRED archetype (simulate)
g2Plan.archetype = "REVIEW_REQUIRED";
let g2Fail = prog.progressionGate(g2Plan, safeLiveState({ archetype: "REVIEW_REQUIRED" }));
assert.equal(g2Fail.decision, "REVIEW_REQUIRED");
assert.equal(g2Fail.failedGate, "current_page_archetype_is_recognized");

// Gate 3: candidate uniquely intermediate
let g3Plan = prog.buildProgressionPlan({ archetype: "identity-contact", controls: [{ label: "Submit" }] });
let g3Fail = prog.progressionGate(g3Plan, safeLiveState());
assert.equal(g3Fail.decision, "REVIEW_REQUIRED");
assert.equal(g3Fail.failedGate, "candidate_control_uniquely_identified_as_intermediate_next_or_continue");
let g3Amb = prog.buildProgressionPlan({ archetype: "identity-contact", controls: [{ label: "Next" }, { label: "Continue" }] });
let g3AmbFail = prog.progressionGate(g3Amb, safeLiveState());
assert.equal(g3AmbFail.decision, "REVIEW_REQUIRED");

// Gate 4: candidate not terminal (submit/apply etc)
let g4Plan = prog.buildProgressionPlan({ archetype: "identity-contact", controls: [{ label: "Continue" }] });
g4Plan.isTerminal = true; // force terminal
let g4Fail = prog.progressionGate(g4Plan, safeLiveState());
assert.equal(g4Fail.decision, "REVIEW_REQUIRED");
assert.equal(g4Fail.failedGate, "candidate_is_not_submit_apply_finish_certify_sign_accept_attestation");
// also via isTerminalLabel
assert.equal(prog.isTerminalLabel("Submit"), true);
assert.equal(prog.isTerminalLabel("Apply"), true);
assert.equal(prog.isTerminalLabel("Captcha"), true);
assert.equal(prog.isTerminalLabel("Continue"), false);

// Gate 5: fill stable
let g5Plan = prog.buildProgressionPlan({ archetype: "identity-contact", controls: [{ label: "Next" }] });
let g5Missing = prog.progressionGate(g5Plan, safeLiveState({ fillStable: undefined, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g5Missing.decision, "REVIEW_REQUIRED", "fill stability must be explicitly proven");
let g5Fail = prog.progressionGate(g5Plan, safeLiveState({ fillStable: false, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g5Fail.decision, "REVIEW_REQUIRED");
assert.equal(g5Fail.failedGate, "deterministic_fill_completed_and_stable_after_live_rescan");
let g5Pass = prog.progressionGate(g5Plan, safeLiveState({ fillStable: true, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g5Pass.decision, "AUTO_ADVANCE_SAFE");

// Gate 6: no validation error
let g6Fail = prog.progressionGate(g5Plan, safeLiveState({ hasValidationError: true }));
assert.equal(g6Fail.decision, "REVIEW_REQUIRED");
assert.equal(g6Fail.failedGate, "no_visible_validation_error_present");
let g6Fail2 = prog.progressionGate(g5Plan, safeLiveState({ validationErrors: ["This field is required"] }));
assert.equal(g6Fail2.decision, "REVIEW_REQUIRED");

// Gate 7: unresolved required field
let g7Fail = prog.progressionGate(g5Plan, safeLiveState({ unresolvedRequiredFields: ["unknown_question_1"] }));
assert.equal(g7Fail.decision, "REVIEW_REQUIRED");
assert.equal(g7Fail.failedGate, "no_required_unknown_manual_review_control_unresolved");
let g7Fail2 = prog.progressionGate(g5Plan, safeLiveState({ hasUnknownManualReview: true }));
assert.equal(g7Fail2.decision, "REVIEW_REQUIRED");

// Gate 8: password outside account bootstrap
let g8Plan = prog.buildProgressionPlan({ archetype: "identity-contact", controls: [{ label: "Next" }] });
let g8Fail = prog.progressionGate(g8Plan, safeLiveState({ hasPassword: true, archetype: "identity-contact", accountBootstrapState: null }));
assert.equal(g8Fail.decision, "REVIEW_REQUIRED");
assert.equal(g8Fail.failedGate, "no_password_requested_outside_explicit_account_bootstrap_state");
// allowed password in account-creation
let g8PassPlan = prog.buildProgressionPlan({ archetype: "account-creation", controls: [{ label: "Continue" }] });
let g8NoState = prog.progressionGate(g8PassPlan, safeLiveState({ hasPassword: true, archetype: "account-creation", accountBootstrapState: null }));
assert.equal(g8NoState.decision, "REVIEW_REQUIRED", "password progression requires explicit ACCOUNT_CREATION state");
let g8Pass = prog.progressionGate(g8PassPlan, safeLiveState({ hasPassword: true, archetype: "account-creation", accountBootstrapState: "ACCOUNT_CREATION" }));
assert.equal(g8Pass.decision, "AUTO_ADVANCE_SAFE");

// Gate 9: file upload / captcha / mfa / legal etc
let g9File = prog.progressionGate(g5Plan, safeLiveState({ hasFileUpload: true, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g9File.decision, "REVIEW_REQUIRED"); assert.equal(g9File.reason, "file_upload_required");
let g9Captcha = prog.progressionGate(g5Plan, safeLiveState({ hasCaptcha: true, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g9Captcha.decision, "REVIEW_REQUIRED"); assert.equal(g9Captcha.reason, "captcha_present");
let g9MFA = prog.progressionGate(g5Plan, safeLiveState({ hasMFA: true, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g9MFA.decision, "REVIEW_REQUIRED"); assert.equal(g9MFA.reason, "mfa_required");
let g9OTP = prog.progressionGate(g5Plan, safeLiveState({ hasOTP: true, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g9OTP.decision, "REVIEW_REQUIRED");
let g9Legal = prog.progressionGate(g5Plan, safeLiveState({ hasLegalGate: true, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g9Legal.decision, "REVIEW_REQUIRED"); assert.equal(g9Legal.reason, "legal_compliance_pending");
let g9Attest = prog.progressionGate(g5Plan, safeLiveState({ hasAttestationGate: true, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g9Attest.decision, "REVIEW_REQUIRED"); assert.equal(g9Attest.reason, "attestation_required");
let g9Demo = prog.progressionGate(g5Plan, safeLiveState({ hasDemographicGate: true, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g9Demo.decision, "REVIEW_REQUIRED"); assert.equal(g9Demo.reason, "demographic_decision_required");

// Gate 10: action unchanged
let g10Plan = prog.buildProgressionPlan({ archetype: "identity-contact", controls: [{ label: "Continue" }] });
let g10Fail = prog.progressionGate(g10Plan, safeLiveState({ controls: [{ label: "Next" }] }));
assert.equal(g10Fail.decision, "REVIEW_REQUIRED");
assert.equal(g10Fail.failedGate, "action_identity_unchanged_between_plan_construction_and_execution");
let g10ArchetypeFail = prog.progressionGate(g10Plan, safeLiveState({ archetype: "application-form" }));
assert.equal(g10ArchetypeFail.decision, "REVIEW_REQUIRED");
assert.equal(g10ArchetypeFail.failedGate, "action_identity_unchanged_between_plan_construction_and_execution");

// Gate 11: loop guard - session budget
let g11Plan = prog.buildProgressionPlan({ archetype: "identity-contact", controls: [{ label: "Next" }] });
let g11FailSession = prog.progressionGate(g11Plan, safeLiveState({ advancesThisSession: 20, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g11FailSession.decision, "REVIEW_REQUIRED");
assert.equal(g11FailSession.failedGate, "advance_budget_loop_guard_not_exceeded");
let g11FailPage = prog.progressionGate(g11Plan, safeLiveState({ advancesThisPage: 3, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g11FailPage.decision, "REVIEW_REQUIRED");
let g11Pass = prog.progressionGate(g11Plan, safeLiveState({ advancesThisSession: 5, advancesThisPage: 1, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g11Pass.decision, "AUTO_ADVANCE_SAFE");
// loop guard via loopState
let loopGuard = prog.createLoopGuard();
loopGuard.advancesThisSession = 20;
let g11LoopState = prog.progressionGate(g11Plan, safeLiveState({ loopState: loopGuard, pageId: "page-1", controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g11LoopState.decision, "REVIEW_REQUIRED");
assert.equal(prog.checkLoopGuard(loopGuard, "page-1").allowed, false);
assert.equal(prog.checkLoopGuard({ advancesThisSession: 0, advancesThisPage: 0, lastPageId: null }, "page-1").allowed, true);
assert.equal(prog.LOOP_GUARD.maxAdvancesPerSession, 20);
assert.equal(prog.LOOP_GUARD.maxAdvancesPerPage, 3);

// Gate 12: transition matches
let g12Fail = prog.progressionGate(g11Plan, safeLiveState({ transitionMismatch: true, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g12Fail.decision, "REVIEW_REQUIRED");
assert.equal(g12Fail.failedGate, "next_observed_page_transition_matches_permitted_state_transition");
let g12Observed = prog.progressionGate(g11Plan, safeLiveState({ observedTransition: { matchesPermitted: false, reason: "mismatch" }, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g12Observed.decision, "REVIEW_REQUIRED");
let g12Pass = prog.progressionGate(g11Plan, safeLiveState({ observedTransition: { matchesPermitted: true }, controls: [{ label: "Next" }], archetype: "identity-contact" }));
assert.equal(g12Pass.decision, "AUTO_ADVANCE_SAFE");

// SPA transition observation helper
let trans = prog.observeTransition("identity-contact", "intermediate-form", { "identity-contact": ["intermediate-form", "application-form"] });
assert.equal(trans.matches, true);
let transFail = prog.observeTransition("identity-contact", "verification-required", { "identity-contact": ["intermediate-form"] });
assert.equal(transFail.matches, false);
let transSame = prog.observeTransition("identity-contact", "identity-contact", {});
assert.equal(transSame.matches, false);
assert.equal(prog.observeTransition(null, "next", null).matches, false);

// user-edited preserved: fill not stable blocks advance (already tested gate 5)
// validation error blocks already tested
// unknown field mismatch blocks (gate 7)

// safe progression full path should pass
let safePlan = prog.buildProgressionPlan({ archetype: "identity-contact", controls: [{ label: "Continue" }] });
let safeGate = prog.progressionGate(safePlan, safeLiveState());
assert.equal(safeGate.decision, "AUTO_ADVANCE_SAFE");
assert.equal(safeGate.failedGate, null);

// account bootstrap chain should classify correctly and gate appropriately
let emailProbePlan = prog.buildProgressionPlan({ archetype: "email-probe", controls: [{ label: "Continue" }] });
assert.equal(emailProbePlan.archetype, "email-probe");
let emailGate = prog.progressionGate(emailProbePlan, safeLiveState({ archetype: "email-probe", controls: [{ label: "Continue" }] }));
assert.equal(emailGate.decision, "AUTO_ADVANCE_SAFE");

// final submit must never be auto-advance
let submitPlan = prog.buildProgressionPlan({ archetype: "application-form", controls: [{ label: "Submit Application" }] });
let submitGate = prog.progressionGate(submitPlan, safeLiveState({ archetype: "application-form", controls: [{ label: "Submit Application" }] }));
assert.equal(submitGate.decision, "REVIEW_REQUIRED");

// ensure file is small and has no forbidden strings
const source = fs.readFileSync(new URL("../browser/application-assist/progression.js", import.meta.url), "utf8");
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "chrome.tabs"]) {
  assert.equal(source.includes(forbidden), false, "progression.js must not contain " + forbidden);
}
assert.ok(source.includes("progression_gate") || source.includes("progressionGate"), "must reference progression_gate");
assert.ok(source.includes("AUTO_ADVANCE_SAFE") && source.includes("REVIEW_REQUIRED"), "must include decisions");
assert.equal(prog.DECISIONS.includes("AUTO_ADVANCE_SAFE"), true);
assert.equal(prog.DECISIONS.includes("REVIEW_REQUIRED"), true);
assert.ok(source.length > 0);

console.log("PROGRESSION_TESTS: PASS");
console.log(`archetypes=${prog.RECOGNIZED_ARCHETYPES.length} decisions=${prog.DECISIONS.length} loop_guard=${prog.LOOP_GUARD.maxAdvancesPerSession}/${prog.LOOP_GUARD.maxAdvancesPerPage}`);
