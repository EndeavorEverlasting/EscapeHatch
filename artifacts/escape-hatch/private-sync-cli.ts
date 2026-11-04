/** Explicit local encrypted sync entrypoint; never prints applicant answers or key material. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createLocalSyncKey, exportPairingOffer, importPairingOffer, runPrivateSync } from './private-sync-device.ts';

const action = process.argv[2];
const carrier = process.argv[3];
const allowed = new Set(['init-key', 'push', 'pull', 'export-pairing', 'import-pairing']);
if (!allowed.has(action) || !carrier || !path.isAbsolute(carrier)) {
  process.stderr.write(
    'Usage: node --experimental-strip-types private-sync-cli.ts init-key|push|pull|export-pairing|import-pairing ABSOLUTE_CARRIER_PATH [PAIRING_FILE] [PAIRING_CODE]\n'
  );
  process.exitCode = 2;
} else {
  try {
    if (process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC !== '1' || !process.env.ESCAPEHATCH_DATA_HOME) {
      throw new Error('EXPERIMENTAL_SYNC_DISABLED');
    }
    if (action === 'push') await fs.mkdir(carrier, { recursive: true });
    if (action === 'init-key') {
      process.stdout.write(JSON.stringify(await createLocalSyncKey({ carrier })) + '\n');
    } else if (action === 'export-pairing') {
      const offer = await exportPairingOffer({ carrier });
      const outPath = process.argv[4];
      if (!outPath || !path.isAbsolute(outPath)) throw new Error('ABSOLUTE_PAIRING_FILE_REQUIRED');
      const { pairingCode, ...sealed } = offer;
      await fs.writeFile(outPath, JSON.stringify(sealed), { flag: 'wx', mode: 0o600 });
      // pairingCode is emitted alone so operators can transfer it out-of-band; never write it beside the sealed file.
      process.stdout.write(JSON.stringify({ state: 'PAIRING_EXPORTED', vaultId: sealed.vaultId, pairingFile: outPath, pairingCode }) + '\n');
    } else if (action === 'import-pairing') {
      const inPath = process.argv[4];
      const code = process.argv[5];
      if (!inPath || !path.isAbsolute(inPath) || !code) throw new Error('PAIRING_IMPORT_ARGS_REQUIRED');
      const sealed = JSON.parse(await fs.readFile(inPath, 'utf8'));
      process.stdout.write(JSON.stringify(await importPairingOffer({ carrier }, sealed, code)) + '\n');
    } else {
      process.stdout.write(JSON.stringify(await runPrivateSync({ carrier }, action as 'push' | 'pull')) + '\n');
    }
  } catch (e) {
    const code = e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : 'SYNC_FAILED';
    process.stderr.write('Sync refused: ' + code + '; existing profile preserved or checkpointed for review.\n');
    process.exitCode = 1;
  }
}
