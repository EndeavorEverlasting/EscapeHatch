/**
 * End-to-end encrypted, provider-neutral EscapeHatch answer capsule.
 * The canonical preference file is never uploaded. Capsules contain only
 * explicitly reusable, user-sourced answer preferences; no sessions, secrets,
 * discovered/unapproved memory, EEO/legal responses, or device consent toggles.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { questions, parsePreferences, PREFERENCE_SCHEMA, type Preference, type Preferences } from './src/lib/application-preferences.ts';

export const SYNC_ENVELOPE_SCHEMA = 'escapehatch/e2ee-preference-capsule/v1';
export const SYNC_PAYLOAD_SCHEMA = 'escapehatch/reusable-preference-projection/v1';
const allowed = new Set(questions.filter(q =>
  q.automation_policy === 'fill_if_explicit_preference' &&
  q.confirmation_policy === 'until_changed' &&
  ['personal', 'employment', 'preference'].includes(q.sensitivity) &&
  !/(password|passwd|secret|token|cookie|credential|otp|mfa|session|api_key|api_secret|auth_code)/i.test(q.id)
).map(q => q.id));

export type ReusableProjection = {
  schema: typeof SYNC_PAYLOAD_SCHEMA;
  entries: Record<string, Preference>;
};
export type SyncEnvelope = {
  schema: typeof SYNC_ENVELOPE_SCHEMA;
  vaultId: string;
  parent: string | null;
  deviceId: string;
  nonce: string;
  ciphertext: string;
  tag: string;
};
const hex64 = /^[a-f0-9]{64}$/;
const hex32 = /^[a-f0-9]{32}$/;
const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
function decoded(value: unknown, length: number | null, max: number): Buffer {
  if (typeof value !== 'string' || value.length > max || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('INVALID_CAPSULE');
  const bytes = Buffer.from(value, 'base64url');
  if ((length !== null && bytes.length !== length) || base64url(bytes) !== value) throw new Error('INVALID_CAPSULE');
  return bytes;
}
function secretKey(secret: Uint8Array): Buffer {
  if (!(secret instanceof Uint8Array) || secret.length !== 32) throw new Error('INVALID_DEVICE_KEY');
  return Buffer.from(secret);
}
export function vaultIdForKey(secret: Uint8Array): string {
  return createHmac('sha256', secretKey(secret)).update('escapehatch/e2ee-preference-capsule/v1/vault').digest('hex').slice(0, 32);
}
function encryptionKey(secret: Uint8Array, vaultId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secretKey(secret), Buffer.from(vaultId, 'hex'), Buffer.from('escapehatch/e2ee-preference-capsule/v1/aes-gcm'), 32));
}
export function projectReusablePreferences(input: unknown): ReusableProjection {
  const prefs = parsePreferences(input);
  if (!prefs) throw new Error('INVALID_LOCAL_PREFERENCES');
  const entries: Record<string, Preference> = {};
  for (const id of Object.keys(prefs.preferences).sort()) {
    const value = prefs.preferences[id];
    if (allowed.has(id) && value.source === 'user' && value.scope === 'profile_preference') entries[id] = value;
  }
  return { schema: SYNC_PAYLOAD_SCHEMA, entries };
}
export function projectionDigest(projection: ReusableProjection): string {
  return createHash('sha256').update(JSON.stringify(projection)).digest('hex');
}
export function validateProjection(input: unknown): ReusableProjection {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_SYNC_PROJECTION');
  const value = input as Partial<ReusableProjection>;
  if (value.schema !== SYNC_PAYLOAD_SCHEMA || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries) ||
    Object.keys(value).some(k => !['schema','entries'].includes(k))) throw new Error('INVALID_SYNC_PROJECTION');
  if (Object.keys(value.entries).some(k => !allowed.has(k))) throw new Error('FORBIDDEN_SYNC_FIELD');
  const parsed = parsePreferences({ schema_version: PREFERENCE_SCHEMA, exported_at: '2026-01-01T00:00:00Z', preferences: value.entries });
  if (!parsed || Object.keys(parsed.preferences).length !== Object.keys(value.entries).length) throw new Error('INVALID_SYNC_PROJECTION');
  return projectReusablePreferences(parsed);
}
function metadata(input: SyncEnvelope) {
  return JSON.stringify([input.schema, input.vaultId, input.parent, input.deviceId]);
}
export function sealProjection(projection: ReusableProjection, secret: Uint8Array, parent: string | null, deviceId: string): SyncEnvelope {
  const clean = validateProjection(projection);
  if (parent !== null && !hex64.test(parent)) throw new Error('INVALID_PARENT');
  if (!hex32.test(deviceId)) throw new Error('INVALID_DEVICE_ID');
  const vaultId = vaultIdForKey(secret);
  const nonce = randomBytes(12);
  const envelope: SyncEnvelope = { schema: SYNC_ENVELOPE_SCHEMA, vaultId, parent, deviceId, nonce: base64url(nonce), ciphertext: '', tag: '' };
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret, vaultId), nonce);
  cipher.setAAD(Buffer.from(metadata(envelope)));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(clean), 'utf8'), cipher.final()]);
  envelope.ciphertext = base64url(ciphertext);
  envelope.tag = base64url(cipher.getAuthTag());
  return envelope;
}
export function parseEnvelope(input: unknown): SyncEnvelope {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_CAPSULE');
  const e = input as SyncEnvelope;
  if (e.schema !== SYNC_ENVELOPE_SCHEMA || typeof e.vaultId !== 'string' || !hex32.test(e.vaultId) ||
      (e.parent !== null && (typeof e.parent !== 'string' || !hex64.test(e.parent))) ||
      typeof e.deviceId !== 'string' || !hex32.test(e.deviceId) ||
      Object.keys(e).length !== 7 || !['schema','vaultId','parent','deviceId','nonce','ciphertext','tag'].every(k => Object.hasOwn(e, k))) throw new Error('INVALID_CAPSULE');
  decoded(e.nonce, 12, 32); decoded(e.tag, 16, 32); decoded(e.ciphertext, null, 90000);
  return e;
}
export function openProjection(input: unknown, secret: Uint8Array): ReusableProjection {
  const envelope = parseEnvelope(input);
  if (vaultIdForKey(secret) !== envelope.vaultId) throw new Error('WRONG_VAULT_KEY');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret, envelope.vaultId), decoded(envelope.nonce, 12, 32));
  decipher.setAAD(Buffer.from(metadata(envelope)));
  decipher.setAuthTag(decoded(envelope.tag, 16, 32));
  let plaintext: Buffer;
  try { plaintext = Buffer.concat([decipher.update(decoded(envelope.ciphertext, null, 90000)), decipher.final()]); }
  catch { throw new Error('CAPSULE_AUTHENTICATION_FAILED'); }
  if (plaintext.length > 65536) throw new Error('INVALID_SYNC_PROJECTION');
  try { return validateProjection(JSON.parse(plaintext.toString('utf8'))); }
  catch { throw new Error('INVALID_SYNC_PROJECTION'); }
}
export function envelopeDigest(input: SyncEnvelope): string {
  return createHash('sha256').update(JSON.stringify(parseEnvelope(input))).digest('hex');
}
export function randomDeviceId(): string { return randomBytes(16).toString('hex'); }
export function generateSyncKey(): Buffer { return randomBytes(32); }
