import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { emptyPreferences } from './src/lib/application-preferences.ts';
import { savePreferences, readPreferences } from './preference-file.ts';
import {
  createLocalSyncKey,
  exportPairingOffer,
  importPairingOffer,
  bindFolderCarrier,
  runPrivateSync,
} from './private-sync-device.ts';
import { projectReusablePreferences, projectionDigest } from './private-sync-crypto.ts';

test('paired alternate data-home pulls Cognizant fields without inheriting legacy private prefs', async () => {
  const prevBackend = process.env.ESCAPEHATCH_SYNC_KEY_BACKEND;
  const prevDataHome = process.env.ESCAPEHATCH_DATA_HOME;
  process.env.ESCAPEHATCH_SYNC_KEY_BACKEND = 'file';
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-cross-device-'));
  const desk = path.join(root, 'desk');
  const laptop = path.join(root, 'laptop');
  const carrier = path.join(root, 'carrier');
  await fs.mkdir(desk, { recursive: true });
  await fs.mkdir(laptop, { recursive: true });
  try {
    const prefs = emptyPreferences();
    for (const [id, value] of [
      ['talent_community.primary_areas', 'Synthetic Engineering'],
      ['talent_community.industry_preferences', 'Synthetic Healthcare'],
      ['talent_community.new_graduate_interest', 'No'],
    ] as const) {
      prefs.preferences[id] = {
        scope: 'profile_preference',
        source: 'user',
        value,
        updated_at: '2026-11-03T00:00:00Z',
      };
    }
    await savePreferences(prefs, path.join(desk, 'application-question-preferences.json'));
    await createLocalSyncKey({ dataHome: desk, carrier });
    await bindFolderCarrier({ dataHome: desk, carrier }, 'desk');
    assert.equal((await runPrivateSync({ dataHome: desk, carrier }, 'push')).state, 'PUSHED');

    const offer = await exportPairingOffer({ dataHome: desk, carrier });
    const { pairingCode, ...sealed } = offer;
    process.env.ESCAPEHATCH_DATA_HOME = laptop;
    assert.equal((await importPairingOffer({ dataHome: laptop, carrier }, sealed, pairingCode)).state, 'PAIRING_IMPORTED');
    assert.equal((await runPrivateSync({ dataHome: laptop, carrier }, 'pull')).state, 'PULLED');

    const deskProj = projectReusablePreferences(await readPreferences(path.join(desk, 'application-question-preferences.json')));
    const lapProj = projectReusablePreferences(await readPreferences(path.join(laptop, 'application-question-preferences.json')));
    assert.equal(projectionDigest(deskProj), projectionDigest(lapProj));
    assert.deepEqual(
      Object.keys(lapProj.entries).filter(k => k.startsWith('talent_community.')).sort(),
      [
        'talent_community.industry_preferences',
        'talent_community.new_graduate_interest',
        'talent_community.primary_areas',
      ],
    );
    // Alternate homes must not silently inherit developer legacy private prefs.
    assert.equal(Object.keys(lapProj.entries).some(k => k.startsWith('identity.')), false);
  } finally {
    if (prevBackend === undefined) delete process.env.ESCAPEHATCH_SYNC_KEY_BACKEND;
    else process.env.ESCAPEHATCH_SYNC_KEY_BACKEND = prevBackend;
    if (prevDataHome === undefined) delete process.env.ESCAPEHATCH_DATA_HOME;
    else process.env.ESCAPEHATCH_DATA_HOME = prevDataHome;
    await fs.rm(root, { recursive: true, force: true });
  }
});
