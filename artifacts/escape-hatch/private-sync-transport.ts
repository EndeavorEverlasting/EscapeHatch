/**
 * Ciphertext-only sync transports. Providers see authenticated capsules and opaque ids —
 * never plaintext preferences, vault secrets, or pairing codes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { envelopeDigest, parseEnvelope, type SyncEnvelope } from './private-sync-crypto.ts';

export type CapsuleObject = {
  id: string;
  etag: string;
  envelope: SyncEnvelope;
  bytes: Buffer;
};
export type TransportListItem = { id: string; etag: string; size: number };
export type SyncTransport = {
  kind: 'folder' | 'google-drive-file';
  principal: string;
  list(): Promise<TransportListItem[]>;
  get(id: string): Promise<CapsuleObject>;
  /** CAS put: if ifMatch is set, provider must reject stale revisions. */
  put(envelope: SyncEnvelope, ifMatch?: string | null): Promise<TransportListItem>;
};

export const OFFLINE_QUEUE_SCHEMA = 'escapehatch/private-sync-offline-queue/v1';
type QueueItem = {
  id: string;
  envelope: SyncEnvelope;
  enqueuedAt: string;
  attempts: number;
  lastError?: string;
};
type OfflineQueue = { schema: typeof OFFLINE_QUEUE_SCHEMA; principal: string; items: QueueItem[] };

export function capsuleBytes(envelope: SyncEnvelope): Buffer {
  const clean = parseEnvelope(envelope);
  const id = envelopeDigest(clean);
  const body = Buffer.from(JSON.stringify(clean), 'utf8');
  if (body.length > 110000) throw new Error('CAPSULE_TOO_LARGE');
  return body;
}
export function capsuleId(envelope: SyncEnvelope): string {
  return envelopeDigest(parseEnvelope(envelope));
}
export function etagForBytes(bytes: Buffer): string {
  return '"' + createHash('sha256').update(bytes).digest('hex') + '"';
}
export function assertCiphertextOnly(bytes: Buffer, forbidden: string[]) {
  const text = bytes.toString('utf8');
  for (const fragment of forbidden) {
    if (fragment && text.includes(fragment)) throw new Error('PLAINTEXT_LEAK_REFUSED');
  }
}
export async function readOfflineQueue(file: string): Promise<OfflineQueue | null> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    if (raw.length > 2_000_000) throw new Error('OFFLINE_QUEUE_TOO_LARGE');
    const parsed = JSON.parse(raw) as OfflineQueue;
    if (parsed?.schema !== OFFLINE_QUEUE_SCHEMA || typeof parsed.principal !== 'string' || !Array.isArray(parsed.items)) {
      throw new Error('INVALID_OFFLINE_QUEUE');
    }
    return parsed;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
