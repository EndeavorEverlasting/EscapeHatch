/** Private, fail-closed recovery journal for the existing vpn-recovery transaction.
 * No VPN command runs here. Store the journal outside the repository and never
 * treat a missing/invalid provider snapshot as permission to disconnect.
 */
import { constants } from 'node:fs';
import { mkdir, open, readFile, lstat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { VpnJournal, VpnJournalEntry } from './vpn-recovery.ts';

export const VPN_RECOVERY_JOURNAL_FILE = 'restore-required.v1.json';

function valid(entry: unknown): entry is VpnJournalEntry {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const x = entry as Record<string, unknown>;
  return Object.keys(x).length === 3 &&
    x.phase === 'RESTORE_REQUIRED' &&
    typeof x.providerId === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(x.providerId) &&
    typeof x.connectionId === 'string' && x.connectionId.length > 0 && x.connectionId.length <= 200 &&
    !/[\r\n\x00-\x1f]/.test(x.connectionId);
}

/** Resolves a user-owned private journal path; not under the public checkout. */
export function defaultVpnJournalPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = process.platform === 'win32' ? env.LOCALAPPDATA : (env.XDG_STATE_HOME || join(homedir(), '.local', 'state'));
  if (!base) throw new Error('VPN_PRIVATE_STATE_DIRECTORY_UNAVAILABLE');
  return join(resolve(base), 'EscapeHatch', 'vpn-recovery', VPN_RECOVERY_JOURNAL_FILE);
}

function hasCode(error: unknown, code: string): boolean {
  return !!error && typeof error === 'object' && 'code' in error && (error as {code?: string}).code === code;
}

/** Creation is exclusive: concurrent app instances cannot replace a pending restore. */
export function createFileVpnJournal(filePath = defaultVpnJournalPath()): VpnJournal {
  if (!filePath.endsWith(VPN_RECOVERY_JOURNAL_FILE)) throw new Error('VPN_INVALID_JOURNAL_PATH');
  return {
    async read() {
      let stat;
      try { stat = await lstat(filePath); }
      catch (error) {
        if (hasCode(error, 'ENOENT')) return null;
        throw error;
      }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2048 || stat.size === 0) {
        throw new Error('VPN_JOURNAL_UNTRUSTED_MANUAL_RECOVERY_REQUIRED');
      }
      try {
        const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
        if (!valid(parsed)) throw new Error('invalid');
        return parsed;
      } catch {
        throw new Error('VPN_JOURNAL_UNTRUSTED_MANUAL_RECOVERY_REQUIRED');
      }
    },
    async write(entry) {
      if (!valid(entry)) throw new Error('VPN_INVALID_RESTORATION_ENTRY');
      await mkdir(resolve(filePath, '..'), { recursive: true, mode: 0o700 });
      // O_EXCL guarantees that this cannot clobber an existing restore record.
      const handle = await open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      try {
        await handle.writeFile(JSON.stringify(entry) + '\n', 'utf8');
        await handle.sync();
      } finally { await handle.close(); }
      // If a crash interrupted this write, read() fails closed on the next run.
      const saved = await this.read();
      if (saved?.providerId !== entry.providerId || saved?.connectionId !== entry.connectionId) {
        throw new Error('VPN_JOURNAL_WRITE_NOT_VERIFIED');
      }
    },
    async clear() {
      // Called by the recovery transaction only after connected-state readback.
      // Treat missing records as errors instead of silently assuming restoration.
      await unlink(filePath);
    },
  };
}
