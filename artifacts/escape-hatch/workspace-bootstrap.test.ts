import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readWorkspace, saveWorkspace, MAX_WORKSPACE_BYTES } from './workspace-file.ts';
import { userDataRoot } from './user-data.ts';
import { migrateLegacyPreferences } from './preference-file.ts';
import { emptyPreferences } from './src/lib/application-preferences.ts';
import { WORKSPACE_SCHEMA, parseSavedWorkspace, reconcileWorkspace, profileFromPreferences, applyBrowserWorkspace } from './src/lib/workspace-bootstrap.ts';
import { PROFILE_KEY, emptyProfile, APPLICATIONS_KEY } from './src/lib/storage.ts';
import { authorizedWorkspaceRequest, createWorkspaceControlPlugin } from './workspace-control.ts';
import type { IncomingMessage } from 'node:http';
import { importContext } from './import-context.ts';
import { DatabaseSync } from 'node:sqlite';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { JOURNEY_RESUME_KEY, EMPTY_JOURNEY_RESUME } from './src/lib/application-journey-projection.ts';
import { hasContext } from './src/lib/workspace-bootstrap.ts';
import { ASSIST_KEY, emptyAssistProfile } from './src/lib/assist-contract.ts';

const workspace = (first_name = 'Synthetic') => ({ schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: { ...emptyProfile, first_name } } });
test('unmanaged dev metadata works with localhost without opening private storage', async () => {
  let handler: Function | undefined;
  const plugin = createWorkspaceControlPlugin();
  (plugin.configureServer as Function)({ middlewares: { use: (callback: Function) => { handler = callback; } }, config: { server: { port: 5173 } } });
  const result: { statusCode?: number; body?: string } = {};
  await handler!({ url: '/__escapehatch/workspace', headers: { host: 'localhost:5173' }, socket: { remoteAddress: '::1' } }, {
    set statusCode(value: number) { result.statusCode = value; }, setHeader() {}, end(body: string) { result.body = body; },
  }, () => assert.fail('workspace route was not handled'));
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body!), { managed: false });
});
test('stable user-data identity does not include checkout path', () => {
  assert.equal(userDataRoot({ LOCALAPPDATA: 'C:/Synthetic/Local' }), path.join('C:/Synthetic/Local', 'EscapeHatch'));
  assert.equal(userDataRoot({ ESCAPEHATCH_DATA_HOME: 'isolated' }), 'isolated');
});
test('validated recovery rejects malformed shapes and unknown/private arbitrary keys', () => {
  assert.ok(parseSavedWorkspace(workspace()));
  assert.equal(parseSavedWorkspace({ ...workspace(), values: { credentials: 'never' } }), null);
  assert.equal(parseSavedWorkspace({ ...workspace(), values: { [PROFILE_KEY]: { first_name: 'missing fields' } } }), null);
  assert.equal(parseSavedWorkspace({ ...workspace(), values: [] }), null);
  for (const key of ['constructor', 'toString', '__proto__']) assert.equal(parseSavedWorkspace(JSON.parse(JSON.stringify({ schema: WORKSPACE_SCHEMA, values: { [key]: {} } }))), null);
});
test('hydrate empty browser, preserve edits, and report nonempty conflicts', () => {
  assert.deepEqual(reconcileWorkspace({ schema: WORKSPACE_SCHEMA, values: {} }, workspace()).workspace, workspace());
  const result = reconcileWorkspace(workspace('Edited'), workspace());
  assert.deepEqual(result.workspace, workspace('Edited'));
  assert.deepEqual(result.conflicts, [PROFILE_KEY]);
  assert.deepEqual(reconcileWorkspace(workspace(), workspace()).conflicts, []);
});
test('contact projection uses only approved identity fields', () => {
  const profile = profileFromPreferences({ 'identity.first_name': { value: 'Synthetic' }, 'employment.us_citizenship': { value: 'Yes' } });
  assert.equal(profile.first_name, 'Synthetic');
  assert.equal(profile.last_name, '');
  assert.equal(Object.values(profile).includes('Yes'), false);
});
test('CAS, backup and restart recovery preserve concurrent user edits', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-bootstrap-'));
  const file = path.join(directory, 'workspace.json');
  try {
    assert.equal(await readWorkspace(file), null);
    const first = await saveWorkspace(workspace(), null, file);
    const edited = await saveWorkspace(workspace('Edited'), first.revision, file);
    await assert.rejects(saveWorkspace(workspace('Stale tab'), first.revision, file), /CONFLICT/);
    assert.deepEqual((await readWorkspace(file))?.workspace, workspace('Edited'));
    assert.deepEqual((await readWorkspace(file + '.previous'))?.workspace, workspace());
    assert.equal((await readWorkspace(file))?.revision, edited.revision);
    await assert.rejects(saveWorkspace({ ...workspace(), values: { unexpected: true } }, edited.revision, file));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('malformed and oversized files are preserved instead of silently reset', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-invalid-'));
  const file = path.join(directory, 'workspace.json');
  try {
    await fs.writeFile(file, 'invalid');
    await assert.rejects(readWorkspace(file), /preserved/);
    await assert.rejects(saveWorkspace(workspace(), null, file), /preserved/);
    assert.equal(await fs.readFile(file, 'utf8'), 'invalid');
    await saveWorkspace(workspace(), null, file, true);
    assert.deepEqual((await readWorkspace(file))?.workspace, workspace());
    const archive = (await fs.readdir(directory)).find(name => name.includes('.recovery-'))!;
    assert.equal(await fs.readFile(path.join(directory, archive), 'utf8'), 'invalid');
    await fs.writeFile(file, 'x'.repeat(MAX_WORKSPACE_BYTES + 1));
    await assert.rejects(readWorkspace(file), /preserved/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('displaced conflict copy remains immutable through later autosaves and stale choices cannot archive', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-conflict-')); const file = path.join(directory, 'workspace.json');
  try {
    const original = await saveWorkspace(workspace('Original saved copy'), null, file);
    const selected = await saveWorkspace(workspace('Chosen browser copy'), original.revision, file, false, true);
    const archive = (await fs.readdir(directory)).find(name => name.startsWith('workspace.json.conflict-'))!;
    const bytes = await fs.readFile(path.join(directory, archive), 'utf8');
    const later = await saveWorkspace(workspace('Later edit'), selected.revision, file);
    await saveWorkspace(workspace('Another edit'), later.revision, file);
    assert.equal(await fs.readFile(path.join(directory, archive), 'utf8'), bytes);
    assert.deepEqual(JSON.parse(bytes), workspace('Original saved copy'));
    await assert.rejects(saveWorkspace(workspace('Stale choice'), original.revision, file, false, true), /CONFLICT/);
    assert.equal((await fs.readdir(directory)).filter(name => name.includes('.conflict-')).length, 1);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('active OS lock blocks another writer without deleting its resource', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-lock-')); const file = path.join(directory, 'workspace.json');
  const lock = new DatabaseSync(file + '.lock.sqlite'); lock.exec('BEGIN IMMEDIATE');
  try {
    await assert.rejects(saveWorkspace(workspace(), null, file), /busy/);
    assert.ok(await fs.stat(file + '.lock.sqlite'));
  } finally { lock.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('writer process termination releases the OS lock and restart saves normally', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-crash-')); const file = path.join(directory, 'workspace.json');
  const child = spawn(process.execPath, ['--input-type=module', '-e', 'import {DatabaseSync} from "node:sqlite"; const lock=new DatabaseSync(process.argv[1]);lock.exec("BEGIN IMMEDIATE");console.log("LOCKED");setInterval(()=>{},1000);', file + '.lock.sqlite'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout!, 'data'), new Promise((_, reject) => setTimeout(() => reject(new Error('synthetic child timeout')), 5000).unref())]);
    await assert.rejects(saveWorkspace(workspace(), null, file), /busy/);
    const closed = once(child, 'close'); child.kill(); await closed;
    await saveWorkspace(workspace(), null, file);
    assert.deepEqual((await readWorkspace(file))?.workspace, workspace());
  } finally { if (child.exitCode === null && child.signalCode === null) { const closed = once(child, 'close'); child.kill(); await closed; } await fs.rm(directory, { recursive: true, force: true }); }
});

test('assist-only context is recovered and blank legacy assist contact receives approved profile fields only', () => {
  const linksOnly = { ...emptyAssistProfile(emptyProfile), links: [{ label: 'Portfolio', url: 'https://portfolio.example.test', provenance: { source: 'user' as const, label: 'Reviewed link', capturedAt: new Date().toISOString() } }] };
  assert.equal(hasContext({ [ASSIST_KEY]: emptyAssistProfile(emptyProfile) }), false);
  assert.equal(hasContext({ [ASSIST_KEY]: linksOnly }), true);
  assert.deepEqual(reconcileWorkspace({ schema: WORKSPACE_SCHEMA, values: { [ASSIST_KEY]: linksOnly } }, { schema: WORKSPACE_SCHEMA, values: {} }).workspace.values[ASSIST_KEY], linksOnly);
  const assist = { ...emptyAssistProfile(emptyProfile), summary: 'Previously reviewed career summary' };
  assert.equal(hasContext({ [ASSIST_KEY]: assist }), true);
  const local = { schema: WORKSPACE_SCHEMA, values: { [ASSIST_KEY]: assist } };
  const merged = reconcileWorkspace(local, workspace());
  // Under the owner gate this legacy assist summary remains in its own
  // workspace until the applicant confirms that the saved contact is theirs.
  assert.deepEqual(merged.conflicts, ['OWNER_CONTEXT_UNVERIFIED']);
  assert.deepEqual(merged.workspace, local);
  const oldEmpty = emptyAssistProfile(emptyProfile);
  const populated = { ...emptyAssistProfile(workspace().values[PROFILE_KEY]), summary: 'Saved summary' };
  assert.deepEqual(reconcileWorkspace({ schema: WORKSPACE_SCHEMA, values: { [ASSIST_KEY]: oldEmpty } }, { schema: WORKSPACE_SCHEMA, values: { [ASSIST_KEY]: populated } }).conflicts, []);
  const laterMetadata = { ...populated, updatedAt: new Date(Date.now() + 1000).toISOString() };
  assert.deepEqual(reconcileWorkspace({ schema: WORKSPACE_SCHEMA, values: { [ASSIST_KEY]: populated } }, { schema: WORKSPACE_SCHEMA, values: { [ASSIST_KEY]: laterMetadata } }).conflicts, []);
});
test('legacy preference migration is validated, idempotent, and never overwrites newer stable answers', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-preferences-')); const legacy = path.join(directory, 'old.json'); const target = path.join(directory, 'new.json');
  try {
    const prior = emptyPreferences(); await fs.writeFile(legacy, JSON.stringify(prior));
    await migrateLegacyPreferences(target, legacy); assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), prior);
    await fs.writeFile(target, 'newer user copy'); await migrateLegacyPreferences(target, legacy);
    assert.equal(await fs.readFile(target, 'utf8'), 'newer user copy');
    assert.deepEqual(JSON.parse(await fs.readFile(legacy, 'utf8')), prior);
    await fs.rm(target); await fs.writeFile(legacy, '{}'); await assert.rejects(migrateLegacyPreferences(target, legacy));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('failed browser hydration rolls back written areas', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { if (key === APPLICATIONS_KEY) throw new Error('quota'); data.set(key, value); }, removeItem: (key: string) => data.delete(key) } as Storage;
  assert.throws(() => applyBrowserWorkspace(storage, { schema: WORKSPACE_SCHEMA, values: { ...workspace().values, [APPLICATIONS_KEY]: [] } }), /could not save/);
  assert.equal(data.size, 0);
});
test('workspace endpoint refuses foreign origin, DNS rebinding and cross-site reads', () => {
  const request = (headers: object, remoteAddress = '127.0.0.1') => ({ headers, socket: { remoteAddress } }) as IncomingMessage;
  assert.equal(authorizedWorkspaceRequest(request({ host: '127.0.0.1:21031', origin: 'http://127.0.0.1:21031' }), 21031), true);
  for (const headers of [{ host: 'evil.example:21031' }, { host: '127.0.0.1:21031', origin: 'https://evil.example' }, { host: '127.0.0.1:21031', 'sec-fetch-site': 'cross-site' }]) assert.equal(authorizedWorkspaceRequest(request(headers), 21031), false);
  assert.equal(authorizedWorkspaceRequest(request({ host: '127.0.0.1:21031' }, '192.0.2.1'), 21031), false);
});

test('explicit local artifact import is idempotent and refuses conflicting workspaces', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-context-import-'));
  try {
    assert.equal(await importContext('workspace', workspace(), directory), 'WORKSPACE_IMPORTED');
    assert.equal(await importContext('workspace', workspace(), directory), 'WORKSPACE_IMPORTED');
    await assert.rejects(importContext('workspace', workspace('Unreviewed replacement'), directory), /EXISTS/);
    assert.deepEqual((await readWorkspace(path.join(directory, 'workspace.v1.json')))?.workspace, workspace());
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('timestamp-only imported progress does not become a false conflict; edited facts still do', () => {
  const application = { id: 'synthetic', company: 'Synthetic', role: 'Role', url: '', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: '2026-10-18T00:00:00Z' };
  const local = { schema: WORKSPACE_SCHEMA, values: { [APPLICATIONS_KEY]: [application] } };
  const saved = { schema: WORKSPACE_SCHEMA, values: { [APPLICATIONS_KEY]: [{ ...application, updatedAt: '2026-10-24T00:00:00Z' }] } };
  assert.deepEqual(reconcileWorkspace(local, saved).conflicts, []);
  saved.values[APPLICATIONS_KEY][0].notes = 'A real user edit';
  // Without a bound owner even an actual source edit must not be assumed
  // to belong to the same applicant merely because row IDs happen to match.
  assert.deepEqual(reconcileWorkspace(local, saved).conflicts, ['OWNER_CONTEXT_UNVERIFIED']);
});


test('resume pointer hydrates an empty browser but divergent nonempty selections preserve both owners', () => {
  const first = { opportunityId: 'job-a', applicationUrl: 'https://jobs.example.com/apply/a' };
  const second = { opportunityId: 'job-b', applicationUrl: 'https://jobs.example.com/apply/b' };
  const saved = { schema: WORKSPACE_SCHEMA, values: { [JOURNEY_RESUME_KEY]: first } };
  const empty = { schema: WORKSPACE_SCHEMA, values: { [JOURNEY_RESUME_KEY]: EMPTY_JOURNEY_RESUME } };
  assert.ok(parseSavedWorkspace(saved));
  assert.ok(parseSavedWorkspace(empty));
  assert.deepEqual(reconcileWorkspace(empty, saved), { workspace: saved, conflicts: [] });
  assert.deepEqual(reconcileWorkspace({ schema: WORKSPACE_SCHEMA, values: {} }, saved), { workspace: saved, conflicts: [] });
  const local = { schema: WORKSPACE_SCHEMA, values: { [JOURNEY_RESUME_KEY]: second } };
  const before = JSON.stringify({ local, saved });
  assert.deepEqual(reconcileWorkspace(local, saved), { workspace: local, conflicts: [JOURNEY_RESUME_KEY] });
  assert.equal(JSON.stringify({ local, saved }), before);
  const reordered = { schema: WORKSPACE_SCHEMA, values: { [JOURNEY_RESUME_KEY]: { applicationUrl: first.applicationUrl, opportunityId: first.opportunityId } } };
  assert.deepEqual(reconcileWorkspace(reordered, saved).conflicts, []);
  assert.equal(hasContext(saved.values), false);
  assert.equal(hasContext(empty.values), false);
  assert.equal(parseSavedWorkspace({ schema: WORKSPACE_SCHEMA, values: { [JOURNEY_RESUME_KEY]: { ...first, applicationUrl: 'https://127.0.0.1/apply' } } }), null);
});

test('resume pointer survives revision-checked save and independent process restart readback', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-journey-pointer-'));
  const file = path.join(directory, 'workspace.json');
  const pointer = { opportunityId: 'pending-job', applicationUrl: 'https://jobs.example.com/job/pending' };
  const selected = { schema: WORKSPACE_SCHEMA, values: { ...workspace().values, [JOURNEY_RESUME_KEY]: pointer } };
  try {
    const first = await saveWorkspace(selected, null, file);
    const childValue = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
      'import fs from "node:fs"; console.log(fs.readFileSync(process.argv[1],"utf8"));', file],
    { encoding: 'utf8', windowsHide: true, timeout: 5000 }));
    assert.deepEqual(childValue.values[JOURNEY_RESUME_KEY], pointer);
    assert.deepEqual((await readWorkspace(file))?.workspace, selected);
    const nextPointer = { opportunityId: 'next-pending-job', applicationUrl: 'https://jobs.example.com/job/next' };
    const reselected = { ...selected, values: { ...selected.values, [JOURNEY_RESUME_KEY]: nextPointer } };
    const current = await saveWorkspace(reselected, first.revision, file);
    await assert.rejects(saveWorkspace(selected, first.revision, file), /CONFLICT/);
    assert.deepEqual((await readWorkspace(file))?.workspace.values[JOURNEY_RESUME_KEY], nextPointer);
    assert.equal((await readWorkspace(file))?.revision, current.revision);
    assert.deepEqual((await readWorkspace(file + '.previous'))?.workspace.values[JOURNEY_RESUME_KEY], pointer);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('owner mismatch blocks automatic startup hydration without changing either copy', () => {
  const alice = { ...emptyProfile, first_name: 'Alex', last_name: 'Example', email: 'alex@example.test' };
  const brook = { ...emptyProfile, first_name: 'Brook', last_name: 'Example', email: 'brook@example.test' };
  const local = { schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: alice, [APPLICATIONS_KEY]: [] } };
  const saved = { schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: brook, [APPLICATIONS_KEY]: [] } };
  const result = reconcileWorkspace(local, saved);
  assert.deepEqual(result.conflicts, ['OWNER_CONTEXT_CONFLICT']);
  assert.deepEqual(result.workspace, local);
});
test('unidentified browser applications never inherit another owner profile silently', () => {
  const local = { schema: WORKSPACE_SCHEMA, values: { [APPLICATIONS_KEY]: [{
    id: 'local-application', company: 'Synthetic Company', role: 'Test role', url: 'https://example.test/jobs',
    status: 'saved', priority: 'normal', notes: '', nextAction: '',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }] } };
  const saved = { schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: { ...emptyProfile, first_name: 'Brook', last_name: 'Example', email: 'brook@example.test' } } };
  const result = reconcileWorkspace(local, saved);
  assert.deepEqual(result.conflicts, ['OWNER_CONTEXT_UNVERIFIED']);
  assert.deepEqual(result.workspace, local);
});
test('inconsistent profile and assist contact cannot be treated as one resolved owner', () => {
  const alice = { ...emptyProfile, first_name: 'Alex', last_name: 'Example', email: 'alex@example.test' };
  const brook = { ...emptyProfile, first_name: 'Brook', last_name: 'Example', email: 'brook@example.test' };
  const local = { schema: WORKSPACE_SCHEMA, values: {
    [PROFILE_KEY]: alice, [ASSIST_KEY]: emptyAssistProfile(brook),
  } };
  const saved = { schema: WORKSPACE_SCHEMA, values: {} };
  const result = reconcileWorkspace(local, saved);
  assert.deepEqual(result.conflicts, ['OWNER_CONTEXT_CONFLICT']);
  assert.deepEqual(result.workspace, local);
});
test('matching verified contact fields allow an ordinary same-owner recovery', () => {
  const alice = { ...emptyProfile, first_name: 'Alex', last_name: 'Example', email: 'ALEX@Example.Test' };
  const local = { schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: alice } };
  const saved = { schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: { ...alice, email: 'alex@example.test' } } };
  assert.equal(reconcileWorkspace(local, saved).conflicts.includes('OWNER_CONTEXT_CONFLICT'), false);
});

