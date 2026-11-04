import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  assertEscapeHatchOwnedTokenPath,
  writeCarrierConfig,
  readCarrierConfig,
  resolveFolderCarrierPath,
} from './private-sync-config.ts';
import { DEFAULT_OAUTH_REDIRECT_PORT } from './private-sync-drive-oauth.ts';

test('Drive OAuth loopback default avoids PiShark port 8765', () => {
  assert.equal(DEFAULT_OAUTH_REDIRECT_PORT, 18767);
  assert.notEqual(DEFAULT_OAUTH_REDIRECT_PORT, 8765);
});

test('carrier config refuses TokenCorridor credential paths', async () => {
  const forbidden = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'TokenCorridor', 'connectors', 'google.json');
  assert.throws(() => assertEscapeHatchOwnedTokenPath(forbidden), /FORBIDDEN_CONNECTOR_CREDENTIAL/);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-carrier-cfg-'));
  try {
    const file = path.join(root, 'private-sync-carrier.json');
    const folderPath = path.join(root, 'carrier-folder');
    await writeCarrierConfig(file, {
      schema: 'escapehatch/private-sync-carrier-config/v1',
      kind: 'folder',
      principal: 'local-folder',
      folderPath,
    });
    const read = await readCarrierConfig(file);
    assert.equal(read?.kind, 'folder');
    if (read?.kind === 'folder') assert.equal(read.folderPath, folderPath);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('resolveFolderCarrierPath prefers env then stored folderPath', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-carrier-resolve-'));
  try {
    const folderPath = path.join(root, 'od-carrier');
    await writeCarrierConfig(path.join(root, 'private-sync-carrier.json'), {
      schema: 'escapehatch/private-sync-carrier-config/v1',
      kind: 'folder',
      principal: 'windows-desktop-onedrive',
      folderPath,
    });
    assert.equal(await resolveFolderCarrierPath(root, {}), folderPath);
    const override = path.join(root, 'override');
    assert.equal(
      await resolveFolderCarrierPath(root, { ESCAPEHATCH_PRIVATE_SYNC_CARRIER: override }),
      override,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
