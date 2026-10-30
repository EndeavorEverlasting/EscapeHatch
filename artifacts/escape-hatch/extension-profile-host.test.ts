import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PassThrough, Readable } from 'node:stream';
import { handleNativeProfileRequest, nativeExtensionOrigin, PAIRING_SCHEMA } from './extension-profile-host.ts';
import { MAX_NATIVE_BYTES, encodeNativeMessage, readNativeMessage } from './native-messaging-host.ts';
import { saveWorkspace } from './workspace-file.ts';
import { savePreferences, readPreferences } from './preference-file.ts';
import { PROFILE_KEY, ANSWERS_KEY, emptyProfile } from './src/lib/storage.ts';
import { WORKSPACE_SCHEMA } from './src/lib/workspace-bootstrap.ts';
import { emptyPreferences } from './src/lib/application-preferences.ts';

const origin = nativeExtensionOrigin();
const browser = randomUUID();
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-native-host-'));
  const workspaceFile = path.join(root, 'workspace.v1.json');
  const preferenceFile = path.join(root, 'application-question-preferences.json');
  const pairingFile = path.join(root, 'extension-native-pairing.v1.json');
  const workspace = { schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: { ...emptyProfile, first_name: 'Synthetic Applicant', email: 'synthetic@example.test', phone: '555-0100', phone_authority: 'user_confirmed_primary' },
    [ANSWERS_KEY]: [{ id: 'private-answer', title: 'Private freeform', category: 'Other', content: 'Never transfer this raw answer', updatedAt: '2026-10-28T00:00:00Z' }] } };
  const preference = (value: string) => ({ scope: 'profile_preference' as const, source: 'user' as const, value, updated_at: '2026-10-28T00:00:00Z' });
  const preferences = { ...emptyPreferences(), preferences: { 'education.highest_completed_level': preference('Synthetic degree'), 'eeo.gender': preference('Synthetic demographic'),
    'employment.work_authorization_proof': preference('Synthetic eligibility'), 'legal.non_compete_blocking': preference('Synthetic legal'), 'compensation.desired_annual_salary': preference('Synthetic salary') } };
  await saveWorkspace(workspace, null, workspaceFile);
  await savePreferences(preferences, preferenceFile);
  const request = (action: 'status' | 'confirm' | 'project' | 'privacy-preference-read' | 'privacy-preference-write', extra: object = {}, selectedBrowser = browser) => handleNativeProfileRequest({ protocol: 1, action, browserProfileId: selectedBrowser, ...extra }, origin, { dataRoot: root });
  const status = await request('status');
  assert.equal(status.ok, true);
  const confirm = (extra: object = {}) => request('confirm', { expectedWorkspaceRevision: (status as any).workspaceRevision,
    expectedPreferenceRevision: (status as any).preferenceRevision, approvedFields: ['first_name', 'email', 'phone'], approvedAnswerIds: ['education.highest_completed_level'], ...extra });
  return { root, workspaceFile, preferenceFile, pairingFile, workspace, preferences, request, status: status as any, confirm,
    cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

test('native caller is fixed key-derived Chrome origin and refused before private filesystem effects', async () => {
  assert.match(origin, /^chrome-extension:\/\/[a-p]{32}\/$/);
  const root = path.join(os.tmpdir(), 'eh-native-uncreated-' + randomUUID());
  for (const caller of ['http://127.0.0.1:21031', 'chrome-extension://' + 'a'.repeat(32) + '/', undefined, origin.slice(0, -1)]) {
    assert.deepEqual(await handleNativeProfileRequest({ protocol: 1, action: 'confirm', browserProfileId: browser }, caller, { dataRoot: root }), { ok: false, reason: 'NATIVE_CALLER_REJECTED' });
  }
  await assert.rejects(fs.stat(root), { code: 'ENOENT' });
});

test('explicit confirmation binds canonical schema; narrow profile and known answers project; phone is unconfirmed', async () => {
  const f = await fixture();
  try {
    assert.equal(f.status.status, 'REVIEW_REQUIRED');
    assert.deepEqual(f.status.availableAnswers.map((a: any) => a.id), ['education.highest_completed_level']);
    assert.deepEqual(await f.request('project'), { ok: false, reason: 'OWNER_UNBOUND' });
    assert.deepEqual(await f.confirm({ expectedWorkspaceRevision: 'a'.repeat(64) }), { ok: false, reason: 'SOURCE_REVISION_CHANGED' });
    await assert.rejects(fs.stat(f.pairingFile), { code: 'ENOENT' });
    assert.equal((await f.confirm()).ok, true);
    const sidecar = JSON.parse(await fs.readFile(f.pairingFile, 'utf8'));
    assert.equal(sidecar.schema, PAIRING_SCHEMA);
    assert.equal(sidecar.binding.schema, 'escapehatch/workspace-owner-binding/v1');
    assert.equal(sidecar.binding.selection, 'applicant-confirmed');
    assert.equal(JSON.stringify(sidecar).includes('synthetic@example.test'), false);
    assert.equal(JSON.stringify(sidecar).includes('Synthetic degree'), false);
    const projection = await f.request('project') as any;
    assert.equal(projection.status, 'PROJECTED');
    assert.deepEqual(projection.profile, { phone_authority: 'unconfirmed', first_name: 'Synthetic Applicant', email: 'synthetic@example.test', phone: '555-0100' });
    assert.deepEqual(projection.answers.map((a: any) => a.id), ['education.highest_completed_level']);
    assert.equal(JSON.stringify(projection).includes('Never transfer'), false);
    assert.equal((await f.request('project', { existingProfile: projection.profile }) as any).status, 'ALREADY_CURRENT');
    const binding = sidecar.binding;
    await f.confirm();
    assert.deepEqual(JSON.parse(await fs.readFile(f.pairingFile, 'utf8')).binding, binding);
  } finally { await f.cleanup(); }
});

test('privacy toggle reads and writes the existing owner-private preference with revision checks', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.request('privacy-preference-read'), { ok: false, reason: 'OWNER_UNBOUND' });
    await f.confirm();
    const first = await f.request('privacy-preference-read') as any;
    assert.equal(first.ok, true); assert.equal(first.privacyConsentEnabled, false);
    assert.match(first.privacyPreferenceRevision, /^[a-f0-9]{64}$/);
    assert.deepEqual(await f.request('privacy-preference-write', { privacyConsentEnabled: true }), { ok: false, reason: 'INVALID_REQUEST' });
    assert.deepEqual(await f.request('privacy-preference-write', { privacyConsentEnabled: 'true', expectedPrivacyRevision: first.privacyPreferenceRevision }), { ok: false, reason: 'INVALID_REQUEST' });
    assert.deepEqual(await f.request('privacy-preference-write', { privacyConsentEnabled: true, expectedPrivacyRevision: first.privacyPreferenceRevision }, randomUUID()), { ok: false, reason: 'CHROME_PROFILE_MISMATCH' });
    const saved = await f.request('privacy-preference-write', { privacyConsentEnabled: true, expectedPrivacyRevision: first.privacyPreferenceRevision }) as any;
    assert.equal(saved.ok, true); assert.equal(saved.privacyConsentEnabled, true);
    assert.equal((await readPreferences(f.preferenceFile)).application_privacy_acknowledgement_enabled, true);
    assert.deepEqual(await f.request('privacy-preference-write', { privacyConsentEnabled: false, expectedPrivacyRevision: first.privacyPreferenceRevision }), { ok: false, reason: 'PRIVACY_PREFERENCE_CHANGED' });
    assert.equal((await readPreferences(f.preferenceFile)).application_privacy_acknowledgement_enabled, true);
    const disabled = await f.request('privacy-preference-write', { privacyConsentEnabled: false, expectedPrivacyRevision: saved.privacyPreferenceRevision }) as any;
    assert.equal(disabled.privacyConsentEnabled, false);
    assert.equal((await readPreferences(f.preferenceFile)).application_privacy_acknowledgement_enabled, false);
  } finally { await f.cleanup(); }
});

