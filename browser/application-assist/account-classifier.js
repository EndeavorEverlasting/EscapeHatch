(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EscapeHatchAccountClassifier = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ARCHETYPES = Object.freeze({
    EMAIL_PROBE: "EMAIL_PROBE",
    EXISTING_ACCOUNT_LOGIN: "EXISTING_ACCOUNT_LOGIN",
    CREATE_ACCOUNT_CHOICE: "CREATE_ACCOUNT_CHOICE",
    ACCOUNT_CREATION: "ACCOUNT_CREATION",
    VERIFICATION_REQUIRED: "VERIFICATION_REQUIRED",
    APPLICATION_FORM: "APPLICATION_FORM",
    CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
    MFA_REQUIRED: "MFA_REQUIRED",
    AUTH_MISMATCH: "AUTH_MISMATCH",
    REVIEW_REQUIRED: "REVIEW_REQUIRED",
    UNKNOWN: "UNKNOWN"
  });

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function hasSignal(text, signals) {
    const t = normalize(text);
    return signals.some((s) => t.includes(s));
  }

  function descriptorHasField(descriptor, matcher) {
    const fields = Array.isArray(descriptor.fields) ? descriptor.fields : [];
    return fields.some(matcher);
  }

  function isEmailField(f) {
    const type = normalize(f.type);
    const label = normalize(f.label);
    const name = normalize(f.name);
    const id = normalize(f.id);
    const auto = normalize(f.autocomplete);
    if (type === "email" || auto.includes("email")) return true;
    if (label.includes("email") || name.includes("email") || id.includes("email")) return true;
    return false;
  }

  function isPasswordField(f) {
    return normalize(f.type) === "password";
  }

  function isUsernameField(f) {
    const label = normalize(f.label);
    const name = normalize(f.name);
    if (label.includes("username") || label.includes("user name")) return true;
    if (name.includes("username") || name.includes("user_name")) return true;
    return false;
  }

  function isVerificationField(f) {
    const label = normalize(f.label);
    const name = normalize(f.name);
    if (label.includes("verification") || label.includes("code") || label.includes("otp")) return true;
    if (name.includes("otp") || name.includes("verification") || name.includes("mfa")) return true;
    if (normalize(f.type) === "tel" && label.includes("code")) return true;
    return false;
  }

  function hasCaptcha(descriptor) {
    if (descriptor.captchaDetected === true) return true;
    if (descriptor.hasCaptcha === true) return true;
    const text = normalize(descriptor.text || descriptor.pageText || "");
    if (text.includes("captcha") || text.includes("recaptcha") || text.includes("i am not a robot")) return true;
    const fields = descriptor.fields || [];
    for (const f of fields) {
      if (normalize(f.label).includes("captcha")) return true;
    }
    return false;
  }

  function hasMfa(descriptor) {
    if (descriptor.mfaDetected === true) return true;
    if (descriptor.hasMfa === true) return true;
    const text = normalize(descriptor.text || descriptor.pageText || "");
    if (text.includes("multi-factor") || text.includes("two-factor") || text.includes("authenticator")) return true;
    return descriptorHasField(descriptor, (f) => normalize(f.label).includes("authenticator") || normalize(f.label).includes("mfa"));
  }

  function hasAuthMismatch(descriptor) {
    if (descriptor.authMismatch === true) return true;
    const text = normalize(descriptor.text || descriptor.errorText || "");
    return text.includes("incorrect password") || text.includes("invalid credentials") || text.includes("authentication failed");
  }

  function hasCreateChoiceSignals(descriptor) {
    const text = normalize(descriptor.text || descriptor.pageText || "");
    const buttons = Array.isArray(descriptor.buttons) ? descriptor.buttons.map((b) => normalize(b.text || b.label || b)) : [];
    const all = [text].concat(buttons).join(" ");
    const hasCreate = all.includes("create account") || all.includes("create an account") || all.includes("sign up") || all.includes("register");
    const hasLogin = all.includes("sign in") || all.includes("log in") || all.includes("already have an account");
    return hasCreate && hasLogin;
  }

  function classifyAccountPage(descriptor) {
    if (!descriptor || typeof descriptor !== "object") return ARCHETYPES.UNKNOWN;
    if (hasCaptcha(descriptor)) return ARCHETYPES.CAPTCHA_REQUIRED;
    if (hasMfa(descriptor) && descriptorHasField(descriptor, isVerificationField)) return ARCHETYPES.MFA_REQUIRED;
    if (hasAuthMismatch(descriptor)) return ARCHETYPES.AUTH_MISMATCH;
    if (descriptorHasField(descriptor, isVerificationField)) return ARCHETYPES.VERIFICATION_REQUIRED;

    if (hasCreateChoiceSignals(descriptor)) return ARCHETYPES.CREATE_ACCOUNT_CHOICE;

    const fields = Array.isArray(descriptor.fields) ? descriptor.fields : [];
    const hasEmail = fields.some(isEmailField);
    const hasPassword = fields.some(isPasswordField);
    const hasUsername = fields.some(isUsernameField);
    const hasVerify = fields.some(isVerificationField);
    const hasConfirmPassword = fields.filter(isPasswordField).length >= 2;

    if (!hasEmail && !hasPassword && !hasVerify && fields.length === 0) {
      const text = normalize(descriptor.text || "");
      if (text.includes("application form") || hasSignal(text, ["first name", "last name"])) return ARCHETYPES.APPLICATION_FORM;
      return ARCHETYPES.UNKNOWN;
    }
    if (hasEmail && !hasPassword && !hasVerify) return ARCHETYPES.EMAIL_PROBE;
    if (hasEmail && hasPassword && !hasConfirmPassword && !hasUsername) {
      const buttons = Array.isArray(descriptor.buttons) ? descriptor.buttons.map((b) => normalize(b.text || b.label || b)) : [];
      const text = normalize(descriptor.text || "");
      if (buttons.some((b) => b.includes("sign in") || b.includes("log in")) || text.includes("sign in") || text.includes("log in")) {
        return ARCHETYPES.EXISTING_ACCOUNT_LOGIN;
      }
      if (hasConfirmPassword || hasUsername) return ARCHETYPES.ACCOUNT_CREATION;
      return ARCHETYPES.EXISTING_ACCOUNT_LOGIN;
    }
    if ((hasPassword && hasConfirmPassword) || (hasEmail && hasPassword && (hasConfirmPassword || hasUsername))) {
      return ARCHETYPES.ACCOUNT_CREATION;
    }
    if (hasEmail && hasPassword) return ARCHETYPES.ACCOUNT_CREATION;

    const text = normalize(descriptor.text || "");
    if (text.includes("application") || text.includes("first name") || text.includes("last name")) return ARCHETYPES.APPLICATION_FORM;
    return ARCHETYPES.UNKNOWN;
  }

  function isAccountCreationAllowed(classification) {
    return classification === ARCHETYPES.ACCOUNT_CREATION;
  }

  return Object.freeze({
    ARCHETYPES,
    classifyAccountPage,
    isAccountCreationAllowed,
    hasCaptcha,
    hasMfa
  });
});
