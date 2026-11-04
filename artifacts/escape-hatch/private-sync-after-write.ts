/**
 * Best-effort ciphertext push after a durable preference write.
 * Never fails the preference save; offline queue absorbs transport faults.
 */
import { runPrivateSync } from './private-sync-device.ts';
import { resolveFolderCarrierPath } from './private-sync-config.ts';
import { userDataRoot } from './user-data.ts';

export type PrivateSyncAfterWriteResult =
  | { attempted: false; reason: string }
  | { attempted: true; state: string; detail?: string };

export async function maybePushPrivateSyncAfterPreferenceWrite(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PrivateSyncAfterWriteResult> {
  if (env.ESCAPEHATCH_EXPERIMENTAL_SYNC !== '1') {
    return { attempted: false, reason: 'experimental_sync_disabled' };
  }
  const dataHome = env.ESCAPEHATCH_DATA_HOME || userDataRoot(env);
  const carrier = await resolveFolderCarrierPath(dataHome, env);
  if (!carrier) {
    return { attempted: false, reason: 'folder_carrier_path_unconfigured' };
  }
  try {
    const result = await runPrivateSync({ carrier, dataHome }, 'push');
    return { attempted: true, state: String((result as { state?: string }).state || 'PUSHED') };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'SYNC_FAILED';
    // Preference bytes already persisted; do not roll them back.
    return { attempted: true, state: 'PUSH_DEFERRED', detail };
  }
}
