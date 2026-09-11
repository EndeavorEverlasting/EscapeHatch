"use strict";

const PROFILE_KEY = "escapeHatch.applicationAssistProfile.v1";
const LEGACY_PROFILE_KEY = "escapeHatch.applicationAutofillProfile.v1";
const SESSION_KEY = "escapeHatch.applicationAssistSession.v1";
const EXPORT_SCHEMA = "escapehatch-application-assist-profile/v2";
const LEGACY_ASSIST_EXPORT_SCHEMA = "escapehatch-application-assist-profile/v1";
const LEGACY_EXPORT_SCHEMA = "escapehatch-application-autofill-profile/v1";
const PHONE_AUTHORITY_VALUES = ["unconfirmed", "user_confirmed_primary", "secondary_or_forwarded"];
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
const sessionNode = document.getElementById("sessionState");
const importFile = document.getElementById("importFile");
const api = globalThis.EscapeHatchAssist;

function setStatus(message) {
  statusNode.textContent = message;
}

function renderSession(session) {
  if (!session) {
    sessionNode.textContent = "Session: idle";
    return;
  }
  const parts = [`Session: ${session.status}`, `origin=${session.origin || "?"}`];
  if (session.pause_reason) parts.push(`reason=${session.pause_reason}`);
  if (session.confirmation) parts.push("confirmation=recorded");
  sessionNode.textContent = parts.join(" · ");
}

function readForm() {
  const profile = {};
  for (const key of PROFILE_KEYS) {
    const value = document.getElementById(key).value.trim();
    if (value) profile[key] = value;
  }
  const authority = document.getElementById("phone_authority").value;
  profile.phone_authority = PHONE_AUTHORITY_VALUES.includes(authority) ? authority : "unconfirmed";
  return profile;
}

function writeForm(profile) {
  for (const key of PROFILE_KEYS) {
    document.getElementById(key).value = profile && typeof profile[key] === "string" ? profile[key] : "";
  }
  const authority = profile && typeof profile.phone_authority === "string" ? profile.phone_authority : "unconfirmed";
  document.getElementById("phone_authority").value = PHONE_AUTHORITY_VALUES.includes(authority) ? authority : "unconfirmed";
}

function hasProfileValues(profile) {
  return PROFILE_KEYS.some((key) => typeof profile[key] === "string" && profile[key].trim());
}

function countProfileValues(profile) {
  return PROFILE_KEYS.filter((key) => typeof profile[key] === "string" && profile[key].trim()).length;
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
  const authority = typeof profile.phone_authority === "string" ? profile.phone_authority : "unconfirmed";
  if (!PHONE_AUTHORITY_VALUES.includes(authority)) {
    throw new Error("Profile phone_authority is invalid.");
  }
  clean.phone_authority = authority;
  return clean;
}

async function loadStoredProfile() {
  const stored = await chrome.storage.local.get([PROFILE_KEY, LEGACY_PROFILE_KEY]);
  const profile = stored[PROFILE_KEY] || stored[LEGACY_PROFILE_KEY] || {};
  writeForm(profile);
}

async function loadStoredSession() {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  renderSession(stored[SESSION_KEY] || null);
  return stored[SESSION_KEY] || null;
}

async function saveSession(session) {
  if (!session) {
    await chrome.storage.local.remove(SESSION_KEY);
    renderSession(null);
    return null;
  }
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  renderSession(session);
  return session;
}

async function saveProfile() {
  const profile = sanitizeProfile(readForm());
  const prefKey = api.PREFERENCE_STORAGE_KEY;
  const existing = await chrome.storage.local.get(prefKey);
  const preferenceStore = api.projectProfileToPreferenceStore(profile, existing[prefKey] || {});
  await chrome.storage.local.set({
    [PROFILE_KEY]: profile,
    [prefKey]: preferenceStore
  });
  setStatus(`Saved ${countProfileValues(profile)} profile fields and projected preference-cache entries locally.`);
}

async function clearProfile() {
  await chrome.storage.local.remove([PROFILE_KEY, LEGACY_PROFILE_KEY]);
  writeForm({});
  setStatus("Cleared the browser-local EscapeHatch assist profile.");
}

