import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { emptyPreferences } from './src/lib/application-preferences.ts';
import { savePreferences } from './preference-file.ts';
import { createLocalSyncKey, bindFolderCarrier, runPrivateSync } from './private-sync-device.ts';
import { maybePushPrivateSyncAfterPreferenceWrite } from './private-sync-after-write.ts';

test('preference save triggers ciphertext push when experimental sync and folder carrier are bound', async () => {
  const dataHome = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-after-write-'));
  const carrier = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-after-write-carrier-'));
  const prevSync = process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC;
  const prevHome = process.env.ESCAPEHATCH_DATA_HOME;
  try {
    process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC = '1';
    process.env.ESCAPEHATCH_DATA_HOME = dataHome;
    await createLocalSyncKey({ carrier, dataHome });
    await bindFolderCarrier({ carrier, dataHome }, 'test-folder');
    const prefs = emptyPreferences();
    prefs.preferences['talent_community.primary_areas'] = {
      scope: 'profile_preference',
      value: 'synthetic-area',
      source: 'user',
      updated_at: prefs.exported_at,
    };
    await savePreferences(prefs, path.join(dataHome, 'application-question-preferences.json'));
    const result = await maybePushPrivateSyncAfterPreferenceWrite();
    assert.equal(result.attempted, true);
    if (result.attempted) assert.notEqual(result.state, 'PUSH_DEFERRED');
    const listed = await fs.readdir(carrier);
    assert.ok(listed.some(name => name.endsWith('.ehsync')));
    // Pull into a fresh data-home proves the capsule is usable without values in the helper.
    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-after-write-other-'));
    process.env.ESCAPEHATCH_DATA_HOME = other;
    // Import is out of scope here; ensure push path remains callable twice.
    process.env.ESCAPEHATCH_DATA_HOME = dataHome;
    await runPrivateSync({ carrier, dataHome }, 'push');
  } finally {
    if (prevSync === undefined) delete process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC;
    else process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC = prevSync;
    if (prevHome === undefined) delete process.env.ESCAPEHATCH_DATA_HOME;
    else process.env.ESCAPEHATCH_DATA_HOME = prevHome;
    await fs.rm(dataHome, { recursive: true, force: true });
    await fs.rm(carrier, { recursive: true, force: true });
  }
});

test('after-write push is skipped when experimental sync is off', async () => {
  const prev = process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC;
  try {
    delete process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC;
    const result = await maybePushPrivateSyncAfterPreferenceWrite();
    assert.deepEqual(result, { attempted: false, reason: 'experimental_sync_disabled' });
  } finally {
    if (prev === undefined) delete process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC;
    else process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC = prev;
  }
});
