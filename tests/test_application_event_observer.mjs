import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const journal = require("../browser/application-assist/event-journal.js");
const review = require("../browser/application-assist/event-evidence-review.js");
const source = await readFile(new URL("../browser/application-assist/event-observer.js", import.meta.url), "utf8");
const clone = (value) => structuredClone(value);
const tick = () => new Promise((resolve) => setImmediate(resolve));

function harness(options = {}) {
  const session = { session_id: "assist-synthetic_observer", origin: "https://synthetic.invalid", status: "active" };
  const data = { [journal.SESSION_KEY]: session, [journal.STORAGE_KEY]: options.journal ?? journal.emptyJournal() };
  const dom = new Map();
  const windowEvents = new Map();
  const storageListeners = new Set();
  const timers = new Map();
  const mutations = [];
  const writes = [];
  let nextTimer = 0;
  let heldRead = null;
  let holdNext = false;
  let writeFailure = options.writeFailure === true;
  let readFailure = false;
  let holdWrite = false;
  let heldWrite = null;
  function notify(changes) {
    for (const listener of [...storageListeners]) listener(clone(changes), "local");
  }
  const storage = {
    async get(keys) {
      if (readFailure) throw new Error("synthetic-private-error");
      const result = Object.fromEntries((Array.isArray(keys) ? keys : [keys])
        .filter((key) => Object.hasOwn(data, key)).map((key) => [key, clone(data[key])]));
      if (holdNext && Array.isArray(keys)) {
        holdNext = false;
        return new Promise((resolve) => { heldRead = () => resolve(result); });
      }
      return result;
    },
    async set(values) {
      if (writeFailure) throw new Error("synthetic-private-error");
      if (holdWrite) {
        holdWrite = false;
        await new Promise((resolve) => { heldWrite = resolve; });
      }
      const changes = {};
      for (const [key, value] of Object.entries(values)) {
        changes[key] = { oldValue: data[key], newValue: clone(value) };
        data[key] = clone(value);
      }
      writes.push(clone(values));
      notify(changes);
    }
  };
  const context = vm.createContext({
    EscapeHatchEventJournal: journal, EscapeHatchEventEvidenceReview: review,
    EscapeHatchAssist: { PROFILE_TO_QUESTION: {}, classifyField: () => null },
    chrome: { storage: { local: storage, onChanged: {
      addListener: (listener) => storageListeners.add(listener),
      removeListener: (listener) => storageListeners.delete(listener)
    } } },
    crypto: { randomUUID }, location: { origin: session.origin },
    document: {
      forms: [], documentElement: {}, querySelectorAll: () => [],
      addEventListener: (type, listener) => dom.set(type, listener),
      removeEventListener: (type, listener) => { if (dom.get(type) === listener) dom.delete(type); }
    },
    addEventListener: (type, listener) => windowEvents.set(type, listener),
    removeEventListener: (type, listener) => { if (windowEvents.get(type) === listener) windowEvents.delete(type); },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.connected = false; mutations.push(this); }
      observe() { this.connected = true; }
      disconnect() { this.connected = false; }
    },
    setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: (id) => timers.delete(id), queueMicrotask
  });
  return {
    context, data, writes, dom, storageListeners, mutations, windowEvents,
    inject: () => vm.runInContext(source, context),
    observer: () => context.__EscapeHatchApplicationObserver,
    submit: () => dom.get("submit")?.({}),
    session(status, sessionId = session.session_id) {
      const oldValue = clone(data[journal.SESSION_KEY]);
      data[journal.SESSION_KEY] = { ...oldValue, status, session_id: sessionId };
      notify({ [journal.SESSION_KEY]: { oldValue, newValue: data[journal.SESSION_KEY] } });
    },
    clear() {
      const oldValue = data[journal.STORAGE_KEY];
      delete data[journal.STORAGE_KEY];
      notify({ [journal.STORAGE_KEY]: { oldValue } });
    },
    replaceJournal(value) {
      const oldValue = data[journal.STORAGE_KEY];
      data[journal.STORAGE_KEY] = clone(value);
      notify({ [journal.STORAGE_KEY]: { oldValue, newValue: value } });
    },
    holdRead() { holdNext = true; },
    releaseRead() { assert.ok(heldRead, "queued storage read reached"); heldRead(); heldRead = null; },
    holdWrite() { holdWrite = true; },
    releaseWrite() { assert.ok(heldWrite, "initial storage write reached"); heldWrite(); heldWrite = null; },
    failWrites(value) { writeFailure = value; },
    failReads(value) { readFailure = value; },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback()); }
  };
}

