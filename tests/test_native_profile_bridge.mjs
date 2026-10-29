import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const bridge = require('../browser/application-assist/native-profile-bridge.js');
const api = require('../browser/application-assist/assist-core.js');
const ids = { ownerId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222', installationId: '33333333-3333-4333-8333-333333333333' };
const browser = '44444444-4444-4444-8444-444444444444';
const revisions = { workspaceRevision: 'a'.repeat(64), preferenceRevision: 'b'.repeat(64), profileRevision: 'c'.repeat(64) };
const projection = { ok: true, status: 'PROJECTED', ...ids, ...revisions, profile: { first_name: 'Synthetic', email: 'fixture@example.test', phone_authority: 'unconfirmed' }, answers: [{ id: 'work.remote', label: 'Work preference', value: 'Remote' }] };
const sortedDictionaries = value => Array.isArray(value) ? value.map(sortedDictionaries) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedDictionaries(value[key])])) : value;
function fixture(initial = {}, responder = () => projection, sortedRoundtrip = false) {
  const clone = value => sortedRoundtrip ? sortedDictionaries(structuredClone(value)) : structuredClone(value);
  const data = clone(initial), calls = [];
  const storage = { async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => Object.hasOwn(data,k)).map(k => [k, clone(data[k])])); }, async set(values) { Object.assign(data, clone(values)); }, async remove(keys) { for (const k of keys) delete data[k]; } };
  const native = async (host, request) => { calls.push({ host, request }); return responder(request, data); };
  return { data, calls, storage, app: bridge.create({ storage, native, api, randomUUID: () => browser }) };
}
const paired = { [bridge.SYNC]: { ...ids, paired: true } };
assert.equal(bridge.cleanProfile({ phone: '555-0100' }).phone_authority, 'unconfirmed');
{
  const f = fixture();
  assert.equal((await f.app.refresh()).status, 'NOT_PAIRED'); assert.equal(f.calls.length, 0);
  await f.app.review(); await f.app.review();
  assert.equal(f.data[bridge.BROWSER], browser);
  assert.ok(f.calls.every(c => c.host === 'com.escapehatch.profile' && c.request.browserProfileId === browser && c.request.protocol === 1));
}
{
  const f = fixture(paired); const result = await f.app.refresh();
  assert.deepEqual(result, { status: 'PROJECTED', profileFieldCount: 2, answerCount: 1 });
  assert.equal(f.data[bridge.PROFILE].first_name, 'Synthetic');
  assert.equal(f.data[bridge.ANSWERS][0].value, 'Remote');
  assert.equal(f.data[api.PREFERENCE_STORAGE_KEY].preferences['identity.email'].value, 'fixture@example.test');
  assert.equal(f.data[api.PREFERENCE_STORAGE_KEY].preferences['work.remote'], undefined);
  await f.app.refresh(); assert.equal(f.calls.length, 4);
}
for (const changed of [
  { ...projection, ownerId: '55555555-5555-4555-8555-555555555555' },
  { ...projection, workspaceRevision: 'invalid' },
  { ok: false, reason: 'PROFILE_REVISION_MISMATCH' },
  { ...projection, answers: [{ id: 'x', value: 12 }] }
]) {
  const f = fixture(paired, () => changed); const before = JSON.stringify(f.data[bridge.PROFILE]);
  await assert.rejects(() => f.app.refresh()); assert.equal(JSON.stringify(f.data[bridge.PROFILE]), before);
}
{
  const f = fixture({ ...paired, [bridge.PROFILE]: { first_name: 'Local edit' } });
  await assert.rejects(() => f.app.refresh(), /EXISTING_PROFILE_REVIEW_REQUIRED/);
  assert.equal(f.data[bridge.PROFILE].first_name, 'Local edit');
}
{
  const f = fixture({ ...paired, [bridge.LEGACY]: { email: 'legacy@example.test' } });
  await assert.rejects(() => f.app.refresh(), /EXISTING_PROFILE_REVIEW_REQUIRED/);
  assert.equal(f.data[bridge.LEGACY].email, 'legacy@example.test');
}
{
  const f = fixture(paired, (_request, data) => { data[bridge.PROFILE] = { first_name: 'Concurrent edit' }; return projection; });
  await assert.rejects(() => f.app.refresh(), /LOCAL_PROFILE_CHANGED/);
  assert.equal(f.data[bridge.PROFILE].first_name, 'Concurrent edit');
}
{
  const f = fixture(paired); await f.app.refresh(); await f.app.edit('clear');
  assert.equal((await f.app.refresh()).status, 'PAUSED');
  assert.equal(f.data[bridge.PROFILE], undefined); assert.equal(f.data[bridge.ANSWERS], undefined);
  assert.equal(f.data[api.PREFERENCE_STORAGE_KEY].preferences['identity.email'], undefined);
}
{
  const f = fixture({}, request => request.action === 'confirm' ? { ok: true, status: 'READY', ...ids } : projection);
  await f.app.confirm({ ...revisions, expectedWorkspaceRevision: revisions.workspaceRevision, expectedPreferenceRevision: revisions.preferenceRevision, approvedFields: ['first_name'], approvedAnswerIds: ['work.remote'] });
  assert.equal(f.calls[0].request.action, 'confirm'); assert.equal(f.calls[1].request.action, 'project');
  assert.equal(f.data[bridge.SYNC].paired, true);
}
{
  const scoped = { scope: 'session_confirmation', value: 'fixture@example.test' };
  const f = fixture({ ...paired, [api.PREFERENCE_STORAGE_KEY]: { preferences: { 'identity.email': scoped } } });
  await f.app.refresh();
  assert.deepEqual(f.data[api.PREFERENCE_STORAGE_KEY].preferences['identity.email'], scoped);
}
{
  const f = fixture({ ...paired, [api.PREFERENCE_STORAGE_KEY]: { preferences: { 'identity.email': { scope: 'profile_preference', value: 'other@example.test' } } } });
  await assert.rejects(() => f.app.refresh(), /EXISTING_PREFERENCE_REVIEW_REQUIRED/);
  assert.equal(f.data[bridge.PROFILE], undefined);
}
{
  let call = 0;
  const f = fixture(paired, () => ++call === 1 ? projection : { ok: false, reason: 'REAPPROVAL_REQUIRED' });
  await assert.rejects(() => f.app.refresh(), /REAPPROVAL_REQUIRED/);
  assert.equal(f.data[bridge.PROFILE], undefined);
  assert.equal(f.data[bridge.ANSWERS], undefined);
  assert.equal(f.data[api.PREFERENCE_STORAGE_KEY], undefined);
  assert.equal(f.data[bridge.SYNC].status, 'BLOCKED');
  assert.equal(f.calls[1].request.expectedWorkspaceRevision, projection.workspaceRevision);
  assert.equal(f.calls[1].request.existingAnswers['work.remote'], 'Remote');
}
{
  let call = 0;
  const f = fixture(paired, () => ++call === 1 ? projection : { ...projection, workspaceRevision: 'd'.repeat(64) });
  await assert.rejects(() => f.app.refresh(), /SOURCE_VERIFICATION_FAILED/);
  assert.equal(f.data[bridge.PROFILE], undefined);
  assert.equal(f.data[bridge.SYNC].status, 'BLOCKED');
}
{
  let call = 0;
  const f = fixture(paired, (_request, data) => {
    if (++call === 2) data[bridge.PROFILE] = { first_name: 'New local edit during final verification' };
    return projection;
  });
  await assert.rejects(() => f.app.refresh(), /LOCAL_PROFILE_CHANGED/);
  assert.equal(f.data[bridge.PROFILE].first_name, 'New local edit during final verification');
  assert.equal(f.data[bridge.SYNC].status, 'BLOCKED');
}
{
  const f = fixture(paired);
  const set = f.storage.set;
  f.storage.set = async values => {
    await set(values);
    if (values[bridge.SYNC]?.status === 'PROJECTED') f.data[bridge.PROFILE] = { first_name: 'Edited during final readback' };
  };
  await assert.rejects(() => f.app.refresh(), /STORAGE_READBACK_FAILED/);
  assert.equal(f.data[bridge.PROFILE].first_name, 'Edited during final readback');
  assert.equal(f.data[bridge.SYNC].status, 'BLOCKED');
}
{
  const f = fixture(paired);
  const set = f.storage.set;
  f.storage.set = async values => {
    if (values[bridge.SYNC]?.status === 'PROJECTED') throw new Error('Simulated final metadata write failure');
    await set(values);
  };
  await assert.rejects(() => f.app.refresh(), /Simulated final metadata write failure/);
  assert.equal(f.data[bridge.PROFILE], undefined);
  assert.equal(f.data[bridge.SYNC].status, 'BLOCKED');
}
{
  // Match real Chrome storage, which may return dictionaries in a different
  // key order from the values supplied to storage.local.set.
  const f = fixture(paired, () => projection, true);
  assert.equal((await f.app.refresh()).status, 'PROJECTED');
  assert.equal(f.data[bridge.PROFILE].first_name, 'Synthetic');
  assert.equal(f.data[bridge.SYNC].status, 'PROJECTED');
  assert.equal(f.calls.length, 2);
  assert.equal((await f.app.refresh()).status, 'PROJECTED');
}
{
  const f = fixture({ ...paired, [bridge.PROFILE]: { phone_authority: 'unconfirmed', first_name: 'Actual conflict' } }, () => projection, true);
  await assert.rejects(() => f.app.refresh(), /EXISTING_PROFILE_REVIEW_REQUIRED/);
  assert.equal(f.data[bridge.PROFILE].first_name, 'Actual conflict');
}
{
  let call = 0;
  const ordered = { ...projection, answers: [...projection.answers, { id: 'education.field', label: 'Field', value: 'Synthetic' }] };
  const f = fixture(paired, () => ++call === 1 ? ordered : { ...ordered, answers: [...ordered.answers].reverse() }, true);
  await assert.rejects(() => f.app.refresh(), /SOURCE_VERIFICATION_FAILED/);
  assert.equal(f.data[bridge.PROFILE], undefined);
}
// Worker boundary: webpage wake responses contain counts only; page/internal
// messages cannot impersonate the popup or supply profile fields.
{
  const listeners = {}, registrations = name => ({ addListener(fn) { (listeners[name] ||= []).push(fn); } });
  const native = { async review() { return { status: 'REVIEW_REQUIRED' }; }, async refresh() { return { status: 'PROJECTED', profileFieldCount: 2, answerCount: 1, profile: { first_name: 'Must not leak' }, answers: ['Must not leak'] }; } };
  const chrome = { runtime: { id: 'fixture-extension', getURL: path => 'chrome-extension://fixture-extension/' + path, onMessage: registrations('message'), onMessageExternal: registrations('external'), onStartup: registrations('startup'), onInstalled: registrations('installed') }, storage: { local: {}, onChanged: registrations('changed') }, tabs: { onUpdated: registrations('updated'), onRemoved: registrations('removed') } };
  const context = { chrome, console, URL, setTimeout, clearTimeout, globalThis: { EscapeHatchSubmission: {}, EscapeHatchNativeProfile: { create: () => native } }, importScripts() {} };
  const workerSource = fs.readFileSync(new URL('../browser/application-assist/worker.js', import.meta.url),'utf8');
  assert.ok(workerSource.includes("accessLevel: 'TRUSTED_CONTEXTS'"));
  vm.runInNewContext(workerSource, context);
  const external = listeners.external[0];
  const send = (message,sender) => new Promise(resolve => external(message,sender,resolve));
  const sender = { url: 'http://127.0.0.1:21031/', frameId: 0, tab: { id: 1 } };
  assert.deepEqual(JSON.parse(JSON.stringify(await send({ type: 'workspace-refresh' },sender))), { ok: true, status: 'PROJECTED', profileFieldCount: 2, answerCount: 1 });
  for (const bad of [{ ...sender, url: 'https://example.test/' }, { ...sender, frameId: 1 }, { ...sender, id: 'other-extension' }]) assert.equal((await send({ type: 'workspace-refresh' },bad)).ok,false);
  assert.equal((await send({ type: 'workspace-refresh', profile: {} },sender)).ok,false);
  const internal = listeners.message[1];
  const denied = await new Promise(resolve => internal({ type: 'workspace-confirm' }, { id: chrome.runtime.id, tab: { id: 1 }, url: 'https://example.test/' },resolve));
  assert.equal(denied.reason, 'POPUP_REQUIRED');
  const popupUrl = chrome.runtime.getURL('popup.html');
  const ownModule = { id: chrome.runtime.id, url: popupUrl, frameId: 0, tab: { id: 2, url: popupUrl } };
  const internalSend = sender => new Promise(resolve => internal({ type: 'workspace-review' },sender,resolve));
  assert.equal((await internalSend(ownModule)).ok, true);
  assert.equal((await internalSend({ id: chrome.runtime.id, url: popupUrl })).ok, true);
  for (const bad of [
    { ...ownModule, frameId: 1 },
    { ...ownModule, tab: { id: 2, url: 'https://employer.example.test/' } },
    { ...ownModule, url: 'https://employer.example.test/' },
    { ...ownModule, id: 'another-extension' }
  ]) assert.equal((await internalSend(bad)).reason, 'POPUP_REQUIRED');
}
console.log('NATIVE_PROFILE_BRIDGE_TESTS: PASS');
