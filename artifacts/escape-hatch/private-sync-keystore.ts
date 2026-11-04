/**
 * OS-backed vault-secret storage for private preference sync.
 * Prototype raw key files remain readable for synthetic tests only.
 * Live Windows sync requires DPAPI CurrentUser protection.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateSyncKey, vaultIdForKey } from './private-sync-crypto.ts';

export const KEYSTORE_SCHEMA = 'escapehatch/private-sync-keystore/v1';
export const PAIRING_SCHEMA = 'escapehatch/private-sync-pairing/v1';
const RAW_KEY = 'private-sync.key';
const DPAPI_KEY = 'private-sync.key.dpapi';
/** Long enough for phone sideload + offer pick; still short-lived SAS. */
const PAIRING_TTL_MS = 60 * 60 * 1000;

export type KeyBackend = 'windows-dpapi' | 'file-prototype';
export type StoredKey = { key: Buffer; backend: KeyBackend; vaultId: string };
export type PairingOffer = {
  schema: typeof PAIRING_SCHEMA;
  vaultId: string;
  createdAt: string;
  expiresAt: string;
  nonce: string;
  ciphertext: string;
  tag: string;
  /** Shown once to the operator; never written beside the sealed offer. */
  pairingCode: string;
};

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}
function fromB64url(value: string, expected?: number): Buffer {
  if (typeof value !== 'string' || value.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('INVALID_KEYSTORE_BLOB');
  const bytes = Buffer.from(value, 'base64url');
  if (b64url(bytes) !== value) throw new Error('INVALID_KEYSTORE_BLOB');
  if (expected !== undefined && bytes.length !== expected) throw new Error('INVALID_KEYSTORE_BLOB');
  return bytes;
}
function repoWindowsHelper(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', 'scripts', 'windows', 'EscapeHatch-PrivateSyncKey.ps1');
}
function runDpapi(action: 'Protect' | 'Unprotect', payload: string): string {
  if (process.platform !== 'win32') throw new Error('WINDOWS_DPAPI_REQUIRED');
  const script = repoWindowsHelper();
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', action, '-Payload', payload],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 }
  );
  if (result.status !== 0) {
    const err = `${result.stderr || ''}${result.stdout || ''}`.trim();
    if (/INVALID_SYNC_KEY/i.test(err)) throw new Error('INVALID_SYNC_KEY');
    if (/DPAPI_UNPROTECT_FAILED/i.test(err)) throw new Error('DPAPI_UNPROTECT_FAILED');
    throw new Error('DPAPI_HELPER_FAILED');
  }
  const out = (result.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
  if (!out) throw new Error('DPAPI_HELPER_FAILED');
  return out;
}
export function preferWindowsDpapi(): boolean {
  return process.platform === 'win32' && process.env.ESCAPEHATCH_SYNC_KEY_BACKEND !== 'file';
}
export function keyPaths(dataHome: string) {
  const root = path.resolve(dataHome);
  return {
    root,
    raw: path.join(root, RAW_KEY),
    dpapi: path.join(root, DPAPI_KEY),
  };
}
async function writeExclusive(file: string, bytes: Buffer) {
  const temp = file + '.' + randomBytes(8).toString('hex') + '.tmp';
  try {
    await fs.writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
export async function protectWithDpapi(key: Buffer): Promise<Buffer> {
  if (key.length !== 32) throw new Error('INVALID_SYNC_KEY');
  return fromB64url(runDpapi('Protect', b64url(key)));
}
export async function unprotectWithDpapi(blob: Buffer): Promise<Buffer> {
  const key = fromB64url(runDpapi('Unprotect', b64url(blob)), 32);
  if (key.length !== 32) throw new Error('INVALID_SYNC_KEY');
  return key;
}
async function assertNoExistingKey(p: ReturnType<typeof keyPaths>) {
  for (const file of [p.dpapi, p.raw]) {
    try {
      await fs.access(file);
      throw new Error('SYNC_KEY_EXISTS');
    } catch (e) {
      if ((e as Error).message === 'SYNC_KEY_EXISTS') throw e;
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
}
export async function storeSyncKey(
  dataHome: string,
  key: Buffer,
  backend: KeyBackend = preferWindowsDpapi() ? 'windows-dpapi' : 'file-prototype',
  options: { replace?: boolean } = {}
): Promise<StoredKey> {
  if (key.length !== 32) throw new Error('INVALID_SYNC_KEY');
  const p = keyPaths(dataHome);
  await fs.mkdir(p.root, { recursive: true, mode: 0o700 });
  if (!options.replace) await assertNoExistingKey(p);
  if (backend === 'windows-dpapi') {
    const blob = await protectWithDpapi(key);
    if (options.replace) await fs.rm(p.dpapi, { force: true }).catch(() => undefined);
    await writeExclusive(p.dpapi, blob);
    if (options.replace) await fs.rm(p.raw, { force: true });
    return { key, backend, vaultId: vaultIdForKey(key) };
  }
  // Live Windows hosts must use DPAPI. Tests may set ESCAPEHATCH_SYNC_KEY_BACKEND=file.
  if (process.platform === 'win32' && process.env.ESCAPEHATCH_SYNC_KEY_BACKEND !== 'file') {
    throw new Error('WINDOWS_DPAPI_REQUIRED');
  }
  if (options.replace) await fs.rm(p.raw, { force: true }).catch(() => undefined);
  await writeExclusive(p.raw, key);
  return { key, backend: 'file-prototype', vaultId: vaultIdForKey(key) };
}
export async function loadSyncKey(dataHome: string): Promise<StoredKey> {
  const p = keyPaths(dataHome);
  try {
    const blob = await fs.readFile(p.dpapi);
    if (blob.length < 16 || blob.length > 4096) throw new Error('INVALID_KEYSTORE_BLOB');
    const key = await unprotectWithDpapi(blob);
    return { key, backend: 'windows-dpapi', vaultId: vaultIdForKey(key) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  try {
    const key = await fs.readFile(p.raw);
    if (key.length !== 32) throw new Error('INVALID_SYNC_KEY');
    if (preferWindowsDpapi()) {
      // Auto-wrap prototype raw key into DPAPI; refuse to leave plaintext as the live store.
      await storeSyncKey(dataHome, key, 'windows-dpapi', { replace: true });
      return { key, backend: 'windows-dpapi', vaultId: vaultIdForKey(key) };
    }
    return { key, backend: 'file-prototype', vaultId: vaultIdForKey(key) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('SYNC_KEY_MISSING');
    throw e;
  }
}
export async function createProtectedSyncKey(dataHome: string): Promise<StoredKey> {
  const key = generateSyncKey();
  return storeSyncKey(dataHome, key, preferWindowsDpapi() ? 'windows-dpapi' : 'file-prototype');
}
function pairingKey(code: string, vaultId: string): Buffer {
  if (!/^[A-Z2-7]{16}$/.test(code)) throw new Error('INVALID_PAIRING_CODE');
  return Buffer.from(hkdfSync('sha256', Buffer.from(code, 'utf8'), Buffer.from(vaultId, 'hex'), Buffer.from('escapehatch/private-sync-pairing/v1'), 32));
}
function randomPairingCode(): string {
  // RFC 4648 Base32 alphabet — matches pairingKey validation.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = randomBytes(16);
  let out = '';
  for (const b of bytes) out += alphabet[b % 32];
  return out;
}
export function createPairingOffer(key: Buffer, now = Date.now()): PairingOffer {
  if (key.length !== 32) throw new Error('INVALID_SYNC_KEY');
  const vaultId = vaultIdForKey(key);
  const pairingCode = randomPairingCode();
  const nonce = randomBytes(12);
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + PAIRING_TTL_MS).toISOString();
  const aad = Buffer.from(JSON.stringify([PAIRING_SCHEMA, vaultId, createdAt, expiresAt]));
  const cipher = createCipheriv('aes-256-gcm', pairingKey(pairingCode, vaultId), nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(key), cipher.final()]);
  return {
    schema: PAIRING_SCHEMA,
    vaultId,
    createdAt,
    expiresAt,
    nonce: b64url(nonce),
    ciphertext: b64url(ciphertext),
    tag: b64url(cipher.getAuthTag()),
    pairingCode,
  };
}
export function openPairingOffer(offer: Omit<PairingOffer, 'pairingCode'> & { pairingCode?: string }, pairingCode: string, now = Date.now()): Buffer {
  if (!offer || offer.schema !== PAIRING_SCHEMA || typeof offer.vaultId !== 'string' || !/^[a-f0-9]{32}$/.test(offer.vaultId)) {
    throw new Error('INVALID_PAIRING_OFFER');
  }
  const expires = Date.parse(offer.expiresAt);
  const created = Date.parse(offer.createdAt);
  if (!Number.isFinite(expires) || !Number.isFinite(created) || now > expires || expires - created > PAIRING_TTL_MS + 1000) {
    throw new Error('PAIRING_EXPIRED');
  }
  const aad = Buffer.from(JSON.stringify([PAIRING_SCHEMA, offer.vaultId, offer.createdAt, offer.expiresAt]));
  const decipher = createDecipheriv('aes-256-gcm', pairingKey(pairingCode, offer.vaultId), fromB64url(offer.nonce, 12));
  decipher.setAAD(aad);
  decipher.setAuthTag(fromB64url(offer.tag, 16));
  let key: Buffer;
  try {
    key = Buffer.concat([decipher.update(fromB64url(offer.ciphertext, 32)), decipher.final()]);
  } catch {
    throw new Error('PAIRING_AUTHENTICATION_FAILED');
  }
  if (key.length !== 32 || vaultIdForKey(key) !== offer.vaultId) throw new Error('PAIRING_AUTHENTICATION_FAILED');
  return key;
}
export function pairingOfferDigest(offer: Omit<PairingOffer, 'pairingCode'>): string {
  return createHash('sha256').update(JSON.stringify({
    schema: offer.schema,
    vaultId: offer.vaultId,
    createdAt: offer.createdAt,
    expiresAt: offer.expiresAt,
    nonce: offer.nonce,
    ciphertext: offer.ciphertext,
    tag: offer.tag,
  })).digest('hex');
}
export function assertSameKey(a: Buffer, b: Buffer) {
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('KEY_MISMATCH');
}
