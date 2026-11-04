/** Explicit local encrypted sync entrypoint; never prints applicant answers or key material. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  bindDriveCarrier,
  bindFolderCarrier,
  createLocalSyncKey,
  exportPairingOffer,
  importPairingOffer,
  runPrivateSync,
} from './private-sync-device.ts';
import { observePrivateSyncStatus } from './private-sync-status.ts';

const action = process.argv[2];
const carrier = process.argv[3];
const allowed = new Set([
  'init-key',
  'push',
  'pull',
  'export-pairing',
  'import-pairing',
  'status',
  'bind-folder',
  'bind-drive',
]);
if (!allowed.has(action) || (action !== 'status' && (!carrier || !path.isAbsolute(carrier)))) {
  process.stderr.write(
    'Usage: node --experimental-strip-types private-sync-cli.ts status|init-key|push|pull|export-pairing|import-pairing|bind-folder|bind-drive [ABSOLUTE_CARRIER_PATH] ...\n'
  );
  process.exitCode = 2;
} else {
  try {
    if (process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC !== '1' || !process.env.ESCAPEHATCH_DATA_HOME) {
      throw new Error('EXPERIMENTAL_SYNC_DISABLED');
    }
    const dataHome = process.env.ESCAPEHATCH_DATA_HOME;
    if (action === 'status') {
      process.stdout.write(JSON.stringify(await observePrivateSyncStatus({
        dataHome,
        carrier: carrier && path.isAbsolute(carrier) ? carrier : undefined,
      })) + '\n');
    } else if (action === 'push') {
      await fs.mkdir(carrier, { recursive: true });
      process.stdout.write(JSON.stringify(await runPrivateSync({ carrier, dataHome }, 'push')) + '\n');
    } else if (action === 'init-key') {
      process.stdout.write(JSON.stringify(await createLocalSyncKey({ carrier, dataHome })) + '\n');
    } else if (action === 'export-pairing') {
      const offer = await exportPairingOffer({ carrier, dataHome });
      const outPath = process.argv[4];
      if (!outPath || !path.isAbsolute(outPath)) throw new Error('ABSOLUTE_PAIRING_FILE_REQUIRED');
      const { pairingCode, ...sealed } = offer;
      await fs.writeFile(outPath, JSON.stringify(sealed), { flag: 'wx', mode: 0o600 });
      process.stdout.write(JSON.stringify({ state: 'PAIRING_EXPORTED', vaultId: sealed.vaultId, pairingFile: outPath, pairingCode }) + '\n');
    } else if (action === 'import-pairing') {
      const inPath = process.argv[4];
      const code = process.argv[5];
      if (!inPath || !path.isAbsolute(inPath) || !code) throw new Error('PAIRING_IMPORT_ARGS_REQUIRED');
      const sealed = JSON.parse(await fs.readFile(inPath, 'utf8'));
      process.stdout.write(JSON.stringify(await importPairingOffer({ carrier, dataHome }, sealed, code)) + '\n');
    } else if (action === 'bind-folder') {
      process.stdout.write(JSON.stringify(await bindFolderCarrier({ carrier, dataHome }, process.argv[4] || 'local-folder')) + '\n');
    } else if (action === 'bind-drive') {
      const principal = process.argv[4];
      const folderId = process.argv[5];
      if (!principal || !folderId) throw new Error('DRIVE_BIND_ARGS_REQUIRED');
      process.stdout.write(JSON.stringify(await bindDriveCarrier({ carrier, dataHome }, { principal, folderId })) + '\n');
    } else {
      process.stdout.write(JSON.stringify(await runPrivateSync({ carrier, dataHome }, action as 'push' | 'pull')) + '\n');
    }
  } catch (e) {
    const code = e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : 'SYNC_FAILED';
    process.stderr.write('Sync refused: ' + code + '; existing profile preserved or checkpointed for review.\n');
    process.exitCode = 1;
  }
}