test("injection awaits persistence and exposes only metadata receipts", async () => {
  const h = harness();
  h.holdWrite();
  let settled = false;
  const injection = h.inject().then((result) => { settled = true; return result; });
  await tick();
  assert.equal(settled, false, "installation alone is not a persisted receipt");
  h.releaseWrite();
  const result = await injection;
  assert.equal(result.ok, true);
  assert.equal(result.state, "listening");
  assert.equal(h.writes.length, 2);
  const status = h.observer().status();
  assert.deepEqual(Object.keys(status).sort(), ["session_id", "document_id", "observation_id", "state", "reason",
    "last_persisted_event_id", "last_persisted_sequence", "last_persisted_observed_at"].sort());
  for (const key of ["document_id", "observation_id"]) {
    assert.match(status[key], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(result[key], status[key]);
  }
  const last = h.data[journal.STORAGE_KEY].events.at(-1);
  assert.equal(status.last_persisted_event_id, last.event_id);
  assert.equal(status.last_persisted_sequence, last.sequence);
  assert.equal(status.last_persisted_observed_at, last.observed_at);
  const duplicate = await h.inject();
  assert.equal(duplicate.existing, true);
  assert.equal(duplicate.observation_id, result.observation_id);
  assert.equal(h.writes.length, 2);
});

for (const action of ["pause", "pause_resume", "stop", "dispose", "clear", "pagehide"]) {
  test(`pending storage read cannot append after ${action}`, async () => {
    const h = harness();
    await h.inject();
    const before = h.writes.length;
    h.holdRead();
    h.submit();
    h.submit();
    await tick();
    if (action === "pause" || action === "pause_resume") h.session("paused");
    if (action === "pause_resume") h.session("active");
    if (action === "stop") h.session("stopped");
    if (action === "dispose") h.observer().dispose();
    if (action === "clear") h.clear();
    if (action === "pagehide") h.windowEvents.get("pagehide")?.({});
    h.releaseRead();
    await tick();
    assert.equal(h.writes.length, before, "stale queued events must not persist");
    const expected = { pause: "paused", pause_resume: "listening", stop: "stopped",
      dispose: "stopped", clear: "paused", pagehide: "disconnected" }[action];
    assert.equal(h.observer().status().state, expected);
    if (["stop", "dispose", "pagehide"].includes(action)) {
      assert.equal(h.dom.size, 0);
      assert.equal(h.storageListeners.size, 0);
      assert.equal(h.windowEvents.size, 0);
      assert.equal(h.mutations[0].connected, false);
      h.session("active");
      const duplicate = await h.inject();
      assert.equal(duplicate.ok, false);
      assert.equal(duplicate.state, expected);
      assert.equal(h.writes.length, before);
    }
    if (action === "clear") {
      assert.equal(h.data[journal.STORAGE_KEY], undefined);
      assert.equal(h.observer().status().last_persisted_event_id, null);
    }
  });
}

test("pause resumes only fresh events", async () => {
  const h = harness();
  await h.inject();
  h.session("paused");
  assert.equal((await h.inject()).ok, false);
  h.submit();
  await tick();
  assert.equal(h.writes.length, 2);
  h.session("active");
  h.submit();
  await tick();
  assert.equal(h.writes.length, 3);
  assert.equal(h.data[journal.STORAGE_KEY].events.at(-1).type, "submit_attempt_observed");
});

for (const malformed of [null, { schema: "broken", events: [] },
  { ...journal.emptyJournal(), private_answer: "synthetic-private-sentinel" }]) {
  test(`stored corruption immediately disconnects capture: ${malformed === null ? "null" : malformed.schema}`, async () => {
    const h = harness();
    await h.inject();
    const count = h.writes.length;
    h.replaceJournal(malformed);
    assert.equal(h.observer().status().state, "review_required");
    assert.equal(h.observer().status().reason, "corrupt_journal");
    h.session("active");
    h.submit();
    await tick();
    assert.equal(h.writes.length, count);
    assert.deepEqual(h.data[journal.STORAGE_KEY], malformed);
  });
}

for (const failure of ["write", "read", "capacity", "corrupt", "null"]) {
  test(`${failure} failure is truthful and cannot be revived by storage changes`, async () => {
    let existing = journal.emptyJournal();
    if (failure === "capacity") {
      for (let i = 0; i < journal.MAX_EVENTS; i++) {
        existing = journal.append(existing, {
          session_id: "assist-synthetic_observer", type: "observation_started"
        }).journal;
      }
    }
    if (failure === "corrupt") {
      existing = journal.append(existing, {
        session_id: "assist-synthetic_observer", type: "observation_started"
      }).journal;
      existing.events[0].payload.answer = "synthetic-private-sentinel";
    }
    const h = harness({ journal: existing, writeFailure: failure === "write" });
    if (failure === "null") h.data[journal.STORAGE_KEY] = null;
    if (failure === "read") h.holdWrite();
    const injection = h.inject();
    if (failure === "read") {
      await tick();
      h.failReads(true);
      h.releaseWrite();
    }
    const result = await injection;
    assert.equal(result.ok, false);
    assert.equal(result.state, "review_required");
    assert.equal(result.reason, { write: "storage_write_failed", read: "storage_read_failed",
      capacity: "event_journal_full", corrupt: "corrupt_journal", null: "corrupt_journal" }[failure]);
    assert.equal(JSON.stringify(result).includes("synthetic-private"), false);
    if (failure !== "read") assert.equal(h.writes.length, 0);
    const before = h.writes.length;
    h.failWrites(false);
    h.failReads(false);
    h.session("paused");
    h.session("active");
    h.submit();
    h.flushTimers();
    await tick();
    assert.equal(h.writes.length, before);
    const duplicate = await h.inject();
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.existing, true);
    assert.equal(duplicate.reason, result.reason);
    assert.equal(duplicate.state, "review_required");
    assert.equal(h.dom.size, 0);
    assert.equal(h.storageListeners.size, 0);
  });
}