test('wrong browser, divergent profiles/answers and unsafe approval IDs preserve all originals', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.confirm({ approvedAnswerIds: ['eeo.gender'] }), { ok: false, reason: 'EXPLICIT_REVIEW_REQUIRED' });
    assert.deepEqual(await f.confirm({ approvedFields: ['email', 'email'] }), { ok: false, reason: 'EXPLICIT_REVIEW_REQUIRED' });
    await f.confirm();
    const before = await fs.readFile(f.pairingFile, 'utf8');
    assert.deepEqual(await f.request('status', {}, randomUUID()), { ok: false, reason: 'CHROME_PROFILE_MISMATCH' });
    assert.deepEqual(await f.request('confirm', { expectedWorkspaceRevision: f.status.workspaceRevision, expectedPreferenceRevision: f.status.preferenceRevision, approvedFields: ['email'], approvedAnswerIds: [] }, randomUUID()), { ok: false, reason: 'CHROME_PROFILE_MISMATCH' });
    assert.deepEqual(await f.request('project', { existingProfile: { first_name: 'Separately owned applicant' } }), { ok: false, reason: 'EXISTING_PROFILE_REVIEW_REQUIRED' });
    assert.deepEqual(await f.request('project', { existingAnswers: { 'education.highest_completed_level': 'Different answer' } }), { ok: false, reason: 'EXISTING_ANSWERS_REVIEW_REQUIRED' });
    assert.equal(await fs.readFile(f.pairingFile, 'utf8'), before);
    assert.equal(JSON.parse(await fs.readFile(f.workspaceFile, 'utf8')).values[PROFILE_KEY].first_name, 'Synthetic Applicant');
  } finally { await f.cleanup(); }
});

