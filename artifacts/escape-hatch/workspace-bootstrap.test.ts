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
import { authorizedWorkspaceRequest } from './workspace-control.ts';
import type { IncomingMessage } from 'node:http';
import { importContext } from './import-context.ts';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { hasContext } from './src/lib/workspace-bootstrap.ts';
import { ASSIST_KEY, emptyAssistProfile } from './src/lib/assist-contract.ts';

const workspace = (first_name = 'Synthetic') => ({ schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: { ...emptyProfile, first_name } } });
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
  const assist = { ...emptyAssistProfile(emptyProfile), summary: 'Previously reviewed career summary' };
  assert.equal(hasContext({ [ASSIST_KEY]: assist }), true);
  const local = { schema: WORKSPACE_SCHEMA, values: { [ASSIST_KEY]: assist } };
  const merged = reconcileWorkspace(local, workspace());
  assert.equal((merged.workspace.values[ASSIST_KEY] as typeof assist).contact.first_name, 'Synthetic');
  assert.equal((merged.workspace.values[ASSIST_KEY] as typeof assist).summary, assist.summary);
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