test('a reviewed display-name change does not orphan an unchanged same-email assist projection', () => {
  const profile = { ...emptyProfile, first_name: 'Updated', last_name: 'Recovery', email: 'synthetic@example.test' };
  const oldContact = { ...profile, first_name: 'Synthetic' };
  const saved = { schema: WORKSPACE_SCHEMA, values: {
    [PROFILE_KEY]: profile,
    [ASSIST_KEY]: emptyAssistProfile(oldContact),
    [ANSWERS_KEY]: [],
  } };
  const emptyBrowser = { schema: WORKSPACE_SCHEMA, values: {} };
  const merged = reconcileWorkspace(emptyBrowser, saved);
  assert.deepEqual(merged.conflicts, []);
  assert.equal((merged.workspace.values[PROFILE_KEY] as typeof profile).first_name, 'Updated');
  // The old assist projection is preserved, not silently rewritten as a fact.
  assert.equal((merged.workspace.values[ASSIST_KEY] as typeof saved.values[typeof ASSIST_KEY]).contact.first_name, 'Synthetic');
});
test('different emails remain a hard context conflict despite matching names', () => {
  const alice = { ...emptyProfile, first_name: 'Alex', last_name: 'Example', email: 'alex@example.test' };
  const bob = { ...alice, email: 'bob@example.test' };
  const saved = { schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: alice, [ASSIST_KEY]: emptyAssistProfile(bob) } };
  assert.deepEqual(reconcileWorkspace({ schema: WORKSPACE_SCHEMA, values: {} }, saved).conflicts, ['OWNER_CONTEXT_CONFLICT']);
});
