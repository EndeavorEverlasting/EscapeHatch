/**
 * Best-effort ciphertext push/pull around durable preference lifecycle.
 * Never fails preference save or host startup; offline queue / conflict markers absorb faults.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { runPrivateSync } from './private-sync-device.ts';
import { resolveFolderCarrierPath } from './private-sync-config.ts';
import { userDataRoot } from './user-data.ts';

export type PrivateSyncAfterWriteResult =
  | { attempted: false; reason: string }
  | { attempted: true; state: string; detail?: string };

const LAST_RESULT = 'private-sync-last-result.json';

export type PrivateSyncLastResult = {
  schema: 'escapehatch/private-sync-last-result/v1';
  at: string;
  action: 'push' | 'pull';
  state: string;
  detail?: string;
};

export async function readPrivateSyncLastResult(dataHome: string): Promise<PrivateSyncLastResult | null> {
  try {
    const raw = await fs.readFile(path.join(path.resolve(dataHome), LAST_RESULT), 'utf8');
    const parsed = JSON.parse(raw) as PrivateSyncLastResult;
    if (parsed?.schema !== 'escapehatch/private-sync-last-result/v1') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeLastResult(dataHome: string, result: Omit<PrivateSyncLastResult, 'schema' | 'at'>) {
  const payload: PrivateSyncLastResult = {
    schema: 'escapehatch/private-sync-last-result/v1',
    at: new Date().toISOString(),
    ...result,
  };
  const file = path.join(path.resolve(dataHome), LAST_RESULT);
  const temp = file + '.' + Date.now() + '.tmp';
  try {
    await fs.writeFile(temp, JSON.stringify(payload), { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

async function runGuarded(
  action: 'push' | 'pull',
  env: NodeJS.ProcessEnv,
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
    const result = await runPrivateSync({ carrier, dataHome }, action);
    const state = String((result as { state?: string }).state || action.toUpperCase());
    await writeLastResult(dataHome, { action, state });
    return { attempted: true, state };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'SYNC_FAILED';
    const state = detail.startsWith('SYNC_CONFLICT') ? 'CONFLICT' : action === 'push' ? 'PUSH_DEFERRED' : 'PULL_DEFERRED';
    await writeLastResult(dataHome, { action, state, detail });
    return { attempted: true, state, detail };
  }
}

export async function maybePushPrivateSyncAfterPreferenceWrite(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PrivateSyncAfterWriteResult> {
  return runGuarded('push', env);
}

/** Best-effort pull at host start so a second Windows device absorbs peer capsules. */
export async function maybePullPrivateSyncOnStartup(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PrivateSyncAfterWriteResult> {
  return runGuarded('pull', env);
}
