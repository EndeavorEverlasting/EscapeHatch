import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const progression = require("../browser/application-assist/progression.js");
const accountFlow = require("../browser/application-assist/account-flow.js");
const accountClassifier = require("../browser/application-assist/account-classifier.js");

function fixture(name) {
  return JSON.parse(fs.readFileSync(new URL(`../fixtures/application-assist-adversarial/${name}`, import.meta.url), "utf8"));
}

function runtimeDecision(data, overrides = {}) {
  const candidate = data.progression_plan && data.progression_plan.candidate_control;
  const label = candidate && candidate.label ? candidate.label : "Continue";
  const fields = Array.isArray(data.fields) ? data.fields : [];
  const descriptor = {
    text: data.title || data.description || "",
    fields,
    controls: [{ label }]
  };
  const hintedArchetype = String(data.page_archetype || "").toLowerCase();
  const archetype = progression.RECOGNIZED_ARCHETYPES.includes(hintedArchetype)
    ? hintedArchetype
    : progression.classifyPageArchetype(descriptor);
  const plan = progression.buildProgressionPlan(
    { archetype, controls: [{ label }] },
    { stable: data.progression_plan?.deterministic_fill_completed_and_stable_after_live_rescan === true }
  );
  const hasPassword = fields.some((f) => String(f.type || "").toLowerCase() === "password");
  const live = {
    session: { status: data.session?.status || "active" },
    archetype: plan.archetype,
    controls: [{ label }],
    fillStable: data.progression_plan?.deterministic_fill_completed_and_stable_after_live_rescan === true,
    transitionObserverReady: overrides.transitionObserverReady === true,
    hasValidationError: data.progression_plan?.no_visible_validation_error_present === false,
    unresolvedRequiredFields:
      data.progression_plan?.no_required_unknown_manual_review_control_unresolved === false ? ["synthetic-required"] : [],
    hasPassword,
    accountBootstrapState: data.account_state || null,
    hasFileUpload: Array.isArray(data.fields) && data.fields.some((f) => String(f.type || "").toLowerCase() === "file"),
    hasCaptcha: (data.expected_reasons || []).includes("captcha_present"),
    hasMFA: (data.expected_reasons || []).includes("mfa_required"),
    hasOTP: (data.expected_reasons || []).includes("otp_required"),
    hasLegalGate: (data.expected_reasons || []).includes("legal_compliance_pending"),
    hasAttestationGate: Boolean(data.attestation_manual_only) || (data.expected_reasons || []).includes("attestation_required"),
    hasDemographicGate: false,
    advancesThisSession:
      data.loop_guard?.current_advances_per_session ?? data.loop_guard?.advances_per_session ?? 0,
    advancesThisPage:
      data.loop_guard?.current_advances_per_page ?? data.loop_guard?.advances_per_page ?? 0,
    ...overrides
  };
  return { plan, gate: progression.progressionGate(plan, live) };
}

// A4 fixture claims must stay coupled to repaired production progression behavior.
for (const [name, expected] of [
  ["02-account-creation-with-temporary-password.json", "AUTO_ADVANCE_SAFE"],
  ["04-safe-intermediate-next.json", "AUTO_ADVANCE_SAFE"],
  ["05-visible-validation-error.json", "REVIEW_REQUIRED"],
  ["06-unknown-required-field-mismatch.json", "REVIEW_REQUIRED"],
  ["08-captcha-mfa-manual-gate.json", "REVIEW_REQUIRED"],
  ["10-final-review-submit-never-auto.json", "REVIEW_REQUIRED"],
  ["11-spa-transition-loop-guard.json", "REVIEW_REQUIRED"]
]) {
  const data = fixture(name);
  const result = runtimeDecision(data, { transitionObserverReady: true });
  assert.equal(result.gate.decision, expected, `${name}: runtime decision drifted from adversarial fixture`);
  assert.equal(result.gate.decision, data.expected_decision, `${name}: fixture expected_decision disagrees with runtime`);
}

// Observer readiness is a real pre-dispatch gate, not a fixture shortcut.
const observerControl = fixture("04-safe-intermediate-next.json");
const observerMissing = runtimeDecision(observerControl, { transitionObserverReady: false });
assert.equal(observerMissing.gate.decision, "REVIEW_REQUIRED", "observer-not-armed control must block safe progression");
assert.equal(observerMissing.gate.reason, "transition_observer_not_ready");

// Final-submit fixture must remain unreachable through the navigation policy.
const finalReview = fixture("10-final-review-submit-never-auto.json");
for (const label of finalReview.must_never_auto_activate) {
  assert.equal(progression.isTerminalLabel(label), true, `terminal label must stay forbidden: ${label}`);
}

// Account-flow fixture sequence must be legal under the repaired state machine.
const accountScenario = fixture("01-email-probe-login-create-account.json");
for (const step of accountScenario.account_flow.sequence) {
  if (!step.transition_to) continue;
  assert.equal(
    accountFlow.canTransition(step.state, step.transition_to),
    step.allowed_transition === true,
    `account transition drift at fixture step ${step.step}: ${step.state} -> ${step.transition_to}`
  );
}

// The adversarial account-creation shape must still classify as account creation.
const accountCreation = fixture("02-account-creation-with-temporary-password.json");
assert.equal(
  accountClassifier.classifyAccountPage({ fields: accountCreation.fields, text: accountCreation.title }),
  "ACCOUNT_CREATION"
);

console.log("APPLICATION_ASSIST_ADVERSARIAL_RUNTIME: PASS");
