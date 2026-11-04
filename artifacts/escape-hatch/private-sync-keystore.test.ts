import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createPairingOffer,
  createProtectedSyncKey,
  loadSyncKey,
  openPairingOffer,
  preferWindowsDpapi,
  storeSyncKey,
} from './private-sync-keystore.ts';
import { generateSyncKey, vaultIdForKey } from './private-sync-crypto.ts';

test('explicit pairing offer transfers vault secret without writing the code beside ciphertext', () => {
  const key = generateSyncKey();
  const offer = createPairingOffer(key);
  assert.equal(offer.vaultId, vaultIdForKey(key));
  assert.match(offer.pairingCode, /^[A-Z2-7]{16}$/);
  const { pairingCode, ...sealed } = offer;
  assert.equal('pairingCode' in sealed, false);
  assert.deepEqual(openPairingOffer(sealed, pairingCode), key);
  assert.throws(() => openPairingOffer(sealed, 'AAAAAAAAAAAAAAA A'.replace(' ', 'B')), /INVALID_PAIRING_CODE|PAIRING_AUTHENTICATION_FAILED/);
  assert.throws(() => openPairingOffer(sealed, 'AAAAAAAAAAAAAAA1'), /INVALID_PAIRING_CODE|PAIRING_AUTHENTICATION_FAILED/);
  assert.throws(() => openPairingOffer({ ...sealed, expiresAt: new Date(Date.now() - 1000).toISOString() }, pairingCode), /PAIRING_EXPIRED|PAIRING_AUTHENTICATION_FAILED/);
});

test('file-prototype backend stores and reloads a 32-byte vault secret', async () => {
  const prev = process.env.ESCAPEHATCH_SYNC_KEY_BACKEND;
  process.env.ESCAPEHATCH_SYNC_KEY_BACKEND = 'file';
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-keystore-file-'));
  try {
    const created = await createProtectedSyncKey(root);
    assert.equal(created.backend, 'file-prototype');
    const loaded = await loadSyncKey(root);
    assert.equal(loaded.vaultId, created.vaultId);
    assert.deepEqual(loaded.key, created.key);
    await assert.rejects(createProtectedSyncKey(root), /SYNC_KEY_EXISTS/);
  } finally {
    if (prev === undefined) delete process.env.ESCAPEHATCH_SYNC_KEY_BACKEND;
    else process.env.ESCAPEHATCH_SYNC_KEY_BACKEND = prev;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Windows DPAPI round-trips the vault secret on this host when available', async (t) => {
  if (!preferWindowsDpapi()) {
    t.skip('Windows DPAPI backend not selected on this host');
    return;
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-keystore-dpapi-'));
  try {
    const key = generateSyncKey();
    const stored = await storeSyncKey(root, key, 'windows-dpapi');
    assert.equal(stored.backend, 'windows-dpapi');
    const files = await fs.readdir(root);
    assert.deepEqual(files, ['private-sync.key.dpapi']);
    const blob = await fs.readFile(path.join(root, 'private-sync.key.dpapi'));
    assert.equal(blob.equals(key), false);
    const loaded = await loadSyncKey(root);
    assert.deepEqual(loaded.key, key);
    assert.equal(loaded.vaultId, vaultIdForKey(key));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
