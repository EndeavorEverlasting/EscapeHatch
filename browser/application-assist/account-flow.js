(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EscapeHatchAccountFlow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STATES = Object.freeze([
    "APPLICATION_ENTRY",
    "EMAIL_PROBE",
    "EXISTING_ACCOUNT_LOGIN",
    "CREATE_ACCOUNT_CHOICE",
    "ACCOUNT_CREATION",
    "VERIFICATION_REQUIRED",
    "APPLICATION_FORM",
    "AUTH_MISMATCH",
    "CAPTCHA_REQUIRED",
    "MFA_REQUIRED",
    "REVIEW_REQUIRED"
  ]);

  const INITIAL_STATE = "APPLICATION_ENTRY";

  const TERMINAL_MANUAL_STATES = Object.freeze([
    "AUTH_MISMATCH",
    "CAPTCHA_REQUIRED",
    "MFA_REQUIRED",
    "REVIEW_REQUIRED"
  ]);

  const TRANSITIONS = Object.freeze({
    APPLICATION_ENTRY: ["EMAIL_PROBE"],
    EMAIL_PROBE: [
      "EXISTING_ACCOUNT_LOGIN",
      "CREATE_ACCOUNT_CHOICE",
      "ACCOUNT_CREATION",
      "CAPTCHA_REQUIRED",
      "REVIEW_REQUIRED"
    ],
    EXISTING_ACCOUNT_LOGIN: [
      "APPLICATION_FORM",
      "VERIFICATION_REQUIRED",
      "AUTH_MISMATCH",
      "CAPTCHA_REQUIRED",
      "MFA_REQUIRED",
      "REVIEW_REQUIRED"
    ],
    CREATE_ACCOUNT_CHOICE: ["ACCOUNT_CREATION", "EXISTING_ACCOUNT_LOGIN", "REVIEW_REQUIRED"],
    ACCOUNT_CREATION: ["VERIFICATION_REQUIRED", "APPLICATION_FORM", "CAPTCHA_REQUIRED", "REVIEW_REQUIRED"],
    VERIFICATION_REQUIRED: ["APPLICATION_FORM", "MFA_REQUIRED", "CAPTCHA_REQUIRED", "REVIEW_REQUIRED"],
    APPLICATION_FORM: ["APPLICATION_FORM", "REVIEW_REQUIRED", "CAPTCHA_REQUIRED", "MFA_REQUIRED", "AUTH_MISMATCH"],
    AUTH_MISMATCH: ["REVIEW_REQUIRED"],
    CAPTCHA_REQUIRED: ["REVIEW_REQUIRED"],
    MFA_REQUIRED: ["REVIEW_REQUIRED"],
    REVIEW_REQUIRED: ["REVIEW_REQUIRED"]
  });

  const SECRET_GENERATION_STATE = "ACCOUNT_CREATION";

  function isValidState(state) {
    return STATES.includes(state);
  }

  function isTerminalManualState(state) {
    return TERMINAL_MANUAL_STATES.includes(state);
  }

  function isCredentialGenerationAllowed(state) {
    return state === SECRET_GENERATION_STATE;
  }

  function canTransition(from, to) {
    if (!isValidState(from) || !isValidState(to)) return false;
    const allowed = TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  function getAllowedTransitions(state) {
    if (!isValidState(state)) return [];
    return TRANSITIONS[state].slice();
  }

  function transition(from, to, context) {
    if (!isValidState(from)) throw new Error(`Unknown account state: ${from}`);
    if (!isValidState(to)) throw new Error(`Unknown account state: ${to}`);
    if (detectDuplicateAccount(context)) {
      if (to !== "REVIEW_REQUIRED") return "REVIEW_REQUIRED";
    }
    if (context && context.captchaDetected && to !== "CAPTCHA_REQUIRED" && to !== "REVIEW_REQUIRED") {
      if (canTransition(from, "CAPTCHA_REQUIRED")) return "CAPTCHA_REQUIRED";
      if (canTransition(from, "REVIEW_REQUIRED")) return "REVIEW_REQUIRED";
      throw new Error(`CAPTCHA gate cannot be represented safely from state: ${from}`);
    }
    if (context && context.mfaDetected && to !== "MFA_REQUIRED" && to !== "REVIEW_REQUIRED") {
      if (canTransition(from, "MFA_REQUIRED")) return "MFA_REQUIRED";
      if (canTransition(from, "REVIEW_REQUIRED")) return "REVIEW_REQUIRED";
      throw new Error(`MFA gate cannot be represented safely from state: ${from}`);
    }
    if (!canTransition(from, to)) {
      throw new Error(`Transition not permitted: ${from} -> ${to}`);
    }
    return to;
  }

  function detectDuplicateAccount(signals) {
    if (!signals || typeof signals !== "object") return false;
    if (signals.duplicateAccountDetected === true) return true;
    if (signals.accountExistsConflict === true) return true;
    if (signals.errorMessage && /already exists|duplicate account|account already/i.test(String(signals.errorMessage))) {
      return true;
    }
    return false;
  }

  function decideNextState(current, observation) {
    if (!isValidState(current)) throw new Error(`Unknown current state: ${current}`);
    if (!observation || typeof observation !== "object") return current;
    if (detectDuplicateAccount(observation)) return "REVIEW_REQUIRED";
    if (observation.captchaDetected) {
      if (canTransition(current, "CAPTCHA_REQUIRED")) return "CAPTCHA_REQUIRED";
      return "REVIEW_REQUIRED";
    }
    if (observation.mfaDetected) {
      if (canTransition(current, "MFA_REQUIRED")) return "MFA_REQUIRED";
      return "REVIEW_REQUIRED";
    }
    if (observation.authMismatch) {
      if (canTransition(current, "AUTH_MISMATCH")) return "AUTH_MISMATCH";
      return "REVIEW_REQUIRED";
    }
    if (observation.verificationRequired) {
      if (canTransition(current, "VERIFICATION_REQUIRED")) return "VERIFICATION_REQUIRED";
    }
    const candidate = observation.candidateState;
    if (candidate && canTransition(current, candidate)) return candidate;
    return current;
  }

  function createAccountFlowState(initial) {
    const start = initial && isValidState(initial) ? initial : INITIAL_STATE;
    let current = start;
    return {
      getState() {
        return current;
      },
      canTransitionTo(target) {
        return canTransition(current, target);
      },
      advanceTo(target, context) {
        const next = transition(current, target, context);
        current = next;
        return current;
      },
      observe(observation) {
        const next = decideNextState(current, observation);
        if (next !== current && canTransition(current, next)) {
          current = next;
        } else if (next === "REVIEW_REQUIRED" && canTransition(current, "REVIEW_REQUIRED")) {
          current = "REVIEW_REQUIRED";
        }
        return current;
      },
      isTerminal() {
        return isTerminalManualState(current);
      }
    };
  }

  return Object.freeze({
    STATES,
    INITIAL_STATE,
    TERMINAL_MANUAL_STATES,
    TRANSITIONS,
    SECRET_GENERATION_STATE,
    isValidState,
    isTerminalManualState,
    isCredentialGenerationAllowed,
    canTransition,
    getAllowedTransitions,
    transition,
    detectDuplicateAccount,
    decideNextState,
    createAccountFlowState
  });
});
