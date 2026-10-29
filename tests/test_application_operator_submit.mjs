import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const api = require('../browser/application-assist/submission-observer.js');
const manifest = JSON.parse(fs.readFileSync(new URL('../browser/application-assist/manifest.json', import.meta.url)));
assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage', 'nativeMessaging']);
assert.equal(manifest.host_permissions, undefined);
assert.equal(api.binding('https://jobs.ashbyhq.com/acme/job/application?secret=x').path, '/acme/job/application');
assert.equal(api.binding('https://example.org/acme/job/application'), null);
const armed = { origin: 'https://jobs.ashbyhq.com', path: '/acme/job/application', sessionId: 'session', state: 'ARMED', armedAt: 100 };
const event = { origin: armed.origin, path: armed.path, kind: 'scan', success: true };
assert.equal(api.reduce(armed, event, 101, 'a').state, 'ARMED', 'preexisting receipt is not success');
assert.equal(api.reduce(armed, { ...event, kind: 'attempt', trusted: false }, 101, 'a').state, 'ARMED');
const pending = api.reduce(armed, { ...event, kind: 'attempt', trusted: true }, 101, 'a');
assert.equal(pending.state, 'PENDING');
assert.equal(api.reduce(pending, { ...event, invalid: true }, 102).state, 'VALIDATION_FAILED');
assert.equal(api.reduce(pending, { ...event, path: '/other' }, 102).state, 'BLOCKED');
assert.equal(api.reduce(pending, event, 100 + 31 * 60000).state, 'BLOCKED');
const confirmed = api.reduce(pending, event, 102);
assert.equal(confirmed.state, 'CONFIRMED');
assert.equal(confirmed.receipt.attemptId, 'a');
assert.equal(confirmed.receipt.source, 'same_session_page_confirmation');
assert.equal(api.reduce(confirmed, event, 103), confirmed, 'receipt is immutable');

