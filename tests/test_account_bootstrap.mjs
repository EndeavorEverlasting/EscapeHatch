import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const accountFlow = require("../browser/application-assist/account-flow.js");
const credentialGen = require("../browser/application-assist/credential-generator.js");
const sessionSecret = require("../browser/application-assist/session-secret.js");
const classifier = require("../browser/application-assist/account-classifier.js");

// --- State machine transitions ---
assert.equal(accountFlow.INITIAL_STATE, "APPLICATION_ENTRY");
assert.ok(accountFlow.STATES.includes("EMAIL_PROBE"));
assert.ok(accountFlow.STATES.includes("EXISTING_ACCOUNT_LOGIN"));
assert.ok(accountFlow.STATES.includes("CREATE_ACCOUNT_CHOICE"));
assert.ok(accountFlow.STATES.includes("ACCOUNT_CREATION"));
assert.ok(accountFlow.STATES.includes("VERIFICATION_REQUIRED"));
assert.ok(accountFlow.STATES.includes("APPLICATION_FORM"));
assert.ok(accountFlow.STATES.includes("CAPTCHA_REQUIRED"));
assert.ok(accountFlow.STATES.includes("MFA_REQUIRED"));
assert.ok(accountFlow.STATES.includes("AUTH_MISMATCH"));
assert.ok(accountFlow.STATES.includes("REVIEW_REQUIRED"));

assert.ok(accountFlow.canTransition("APPLICATION_ENTRY", "EMAIL_PROBE"));
assert.ok(accountFlow.canTransition("EMAIL_PROBE", "EXISTING_ACCOUNT_LOGIN"));
assert.ok(accountFlow.canTransition("EMAIL_PROBE", "CREATE_ACCOUNT_CHOICE"));
assert.ok(accountFlow.canTransition("EMAIL_PROBE", "ACCOUNT_CREATION"));
assert.ok(!accountFlow.canTransition("EMAIL_PROBE", "APPLICATION_FORM"));
assert.ok(accountFlow.canTransition("ACCOUNT_CREATION", "VERIFICATION_REQUIRED"));
assert.ok(accountFlow.canTransition("ACCOUNT_CREATION", "APPLICATION_FORM"));
assert.ok(accountFlow.canTransition("VERIFICATION_REQUIRED", "APPLICATION_FORM"));
assert.ok(accountFlow.canTransition("EXISTING_ACCOUNT_LOGIN", "APPLICATION_FORM"));
assert.ok(accountFlow.canTransition("AUTH_MISMATCH", "REVIEW_REQUIRED"));
assert.ok(accountFlow.canTransition("CAPTCHA_REQUIRED", "REVIEW_REQUIRED"));
assert.ok(accountFlow.canTransition("MFA_REQUIRED", "REVIEW_REQUIRED"));
assert.ok(accountFlow.canTransition("REVIEW_REQUIRED", "REVIEW_REQUIRED"));
assert.ok(!accountFlow.canTransition("APPLICATION_ENTRY", "ACCOUNT_CREATION"));

assert.equal(accountFlow.transition("APPLICATION_ENTRY", "EMAIL_PROBE"), "EMAIL_PROBE");
assert.equal(accountFlow.transition("EMAIL_PROBE", "CREATE_ACCOUNT_CHOICE"), "CREATE_ACCOUNT_CHOICE");
assert.equal(accountFlow.transition("CREATE_ACCOUNT_CHOICE", "ACCOUNT_CREATION"), "ACCOUNT_CREATION");
assert.equal(accountFlow.transition("ACCOUNT_CREATION", "VERIFICATION_REQUIRED"), "VERIFICATION_REQUIRED");
assert.equal(accountFlow.transition("VERIFICATION_REQUIRED", "APPLICATION_FORM"), "APPLICATION_FORM");
assert.equal(accountFlow.transition("ACCOUNT_CREATION", "APPLICATION_FORM"), "APPLICATION_FORM");
assert.equal(accountFlow.transition("EXISTING_ACCOUNT_LOGIN", "APPLICATION_FORM"), "APPLICATION_FORM");

// Credential generation only in ACCOUNT_CREATION
assert.equal(accountFlow.isCredentialGenerationAllowed("ACCOUNT_CREATION"), true);
assert.equal(accountFlow.isCredentialGenerationAllowed("EMAIL_PROBE"), false);
assert.equal(accountFlow.isCredentialGenerationAllowed("EXISTING_ACCOUNT_LOGIN"), false);
assert.equal(accountFlow.isCredentialGenerationAllowed("APPLICATION_FORM"), false);

