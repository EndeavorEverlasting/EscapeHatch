"use strict";

const STORAGE_KEY = "escapeHatch.applicationAutofillProfile.v1";
const EXPORT_SCHEMA = "escapehatch-application-autofill-profile/v1";
const MAX_IMPORT_BYTES = 65536;
const PROFILE_KEYS = [
  "name_prefix",
  "first_name",
  "last_name",
  "preferred_name",
  "email",
  "phone",
  "linkedin_url",
  "street_address",
  "city",
  "region",
  "postal_code",
  "country"
];

const statusNode = document.getElementById("status");
const importFile = document.getElementById("importFile");

function setStatus(message) {
  statusNode.textContent = message;
}

function readForm() {
  const profile = {};
  for (const key of PROFILE_KEYS) {
    const value = document.getElementById(key).value.trim();
    if (value) profile[key] = value;
  }
  return profile;
}

function writeForm(profile) {
  for (const key of PROFILE_KEYS) {
    document.getElementById(key).value =
      profile && typeof profile[key] === "string" ? profile[key] : "";
  }
}

function sanitizeProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error("Profile must be a JSON object.");
  }
  const clean = {};
  for (const key of PROFILE_KEYS) {
    if (!(key in profile)) continue;
    if (typeof profile[key] !== "string") {
      throw new Error(`Profile field ${key} must be text.`);
    }
    const value = profile[key].trim();
    if (value) clean[key] = value;
  }
  return clean;
}

async function loadStoredProfile() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  writeForm(stored[STORAGE_KEY] || {});
}

async function saveProfile() {
  const profile = sanitizeProfile(readForm());
  await chrome.storage.local.set({ [STORAGE_KEY]: profile });
  setStatus(`Saved ${Object.keys(profile).length} profile fields locally.`);
}

async function clearProfile() {
  await chrome.storage.local.remove(STORAGE_KEY);
  writeForm({});
  setStatus("Cleared the browser-local EscapeHatch autofill profile.");
}

function downloadJson(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "escapehatch-autofill-profile.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function exportProfile() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const profile = sanitizeProfile(stored[STORAGE_KEY] || {});
  downloadJson({
    schema_version: EXPORT_SCHEMA,
    exported_at: new Date().toISOString(),
    source: "escapehatch-browser-autofill",
    profile
  });
  setStatus("Exported a portable profile JSON file.");
}

async function importProfile(file) {
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error("Import rejected: file exceeds 64 KiB.");
  }
  const text = await file.text();
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    throw new Error("Import rejected: payload exceeds 64 KiB.");
  }
  const payload = JSON.parse(text);
  if (!payload || payload.schema_version !== EXPORT_SCHEMA) {
    throw new Error("Import rejected: unsupported schema.");
  }
  const profile = sanitizeProfile(payload.profile);
  await chrome.storage.local.set({ [STORAGE_KEY]: profile });
  writeForm(profile);
  setStatus(`Imported ${Object.keys(profile).length} profile fields locally.`);
}

async function fillCurrentPage() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (!stored[STORAGE_KEY] || Object.keys(stored[STORAGE_KEY]).length === 0) {
    setStatus("No saved profile. Save or import one first.");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active browser tab is available.");
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["autofill-core.js"]
  });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });
  const result = results && results[0] ? results[0].result : null;
  if (!result || result.status !== "ok") {
    setStatus("Autofill could not run on this page.");
    return;
  }
  setStatus(`Filled ${result.filled} empty recognized field(s). Review everything before submitting.`);
}

document.getElementById("save").addEventListener("click", () => saveProfile().catch((error) => setStatus(error.message)));
document.getElementById("clear").addEventListener("click", () => clearProfile().catch((error) => setStatus(error.message)));
document.getElementById("fill").addEventListener("click", () => fillCurrentPage().catch((error) => setStatus(error.message)));
document.getElementById("export").addEventListener("click", () => exportProfile().catch((error) => setStatus(error.message)));
document.getElementById("import").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => {
  const file = importFile.files && importFile.files[0];
  importProfile(file).catch((error) => setStatus(error.message)).finally(() => {
    importFile.value = "";
  });
});

loadStoredProfile().catch((error) => setStatus(error.message));