async function writeOfflineQueue(file: string, queue: OfflineQueue) {
  const temp = file + '.' + randomBytes(8).toString('hex') + '.tmp';
  try {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(temp, JSON.stringify(queue), { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
export async function enqueueOfflineCapsule(file: string, principal: string, envelope: SyncEnvelope) {
  const id = capsuleId(envelope);
  const existing = (await readOfflineQueue(file)) || { schema: OFFLINE_QUEUE_SCHEMA, principal, items: [] as QueueItem[] };
  if (existing.principal !== principal) throw new Error('OFFLINE_QUEUE_PRINCIPAL_MISMATCH');
  if (existing.items.some(item => item.id === id)) return existing;
  if (existing.items.length >= 64) throw new Error('OFFLINE_QUEUE_FULL');
  existing.items.push({ id, envelope: parseEnvelope(envelope), enqueuedAt: new Date().toISOString(), attempts: 0 });
  await writeOfflineQueue(file, existing);
  return existing;
}
export async function flushOfflineQueue(
  file: string,
  transport: SyncTransport,
  options: { maxAttempts?: number } = {}
): Promise<{ flushed: number; remaining: number; conflicts: string[] }> {
  const maxAttempts = options.maxAttempts ?? 5;
  const queue = await readOfflineQueue(file);
  if (!queue) return { flushed: 0, remaining: 0, conflicts: [] };
  if (queue.principal !== transport.principal) throw new Error('OFFLINE_QUEUE_PRINCIPAL_MISMATCH');
  const remaining: QueueItem[] = [];
  const conflicts: string[] = [];
  let flushed = 0;
  for (const item of queue.items) {
    try {
      await transport.put(item.envelope, null);
      flushed++;
    } catch (e) {
      const code = e instanceof Error ? e.message : 'SYNC_FAILED';
      if (code === 'SYNC_CONFLICT_CAS' || code === 'SYNC_CONFLICT_REMOTE_ADVANCED') {
        conflicts.push(item.id);
        remaining.push({ ...item, attempts: item.attempts + 1, lastError: code });
      } else if (item.attempts + 1 >= maxAttempts) {
        remaining.push({ ...item, attempts: item.attempts + 1, lastError: code });
      } else {
        remaining.push({ ...item, attempts: item.attempts + 1, lastError: code });
      }
    }
  }
  await writeOfflineQueue(file, { ...queue, items: remaining });
  return { flushed, remaining: remaining.length, conflicts };
}

/** Local folder transport used for development and same-host experiments. */
export function folderTransport(folder: string, principal = 'local-folder'): SyncTransport {
  if (!path.isAbsolute(folder)) throw new Error('ABSOLUTE_PATH_REQUIRED');
  return {
    kind: 'folder',
    principal,
    async list() {
      const files = await fs.readdir(folder).catch(e => {
        if (e.code === 'ENOENT') return [];
        throw e;
      });
      const items: TransportListItem[] = [];
      for (const file of files.filter(f => f.endsWith('.ehsync'))) {
        if (!/^[a-f0-9]{64}\.ehsync$/.test(file)) throw new Error('BAD_CAPSULE_FILENAME');
        const full = path.join(folder, file);
        const st = await fs.lstat(full);
        if (!st.isFile() || st.size > 110000) throw new Error('CAPSULE_FILE_REJECTED');
        const bytes = await fs.readFile(full);
        items.push({ id: file.replace(/\.ehsync$/, ''), etag: etagForBytes(bytes), size: bytes.length });
      }
      return items;
    },
    async get(id: string) {
      if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('BAD_CAPSULE_ID');
      const bytes = await fs.readFile(path.join(folder, id + '.ehsync'));
      if (bytes.length > 110000) throw new Error('CAPSULE_FILE_REJECTED');
      const envelope = parseEnvelope(JSON.parse(bytes.toString('utf8')));
      if (capsuleId(envelope) !== id) throw new Error('CARRIER_TAMPERED');
      return { id, etag: etagForBytes(bytes), envelope, bytes };
    },
    async put(envelope: SyncEnvelope, ifMatch?: string | null) {
      const clean = parseEnvelope(envelope);
      const id = capsuleId(clean);
      const bytes = capsuleBytes(clean);
      await fs.mkdir(folder, { recursive: true });
      const target = path.join(folder, id + '.ehsync');
      try {
        const existing = await fs.readFile(target);
        const current = etagForBytes(existing);
        if (ifMatch && ifMatch !== current) throw new Error('SYNC_CONFLICT_CAS');
        if (!existing.equals(bytes)) throw new Error('CARRIER_TAMPERED');
        return { id, etag: current, size: existing.length };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        if (ifMatch) throw new Error('SYNC_CONFLICT_CAS');
      }
      const temp = target + '.' + randomBytes(8).toString('hex') + '.tmp';
      try {
        await fs.writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
        await fs.rename(temp, target);
      } finally {
        await fs.rm(temp, { force: true });
      }
      return { id, etag: etagForBytes(bytes), size: bytes.length };
    },
  };
}