function downloadJsonText(text, filename) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "escapehatch-assist-profile.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function exportProfile() {
  const stored = await chrome.storage.local.get(PROFILE_KEY);
  const profile = sanitizeProfile(stored[PROFILE_KEY] || {});
  const payload = {
    schema_version: EXPORT_SCHEMA,
    exported_at: new Date().toISOString(),
    source: "escapehatch-browser-application-assist",
    profile
  };
  const text = JSON.stringify(payload, null, 2) + "\n";
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    throw new Error("Export rejected: payload exceeds 64 KiB.");
  }
  downloadJsonText(text);
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
  const schema = payload && payload.schema_version;
  if (schema !== EXPORT_SCHEMA && schema !== LEGACY_ASSIST_EXPORT_SCHEMA && schema !== LEGACY_EXPORT_SCHEMA) {
    throw new Error("Import rejected: unsupported schema.");
  }
  const rawProfile = payload && payload.profile;
  const incoming =
    rawProfile && typeof rawProfile === "object" && !Array.isArray(rawProfile) ? { ...rawProfile } : rawProfile;
  if (incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
    if (schema !== EXPORT_SCHEMA || !Object.prototype.hasOwnProperty.call(incoming, "phone_authority")) {
      incoming.phone_authority = "unconfirmed";
    }
  }
  const profile = sanitizeProfile(incoming);
  await chrome.storage.local.set({ [PROFILE_KEY]: profile });
  writeForm(profile);
  setStatus(`Imported ${countProfileValues(profile)} profile fields locally.`);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active browser tab is available.");
  }
  return tab;
}

function tabOrigin(tab) {
  try {
    return new URL(tab.url || "").origin;
  } catch (_error) {
    throw new Error("Active tab URL is not a usable application origin.");
  }
}

async function runPageCommand(command, profile, session, preferenceStore) {
  const tab = await activeTab();
  const origin = tabOrigin(tab);
  session = api.observeOrigin(session, origin);
  await saveSession(session);

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["assist-core.js"]
  });
  const injected = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (payload) => {
      globalThis.__ESCAPEHATCH_ASSIST_COMMAND__ = payload;
    },
    args: [{ type: command, profile, session, preferenceStore: preferenceStore || null }]
  });
  if (!injected) {
    throw new Error("Assist command injection failed.");
  }
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });
  const result = results && results[0] ? results[0].result : null;
  if (!result || result.status !== "ok") {
    throw new Error((result && result.message) || "Assist could not run on this page.");
  }
  if (result.session) await saveSession(result.session);
  return result;
}

async function startAssist() {
  const tab = await activeTab();
  const origin = tabOrigin(tab);
  if (origin === "null" || origin.startsWith("chrome:") || origin.startsWith("edge:") || origin.startsWith("about:")) {
    throw new Error("Open a real application page before starting assist.");
  }
  const session = api.createSession({
    origin,
    application_id: origin,
    started_at: new Date().toISOString()
  });
  await saveSession(session);
  setStatus("Assist session started for this application origin. Navigate pages manually.");
}

async function fillAllowedFields() {
  const storedProfile = await chrome.storage.local.get(PROFILE_KEY);
  const profile = sanitizeProfile(storedProfile[PROFILE_KEY] || readForm());
  if (!hasProfileValues(profile)) {
    setStatus("No saved profile. Save or import one first.");
    return;
  }
  let session = await loadStoredSession();
  if (!session) {
    setStatus("Start Assist on the application before filling.");
    return;
  }
  const prefStored = await chrome.storage.local.get(api.PREFERENCE_STORAGE_KEY);
  const preferenceStore = prefStored[api.PREFERENCE_STORAGE_KEY] || null;
  const result = await runPageCommand("fill", profile, session, preferenceStore);
  if (result.skipped_reason === "emergency_stop") {
    setStatus("Emergency Stop is latched. No fields were written.");
    return;
  }
  if (result.skipped_reason) {
    setStatus(`Fill blocked (${result.skipped_reason}). Resume or start a new session.`);
    return;
  }
  setStatus(
    `Filled ${result.filled} allowed field(s) via Fill Plan r${result.plan_revision}. Review, navigate manually, then submit yourself.`
  );
}

async function pauseAssist() {
  const session = await loadStoredSession();
  if (!session) {
    setStatus("No active assist session.");
    return;
  }
  await saveSession(api.pauseSession(session, "user_pause"));
  setStatus("Assist paused. No DOM writes will run until Resume.");
}

async function resumeAssist() {
  const tab = await activeTab();
  const session = await loadStoredSession();
  if (!session) {
    setStatus("No assist session to resume.");
    return;
  }
  const next = api.resumeSession(session, tabOrigin(tab));
  await saveSession(next);
  setStatus("Assist resumed on the same application origin.");
}