// Exercise the real service-worker wiring with asynchronous Chrome API doubles.
const hooks = {}, store = { 'escapeHatch.applicationAssistSession.v1': { status: 'active', origin: armed.origin } };
let injections = 0;
let tab = { id: 12, url: armed.origin + armed.path };
let baseline = { terminalCount: 1, enabled: true, success: false };
const listener = name => {
  const callbacks = hooks[name] ||= new Set();
  return { addListener(callback) { callbacks.add(callback); }, removeListener(callback) { callbacks.delete(callback); }, hasListener(callback) { return callbacks.has(callback); } };
};
const emit = (name, ...args) => { for (const callback of hooks[name] || []) callback(...args); };
let nativeRequests = 0, storageAccessLevel;
const chrome = {
  runtime: { id: 'extension', getURL: p => 'chrome-extension://extension/' + p,
    onMessage: listener('message'), onMessageExternal: listener('external'),
    onStartup: listener('startup'), onInstalled: listener('installed'),
    sendNativeMessage(_host, _request, callback) { nativeRequests++; callback({ ok: false, reason: 'SYNTHETIC_NATIVE_HOST_UNAVAILABLE' }); } },
  tabs: { query: async () => [tab], onUpdated: listener('updated'), onRemoved: listener('removed') },
  storage: { local: {
    get: async keys => {
      const selected = keys === null || keys === undefined ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(selected.filter(key => Object.hasOwn(store,key)).map(key => [key, structuredClone(store[key])]));
    },
    set: async value => Object.assign(store, structuredClone(value)),
    remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key]; },
    setAccessLevel: async options => { storageAccessLevel = options.accessLevel; }
  }, onChanged: listener('storage') },
  scripting: { executeScript: async () => { injections++; return [{ result: baseline }]; } }
};
const context = vm.createContext({ chrome, crypto: { randomUUID }, URL, Date, console, setTimeout, clearTimeout });
context.importScripts = (...scripts) => {
  for (const script of scripts) {
    assert.ok(['submission-observer.js','assist-core.js','native-profile-bridge.js'].includes(script), 'worker imports only reviewed packaged modules');
    vm.runInContext(fs.readFileSync(new URL('../browser/application-assist/' + script, import.meta.url), 'utf8'), context, { filename: script });
  }
};
vm.runInContext(fs.readFileSync(new URL('../browser/application-assist/worker.js', import.meta.url), 'utf8'), context, { filename: 'worker.js' });
assert.equal(storageAccessLevel, 'TRUSTED_CONTEXTS');
assert.equal(hooks.message.size, 2, 'submission and native handlers coexist');
assert.ok(hooks.startup.size >= 2, 'restart listeners coexist');
const popup = { id: 'extension', url: chrome.runtime.getURL('popup.html') };
const send = (message, sender = popup) => new Promise((resolve, reject) => {
  let answered = false, pending = false;
  const respond = value => { if (!answered) { answered = true; resolve(value); } };
  try {
    // Chrome delivers each event to every listener; the first response wins.
    for (const callback of hooks.message) if (callback(message,sender,respond) === true) pending = true;
    if (!answered && !pending) resolve(undefined);
  } catch (error) { reject(error); }
});
assert.equal((await send({ type: 'submission-arm' }, { id: 'extension', url: 'https://evil.test' })).ok, false);
assert.equal((await send({ type: 'submission-arm' })).ok, true);
let current = (await send({ type: 'submission-status' })).observation;
assert.equal(current.state, 'ARMED');
const pageSender = { id: 'extension', frameId: 0, tab, url: tab.url };
await send({ ...event, type: 'submission-observation', sessionId: 'wrong', kind: 'attempt', trusted: true }, pageSender);
assert.equal(store[api.KEY].state, 'ARMED', 'old observer cannot advance session');
await send({ ...event, type: 'submission-observation', sessionId: current.sessionId, kind: 'attempt', trusted: true }, pageSender);
assert.equal(store[api.KEY].state, 'PENDING');
emit('updated', tab.id, { status: 'complete' }, tab);
await send({ type: 'submission-status' });
assert.equal(injections, 2, 'full same-path navigation reinjects without broad permissions');
await send({ ...event, type: 'submission-observation', sessionId: current.sessionId }, { ...pageSender, frameId: 1 });
assert.equal(store[api.KEY].state, 'PENDING', 'child-frame claims ignored');
await send({ ...event, type: 'submission-observation', sessionId: current.sessionId }, pageSender);
assert.equal(store[api.KEY].state, 'CONFIRMED');
assert.equal(store[api.KEY].receipt.applicationPath, armed.path);
baseline = { terminalCount: 1, enabled: true, success: true };
assert.equal((await send({ type: 'submission-arm' })).ok, false);
assert.equal(store[api.KEY].state, 'DISARMED', 'failed rearm cannot leave stale armed state');
baseline.success = false;
await send({ type: 'submission-arm' });
emit('updated', tab.id, { url: 'https://other.test/' }, { ...tab, url: 'https://other.test/' });
await send({ type: 'submission-status' });
assert.equal(store[api.KEY].state, 'BLOCKED');
await send({ type: 'submission-arm' });
emit('startup'); await send({ type: 'submission-status' });
assert.equal(store[api.KEY].state, 'BLOCKED', 'persisted state cannot claim a live listener after browser restart');
await send({ type: 'submission-arm' });
emit('storage', { 'escapeHatch.applicationAssistSession.v1': { newValue: { status: 'paused', origin: armed.origin } } }, 'local');
await send({ type: 'submission-status' });
assert.equal(store[api.KEY].state, 'DISARMED');
assert.equal(nativeRequests, 0, 'submission observation never invokes private native projection');
const observerSource = fs.readFileSync(new URL('../browser/application-assist/submission-observer.js', import.meta.url), 'utf8');
for (const forbidden of ['.click(', '.submit(', '.requestSubmit(', 'fetch(', 'XMLHttpRequest']) assert.equal(observerSource.includes(forbidden), false);
console.log('PASS: extension observation policy, stale/forged events, navigation, restart, pause, receipt; operator proxy deliberately unavailable');
