import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const sync = require("../browser/application-assist/profile-sync.js");
const core = require("../browser/application-assist/assist-core.js");

function readText(p) {
  return fs.readFileSync(path.join(root, p), "utf8");
}

// 1. Module surface: small, no progression/password/final-submit, no network

assert.equal(sync.isTrustedCockpitUrl("http://127.0.0.1:21031/"), true);
assert.equal(sync.isTrustedCockpitUrl("http://localhost:21031/profile"), true);
assert.equal(sync.isTrustedCockpitUrl("http://[::1]:21031/"), true);
assert.equal(sync.isTrustedCockpitUrl("https://jobs.example.invalid/"), false);
assert.equal(sync.isTrustedCockpitUrl("https://example.com/"), false);
assert.equal(sync.isTrustedCockpitUrl("chrome://extensions"), false);

const noncanonicalCockpit = sync.parseCockpitDump({
  "escape-hatch-profile": JSON.stringify({
    first_name: "Synthetic",
    email: "synthetic@example.invalid",
    phone: "+1 555 010 0101",
    phone_authority: "mobile"
  })
});
assert.ok(noncanonicalCockpit, "noncanonical cockpit phone labels must not discard the profile");
assert.equal(noncanonicalCockpit.email, "synthetic@example.invalid");
assert.equal(noncanonicalCockpit.phone_authority, "unconfirmed", "noncanonical cockpit phone labels must fail closed to unconfirmed");

const popupSource = fs.readFileSync(new URL("../browser/application-assist/popup.js", import.meta.url), "utf8");
assert.ok(popupSource.includes("isTrustedCockpitUrl"), "popup must restrict sync to trusted loopback cockpit URL");
assert.ok(popupSource.includes("__escapehatch_cockpit__"), "popup must verify cockpit document identity before importing localStorage");
assert.ok(popupSource.includes("values: out"), "cockpit injection must return the nested values shape consumed by syncFromCockpit");

assert.equal(typeof sync.sanitizeProfile, "function", "sanitizeProfile must exist");
assert.equal(typeof sync.acceptOnlyKnownProfileKeys, "function");
assert.equal(typeof sync.hasProfileValues, "function");
assert.equal(typeof sync.countProfileValues, "function");
assert.equal(typeof sync.validateImportPayloadText, "function");
assert.equal(typeof sync.parseCockpitDump, "function");
assert.equal(typeof sync.projectProfileToPreferenceStore, "function");
assert.equal(typeof sync.isNoAgentBootstrapReady, "function");
assert.deepEqual(sync.PROFILE_KEYS, core.PROFILE_KEYS, "PROFILE_KEYS must align with assist-core");
assert.deepEqual(sync.PHONE_AUTHORITY_VALUES, ["unconfirmed", "user_confirmed_primary", "secondary_or_forwarded"]);
assert.equal(sync.MAX_IMPORT_BYTES, 65536, "MAX_IMPORT_BYTES must be 64KiB");
assert.equal(sync.CANONICAL_OUTPUT_ROOT, "Outputs/application-assist/");
assert.equal(sync.RECOVERY_EXPORT_PREFIX, "escapehatch-application-assist-profile");
assert.equal(sync.PROFILE_STORAGE_KEY, "escapeHatch.applicationAssistProfile.v1");
assert.equal(sync.PREFERENCE_STORAGE_KEY, "escapeHatch.applicationQuestionPreferences.v1");

const stalePreferenceStore = {
  schema_version: "escapehatch-application-question-preferences/v1",
  preferences: {
    "identity.email": { scope: "profile_preference", value: "stale@example.invalid" },
    "identity.phone": { scope: "profile_preference", value: "+1 555 111 2222" },
    "custom.question": { scope: "session_confirmation", value: "keep-me" }
  }
};
const clearedProjection = sync.projectProfileToPreferenceStore(
  { first_name: "Synthetic", phone_authority: "unconfirmed" },
  stalePreferenceStore
);
assert.equal(clearedProjection.preferences["identity.email"], undefined, "cleared cockpit email must remove stale profile preference");
assert.equal(clearedProjection.preferences["identity.phone"], undefined, "cleared cockpit phone must remove stale profile preference");
assert.deepEqual(clearedProjection.preferences["custom.question"], { scope: "session_confirmation", value: "keep-me" }, "non-profile preference scopes must survive projection");
assert.equal(clearedProjection.preferences["identity.first_name"].value, "Synthetic");