// Terminal manual states
for (const s of ["AUTH_MISMATCH", "CAPTCHA_REQUIRED", "MFA_REQUIRED", "REVIEW_REQUIRED"]) {
  assert.equal(accountFlow.isTerminalManualState(s), true);
}
assert.equal(accountFlow.isTerminalManualState("APPLICATION_FORM"), false);

// Duplicate-account ambiguity -> REVIEW_REQUIRED
assert.equal(accountFlow.detectDuplicateAccount({ duplicateAccountDetected: true }), true);
assert.equal(accountFlow.detectDuplicateAccount({ errorMessage: "An account already exists for synthetic@example.invalid" }), true);
assert.equal(accountFlow.detectDuplicateAccount({ accountExistsConflict: true }), true);
assert.equal(accountFlow.detectDuplicateAccount({}), false);
assert.equal(accountFlow.transition("EMAIL_PROBE", "ACCOUNT_CREATION", { duplicateAccountDetected: true }), "REVIEW_REQUIRED");
assert.equal(accountFlow.decideNextState("EMAIL_PROBE", { duplicateAccountDetected: true }), "REVIEW_REQUIRED");
assert.equal(accountFlow.decideNextState("ACCOUNT_CREATION", { duplicateAccountDetected: true }), "REVIEW_REQUIRED");

// CAPTCHA/MFA gates block progression
assert.equal(accountFlow.decideNextState("EMAIL_PROBE", { captchaDetected: true }), "CAPTCHA_REQUIRED");
assert.equal(accountFlow.decideNextState("ACCOUNT_CREATION", { captchaDetected: true }), "CAPTCHA_REQUIRED");
assert.equal(accountFlow.decideNextState("EXISTING_ACCOUNT_LOGIN", { mfaDetected: true }), "MFA_REQUIRED");
assert.equal(accountFlow.decideNextState("VERIFICATION_REQUIRED", { mfaDetected: true }), "MFA_REQUIRED");
assert.equal(accountFlow.transition("EMAIL_PROBE", "EXISTING_ACCOUNT_LOGIN", { captchaDetected: true }), "CAPTCHA_REQUIRED");
assert.equal(accountFlow.transition("EXISTING_ACCOUNT_LOGIN", "APPLICATION_FORM", { mfaDetected: true }), "MFA_REQUIRED");
// Terminal CAPTCHA/MFA only go to REVIEW_REQUIRED
assert.equal(accountFlow.transition("CAPTCHA_REQUIRED", "REVIEW_REQUIRED"), "REVIEW_REQUIRED");
assert.equal(accountFlow.transition("MFA_REQUIRED", "REVIEW_REQUIRED"), "REVIEW_REQUIRED");
assert.throws(() => accountFlow.transition("CAPTCHA_REQUIRED", "APPLICATION_FORM"), /not permitted/);

// State object
const flow = accountFlow.createAccountFlowState("APPLICATION_ENTRY");
assert.equal(flow.getState(), "APPLICATION_ENTRY");
flow.advanceTo("EMAIL_PROBE");
assert.equal(flow.getState(), "EMAIL_PROBE");
flow.advanceTo("ACCOUNT_CREATION");
assert.equal(flow.getState(), "ACCOUNT_CREATION");
flow.observe({ verificationRequired: true });
assert.equal(flow.getState(), "VERIFICATION_REQUIRED");
flow.advanceTo("APPLICATION_FORM");
assert.equal(flow.getState(), "APPLICATION_FORM");
assert.equal(flow.isTerminal(), false);
const dupFlow = accountFlow.createAccountFlowState("EMAIL_PROBE");
dupFlow.observe({ duplicateAccountDetected: true });
assert.equal(dupFlow.getState(), "REVIEW_REQUIRED");
assert.equal(dupFlow.isTerminal(), true);

