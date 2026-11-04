import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { emptyPreferences } from './src/lib/application-preferences.ts';
import { savePreferences } from './preference-file.ts';
import { createLocalSyncKey, bindFolderCarrier } from './private-sync-device.ts';
import { observePrivateSyncStatus } from './private-sync-status.ts';

test('status reports Cognizant field ids without values and pairing-required when no vault', async () => {
  const prev = process.env.ESCAPEHATCH_SYNC_KEY_BACKEND;
  process.env.ESCAPEHATCH_SYNC_KEY_BACKEND = 'file';
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-sync-status-'));
  try {
    const prefs = emptyPreferences();
    prefs.preferences['talent_community.primary_areas'] = {
      scope: 'profile_preference',
      source: 'user',
      value: 'SECRET_SHOULD_NOT_APPEAR',
      updated_at: '2026-11-03T00:00:00Z',
    };
    await savePreferences(prefs, path.join(root, 'application-question-preferences.json'));
    const before = await observePrivateSyncStatus({ dataHome: root });
    assert.equal(before.status, 'PAIRING_REQUIRED');
    assert.deepEqual(before.cognizantTalentCommunityFieldsPresent, ['talent_community.primary_areas']);
    assert.equal(JSON.stringify(before).includes('SECRET_SHOULD_NOT_APPEAR'), false);
    assert.equal(typeof before.projectionDigest, 'string');
    assert.equal(before.projectionDigest?.length, 64);
    const carrier = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-sync-status-carrier-'));
    await createLocalSyncKey({ dataHome: root, carrier });
    const after = await observePrivateSyncStatus({ dataHome: root });
    assert.equal(after.status, 'LOCAL_ONLY');
    assert.equal(after.vaultPresent, true);
    assert.equal(after.projectionDigest, before.projectionDigest);
  } finally {
    if (prev === undefined) delete process.env.ESCAPEHATCH_SYNC_KEY_BACKEND;
    else process.env.ESCAPEHATCH_SYNC_KEY_BACKEND = prev;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('status reports CONFLICT from last-result marker without preference values', async () => {
  const prev = process.env.ESCAPEHATCH_SYNC_KEY_BACKEND;
  process.env.ESCAPEHATCH_SYNC_KEY_BACKEND = 'file';
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-sync-conflict-status-'));
  const carrier = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-sync-conflict-carrier-'));
  try {
    await createLocalSyncKey({ dataHome: root, carrier });
    await bindFolderCarrier({ dataHome: root, carrier }, 'test');
    await fs.writeFile(
      path.join(root, 'private-sync-last-result.json'),
      JSON.stringify({
        schema: 'escapehatch/private-sync-last-result/v1',
        at: new Date().toISOString(),
        action: 'push',
        state: 'CONFLICT',
        detail: 'SYNC_CONFLICT_REMOTE_ADVANCED',
      }),
      { mode: 0o600 },
    );
    const report = await observePrivateSyncStatus({ dataHome: root, carrier });
    assert.equal(report.status, 'CONFLICT');
    assert.ok(report.notes.some(n => n.includes('SYNC_CONFLICT')));
    assert.ok(report.notes.includes('LOCAL_LAST_KNOWN_GOOD_PRESERVED'));
  } finally {
    if (prev === undefined) delete process.env.ESCAPEHATCH_SYNC_KEY_BACKEND;
    else process.env.ESCAPEHATCH_SYNC_KEY_BACKEND = prev;
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(carrier, { recursive: true, force: true });
  }
});
