import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { assertEscapeHatchOwnedTokenPath, writeCarrierConfig, readCarrierConfig } from './private-sync-config.ts';

test('carrier config refuses TokenCorridor credential paths', async () => {
  const forbidden = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'TokenCorridor', 'connectors', 'google.json');
  assert.throws(() => assertEscapeHatchOwnedTokenPath(forbidden), /FORBIDDEN_CONNECTOR_CREDENTIAL/);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-carrier-cfg-'));
  try {
    const file = path.join(root, 'private-sync-carrier.json');
    await writeCarrierConfig(file, {
      schema: 'escapehatch/private-sync-carrier-config/v1',
      kind: 'folder',
      principal: 'local-folder',
    });
    assert.equal((await readCarrierConfig(file))?.kind, 'folder');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
