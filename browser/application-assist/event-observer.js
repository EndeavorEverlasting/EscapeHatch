(async function () {
  "use strict";

  const journalApi = globalThis.EscapeHatchEventJournal;
  const assist = globalThis.EscapeHatchAssist;
  if (!journalApi || !assist || !chrome?.storage?.local) {
    return { ok: false, reason: "missing_observer_runtime" };
  }
  const saved = await chrome.storage.local.get(journalApi.SESSION_KEY);
  const session = saved[journalApi.SESSION_KEY];
  if (!session || session.status !== "active" || session.origin !== location.origin) {
    return { ok: false, reason: "active_same_origin_assist_session_required" };
  }

  const old = globalThis.__EscapeHatchApplicationObserver;
  if (old && old.session_id === session.session_id) {
    return { ok: true, existing: true, session_id: session.session_id };
  }
  if (old && typeof old.dispose === "function") old.dispose();

  let enabled = true;
  let queue = Promise.resolve();
  let lastSnapshot = "";
  let scheduled = null;
  const origin = session.origin;
  const sessionId = session.session_id;

  function emit(type, payload) {
    if (!enabled) return;
    queue = queue.then(async function () {
      const stored = await chrome.storage.local.get([journalApi.SESSION_KEY, journalApi.STORAGE_KEY]);
      const current = stored[journalApi.SESSION_KEY];
      if (!current || current.session_id !== sessionId ||
          current.status !== "active" || current.origin !== origin || location.origin !== origin) {
        return;
      }
      const existing = stored[journalApi.STORAGE_KEY] || journalApi.emptyJournal();
      const updated = journalApi.append(existing, { session_id: sessionId, type, payload });
      await chrome.storage.local.set({ [journalApi.STORAGE_KEY]: updated.journal });
    }).catch(function () {
      // No page content, error detail, or credential is sent to console/network.
      enabled = false;
    });
  }

  function eligible(element) {
    if (!element || !["INPUT", "SELECT"].includes(element.tagName)) return false;
    const type = String(element.type || "text").toLowerCase();
    if (["password", "hidden", "file", "submit", "reset", "button",
      "checkbox", "radio", "date", "datetime-local"].includes(type)) return false;
    if (element.disabled || element.hidden) return false;
    return true;
  }

  function questionId(element) {
    if (!eligible(element)) return null;
    const labels = element.labels && [...element.labels].map((node) => node.textContent || "").join(" ");
    const key = assist.classifyField({
      tag: element.tagName.toLowerCase(),
      type: element.type || "text",
      autocomplete: element.getAttribute("autocomplete") || "",
      label: labels || "",
      name: element.name || "",
      id: element.id || "",
      placeholder: element.getAttribute("placeholder") || "",
      value: ""
    });
    const id = assist.PROFILE_TO_QUESTION[key];
    return id && journalApi.QUESTION_IDS.has(id) ? id : null;
  }

  function snapshot() {
    const elements = [...document.querySelectorAll("input,select,textarea")];
    let known = 0;
    let unknown = 0;
    let required = 0;
    let invalid = 0;
    let fileControls = 0;
    for (const element of elements) {
      if (String(element.type || "").toLowerCase() === "file") fileControls++;
      if (element.validity && !element.validity.valid) invalid++;
      if (element.required && element.validity && element.validity.valueMissing) required++;
      if (questionId(element)) known++;
      else unknown++;
    }
    const result = {
      form_count: document.forms.length,
      known_field_count: known,
      unknown_field_count: unknown,
      required_unresolved_count: required,
      validation_error_count: invalid,
      file_control_count: fileControls,
      submit_control_count: document.querySelectorAll('button[type="submit"],input[type="submit"]').length
    };
    const digest = JSON.stringify(result);
    if (digest !== lastSnapshot) {
      lastSnapshot = digest;
      emit("page_snapshot", result);
    }
  }

  function onChange(event) {
    if (!enabled) return;
    const node = event.target;
    if (!node || !node.tagName) return;
    if (node.tagName === "INPUT" && String(node.type).toLowerCase() === "file") {
      emit("upload_presence_changed", { present: !!(node.files && node.files.length) });
    } else {
      const id = questionId(node);
      if (id) {
        // Presence only; never save or send the field's contents.
        emit(String(node.value || "").trim() ? "field_completed" : "field_cleared", { question_id: id });
      }
    }
    queueMicrotask(snapshot);
  }

  function onSubmit() {
    // A submit event is only an attempt. Confirmation requires the existing operator gate.
    emit("submit_attempt_observed", {});
  }

  function scheduleSnapshot() {
    if (scheduled !== null) return;
    scheduled = setTimeout(function () { scheduled = null; if (enabled) snapshot(); }, 350);
  }

  function onStorage(changes, area) {
    if (area !== "local" || !changes[journalApi.SESSION_KEY]) return;
    const next = changes[journalApi.SESSION_KEY].newValue;
    enabled = !!next && next.session_id === sessionId &&
      next.origin === origin && next.status === "active" && location.origin === origin;
    if (enabled) scheduleSnapshot();
  }

  const mutations = new MutationObserver(scheduleSnapshot);
  mutations.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("change", onChange, true);
  document.addEventListener("submit", onSubmit, true);
  chrome.storage.onChanged.addListener(onStorage);
  globalThis.__EscapeHatchApplicationObserver = {
    session_id: sessionId,
    dispose() {
      enabled = false;
      mutations.disconnect();
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("submit", onSubmit, true);
      chrome.storage.onChanged.removeListener(onStorage);
      if (scheduled !== null) clearTimeout(scheduled);
    }
  };
  emit("observation_started", {});
  snapshot();
  return { ok: true, existing: false, session_id: sessionId, scope: "current_document" };
})();
