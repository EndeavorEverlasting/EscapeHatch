(async function () {
  "use strict";

  const journalApi = globalThis.EscapeHatchEventJournal;
  const evidenceReview = globalThis.EscapeHatchEventEvidenceReview;
  const assist = globalThis.EscapeHatchAssist;
  if (!journalApi || !assist || !evidenceReview?.review ||
      !globalThis.chrome?.storage?.local || !globalThis.crypto?.randomUUID) {
    return { ok: false, reason: "missing_observer_runtime" };
  }
  let saved;
  try {
    saved = await chrome.storage.local.get(journalApi.SESSION_KEY);
  } catch (_error) {
    return { ok: false, state: "review_required", reason: "storage_read_failed" };
  }
  const session = saved[journalApi.SESSION_KEY];
  const old = globalThis.__EscapeHatchApplicationObserver;
  if (old && old.session_id === session?.session_id && typeof old.status === "function") {
    const health = old.status();
    return { ok: health.state === "listening", existing: true, scope: "current_document", ...health };
  }
  if (!session || session.status !== "active" || session.origin !== location.origin ||
      typeof session.session_id !== "string" || !/^assist-[A-Za-z0-9_-]{1,80}$/.test(session.session_id)) {
    return { ok: false, reason: "active_same_origin_assist_session_required" };
  }
  if (old && typeof old.dispose === "function") old.dispose();

  let enabled = true;
  let disposed = false;
  let initialized = false;
  let generation = 0;
  let state = "paused";
  let reason = "initializing";
  let lastPersisted = null;
  let queue = Promise.resolve();
  let lastSnapshot = "";
  let scheduled = null;
  const origin = session.origin;
  const sessionId = session.session_id;
  const previousDocumentId = globalThis.__EscapeHatchApplicationDocumentId;
  const documentId = typeof previousDocumentId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(previousDocumentId) ?
    previousDocumentId : crypto.randomUUID();
  globalThis.__EscapeHatchApplicationDocumentId = documentId;
  const observationId = crypto.randomUUID();

  function status() {
    return Object.freeze({
      session_id: sessionId,
      document_id: documentId,
      observation_id: observationId,
      state,
      reason,
      last_persisted_event_id: lastPersisted ? lastPersisted.event_id : null,
      last_persisted_sequence: lastPersisted ? lastPersisted.sequence : null,
      last_persisted_observed_at: lastPersisted ? lastPersisted.observed_at : null
    });
  }

  function pause(nextReason) {
    enabled = false;
    generation++;
    state = "paused";
    reason = nextReason;
    lastSnapshot = "";
    if (scheduled !== null) clearTimeout(scheduled);
    scheduled = null;
  }

  function terminate(nextState, nextReason) {
    if (disposed) return;
    pause(nextReason);
    disposed = true;
    state = nextState;
    mutations.disconnect();
    document.removeEventListener("change", onChange, true);
    document.removeEventListener("submit", onSubmit, true);
    chrome.storage.onChanged.removeListener(onStorage);
    globalThis.removeEventListener("pagehide", onPageHide);
  }

  function applySession(current) {
    if (disposed) return;
    if (location.origin !== origin) {
      terminate("disconnected", "document_disconnected");
    } else if (!current || current.session_id !== sessionId || current.origin !== origin) {
      terminate("stopped", "session_unavailable");
    } else if (current.status === "stopped") {
      terminate("stopped", "session_stopped");
    } else if (current.status !== "active") {
      pause("session_paused");
    } else {
      enabled = true;
      state = initialized ? "listening" : "paused";
      reason = initialized ? null : "initializing";
      if (initialized) scheduleSnapshot();
    }
  }

  function emit(type, payload) {
    if (!enabled || disposed) return;
    const queuedGeneration = generation;
    queue = queue.then(async function () {
      if (!enabled || disposed || queuedGeneration !== generation) return;
      let stored;
      try {
        stored = await chrome.storage.local.get([journalApi.SESSION_KEY, journalApi.STORAGE_KEY]);
      } catch (_error) {
        if (enabled && queuedGeneration === generation) terminate("review_required", "storage_read_failed");
        return;
      }
      // Pause/Stop/clear/dispose may arrive while the read is pending. Even a
      // subsequent Resume must not revive events queued before that boundary.
      if (!enabled || disposed || queuedGeneration !== generation) return;
      const current = stored[journalApi.SESSION_KEY];
      if (!current || current.session_id !== sessionId ||
          current.status !== "active" || current.origin !== origin || location.origin !== origin) {
        applySession(current);
        return;
      }
      const existing = stored[journalApi.STORAGE_KEY] === undefined ?
        journalApi.emptyJournal() : stored[journalApi.STORAGE_KEY];
      if (evidenceReview.review(existing).state === "REJECTED_INVALID_EVIDENCE") {
        terminate("review_required", "corrupt_journal");
        return;
      }
      if (lastPersisted && !existing.events.some((event) => event.event_id === lastPersisted.event_id)) {
        pause("journal_cleared");
        lastPersisted = null;
        return;
      }
      if (existing.events.length >= journalApi.MAX_EVENTS) {
        terminate("review_required", "event_journal_full");
        return;
      }
      let updated;
      try {
        updated = journalApi.append(existing, { session_id: sessionId, type, payload });
      } catch (_error) {
        terminate("review_required", "corrupt_journal");
        return;
      }
      try {
        await chrome.storage.local.set({ [journalApi.STORAGE_KEY]: updated.journal });
        lastPersisted = updated.event;
      } catch (_error) {
        terminate("review_required", "storage_write_failed");
      }
    }).catch(function () {
      // No page content, error detail, or credential is sent to console/network.
      terminate("review_required", "corrupt_journal");
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
    if (!enabled || disposed) return;
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
    if (!enabled || disposed || scheduled !== null) return;
    scheduled = setTimeout(function () { scheduled = null; if (enabled) snapshot(); }, 350);
  }

  function onStorage(changes, area) {
    if (area !== "local" || disposed) return;
    if (changes[journalApi.SESSION_KEY]) applySession(changes[journalApi.SESSION_KEY].newValue);
    if (disposed) return;
    const change = changes[journalApi.STORAGE_KEY];
    if (change && change.newValue !== undefined &&
        evidenceReview.review(change.newValue).state === "REJECTED_INVALID_EVIDENCE") {
      terminate("review_required", "corrupt_journal");
      return;
    }
    if (change && (change.newValue === undefined ||
        (Array.isArray(change.newValue?.events) && Array.isArray(change.oldValue?.events) &&
        change.newValue.events.length < change.oldValue.events.length))) {
      pause("journal_cleared");
      lastPersisted = null;
    }
  }

  function onPageHide() {
    terminate("disconnected", "document_disconnected");
  }

  const mutations = new MutationObserver(scheduleSnapshot);
  mutations.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("change", onChange, true);
  document.addEventListener("submit", onSubmit, true);
  chrome.storage.onChanged.addListener(onStorage);
  globalThis.addEventListener("pagehide", onPageHide);
  globalThis.__EscapeHatchApplicationObserver = {
    session_id: sessionId,
    status,
    async drain() { await queue; return status(); },
    dispose() { terminate("stopped", "observer_disposed"); }
  };
  emit("observation_started", {});
  snapshot();
  await queue;
  if (!lastPersisted && !disposed) terminate("stopped", "initial_observation_interrupted");
  initialized = true;
  if (enabled && !disposed) {
    state = "listening";
    reason = null;
  }
  const health = status();
  return { ok: health.state === "listening", existing: false, scope: "current_document", ...health };
})();
