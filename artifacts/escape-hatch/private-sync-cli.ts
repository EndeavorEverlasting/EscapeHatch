/** Explicit local encrypted sync entrypoint; never prints applicant answers or key material. */
import fs from 'node:fs/promises';
import os from 'node:os';
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
import { authorizeDriveFileAccess, defaultOAuthClientPath } from './private-sync-drive-oauth.ts';

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
  'authorize-drive',
]);
if (!allowed.has(action) || (!['status', 'authorize-drive'].includes(action) && (!carrier || !path.isAbsolute(carrier)))) {
  process.stderr.write(
    'Usage: node --experimental-strip-types private-sync-cli.ts status|authorize-drive|init-key|push|pull|export-pairing|import-pairing|bind-folder|bind-drive [ABSOLUTE_CARRIER_PATH] ...\n' +
      '  import-pairing CARRIER ABSOLUTE_OFFER_FILE PAIRING_CODE\n' +
      '  export-pairing CARRIER ABSOLUTE_OFFER_OUT\n'
  );
  process.exitCode = 2;
} else {
  try {
    if (process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC !== '1' || !process.env.ESCAPEHATCH_DATA_HOME) {
      throw new Error('EXPERIMENTAL_SYNC_DISABLED');
    }
    // Live Windows CLI must not silently accept plaintext file-prototype keys.
    if (process.platform === 'win32' && process.env.ESCAPEHATCH_SYNC_KEY_BACKEND === 'file') {
      throw new Error('WINDOWS_DPAPI_REQUIRED_CLEAR_ESCAPEHATCH_SYNC_KEY_BACKEND');
    }
    const dataHome = process.env.ESCAPEHATCH_DATA_HOME;
    if (action === 'status') {
      process.stdout.write(JSON.stringify(await observePrivateSyncStatus({
        dataHome,
        carrier: carrier && path.isAbsolute(carrier) ? carrier : undefined,
      })) + '\n');
    } else if (action === 'authorize-drive') {
      process.stdout.write(JSON.stringify({
        ...(await authorizeDriveFileAccess()),
        clientConfigPath: defaultOAuthClientPath(),
      }) + '\n');
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
      // Replace any prior sealed offer at this path (keepalive/refresh). Never append codes into the file.
      try {
        await fs.unlink(outPath);
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err?.code !== 'ENOENT') throw e;
      }
      await fs.writeFile(outPath, JSON.stringify(sealed), { flag: 'wx', mode: 0o600 });
      // Pairing code stays in TEMP only — never echo it on stdout (agent/CI logs).
      const codePath = path.join(os.tmpdir(), 'pairing-code.local.txt');
      await fs.writeFile(codePath, pairingCode, { mode: 0o600 });
      process.stdout.write(
        JSON.stringify({
          state: 'PAIRING_EXPORTED',
          vaultId: sealed.vaultId,
          pairingFile: outPath,
          pairingCodePath: codePath,
          pairingCode: 'written_to_temp_only',
        }) + '\n',
      );
    } else if (action === 'import-pairing') {
      const inPath = process.argv[4];
      const code = process.argv[5];
      if (!inPath || !path.isAbsolute(inPath) || !code) throw new Error('PAIRING_IMPORT_ARGS_REQUIRED');
      const sealed = JSON.parse(await fs.readFile(inPath, 'utf8'));
      const imported = await importPairingOffer({ carrier, dataHome }, sealed, code);
      // Paired devices need the same absolute folder carrier binding for status/push/pull.
      const bound = await bindFolderCarrier({ carrier, dataHome }, 'paired-folder');
      process.stdout.write(JSON.stringify({
        ...imported,
        carrierBound: bound.state,
        folderPath: bound.folderPath,
        principal: bound.principal,
      }) + '\n');
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
