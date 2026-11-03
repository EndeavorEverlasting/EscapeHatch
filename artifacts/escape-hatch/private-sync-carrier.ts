/** Encrypted capsule carrier. Never stores plaintext profiles or keys. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { envelopeDigest, parseEnvelope, openProjection } from './private-sync-crypto.ts';
export async function readCarrier(folder: string, key: Uint8Array) {
  if (!path.isAbsolute(folder)) throw new Error('ABSOLUTE_PATH_REQUIRED');
  const files = await fs.readdir(folder).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
  const found = [];
  for (const file of files.filter(f => f.endsWith('.ehsync'))) {
    const envelope = parseEnvelope(JSON.parse(await fs.readFile(path.join(folder, file), 'utf8')));
    if (file !== envelopeDigest(envelope) + '.ehsync') throw new Error('CARRIER_TAMPERED');
    found.push({ file, envelope, answers: openProjection(envelope, key) });
  }
  return found;
}