async function emergencyStop() {
  const session = await loadStoredSession();
  if (!session) {
    setStatus("No assist session.");
    return;
  }
  await saveSession(api.stopSession(session));
  setStatus("Emergency Stop latched. Future fills are cancelled until you Start Assist again.");
}

async function undoLastFill() {
  const session = await loadStoredSession();
  if (!session) {
    setStatus("No assist session.");
    return;
  }
  const result = await runPageCommand("undo", {}, session);
  setStatus(`Undo restored ${result.undone} EscapeHatch-inserted value(s); skipped ${result.skipped} edited/missing field(s).`);
}

async function recordConfirmationEvidence() {
  let session = await loadStoredSession();
  if (!session) {
    setStatus("Start Assist before recording confirmation evidence.");
    return;
  }
  session = api.recordConfirmation(session, {
    source: "same_session_page_confirmation",
    application_id: session.application_id || session.origin
  });
  await saveSession(session);
  if (session.companion_export) {
    const text = JSON.stringify(session.companion_export, null, 2) + "\n";
    downloadJsonText(text, "escapehatch-companion-confirmation.json");
  }
  setStatus("Recorded companion-compatible confirmation evidence (metadata only). Submission remains manual.");
}

document.getElementById("phone").addEventListener("input", () => {
  const authority = document.getElementById("phone_authority");
  if (authority.value !== "unconfirmed") {
    authority.value = "unconfirmed";
    setStatus("Phone changed. Reconfirm which primary career number you control before autofill can use it.");
  }
});

const modality = globalThis.EscapeHatchAssistModality;
const modeChip = document.getElementById("modeChip");
const commandPalette = document.getElementById("commandPalette");
const commandQuery = document.getElementById("commandQuery");
const commandList = document.getElementById("commandList");
const phoneSheetActions = document.getElementById("phoneSheetActions");
const phoneBackToSheet = document.getElementById("phoneBackToSheet");

let activeMode = "mouse";
let paletteOpen = false;

function setProfileOpen(open) {
  document.documentElement.classList.toggle("profile-open", !!open);
  if (phoneBackToSheet) phoneBackToSheet.hidden = !open;
  if (!open && document.activeElement && modality.isEditableTarget(document.activeElement)) {
    document.activeElement.blur();
  }
}

function closeCommandPalette() {
  paletteOpen = false;
  if (commandPalette) commandPalette.classList.remove("open");
  if (commandQuery && document.activeElement === commandQuery) commandQuery.blur();
}

function renderCommandList(query) {
  if (!commandList) return;
  const actions = modality.paletteActions(query);
  commandList.innerHTML = "";
  for (const action of actions) {
    if (action.id === "open_command_palette") continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheet-btn";
    button.dataset.action = action.id;
    button.textContent = action.label;
    if (action.shortcuts && action.shortcuts.length) {
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = action.shortcuts.join(" · ");
      button.appendChild(document.createElement("br"));
      button.appendChild(hint);
    }
    button.addEventListener("click", () => {
      closeCommandPalette();
      invokeAction(action.id, "keyboard").catch((error) => setStatus(error.message));
    });
    commandList.appendChild(button);
  }
}

function openCommandPalette() {
  paletteOpen = true;
  commandPalette.classList.add("open");
  renderCommandList("");
  commandQuery.value = "";
  commandQuery.focus();
}

function renderPhoneSheet() {
  if (!phoneSheetActions) return;
  phoneSheetActions.innerHTML = "";
  for (const action of modality.phoneHomeActions()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheet-btn";
    button.dataset.action = action.id;
    button.textContent = action.label;
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = action.destructive
      ? "Latches stop until Start Assist"
      : "Same terminal result as mouse/keyboard";
    button.appendChild(hint);
    button.addEventListener(
      "pointerup",
      (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        invokeAction(action.id, event.pointerType === "touch" ? "touch" : "sheet").catch((error) =>
          setStatus(error.message)
        );
      },
      { passive: false }
    );
    button.addEventListener("click", () => {
      invokeAction(action.id, "click").catch((error) => setStatus(error.message));
    });
    phoneSheetActions.appendChild(button);
  }
}

async function invokeAction(actionId, source) {
  const outcome = modality.invokeSemantic(actionId, source);
  if (outcome && outcome.deduped) return outcome;
  if (outcome && outcome.result && typeof outcome.result.then === "function") {
    await outcome.result;
  }
  return outcome;
}