test('changed private sources require explicit reapproval and invalid sidecar is preserved', async () => {
  const f = await fixture();
  try {
    await f.confirm();
    const before = await fs.readFile(f.pairingFile, 'utf8');
    f.preferences.preferences['education.highest_completed_level'].value = 'Changed degree';
    await savePreferences(f.preferences, f.preferenceFile);
    assert.deepEqual(await f.request('project'), { ok: false, reason: 'REAPPROVAL_REQUIRED' });
    assert.equal((await f.request('status') as any).status, 'REAPPROVAL_REQUIRED');
    assert.equal(await fs.readFile(f.pairingFile, 'utf8'), before);
    const status = await f.request('status') as any;
    await f.request('confirm', { expectedWorkspaceRevision: status.workspaceRevision, expectedPreferenceRevision: status.preferenceRevision, approvedFields: ['email'], approvedAnswerIds: [] });
    assert.equal((await f.request('project') as any).ok, true);
    await fs.writeFile(f.pairingFile, '{invalid');
    assert.deepEqual(await f.request('status'), { ok: false, reason: 'PAIRING_RECOVERY_REQUIRED' });
    assert.equal(await fs.readFile(f.pairingFile, 'utf8'), '{invalid');
  } finally { await f.cleanup(); }
});

test('profile edits require reapproval; missing preferences never manufacture answers or binding', async () => {
  const f = await fixture();
  try {
    await fs.unlink(f.preferenceFile);
    const empty = await f.request('status') as any;
    assert.deepEqual(empty.availableAnswers, []);
    assert.match(empty.preferenceRevision, /^[a-f0-9]{64}$/);
    await assert.rejects(fs.stat(f.preferenceFile), { code: 'ENOENT' });
    await assert.rejects(fs.stat(f.pairingFile), { code: 'ENOENT' });
    await f.request('confirm', { expectedWorkspaceRevision: empty.workspaceRevision, expectedPreferenceRevision: empty.preferenceRevision, approvedFields: ['email'], approvedAnswerIds: [] });
    f.workspace.values[PROFILE_KEY].email = 'changed@example.test';
    await saveWorkspace(f.workspace, empty.workspaceRevision, f.workspaceFile);
    assert.deepEqual(await f.request('project'), { ok: false, reason: 'REAPPROVAL_REQUIRED' });
  } finally { await f.cleanup(); }
});