// --- Credential generator ---
const pwd1 = credentialGen.generateTemporaryPassword({ state: "ACCOUNT_CREATION" });
assert.ok(typeof pwd1 === "string");
assert.ok(pwd1.length >= 20, `password length ${pwd1.length} < 20`);
assert.ok(credentialGen.isStrongPassword(pwd1));
assert.ok(/[a-z]/.test(pwd1));
assert.ok(/[A-Z]/.test(pwd1));
assert.ok(/[0-9]/.test(pwd1));
assert.ok(/[!@#$%^&*_\-+=<>?]/.test(pwd1));

const pwd2 = credentialGen.generateTemporaryPassword({ state: "ACCOUNT_CREATION", length: 24 });
assert.equal(pwd2.length, 24);
assert.ok(credentialGen.isStrongPassword(pwd2));
assert.notEqual(pwd1, pwd2, "high entropy passwords should not be identical");

const pwdDefault = credentialGen.generateTemporaryPassword({ state: "ACCOUNT_CREATION" });
assert.ok(pwdDefault.length >= 20);

assert.throws(() => credentialGen.generateTemporaryPassword({ state: "EMAIL_PROBE" }), /only in ACCOUNT_CREATION/);
assert.throws(() => credentialGen.generateTemporaryPassword({ state: "APPLICATION_FORM" }), /only in ACCOUNT_CREATION/);

// Username generator only when site requires it
assert.equal(credentialGen.generateUsername({ email: "alex@example.invalid", siteRequiresUsername: false }), null);
assert.equal(credentialGen.generateUsernameIfRequired("alex@example.invalid", false), null);
assert.equal(credentialGen.generateUsernameIfRequired("alex@example.invalid", null), null);
const username = credentialGen.generateUsername({ email: "alex@example.invalid", siteRequiresUsername: true });
assert.ok(typeof username === "string");
assert.ok(username.length >= 6);
assert.ok(username.includes("alex") || username.length >= 6);
const username2 = credentialGen.generateUsername({ email: "alex@example.invalid", siteRequiresUsername: true });
assert.notEqual(username, username2);

// No persistence to disk/Git (check module does not use fs or localStorage)
const credSource = fs.readFileSync(new URL("../browser/application-assist/credential-generator.js", import.meta.url), "utf8");
assert.equal(credSource.includes("fetch("), false);
assert.equal(credSource.includes("localStorage"), false);
assert.equal(credSource.includes("chrome.storage.local"), false);
assert.ok(credSource.includes("crypto.getRandomValues"));

// --- Session secret ---
const secretSrc = fs.readFileSync(new URL("../browser/application-assist/session-secret.js", import.meta.url), "utf8");
assert.ok(secretSrc.includes("chrome.storage.session"));
assert.ok(secretSrc.includes("session_scoped") || secretSrc.includes("SESSION_SECRET_KEY"));
assert.equal(secretSrc.includes("chrome.storage.local.set"), false, "must not use persistent local storage for secrets");
assert.equal(secretSrc.includes("console.log"), false);
assert.ok(secretSrc.includes("never_commit") || secretSrc.includes("never_log"));

let asyncTests = (async () => {
  await sessionSecret.clearSecret();
  let v = await sessionSecret.getSecret();
  assert.equal(v, null);

  const tempPwd = credentialGen.generateTemporaryPassword({ state: "ACCOUNT_CREATION" });
  await sessionSecret.setSecret(tempPwd, { state: "ACCOUNT_CREATION" });
  assert.equal(await sessionSecret.getSecret(), tempPwd);
  assert.equal(await sessionSecret.hasSecret(), true);

  // Simulate same-browser page transition: secret survives
  const afterTransition = await sessionSecret.getSecret();
  assert.equal(afterTransition, tempPwd, "generated temporary password must survive same-browser page transitions for session");

  // Reveal/copy hooks
  const revealed = await sessionSecret.revealSecret();
  assert.equal(revealed, tempPwd);
  // copySecret should return boolean and not throw
  const copyResult = await sessionSecret.copySecret();
  assert.equal(typeof copyResult, "boolean");

  // Secret values never appear in exports - ensure getStorageDiagnostics doesn't leak secret
  const diag = sessionSecret.getStorageDiagnostics();
  assert.equal(diag.persistence, "session_scoped");
  assert.equal(diag.never_commit, true);
  assert.ok(!JSON.stringify(diag).includes(tempPwd));

  // Generation outside ACCOUNT_CREATION must be blocked
  await assert.rejects(() => sessionSecret.setSecret("test", { state: "EMAIL_PROBE" }), /only be set in ACCOUNT_CREATION/);

  // Clear
  await sessionSecret.clearSecret();
  assert.equal(await sessionSecret.getSecret(), null);
  assert.equal(await sessionSecret.hasSecret(), false);
  assert.equal(await sessionSecret.revealSecret(), null);
  assert.equal(await sessionSecret.copySecret(), false);
})();

// --- Account classifier ---
assert.equal(classifier.classifyAccountPage({ fields: [{ type: "email", label: "Email" }], buttons: [{ text: "Continue" }], text: "Enter your email" }), "EMAIL_PROBE");
assert.equal(classifier.classifyAccountPage({ fields: [{ type: "email", label: "Email" }, { type: "password", label: "Password" }], buttons: [{ text: "Sign In" }], text: "Sign in" }), "EXISTING_ACCOUNT_LOGIN");
assert.equal(classifier.classifyAccountPage({ fields: [], buttons: [{ text: "Create Account" }, { text: "Sign In" }], text: "Create Account or Sign In" }), "CREATE_ACCOUNT_CHOICE");
assert.equal(classifier.classifyAccountPage({ fields: [{ type: "email", label: "Email" }, { type: "password", label: "Password" }, { type: "password", label: "Confirm Password" }], text: "Create your account" }), "ACCOUNT_CREATION");
assert.equal(classifier.classifyAccountPage({ fields: [{ type: "text", label: "Verification Code", name: "verification_code" }], text: "Enter verification code" }), "VERIFICATION_REQUIRED");
assert.equal(classifier.classifyAccountPage({ captchaDetected: true, fields: [], text: "CAPTCHA" }), "CAPTCHA_REQUIRED");
assert.equal(classifier.classifyAccountPage({ fields: [{ label: "CAPTCHA" }], text: "captcha" }), "CAPTCHA_REQUIRED");
assert.equal(classifier.classifyAccountPage({ mfaDetected: true, fields: [{ type: "text", label: "Authenticator Code", name: "mfa_code" }], text: "two-factor" }), "MFA_REQUIRED");
assert.equal(classifier.classifyAccountPage({ fields: [{ type: "text", label: "Authenticator Code" }, { type: "text", label: "MFA Code" }], mfaDetected: true }), "MFA_REQUIRED");
assert.equal(classifier.classifyAccountPage({ fields: [{ type: "email", label: "Email" }, { type: "password", label: "Password" }], text: "incorrect password", errorText: "Incorrect password" }), "AUTH_MISMATCH");

// Classifier no broad permissions/fetch
const classifierSrc = fs.readFileSync(new URL("../browser/application-assist/account-classifier.js", import.meta.url), "utf8");
assert.equal(classifierSrc.includes("fetch("), false);
assert.equal(classifierSrc.includes("chrome.tabs"), false);
assert.equal(classifierSrc.includes(".click("), false);

// Flow classifier also has no submit
for (const p of ["browser/application-assist/account-flow.js", "browser/application-assist/session-secret.js", "browser/application-assist/account-classifier.js", "browser/application-assist/credential-generator.js"]) {
  const src = fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.equal(src.includes("fetch("), false, `${p} must not contain fetch`);
  assert.equal(src.includes("XMLHttpRequest"), false, `${p} must not contain XMLHttpRequest`);
  assert.equal(src.includes("WebSocket"), false, `${p} must not contain WebSocket`);
  assert.equal(src.includes(".submit("), false, `${p} must not contain .submit`);
  assert.equal(src.includes("requestSubmit"), false, `${p} must not contain requestSubmit`);
  assert.equal(src.includes(".click("), false, `${p} must not contain .click`);
  assert.equal(src.includes("chrome.tabs"), false, `${p} must not contain chrome.tabs`);
  const loc = src.split("\n").length;
  assert.ok(loc < 250, `${p} must be <250 LOC, got ${loc}`);
}

// Fixtures: sanitized placeholders only
const fixtureDirUrl = new URL("../fixtures/account-bootstrap/", import.meta.url);
const fixtures = fs.readdirSync(fixtureDirUrl).filter((f) => f.endsWith(".json"));
assert.ok(fixtures.length >= 6, `expected >=6 fixtures, got ${fixtures.length}`);
for (const name of fixtures) {
  const raw = fs.readFileSync(new URL(`../fixtures/account-bootstrap/${name}`, import.meta.url), "utf8");
  const data = JSON.parse(raw);
  assert.ok(data.secret_placeholder === "generated_password_placeholder" || String(raw).includes("generated_password_placeholder") || raw.includes("username_placeholder") || raw.includes("synthetic_"));
  // Ensure no real secrets patterns: should not contain real email like @northwell.edu or real password
  assert.equal(raw.includes("rperez26@northwell.edu"), false, `${name} leak`);
  assert.equal(raw.includes("Richard Perez"), false, `${name} leak`);
  assert.equal(raw.includes("CheeksMcClappeth"), false, `${name} leak`);
  // Ensure synthetic placeholders present
  assert.ok(raw.includes("synthetic") || raw.includes("placeholder"), `${name} must contain synthetic placeholder`);
  // Ensure fixture does not contain fetch/click etc? not needed
  // Check secret_handling invariants when present
  if (data.secret_handling) {
    assert.equal(data.secret_handling.persistence, "session_scoped");
  }
  // Ensure no actual password value leakage: fixture passwords must be placeholder
  if (data.descriptor && data.descriptor.fields) {
    for (const f of data.descriptor.fields) {
      if (f.type === "password") {
        assert.equal(f.value, "generated_password_placeholder", `${name} password field must be placeholder`);
      }
    }
  }
}

// Wait for async tests then finish
asyncTests.then(() => {
  console.log("ACCOUNT_BOOTSTRAP_TESTS: PASS");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