function bindSemanticHandlers() {
  modality.registerHandler("start_assist", () => startAssist());
  modality.registerHandler("fill_allowed", () => fillAllowedFields());
  modality.registerHandler("pause_session", () => pauseAssist());
  modality.registerHandler("resume_session", () => resumeAssist());
  modality.registerHandler("undo_last_fill", () => undoLastFill());
  modality.registerHandler("emergency_stop", () => emergencyStop());
  modality.registerHandler("record_confirmation", () => recordConfirmationEvidence());
  modality.registerHandler("save_profile", () => saveProfile());
  modality.registerHandler("clear_profile", () => clearProfile());
  modality.registerHandler("export_profile", () => exportProfile());
  modality.registerHandler("import_profile", () => {
    importFile.click();
  });
  modality.registerHandler("open_command_palette", () => {
    openCommandPalette();
  });
  modality.registerHandler("open_profile_panel", () => {
    closeCommandPalette();
    setProfileOpen(true);
    setStatus("Profile destination open. Text entry is intentional here.");
  });
  modality.registerHandler("dismiss_overlay", () => {
    if (paletteOpen) {
      closeCommandPalette();
      setStatus("Command palette closed. Session state unchanged.");
      return;
    }
    if (document.documentElement.classList.contains("profile-open") && activeMode === "phone") {
      setProfileOpen(false);
      setStatus("Returned to session command sheet. Session state unchanged.");
    }
  });
}

function bindDirectControls() {
  const pairs = [
    ["startAssist", "start_assist"],
    ["fillAllowed", "fill_allowed"],
    ["pause", "pause_session"],
    ["resume", "resume_session"],
    ["undoLast", "undo_last_fill"],
    ["emergencyStop", "emergency_stop"],
    ["recordConfirmation", "record_confirmation"],
    ["openCommands", "open_command_palette"],
    ["save", "save_profile"],
    ["clear", "clear_profile"],
    ["export", "export_profile"]
  ];
  for (const [elementId, actionId] of pairs) {
    const node = document.getElementById(elementId);
    if (!node) continue;
    node.addEventListener("click", () => {
      invokeAction(actionId, "click").catch((error) => setStatus(error.message));
    });
  }
  document.getElementById("import").addEventListener("click", () => {
    invokeAction("import_profile", "click").catch((error) => setStatus(error.message));
  });
  const dismiss = document.getElementById("dismissPalette");
  if (dismiss) {
    dismiss.addEventListener("click", () => {
      invokeAction("dismiss_overlay", "click").catch((error) => setStatus(error.message));
    });
  }
  if (phoneBackToSheet) {
    phoneBackToSheet.addEventListener("click", () => {
      invokeAction("dismiss_overlay", "click").catch((error) => setStatus(error.message));
    });
  }
}

function applyMode() {
  const env = modality.readEnvironment(window);
  activeMode = modality.detectMode(env);
  modality.applyDocumentMode(document, activeMode);
  if (modeChip) modeChip.textContent = `Mode: ${activeMode}`;
  if (activeMode === "phone") {
    setProfileOpen(false);
    renderPhoneSheet();
    if (document.activeElement && modality.isEditableTarget(document.activeElement)) {
      document.activeElement.blur();
    }
  }
}

importFile.addEventListener("change", () => {
  const file = importFile.files && importFile.files[0];
  importProfile(file)
    .catch((error) => setStatus(error.message))
    .finally(() => {
      importFile.value = "";
    });
});

if (commandQuery) {
  commandQuery.addEventListener("input", () => {
    renderCommandList(commandQuery.value);
  });
}

document.addEventListener("keydown", (event) => {
  const actionId = modality.shortcutAction(event);
  if (!actionId) return;
  if (
    actionId === "dismiss_overlay" &&
    !paletteOpen &&
    !(activeMode === "phone" && document.documentElement.classList.contains("profile-open"))
  ) {
    return;
  }
  event.preventDefault();
  invokeAction(actionId, "keyboard").catch((error) => setStatus(error.message));
});

window.matchMedia("(pointer: coarse)").addEventListener("change", applyMode);
window.matchMedia("(max-width: 640px)").addEventListener("change", applyMode);

bindSemanticHandlers();
bindDirectControls();
applyMode();

Promise.all([loadStoredProfile(), loadStoredSession()])
  .then(() => {
    if (activeMode === "phone" && document.activeElement && modality.isEditableTarget(document.activeElement)) {
      document.activeElement.blur();
    }
  })
  .catch((error) => setStatus(error.message));