test("review owner is required before installation", async () => {
  const h = harness();
  delete h.context.EscapeHatchEventEvidenceReview;
  const result = await h.inject();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_observer_runtime");
  assert.equal(h.writes.length, 0);
  assert.equal(h.dom.size, 0);
});

test("missing journal after persistence is a clear, even before storage notification", async () => {
  const h = harness();
  await h.inject();
  delete h.data[journal.STORAGE_KEY];
  h.submit();
  await tick();
  assert.equal(h.writes.length, 2);
  assert.equal(h.data[journal.STORAGE_KEY], undefined);
  assert.equal(h.observer().status().state, "paused");
  assert.equal(h.observer().status().reason, "journal_cleared");
});

test("later storage failure retains only the last persisted receipt", async () => {
  const h = harness();
  await h.inject();
  const before = h.observer().status();
  h.failWrites(true);
  h.submit();
  await tick();
  const after = h.observer().status();
  assert.equal(after.state, "review_required");
  assert.equal(after.reason, "storage_write_failed");
  assert.equal(after.last_persisted_event_id, before.last_persisted_event_id);
  assert.equal(after.last_persisted_sequence, before.last_persisted_sequence);
  assert.equal(h.writes.length, 2);
  h.failWrites(false);
  h.session("active");
  assert.equal((await h.inject()).ok, false);
});

test("new explicit session gets a new observation UUID but the same document UUID", async () => {
  const h = harness();
  const first = await h.inject();
  h.session("active", "assist-synthetic_replacement");
  const second = await h.inject();
  assert.equal(second.ok, true);
  assert.equal(second.document_id, first.document_id);
  assert.notEqual(second.observation_id, first.observation_id);
  assert.equal(h.dom.size, 2);
  assert.equal(h.storageListeners.size, 1);
  assert.equal(h.mutations[0].connected, false);
  assert.equal(h.data[journal.STORAGE_KEY].events.at(-1).sequence, 2);
});

test("initial session read failure returns a fixed error and installs nothing", async () => {
  const h = harness();
  h.failReads(true);
  const result = await h.inject();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "storage_read_failed");
  assert.equal(h.observer(), undefined);
  assert.equal(h.writes.length, 0);
});

test("pause/resume during initialization cannot report success without a persisted event", async () => {
  const h = harness();
  h.holdRead();
  const injection = h.inject();
  await tick();
  h.session("paused");
  h.session("active");
  h.releaseRead();
  const result = await injection;
  assert.equal(result.ok, false);
  assert.equal(result.state, "stopped");
  assert.equal(result.reason, "initial_observation_interrupted");
  assert.equal(result.last_persisted_event_id, null);
  assert.equal(h.writes.length, 0);
});

test("drain waits for an already dispatched write before control acknowledgment", async () => {
  const h = harness();
  await h.inject();
  h.holdWrite();
  h.submit();
  await tick();
  h.session("paused");
  let acknowledged = false;
  const drained = h.observer().drain().then(() => { acknowledged = true; });
  await tick();
  assert.equal(acknowledged, false, "Pause/Clear acknowledgment must wait for in-flight storage");
  h.releaseWrite();
  await drained;
  const count = h.writes.length;
  h.clear();
  h.submit();
  await tick();
  assert.equal(h.writes.length, count);
  assert.equal(h.data[journal.STORAGE_KEY], undefined);
});