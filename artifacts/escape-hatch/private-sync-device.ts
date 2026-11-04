/**
 * Private, conflict-safe sync of the existing preference file.
 * A locally configured encrypted carrier is a transport, not a second profile.
 * The vault secret is provisioned via OS keystore / explicit pairing — NEVER written into the carrier.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { userDataRoot } from './user-data.ts';
import { readPreferences, updatePreferences } from './preference-file.ts';
import { readCarrier } from './private-sync-carrier.ts';
import { uniqueCarrierHead, isDescendantOf } from './private-sync-chain.ts';
import { sealProjection, openProjection, envelopeDigest, projectReusablePreferences, projectionDigest } from './private-sync-crypto.ts';
import {
  createProtectedSyncKey,
  createPairingOffer,
  loadSyncKey,
  openPairingOffer,
  storeSyncKey,
  type PairingOffer,
} from './private-sync-keystore.ts';
import { enqueueOfflineCapsule, flushOfflineQueue, folderTransport } from './private-sync-transport.ts';
import {
  defaultCarrierConfigPath,
  defaultDriveTokenPath,
  readCarrierConfig,
  readDriveTokenFile,
  writeCarrierConfig,
  type CarrierConfig,
} from './private-sync-config.ts';
import { googleDriveTransport } from './private-sync-drive-transport.ts';
import type { SyncTransport } from './private-sync-transport.ts';

const SCHEMA = 'escapehatch/private-sync-device/v1';
type State = { schema: typeof SCHEMA; vaultId: string; deviceId: string; head: string | null; localDigest: string };
export type Options = { carrier: string; dataHome?: string; preferencesFile?: string; principal?: string };
function paths(o: Options) {
  if (!path.isAbsolute(o.carrier)) throw new Error('ABSOLUTE_CARRIER_REQUIRED');
  const root = path.resolve(o.dataHome || userDataRoot()), carrier = path.resolve(o.carrier);
  if (root === carrier || carrier.startsWith(root + path.sep) || root.startsWith(carrier + path.sep)) {
    throw new Error('CARRIER_OVERLAPS_PRIVATE_ROOT');
  }
  return {
    root,
    carrier,
    state: path.join(root, 'private-sync-device.json'),
    prefs: o.preferencesFile || path.join(root, 'application-question-preferences.json'),
    queue: path.join(root, 'private-sync-offline-queue.json'),
    config: defaultCarrierConfigPath(root),
  };
}
async function resolveTransport(o: Options, p: ReturnType<typeof paths>): Promise<SyncTransport> {
  const config = await readCarrierConfig(p.config);
  if (!config || config.kind === 'folder') {
    return folderTransport(p.carrier, o.principal || config?.principal || 'local-folder');
  }
  const token = await readDriveTokenFile(config.tokenFile);
  if (token.principal !== config.principal) throw new Error('PROVIDER_PRINCIPAL_CHANGED');
  return googleDriveTransport({
    folderId: config.folderId,
    expectedPrincipal: config.principal,
    tokenProvider: async () => ({
      accessToken: token.accessToken,
      principal: token.principal,
      expiresAt: token.expiresAt,
    }),
  });
}
async function stateAt(p: string, vaultId: string): Promise<State | null> {
  let raw: string;
  try { raw = await fs.readFile(p, 'utf8'); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  if (raw.length > 4096) throw new Error('INVALID_SYNC_STATE');
  const s = JSON.parse(raw) as State;
  if (s?.schema !== SCHEMA || s.vaultId !== vaultId || !(/^[a-f0-9]{32}$/).test(s.deviceId) ||
    (s.head !== null && !(/^[a-f0-9]{64}$/).test(s.head)) || !(/^[a-f0-9]{64}$/).test(s.localDigest)) {
    throw new Error('INVALID_SYNC_STATE');
  }
  return s;
}
async function stateWrite(p: string, s: State) {
  const temp = p + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temp, JSON.stringify(s), { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, p);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
export async function createLocalSyncKey(o: Options) {
  const p = paths(o);
  const stored = await createProtectedSyncKey(p.root);
  return { state: 'KEY_CREATED_LOCAL_ONLY', vaultId: stored.vaultId, backend: stored.backend };
}
export async function exportPairingOffer(o: Options): Promise<PairingOffer> {
  const p = paths(o);
  const stored = await loadSyncKey(p.root);
  return createPairingOffer(stored.key);
}
export async function importPairingOffer(o: Options, offer: Omit<PairingOffer, 'pairingCode'>, pairingCode: string) {
  const p = paths(o);
  const key = openPairingOffer(offer, pairingCode);
  const stored = await storeSyncKey(p.root, key); // fails closed if a vault key already exists
  return { state: 'PAIRING_IMPORTED', vaultId: stored.vaultId, backend: stored.backend };
}
export async function bindFolderCarrier(o: Options, principal = 'local-folder') {
  const p = paths(o);
  const config: CarrierConfig = { schema: 'escapehatch/private-sync-carrier-config/v1', kind: 'folder', principal };
  await writeCarrierConfig(p.config, config);
  return { state: 'CARRIER_BOUND_FOLDER', principal };
}
export async function bindDriveCarrier(o: Options, input: { principal: string; folderId: string; tokenFile?: string }) {
  const p = paths(o);
  const tokenFile = input.tokenFile || defaultDriveTokenPath();
  const config: CarrierConfig = {
    schema: 'escapehatch/private-sync-carrier-config/v1',
    kind: 'google-drive-file',
    principal: input.principal,
    folderId: input.folderId,
    tokenFile,
  };
  await writeCarrierConfig(p.config, config);
  return { state: 'CARRIER_BOUND_DRIVE', principal: input.principal, folderId: input.folderId, tokenFile };
}
export async function runPrivateSync(o: Options, action: 'push' | 'pull') {
  const p = paths(o);
  const stored = await loadSyncKey(p.root);
  const key = stored.key;
  const vaultId = stored.vaultId;
  const transport = await resolveTransport(o, p);
  if (action === 'push') {
    try {
      await flushOfflineQueue(p.queue, transport);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'SYNC_FAILED';
      if (!['AUTH_REQUIRED', 'PROVIDER_REVOKED', 'PROVIDER_LIST_FAILED', 'PROVIDER_PUT_FAILED'].includes(code)) throw e;
    }
  }
  const entries = transport.kind === 'folder'
    ? await readCarrier(p.carrier, key)
    : await (async () => {
      const listed = await transport.list();
      const found = [];
      for (const item of listed) {
        const obj = await transport.get(item.id);
        found.push({
          file: item.id + '.ehsync',
          envelope: obj.envelope,
          answers: openProjection(obj.envelope, key),
        });
      }
      return found;
    })();
  const tip = uniqueCarrierHead(entries), state = await stateAt(p.state, vaultId);
  const local = await readPreferences(p.prefs), projection = projectReusablePreferences(local), digest = projectionDigest(projection);
  const head = tip?.file.replace(/\.ehsync$/, '') || null;
  if (action === 'push') {
    if (!Object.keys(projection.entries).length) throw new Error('EMPTY_EXPORT_REFUSED');
    if (!state && tip) throw new Error('PAIR_BY_PULL_FIRST');
    if (state && state.head !== head) throw new Error('SYNC_CONFLICT_REMOTE_ADVANCED');
    if (state && state.localDigest === digest) return { state: 'UP_TO_DATE', vaultId, count: entries.length, backend: stored.backend };
    const deviceId = state?.deviceId || randomUUID().replaceAll('-', '');
    const capsule = sealProjection(projection, key, head, deviceId);
    const id = envelopeDigest(capsule);
    try {
      await transport.put(capsule, null);
      // Keep local folder mirror for folder carriers and offline inspection.
      if (transport.kind === 'folder') {
        await fs.mkdir(p.carrier, { recursive: true });
        const target = path.join(p.carrier, id + '.ehsync');
        try { await fs.access(target); } catch {
          await fs.writeFile(target, JSON.stringify(capsule), { flag: 'wx', mode: 0o600 });
        }
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : 'SYNC_FAILED';
      if (['AUTH_REQUIRED', 'PROVIDER_REVOKED', 'PROVIDER_PUT_FAILED'].includes(code)) {
        await enqueueOfflineCapsule(p.queue, transport.principal, capsule);
        return { state: 'QUEUED_OFFLINE', vaultId, count: entries.length, backend: stored.backend, reason: code };
      }
      throw e;
    }
    await stateWrite(p.state, { schema: SCHEMA, vaultId, deviceId, head: id, localDigest: digest });
    return { state: 'PUSHED', vaultId, count: entries.length + 1, backend: stored.backend };
  }
  if (!tip) return { state: 'NO_REMOTE', vaultId, count: 0, backend: stored.backend };
  if (state && !isDescendantOf(entries, state.head, tip)) throw new Error('SYNC_CONFLICT_REMOTE_DIVERGED');
  if (state?.head === head) {
    if (state.localDigest !== digest) throw new Error('LOCAL_UNSYNCED_CHANGES');
    return { state: 'UP_TO_DATE', vaultId, count: entries.length, backend: stored.backend };
  }
  const remoteDigest = projectionDigest(tip.answers);
  const blank = Object.keys(projection.entries).length === 0;
  if ((state ? digest !== state.localDigest : !blank) && digest !== remoteDigest) throw new Error('SYNC_CONFLICT_LOCAL_CHANGES');
  if (digest !== remoteDigest) await updatePreferences(current => {
    const localNow = projectReusablePreferences(current);
    if (projectionDigest(localNow) !== digest) throw new Error('SYNC_CONFLICT_LOCAL_CHANGES');
    const next = { ...current, preferences: { ...current.preferences } };
    for (const id of Object.keys(localNow.entries)) delete next.preferences[id];
    Object.assign(next.preferences, tip.answers.entries);
    return next;
  }, p.prefs);
  await stateWrite(p.state, {
    schema: SCHEMA,
    vaultId,
    deviceId: state?.deviceId || randomUUID().replaceAll('-', ''),
    head,
    localDigest: remoteDigest,
  });
  return { state: 'PULLED', vaultId, count: entries.length, backend: stored.backend };
}
