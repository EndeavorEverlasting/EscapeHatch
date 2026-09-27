import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const settings = require("../browser/application-assist/user-settings.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(
  fs.readFileSync(path.join(root, "contracts/application-assist-user-settings.v1.json"), "utf8")
);
const popupJs = fs.readFileSync(path.join(root, "browser/application-assist/popup.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(root, "browser/application-assist/popup.html"), "utf8");

assert.equal(contract.schema, settings.SCHEMA);
assert.equal(contract.storage_key, settings.STORAGE_KEY);
assert.equal(contract.defaults.autofill_enabled, true);

const missing = settings.normalizeSettings(null);
assert.equal(missing.settings.autofill_enabled, true);
assert.equal(missing.source, "missing_default_on");
assert.equal(settings.isAutofillEnabled(undefined), true);

const off = settings.normalizeSettings({ autofill_enabled: false });
assert.equal(off.settings.autofill_enabled, false);
assert.equal(off.source, "stored");
assert.equal(settings.isAutofillEnabled({ autofill_enabled: false }), false);

const malformed = settings.normalizeSettings({ autofill_enabled: "yes" });
assert.equal(malformed.settings.autofill_enabled, true);
assert.equal(malformed.source, "malformed_default_on");
assert.ok(malformed.note);

assert.ok(popupHtml.includes('id="autofillToggle"'));
assert.ok(popupJs.includes("maybeAutofillAfterStart"));
assert.ok(popupJs.includes("executeCanonicalFill"));
assert.ok(popupJs.includes("Candidate A"));
assert.ok(popupJs.includes("userSettingsApi.STORAGE_KEY"));
assert.ok(popupJs.includes("EscapeHatchAssistUserSettings"));
assert.ok(popupHtml.includes("user-settings.js"));

console.log("AUTOFILL_SETTINGS_HARNESS: PASS");
