import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { createWorkspaceControlPlugin } from './workspace-control.ts';
import { randomUUID } from 'node:crypto';
import { saveWorkspace } from './workspace-file.ts';
import { selectHostWorkspace, readHostWorkspaceOwner } from './workspace-owner-file.ts';
import { OWNER_BINDING_SCHEMA } from './src/lib/workspace-owner-binding.ts';
import { PAIRING_SCHEMA } from './src/lib/extension-pairing.ts';
import { WORKSPACE_SCHEMA } from './src/lib/workspace-bootstrap.ts';
import { PROFILE_KEY, emptyProfile } from './src/lib/storage.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-owner-test-'));
  const file = path.join(root, 'workspace.v1.json');
  const saved = await saveWorkspace({ schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: { ...emptyProfile, first_name: 'Synthetic private sentinel' } } }, null, file);
  return { root, file, saved, async cleanup() {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'eh-owner-test-')) throw new Error('unsafe fixture cleanup');
    await fs.rm(root, { recursive: true, force: true });
  } };
}
const binding = () => ({ schema: OWNER_BINDING_SCHEMA, ownerId: randomUUID(), workspaceId: randomUUID(), installationId: randomUUID(), boundAt: new Date().toISOString(), selection: 'applicant-confirmed' as const });
const pairing = (value: ReturnType<typeof binding>) => ({ schema: PAIRING_SCHEMA, binding: value, browserProfileId: randomUUID(), profileDigest: '1'.repeat(64), preferenceDigest: '2'.repeat(64), approvedFields: ['first_name'], approvedAnswerIds: [], approvedAt: new Date().toISOString() });

test('host selection is extension-free, stable, revision checked and approves no facts or documents', async () => {
  const f = await fixture(); try {
    const before = await fs.readFile(f.file);
    assert.equal(await readHostWorkspaceOwner(f.root), null);
    const selected = await selectHostWorkspace(f.saved.revision, f.root);
    assert.deepEqual(await selectHostWorkspace(f.saved.revision, f.root), selected);
    assert.equal(selected.factsApproved, false); assert.equal(selected.documentsApproved, false);
    assert.deepEqual(await fs.readFile(f.file), before);
    assert.equal(JSON.stringify(selected).includes('Synthetic private sentinel'), false);
  } finally { await f.cleanup(); }
});

test('concurrent host selections converge on one owner record', async () => {
  const f = await fixture(); try {
    const values = await Promise.all(Array.from({ length: 4 }, () => selectHostWorkspace(f.saved.revision, f.root)));
    assert.equal(new Set(values.map(value => value.binding.ownerId)).size, 1);
  } finally { await f.cleanup(); }
});

test('a moved workspace revision never creates owner approval', async () => {
  const f = await fixture(); try {
    await assert.rejects(selectHostWorkspace('0'.repeat(64), f.root), /WORKSPACE_REVISION_CHANGED/);
    assert.equal(await readHostWorkspaceOwner(f.root), null);
  } finally { await f.cleanup(); }
});

test('existing native binding is migrated without inventing another owner', async () => {
  const f = await fixture(); try {
    const prior = binding();
    await fs.writeFile(path.join(f.root, 'extension-native-pairing.v1.json'), JSON.stringify(pairing(prior)));
    assert.deepEqual((await selectHostWorkspace(f.saved.revision, f.root)).binding, prior);
  } finally { await f.cleanup(); }
});

test('conflicting native/host owners preserve both records and fail closed', async () => {
  const f = await fixture(); try {
    const selected = await selectHostWorkspace(f.saved.revision, f.root);
    const native = JSON.stringify(pairing(binding()));
    await fs.writeFile(path.join(f.root, 'extension-native-pairing.v1.json'), native);
    await assert.rejects(selectHostWorkspace(f.saved.revision, f.root), /OWNER_CONTEXT_CONFLICT/);
    await assert.rejects(readHostWorkspaceOwner(f.root), /OWNER_CONTEXT_CONFLICT/);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root, 'workspace-owner-binding.v1.json'), 'utf8')), selected.binding);
    assert.equal(await fs.readFile(path.join(f.root, 'extension-native-pairing.v1.json'), 'utf8'), native);
  } finally { await f.cleanup(); }
});

test('malformed native ownership cannot become a trusted shared identity', async () => {
  const f = await fixture(); try {
    await fs.writeFile(path.join(f.root, 'extension-native-pairing.v1.json'), JSON.stringify({ binding: binding() }));
    await assert.rejects(selectHostWorkspace(f.saved.revision, f.root), /OWNER_RECORD_INVALID/);
    await assert.rejects(readHostWorkspaceOwner(f.root), /OWNER_RECORD_INVALID/);
    await assert.rejects(fs.access(path.join(f.root, 'workspace-owner-binding.v1.json')));
  } finally { await f.cleanup(); }
});

test('independent OS-store fixtures receive independent opaque identities', async () => {
  const a = await fixture(), b = await fixture(); try {
    assert.notEqual((await selectHostWorkspace(a.saved.revision, a.root)).binding.ownerId, (await selectHostWorkspace(b.saved.revision, b.root)).binding.ownerId);
  } finally { await a.cleanup(); await b.cleanup(); }
});


test('managed host endpoint establishes ownership from one current-workspace selection, not an extension', async () => {
  const f = await fixture();
  const vars = { ESCAPEHATCH_DATA_HOME: f.root, ESCAPEHATCH_INSTANCE_ID: 'synthetic-owner-endpoint', ESCAPEHATCH_REPO_FINGERPRINT: 'a'.repeat(64), ESCAPEHATCH_SHUTDOWN_TOKEN: randomUUID(), ESCAPEHATCH_STARTED_AT_UTC: new Date().toISOString(), ESCAPEHATCH_RUNTIME_PROTOCOL: '1' };
  const before = Object.fromEntries(Object.keys(vars).map(key => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    let handler: Function;
    (createWorkspaceControlPlugin().configureServer as Function)({ config: { server: { port: 21997 } }, middlewares: { use: (value: Function) => { handler = value; } } });
    const call = async (method: string, body: object, extra: Record<string, string> = {}) => {
      const request = Readable.from([JSON.stringify(body)]) as any;
      Object.assign(request, { method, url: '/__escapehatch/workspace/owner', socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:21997', origin: 'http://127.0.0.1:21997', 'content-type': 'application/json', 'x-escapehatch-workspace': '1', ...extra } });
      const response: { statusCode: number; body?: any; setHeader: Function; end: Function } = { statusCode: 0, setHeader() {}, end(value: string) { this.body = JSON.parse(value); } };
      await handler!(request, response, () => assert.fail('owner route not handled'));
      return response;
    };
    assert.equal((await call('GET', {})).body.state, 'OWNER_SELECTION_REQUIRED');
    assert.equal((await call('POST', {}, { origin: 'https://foreign.invalid' })).statusCode, 403);
    assert.equal((await call('POST', { selection: 'another-workspace', expectedRevision: f.saved.revision })).statusCode, 400);
    assert.equal(await readHostWorkspaceOwner(f.root), null);
    const selected = await call('POST', { selection: 'current-installed-workspace', expectedRevision: f.saved.revision });
    assert.equal(selected.statusCode, 200); assert.equal(selected.body.state, 'OWNER_BOUND');
    assert.equal(selected.body.extensionRequired, false); assert.equal(selected.body.documentsApproved, false);
    assert.equal(JSON.stringify(selected.body).includes('Synthetic private sentinel'), false);
    assert.equal((await call('GET', {})).body.binding.ownerId, selected.body.binding.ownerId);
  } finally {
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await f.cleanup();
  }
});