test('separate synthetic OS-account roots receive distinct opaque owner bindings and their own values', async () => {
  const a = await fixture(), b = await fixture();
  try {
    b.workspace.values[PROFILE_KEY].first_name = 'Different Synthetic Applicant';
    await saveWorkspace(b.workspace, b.status.workspaceRevision, b.workspaceFile);
    await a.confirm();
    const statusB = await b.request('status') as any;
    await b.request('confirm', { expectedWorkspaceRevision: statusB.workspaceRevision, expectedPreferenceRevision: statusB.preferenceRevision, approvedFields: ['first_name'], approvedAnswerIds: [] });
    const projectionA = await a.request('project') as any;
    const projectionB = await b.request('project') as any;
    assert.notEqual(projectionA.ownerId, projectionB.ownerId);
    assert.notEqual(projectionA.workspaceId, projectionB.workspaceId);
    assert.equal(projectionA.profile.first_name, 'Synthetic Applicant');
    assert.equal(projectionB.profile.first_name, 'Different Synthetic Applicant');
    assert.equal(JSON.stringify(projectionB).includes('synthetic@example.test'), false);
  } finally { await a.cleanup(); await b.cleanup(); }
});

test('invalid request shapes and developer roots without a workspace cannot establish a binding', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-native-empty-'));
  try {
    for (const input of [null, { protocol: 1, action: ['status'], browserProfileId: browser }, { protocol: 1, action: 'status', browserProfileId: browser, dataRoot: root }]) {
      assert.deepEqual(await handleNativeProfileRequest(input, origin, { dataRoot: root }), { ok: false, reason: 'INVALID_REQUEST' });
    }
    assert.deepEqual(await handleNativeProfileRequest({ protocol: 1, action: 'status', browserProfileId: browser }, origin, { dataRoot: root }), { ok: false, reason: 'WORKSPACE_REQUIRED' });
    assert.deepEqual(await fs.readdir(root), []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('explicit phone authority remains separately approved', async () => {
  const f = await fixture();
  try {
    await f.confirm({ approvedFields: ['phone', 'phone_authority'] });
    assert.equal((await f.request('project') as any).profile.phone_authority, 'user_confirmed_primary');
  } finally { await f.cleanup(); }
});

test('linked private root is refused without reading through the link', async () => {
  const f = await fixture();
  const link = f.root + '-junction';
  try {
    await fs.symlink(f.root, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.deepEqual(await handleNativeProfileRequest({ protocol: 1, action: 'status', browserProfileId: browser }, origin, { dataRoot: link }), { ok: false, reason: 'PRIVATE_PATH_LINK_FORBIDDEN' });
  } finally { await fs.unlink(link); await f.cleanup(); }
});

test('native framing accepts split header/body and rejects bounds, malformed/truncated JSON and extra frames', async () => {
  const frame = encodeNativeMessage({ protocol: 1 });
  assert.deepEqual(await readNativeMessage(Readable.from([frame.subarray(0, 2), frame.subarray(2, 6), frame.subarray(6)])), { protocol: 1 });
  const oversized = Buffer.alloc(4); oversized.writeUInt32LE(MAX_NATIVE_BYTES + 1);
  await assert.rejects(readNativeMessage(Readable.from([oversized])), /LENGTH_INVALID/);
  await assert.rejects(readNativeMessage(Readable.from([Buffer.alloc(4)])), /LENGTH_INVALID/);
  await assert.rejects(readNativeMessage(Readable.from([frame.subarray(0, 5)])), /INCOMPLETE/);
  await assert.rejects(readNativeMessage(Readable.from([Buffer.concat([frame, frame])])), /EXTRA_FRAME/);
  const malformed = Buffer.from([1, 0, 0, 0, 0xff]);
  await assert.rejects(readNativeMessage(Readable.from([malformed])), /JSON_INVALID/);
  await assert.rejects(readNativeMessage(new PassThrough(), 5), /TIMEOUT/);
});

test('real stdio entry emits exactly one framed response and no stdout diagnostics', async () => {
  const f = await fixture();
  try {
    const child = spawnSync(process.execPath, ['--experimental-strip-types', path.join(import.meta.dirname, 'native-messaging-host.ts'), origin], {
      input: encodeNativeMessage({ protocol: 1, action: 'status', browserProfileId: browser }), env: { ...process.env, ESCAPEHATCH_DATA_HOME: f.root }, timeout: 15000,
    });
    assert.equal(child.status, 0, child.stderr.toString());
    const length = child.stdout.readUInt32LE();
    assert.equal(child.stdout.length, length + 4);
    const response = JSON.parse(child.stdout.subarray(4).toString());
    assert.equal(response.status, 'REVIEW_REQUIRED');
  } finally { await f.cleanup(); }
});