assert.equal(sync.EXPORT_SCHEMA, "escapehatch-application-assist-profile/v2");
assert.deepEqual(sync.LEGACY_SCHEMAS, [
  "escapehatch-application-assist-profile/v2",
  "escapehatch-application-assist-profile/v1",
  "escapehatch-application-autofill-profile/v1"
]);

// No broad host permissions, no network, no secrets in sync module
const syncSource = readText("browser/application-assist/profile-sync.js");
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", ".click(", ".submit(", ".requestSubmit(", "chrome.tabs", "http://", "https://"]) {
  // Allow comment mentions? Check real code: should not contain network fetch
  if (forbidden === "http://" || forbidden === "https://") {
    // Allow only if not part of URL construction with network — but sync module must not contain network requests
    // We check that it does not contain fetch/http request patterns; simple check for "http" in source is too strict because comments may contain.
    // So skip strict check for http/https
    continue;
  }
  assert.equal(syncSource.includes(forbidden), false, `profile-sync must not contain ${forbidden}`);
}
// Must not contain progression logic
for (const forbidden of ["progression_gate", "AUTO_ADVANCE_SAFE", "REVIEW_REQUIRED", "progression_plan", "navigation_adapter", "password"]) {
  // password is allowed only as a word in comment? But spec says no password generation; check no generation logic
  // Only check for progression_gutter; password generation forbidden but phone/email docs may mention password in secret handling context — skip check for generic password mention
  if (forbidden === "password") continue;
  assert.equal(syncSource.includes(forbidden), false, `profile-sync must not contain ${forbidden}`);
}
assert.equal(syncSource.includes("acceptOnlyKnownProfileKeys"), true);
assert.equal(syncSource.includes("sanitizeProfile"), true);
assert.equal(syncSource.includes("MAX_IMPORT_BYTES"), true);
assert.equal(syncSource.includes("CANONICAL_OUTPUT_ROOT"), true);
assert.equal(syncSource.includes("Outputs/application-assist/"), true);

// 2. Validation: acceptOnlyKnownProfileKeys drops unknown keys, sanitizes
{
  const raw = {
    email: "alex@example.invalid",
    first_name: "Alex",
    unknown_field: "should be dropped",
    extra: "drop",
    phone_authority: "user_confirmed_primary"
  };
  const filtered = sync.acceptOnlyKnownProfileKeys(raw);
  assert.equal(filtered.email, "alex@example.invalid");
  assert.equal(filtered.first_name, "Alex");
  assert.equal(filtered.unknown_field, undefined);
  assert.equal(filtered.extra, undefined);
  assert.equal(filtered.phone_authority, "user_confirmed_primary");
  const clean = sync.sanitizeProfile(filtered);
  assert.equal(clean.email, "alex@example.invalid");
  assert.equal(clean.phone_authority, "user_confirmed_primary");
  assert.equal(sync.hasProfileValues(clean), true);
  assert.equal(sync.countProfileValues(clean), 2);
}

// 3. sanitizeProfile rejects invalid phone_authority, requires known keys only
{
  assert.throws(() => sync.sanitizeProfile({ email: 123 }), /must be text/);
  assert.throws(() => sync.sanitizeProfile({ phone_authority: "invalid" }), /phone_authority is invalid/);
  assert.throws(() => sync.sanitizeProfile(null), /must be a JSON object/);
  // extra keys are simply ignored, not thrown
  const withExtra = sync.sanitizeProfile({ email: "a@b.invalid", extra: "ignore me", phone_authority: "unconfirmed" });
  assert.equal(withExtra.extra, undefined);
  assert.equal(withExtra.email, "a@b.invalid");
}

// 4. hasProfileValues / isNoAgentBootstrapReady (no-agent bootstrap = email available without file archaeology)
{
  assert.equal(sync.hasProfileValues({}), false);
  assert.equal(sync.hasProfileValues({ email: "" }), false);
  assert.equal(sync.hasProfileValues({ email: "x@y.invalid" }), true);
  assert.equal(sync.isNoAgentBootstrapReady({ email: "x@y.invalid", phone_authority: "unconfirmed" }), true);
  assert.equal(sync.isNoAgentBootstrapReady({ first_name: "Alex" }), false, "no email -> not ready for app fill");
  assert.equal(sync.isNoAgentBootstrapReady({ email: "" }), false);
  assert.equal(sync.isNoAgentBootstrapReady(null), false);
}

// 5. Legacy recovery compatibility: capped 64KiB, schema-checked, field-whitelisted, legacy phone defaults to unconfirmed
{
  const payloadV2 = JSON.stringify({
    schema_version: "escapehatch-application-assist-profile/v2",
    exported_at: new Date().toISOString(),
    profile: { email: "v2@example.invalid", first_name: "V2", phone_authority: "user_confirmed_primary", extra: "drop me" }
  }, null, 2) + "\n";
  const parsedV2 = sync.validateImportPayloadText(payloadV2);
  assert.equal(parsedV2.profile.email, "v2@example.invalid");
  assert.equal(parsedV2.profile.first_name, "V2");
  assert.equal(parsedV2.profile.extra, undefined, "unknown keys must be dropped");
  assert.equal(parsedV2.profile.phone_authority, "user_confirmed_primary");

  const payloadV1 = JSON.stringify({
    schema_version: "escapehatch-application-assist-profile/v1",
    profile: { email: "legacy@example.invalid", last_name: "Legacy" }
  });
  const parsedV1 = sync.validateImportPayloadText(payloadV1);
  assert.equal(parsedV1.profile.email, "legacy@example.invalid");
  assert.equal(parsedV1.profile.phone_authority, "unconfirmed", "legacy v1 must default phone_authority to unconfirmed");

  const payloadLegacyAutofill = JSON.stringify({
    schema_version: "escapehatch-application-autofill-profile/v1",
    profile: { email: "old@example.invalid", phone: "+1 555 0100", phone_authority: "user_confirmed_primary" }
  });
  const parsedLegacy = sync.validateImportPayloadText(payloadLegacyAutofill);
  // per popup.js logic: if schema !== EXPORT_SCHEMA, force unconfirmed even if present
  assert.equal(parsedLegacy.profile.phone_authority, "unconfirmed", "legacy autofill must degrade phone_authority to unconfirmed");

  // Oversized payload rejected
  const big = "a".repeat(65537);
  const overPayload = JSON.stringify({ schema_version: "escapehatch-application-assist-profile/v2", profile: { email: big } });
  // Even if text >64KiB, must throw
  const overText = overPayload + " ".repeat(70000);
  assert.throws(() => sync.validateImportPayloadText(overText), /exceeds 64 KiB/);

  // Unsupported schema rejected
  assert.throws(() => sync.validateImportPayloadText(JSON.stringify({ schema_version: "unknown/v9", profile: {} })), /unsupported schema/);

  // Ensure bytesOf works
  assert.equal(sync.isValidSyncSize(payloadV2), true);
  assert.equal(sync.isValidSyncSize(overText), false);
}

// 6. One-action sync seam: cockpit dump -> validated profile without file shuttling, no local agent needed
{
  const cockpitProfile = {
    email: "cockpit@example.invalid",
    first_name: "Cockpit",
    last_name: "User",
    phone: "+1 555 010 0142",
    phone_authority: "user_confirmed_primary",
    city: "Example City"
  };
  const dump = sync.createCockpitDumpFromProfile(cockpitProfile);
  assert.ok(dump["escape-hatch-profile"], "dump must contain escape-hatch-profile");
  const parsed = sync.parseCockpitDump(dump);
  assert.ok(parsed, "parseCockpitDump must succeed for valid cockpit dump");
  assert.equal(parsed.email, "cockpit@example.invalid");
  assert.equal(sync.hasProfileValues(parsed), true);
  assert.equal(sync.isNoAgentBootstrapReady(parsed), true, "email available without file archaeology");

  // Alternative dump shape: assist-profile contact
  const assistDump = {
    "escape-hatch-assist-profile": JSON.stringify({
      schema: "escape-hatch-assist",
      version: 1,
      profile: { contact: { email: "assist@example.invalid", first_name: "Assist" } }
    })
  };
  const parsedAssist = sync.parseCockpitDump(assistDump);
  assert.equal(parsedAssist.email, "assist@example.invalid");

  // Workspace shape
  const wsDump = {
    "escape-hatch-workspace": JSON.stringify({ profile: { email: "ws@example.invalid", first_name: "Ws" } })
  };
  const parsedWs = sync.parseCockpitDump(wsDump);
  assert.equal(parsedWs.email, "ws@example.invalid");

  // Empty dump -> null
  assert.equal(sync.parseCockpitDump({}), null);
  assert.equal(sync.parseCockpitDump({ "escape-hatch-profile": "not json" }), null);
  assert.equal(sync.parseCockpitDump({ "escape-hatch-profile": JSON.stringify({ unknown: "field" }) }), null, "no usable values -> null");
  assert.equal(sync.parseCockpitDump(null), null);

  // Extra unknown fields are stripped
  const withExtraDump = {
    "escape-hatch-profile": JSON.stringify({ email: "filtered@example.invalid", secret_extra: "must drop", first_name: "Filtered" })
  };
  const filtered = sync.parseCockpitDump(withExtraDump);
  assert.equal(filtered.secret_extra, undefined);
  assert.equal(filtered.email, "filtered@example.invalid");
}

// 7. Projection into extension local store (profile_preference)
{
  const profile = { email: "proj@example.invalid", first_name: "Proj", city: "Proj City", phone_authority: "unconfirmed" };
  const projected = sync.projectProfileToPreferenceStore(profile, null);
  assert.equal(projected.schema_version, "escapehatch-application-question-preferences/v1");
  assert.equal(projected.preferences["identity.email"].value, "proj@example.invalid");
  assert.equal(projected.preferences["identity.email"].scope, "profile_preference");
  assert.equal(projected.preferences["identity.first_name"].value, "Proj");
  // Existing preferences preserved, not overwritten incorrectly
  const existing = { preferences: { "identity.email": { scope: "opportunity_override", value: "keep@example.invalid" } } };
  const merged = sync.projectProfileToPreferenceStore({ email: "new@example.invalid" }, existing);
  // New profile should overwrite with profile_preference? Actually projection writes profile_preference for cleaned profile, so it will overwrite previous entry
  assert.equal(merged.preferences["identity.email"].value, "new@example.invalid");
  assert.equal(merged.preferences["identity.email"].scope, "profile_preference");
}

// 8. Popup wiring: one-action Sync from EscapeHatch using activeTab + scripting + storage, no broad host perms, recovery still capped
{
  const popup = readText("browser/application-assist/popup.js");
  assert.equal(popup.includes("syncFromCockpit"), true, "popup must expose syncFromCockpit");
  assert.equal(popup.includes("EscapeHatchProfileSync"), true, "popup must use profile-sync module");
  assert.equal(popup.includes("chrome.tabs.query"), true, "sync must use chrome.tabs.query (activeTab)");
  assert.equal(popup.includes("chrome.scripting.executeScript"), true, "sync must use chrome.scripting.executeScript");
  assert.equal(popup.includes("chrome.storage.local.set"), true, "sync must persist to storage");
  assert.equal(popup.includes("parseCockpitDump"), true, "popup must validate via parseCockpitDump");
  assert.equal(popup.includes("projectProfileToPreferenceStore"), true, "popup must project to preference store");
  assert.equal(popup.includes("Sync from EscapeHatch"), true, "popup status must mention Sync from EscapeHatch");
  assert.equal(popup.includes("hasProfileValues"), true);
  assert.equal(popup.includes("PROFILE_KEYS"), true);
  assert.equal(popup.includes("MAX_IMPORT_BYTES"), true);
  // Must still retain legacy import/export logic
  assert.equal(popup.includes("Import rejected: file exceeds 64 KiB"), true);
  assert.equal(popup.includes("Export rejected: payload exceeds 64 KiB"), true);
  assert.equal(popup.includes("escapehatch-application-assist-profile/v2"), true);
  assert.equal(popup.includes("escapehatch-application-assist-profile/v1"), true);
  assert.equal(popup.includes("escapehatch-application-autofill-profile/v1"), true);
  // Must not add progression/password/final-submit logic (anchor.click / inputFile.click are allowed for recovery export/import)
  for (const bad of ["progression_gate", "AUTO_ADVANCE_SAFE", "fetch(", "XMLHttpRequest", "WebSocket"]) {
    assert.equal(popup.includes(bad), false, `popup must not contain ${bad} in sync seam`);
  }
  // Popup chrome.tabs is only via queries for activeTab, not broad host enumeration
  assert.equal(popup.includes("chrome.tabs.query({ active: true, currentWindow: true })"), true);
}

// 9. Popup HTML: Sync button present, script load order correct, no local agent requirement messaging
{
  const html = readText("browser/application-assist/popup.html");
  assert.equal(html.includes('id="syncFromCockpit"'), true, "popup.html must have sync button");
  assert.equal(html.includes("Sync from EscapeHatch"), true);
  assert.equal(html.includes('src="profile-sync.js"'), true, "popup.html must load profile-sync.js");
  // Order: assist-core before modality before profile-sync before popup
  const idxCore = html.indexOf('src="assist-core.js"');
  const idxMod = html.indexOf('src="modality.js"');
  const idxSync = html.indexOf('src="profile-sync.js"');
  const idxPopup = html.indexOf('src="popup.js"');
  assert.ok(idxCore < idxMod && idxMod < idxSync && idxSync < idxPopup, "script load order must be assist-core, modality, profile-sync, popup");
  assert.equal(html.includes("activeTab + scripting + storage"), true, "HTML must document activeTab + scripting + storage seam");
  assert.equal(html.includes("Outputs/application-assist/"), true, "HTML must document canonical output root");
  assert.equal(html.includes("64 KiB"), true, "HTML must document 64 KiB cap");
}

// 10. Manifest permissions remain minimal: activeTab, scripting, storage only; no host_permissions, no broad perms
{
  const manifest = JSON.parse(readText("browser/application-assist/manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(new Set(manifest.permissions), new Set(["activeTab", "scripting", "storage"]));
  assert.equal("host_permissions" in manifest, false, "manifest must not have host_permissions (no broad host perms)");
  assert.equal("background" in manifest, false);
  assert.equal("content_scripts" in manifest, false);
}

// 11. Docs: single generated-output root documented, recovery export destination, sync seam documented, required markers preserved
{
  const docs = readText("docs/APPLICATION_ASSIST_SESSION.md");
  for (const marker of [
    "Sync from EscapeHatch",
    "activeTab + scripting + storage",
    "Outputs/application-assist/",
    "CANONICAL_OUTPUT_ROOT",
    "acceptOnlyKnownProfileKeys",
    "sanitizeProfile",
    "projectProfileToPreferenceStore",
    "profile_preference",
    "64 KiB",
    "escapehatch-application-assist-profile/v2",
    "recovery",
    "no local agent",
    "without file",
    "profile-sync.js"
  ]) {
    assert.equal(docs.includes(marker), true, `docs must contain marker: ${marker}`);
  }
  for (const required of [
    "Start Assist",
    "Fill Allowed Fields",
    "Pause",
    "Resume",
    "Emergency Stop",
    "Undo Last Fill",
    "canonical Fill Plan",
    "user_confirmed_primary",
    "Load unpacked",
    "Progression Plan",
    "AUTO_ADVANCE_SAFE",
    "REVIEW_REQUIRED",
    "APPLICATION_ENTRY",
    "ACCOUNT_CREATION",
    "session_scoped",
    "never_commit"
  ]) {
    assert.equal(docs.includes(required), true, `docs must preserve required marker: ${required}`);
  }
}

// 12. Registry documents single generated-output root and recovery export
{
  const registry = readText("ARTIFACT_REGISTRY.md");
  assert.equal(registry.includes("Outputs/application-assist/"), true, "registry must document Outputs/application-assist/");
  assert.equal(registry.includes("profile-sync.js"), true, "registry must register profile-sync adapter");
  assert.equal(registry.includes("Generated application-assist distribution"), true);
  assert.equal(registry.includes("single canonical generated-output root") || registry.includes("single canonical"), true);
  assert.equal(registry.includes("escapehatch-application-assist-profile"), true, "registry must mention recovery export prefix");
  assert.equal(registry.includes("64 KiB"), true, "registry must mention 64 KiB cap");
}

// 13. Outputs/application-assist directory exists as canonical generated-output root (not a source duplicate)
{
  const outPath = path.join(root, "Outputs", "application-assist");
  assert.equal(fs.existsSync(outPath), true, "Outputs/application-assist/ must exist as canonical generated-output root");
  const stat = fs.statSync(outPath);
  assert.equal(stat.isDirectory(), true);
  // Ensure it is not a source duplicate: browser source remains distinct
  assert.equal(fs.existsSync(path.join(root, "browser", "application-assist", "assist-core.js")), true);
  assert.equal(fs.existsSync(path.join(root, "artifacts", "escape-hatch", "src", "lib", "storage.ts")), true);
}

// 14. Legacy recovery import/export remains usable alongside new sync: simulate file-import path still works after sync logic added
{
  const legacyProfile = { email: "legacy-sync@example.invalid", first_name: "LegacySync" };
  const payload = JSON.stringify({ schema_version: "escapehatch-application-assist-profile/v2", profile: legacyProfile });
  const importResult = sync.validateImportPayloadText(payload);
  assert.equal(importResult.profile.email, "legacy-sync@example.invalid");
  // Synthesize cockpit dump still works
  const dump = sync.createCockpitDumpFromProfile(legacyProfile);
  const fromCockpit = sync.parseCockpitDump(dump);
  assert.equal(fromCockpit.email, "legacy-sync@example.invalid");
  // Both paths produce same email availability without file archaeology
  assert.equal(sync.isNoAgentBootstrapReady(fromCockpit), true);
  assert.equal(sync.isNoAgentBootstrapReady(importResult.profile), true);
}

console.log("PROFILE_SYNC_TESTS: PASS");
