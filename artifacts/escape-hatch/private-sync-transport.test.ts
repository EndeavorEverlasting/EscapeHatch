import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { emptyPreferences } from './src/lib/application-preferences.ts';
import { generateSyncKey, projectReusablePreferences, sealProjection } from './private-sync-crypto.ts';
import { enqueueOfflineCapsule, flushOfflineQueue, folderTransport } from './private-sync-transport.ts';
import { googleDriveTransport } from './private-sync-drive-transport.ts';

function sealedCapsule() {
  const prefs = emptyPreferences();
  prefs.preferences['talent_community.primary_areas'] = {
    scope: 'profile_preference',
    source: 'user',
    value: 'Synthetic Engineering',
    updated_at: '2026-11-03T00:00:00Z',
  };
  const key = generateSyncKey();
  const projection = projectReusablePreferences(prefs);
  return { key, envelope: sealProjection(projection, key, null, 'a'.repeat(32)), plaintext: 'Synthetic Engineering' };
}

test('folder transport stores ciphertext only and enforces content-addressed CAS', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-carrier-folder-'));
  try {
    const { envelope, plaintext } = sealedCapsule();
    const transport = folderTransport(root, 'local-folder');
    const put = await transport.put(envelope, null);
    const bytes = await fs.readFile(path.join(root, put.id + '.ehsync'));
    assert.equal(bytes.toString('utf8').includes(plaintext), false);
    assert.deepEqual((await transport.list()).map(x => x.id), [put.id]);
    assert.equal((await transport.get(put.id)).etag, put.etag);
    await assert.rejects(transport.put(envelope, '"deadbeef"'), /SYNC_CONFLICT_CAS/);
    assert.deepEqual(await transport.put(envelope, null), put);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('offline queue preserves capsules until the authorized transport accepts them', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-carrier-queue-'));
  try {
    const queueFile = path.join(root, 'offline-queue.json');
    const carrier = path.join(root, 'carrier');
    const { envelope } = sealedCapsule();
    await enqueueOfflineCapsule(queueFile, 'user@example.com', envelope);
    const failing = {
      kind: 'google-drive-file' as const,
      principal: 'user@example.com',
      async list() { return []; },
      async get() { throw new Error('AUTH_REQUIRED'); },
      async put() { throw new Error('AUTH_REQUIRED'); },
    };
    const blocked = await flushOfflineQueue(queueFile, failing);
    assert.equal(blocked.flushed, 0);
    assert.equal(blocked.remaining, 1);
    const ready = folderTransport(carrier, 'user@example.com');
    const flushed = await flushOfflineQueue(queueFile, ready);
    assert.equal(flushed.flushed, 1);
    assert.equal(flushed.remaining, 0);
    assert.equal((await ready.list()).length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Drive transport refuses wrong principal and uploads opaque ciphertext names only', async () => {
  const { envelope, plaintext } = sealedCapsule();
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? init.body : init?.body ? Buffer.from(init.body as Buffer).toString('utf8') : '';
    calls.push({ url, body });
    if (url.includes('/upload/drive/v3/files')) {
      assert.equal(body.includes(plaintext), false);
      assert.match(body, /[a-f0-9]{64}\.ehsync/);
      return new Response(JSON.stringify({ name: body.match(/[a-f0-9]{64}\.ehsync/)![0], sha256Checksum: 'ab'.repeat(32), size: '128' }), { status: 200 });
    }
    return new Response('{}', { status: 500 });
  };
  const transport = googleDriveTransport({
    folderId: 'folder_abc1234567',
    expectedPrincipal: 'owner@example.com',
    tokenProvider: async () => ({ accessToken: 'ya29.synthetic-token', principal: 'owner@example.com' }),
    fetchImpl,
    apiRoot: 'https://example.test',
  });
  const put = await transport.put(envelope, null);
  assert.match(put.id, /^[a-f0-9]{64}$/);
  assert.equal(calls.length, 1);
  const wrong = googleDriveTransport({
    folderId: 'folder_abc1234567',
    expectedPrincipal: 'owner@example.com',
    tokenProvider: async () => ({ accessToken: 'ya29.synthetic-token', principal: 'other@example.com' }),
    fetchImpl,
    apiRoot: 'https://example.test',
  });
  await assert.rejects(wrong.put(envelope, null), /PROVIDER_PRINCIPAL_CHANGED/);
});
