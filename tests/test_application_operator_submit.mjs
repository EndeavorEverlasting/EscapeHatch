import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const api = require('../browser/application-assist/submission-observer.js');
const manifest = JSON.parse(fs.readFileSync(new URL('../browser/application-assist/manifest.json', import.meta.url)));
assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
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
const listener = name => ({ addListener(callback) { hooks[name] = callback; } });
const chrome = {
  runtime: { id: 'extension', getURL: p => 'chrome-extension://extension/' + p,
    onMessage: listener('message'), onStartup: listener('startup') },
  tabs: { query: async () => [tab], onUpdated: listener('updated'), onRemoved: listener('removed') },
  storage: { local: { get: async key => ({ [key]: structuredClone(store[key]) }), set: async value => Object.assign(store, structuredClone(value)) }, onChanged: listener('storage') },
  scripting: { executeScript: async () => { injections++; return [{ result: baseline }]; } }
};
vm.runInNewContext(fs.readFileSync(new URL('../browser/application-assist/worker.js', import.meta.url), 'utf8'),
  { chrome, EscapeHatchSubmission: api, importScripts() {}, crypto: { randomUUID }, URL, Date, console });
const popup = { id: 'extension', url: chrome.runtime.getURL('popup.html') };
const send = (message, sender = popup) => new Promise(resolve => hooks.message(message, sender, resolve));
assert.equal((await send({ type: 'submission-arm' }, { id: 'extension', url: 'https://evil.test' })).ok, false);
assert.equal((await send({ type: 'submission-arm' })).ok, true);
let current = (await send({ type: 'submission-status' })).observation;
assert.equal(current.state, 'ARMED');
const pageSender = { id: 'extension', frameId: 0, tab, url: tab.url };
await send({ ...event, type: 'submission-observation', sessionId: 'wrong', kind: 'attempt', trusted: true }, pageSender);
assert.equal(store[api.KEY].state, 'ARMED', 'old observer cannot advance session');
await send({ ...event, type: 'submission-observation', sessionId: current.sessionId, kind: 'attempt', trusted: true }, pageSender);
assert.equal(store[api.KEY].state, 'PENDING');
hooks.updated(tab.id, { status: 'complete' }, tab);
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
hooks.updated(tab.id, { url: 'https://other.test/' }, { ...tab, url: 'https://other.test/' });
await send({ type: 'submission-status' });
assert.equal(store[api.KEY].state, 'BLOCKED');
await send({ type: 'submission-arm' });
hooks.startup(); await send({ type: 'submission-status' });
assert.equal(store[api.KEY].state, 'BLOCKED', 'persisted state cannot claim a live listener after browser restart');
await send({ type: 'submission-arm' });
hooks.storage({ 'escapeHatch.applicationAssistSession.v1': { newValue: { status: 'paused', origin: armed.origin } } }, 'local');
await send({ type: 'submission-status' });
assert.equal(store[api.KEY].state, 'DISARMED');
const observerSource = fs.readFileSync(new URL('../browser/application-assist/submission-observer.js', import.meta.url), 'utf8');
for (const forbidden of ['.click(', '.submit(', '.requestSubmit(', 'fetch(', 'XMLHttpRequest']) assert.equal(observerSource.includes(forbidden), false);
console.log('PASS: extension observation policy, stale/forged events, navigation, restart, pause, receipt; operator proxy deliberately unavailable');
