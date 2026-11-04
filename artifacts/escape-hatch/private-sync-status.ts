/**
 * Observed sync surface status for host UI. Never returns preference values.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { userDataRoot } from './user-data.ts';
import { keyPaths, loadSyncKey, preferWindowsDpapi } from './private-sync-keystore.ts';
import { defaultCarrierConfigPath, readCarrierConfig } from './private-sync-config.ts';
import { readOfflineQueue } from './private-sync-transport.ts';
import { projectReusablePreferences, projectionDigest } from './private-sync-crypto.ts';
import { readPreferences } from './preference-file.ts';

export type SyncUiStatus =
  | 'LOCAL_ONLY'
  | 'PAIRING_REQUIRED'
  | 'SYNCING'
  | 'SYNCED'
  | 'OFFLINE'
  | 'CONFLICT'
  | 'AUTH_REQUIRED'
  | 'REVOKED';

export type SyncStatusReport = {
  status: SyncUiStatus;
  vaultPresent: boolean;
  keyBackend: 'windows-dpapi' | 'file-prototype' | 'missing';
  carrierKind: 'folder' | 'google-drive-file' | 'unconfigured';
  offlineQueued: number;
  reusableAnswerCount: number;
  /** SHA-256 of reusable projection JSON; never includes preference values in this report object beyond digest. */
  projectionDigest: string | null;
  cognizantTalentCommunityFieldsPresent: string[];
  notes: string[];
};

export async function observePrivateSyncStatus(options: { dataHome?: string; carrier?: string } = {}): Promise<SyncStatusReport> {
  const root = path.resolve(options.dataHome || userDataRoot());
  const notes: string[] = [];
  const prefsPath = path.join(root, 'application-question-preferences.json');
  let reusableAnswerCount = 0;
  let digest: string | null = null;
  let cognizant: string[] = [];
  try {
    const prefs = await readPreferences(prefsPath);
    const projection = projectReusablePreferences(prefs);
    reusableAnswerCount = Object.keys(projection.entries).length;
    digest = reusableAnswerCount ? projectionDigest(projection) : null;
    cognizant = Object.keys(projection.entries)
      .filter(id => id.startsWith('talent_community.'))
      .sort();
  } catch {
    notes.push('PREFERENCES_UNREADABLE_OR_MISSING');
  }

  let keyBackend: SyncStatusReport['keyBackend'] = 'missing';
  let vaultPresent = false;
  try {
    const stored = await loadSyncKey(root);
    vaultPresent = true;
    keyBackend = stored.backend;
  } catch (e) {
    if ((e as Error).message !== 'SYNC_KEY_MISSING') notes.push('KEYSTORE_ERROR');
  }

  const keys = keyPaths(root);
  try {
    await fs.access(keys.raw);
    if (preferWindowsDpapi()) notes.push('RAW_KEY_SHOULD_MIGRATE_TO_DPAPI');
  } catch { /* absent is fine */ }

  const config = await readCarrierConfig(defaultCarrierConfigPath(root));
  const carrierKind = config?.kind || 'unconfigured';
  const queueFile = path.join(root, 'private-sync-offline-queue.json');
  const queue = await readOfflineQueue(queueFile);
  const offlineQueued = queue?.items.length || 0;

  if (!vaultPresent) {
    return {
      status: 'PAIRING_REQUIRED',
      vaultPresent,
      keyBackend,
      carrierKind,
      offlineQueued,
      reusableAnswerCount,
      projectionDigest: digest,
      cognizantTalentCommunityFieldsPresent: cognizant,
      notes,
    };
  }
  if (carrierKind === 'unconfigured') {
    return {
      status: 'LOCAL_ONLY',
      vaultPresent,
      keyBackend,
      carrierKind,
      offlineQueued,
      reusableAnswerCount,
      projectionDigest: digest,
      cognizantTalentCommunityFieldsPresent: cognizant,
      notes: [...notes, 'CARRIER_UNCONFIGURED'],
    };
  }
  if (offlineQueued > 0) {
    return {
      status: 'OFFLINE',
      vaultPresent,
      keyBackend,
      carrierKind,
      offlineQueued,
      reusableAnswerCount,
      projectionDigest: digest,
      cognizantTalentCommunityFieldsPresent: cognizant,
      notes: [...notes, 'OFFLINE_QUEUE_PENDING'],
    };
  }
  if (options.carrier) {
    try {
      await fs.access(options.carrier);
    } catch {
      notes.push('CARRIER_PATH_MISSING');
    }
  }
  let hasDeviceState = false;
  try {
    await fs.access(path.join(root, 'private-sync-device.json'));
    hasDeviceState = true;
  } catch { /* first sync not completed */ }
  return {
    status: hasDeviceState ? 'SYNCED' : 'LOCAL_ONLY',
    vaultPresent,
    keyBackend,
    carrierKind,
    offlineQueued,
    reusableAnswerCount,
    projectionDigest: digest,
    cognizantTalentCommunityFieldsPresent: cognizant,
    notes: hasDeviceState ? notes : [...notes, 'AWAITING_FIRST_PUSH_OR_PULL'],
  };
}
