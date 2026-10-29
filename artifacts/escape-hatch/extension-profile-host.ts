/** Private native-messaging projection owner. Chrome authenticates the caller
 * through allowed_origins; names/email never establish applicant ownership.
 * Returned projections authorize this host snapshot, not an atomic browser write.
 */
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { userDataRoot } from './user-data.ts';
import { readWorkspace } from './workspace-file.ts';
import { readPreferences } from './preference-file.ts';
import { PROFILE_KEY, parseProfileStorage, type Profile } from './src/lib/storage.ts';
import { emptyPreferences, questions, reusableValue, type Preferences } from './src/lib/application-preferences.ts';
import { OWNER_BINDING_SCHEMA, AGENT_CONTEXT_SCHEMA, parseWorkspaceOwnerBinding, authorizeAgentContext, type WorkspaceOwnerBinding } from './src/lib/workspace-owner-binding.ts';
import { EXTENSION_PROFILE_FIELDS, admitExtensionProfileProjection, type ApprovedExtensionProfile } from './src/lib/extension-profile-admission.ts';

export const PROFILE_HOST_NAME = 'com.escapehatch.profile';
export const PAIRING_SCHEMA = 'escapehatch/extension-native-pairing/v1';
export const SAFE_ANSWER_IDS = [
  'identity.professional_title', 'identity.website', 'education.highest_completed_level',
  'education.institution', 'education.credential', 'education.field_of_study',
  'education.dates', 'interview.live_coding_comfort',
] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = /^[a-f0-9]{64}$/;
const profileFields = [...EXTENSION_PROFILE_FIELDS, 'phone_authority'];
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail = (reason: string) => ({ ok: false as const, reason });
export type ReviewItem = { id: string; label: string; value: string };
export type HostRequest = {
  protocol: 1; action: 'status' | 'confirm' | 'project'; browserProfileId: string;
  expectedWorkspaceRevision?: string; expectedPreferenceRevision?: string;
  approvedFields?: string[]; approvedAnswerIds?: string[];
  existingProfile?: unknown; existingAnswers?: Record<string, string>;
};
type Pairing = {
  schema: typeof PAIRING_SCHEMA; binding: WorkspaceOwnerBinding; browserProfileId: string;
  profileDigest: string; preferenceDigest: string; approvedFields: string[];
  approvedAnswerIds: string[]; approvedAt: string;
};
export type HostOptions = { dataRoot?: string };

/** Matches Chrome's manifest-key extension ID derivation; never accepts a request ID. */
export function nativeExtensionOrigin(): string {
  const manifest = JSON.parse(readFileSync(new URL('../../browser/application-assist/manifest.json', import.meta.url), 'utf8'));
  if (typeof manifest.key !== 'string' || !manifest.key) throw new Error('NATIVE_MANIFEST_KEY_REQUIRED');
  const hex = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
  return 'chrome-extension://' + [...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('') + '/';
}
export function trustedNativeCaller(origin: unknown): boolean {
  return typeof origin === 'string' && origin === nativeExtensionOrigin();
}

async function noLinks(file: string) {
  let current = path.resolve(file);
  while (true) {
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error('PRIVATE_PATH_LINK_FORBIDDEN');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
function list(value: unknown, allowed: readonly string[], nonempty = false): value is string[] {
  return Array.isArray(value) && (!nonempty || value.length > 0) && value.length <= allowed.length &&
    value.every(v => typeof v === 'string' && allowed.includes(v)) && new Set(value).size === value.length;
}
function parsePairing(input: unknown): Pairing | null {
  if (!object(input) || Object.keys(input).some(k => !['schema','binding','browserProfileId','profileDigest','preferenceDigest','approvedFields','approvedAnswerIds','approvedAt'].includes(k))) return null;
  if (input.schema !== PAIRING_SCHEMA || !parseWorkspaceOwnerBinding(input.binding) || typeof input.browserProfileId !== 'string' || !uuid.test(input.browserProfileId) ||
    typeof input.profileDigest !== 'string' || !sha.test(input.profileDigest) || typeof input.preferenceDigest !== 'string' || !sha.test(input.preferenceDigest) ||
    !list(input.approvedFields, profileFields, true) || !list(input.approvedAnswerIds, SAFE_ANSWER_IDS) || typeof input.approvedAt !== 'string' || Number.isNaN(Date.parse(input.approvedAt))) return null;
  return input as unknown as Pairing;
}
async function readPairing(file: string): Promise<Pairing | null> {
  await noLinks(file);
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size > 16384) throw new Error('PAIRING_INVALID');
    const raw = await fs.readFile(file, 'utf8');
    const pairing = parsePairing(JSON.parse(raw));
    if (!pairing) throw new Error('PAIRING_INVALID');
    return pairing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('PAIRING_RECOVERY_REQUIRED');
  }
}
async function savePairing(file: string, pairing: Pairing) {
  await noLinks(file);
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, JSON.stringify(pairing), { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}
function knownAnswers(preferences: Preferences): ReviewItem[] {
  return SAFE_ANSWER_IDS.flatMap(id => {
    const question = questions.find(q => q.id === id);
    const entry = preferences.preferences[id];
    const value = reusableValue(id, preferences);
    if (!question || question.answer_scope !== 'profile' || question.sensitivity !== 'personal' ||
      entry?.source !== 'user' || entry.scope !== 'profile_preference' || !value) return [];
    return [{ id, label: question.aliases[0], value }];
  });
}
async function snapshot(root: string) {
  const workspacePath = path.join(root, 'workspace.v1.json');
  const preferencePath = path.join(root, 'application-question-preferences.json');
  await noLinks(workspacePath); await noLinks(preferencePath);
  const saved = await readWorkspace(workspacePath);
  if (!saved) throw new Error('WORKSPACE_REQUIRED');
  const profile = parseProfileStorage(saved.workspace.values[PROFILE_KEY]);
  if (!profile) throw new Error('PROFILE_REQUIRED');
  // Native projection never migrates a developer checkout's legacy answers
  // into an applicant binding. Only this selected OS-account store is eligible.
  let preferences = emptyPreferences();
  try {
    const preferenceStat = await fs.lstat(preferencePath);
    if (!preferenceStat.isFile()) throw new Error('PRIVATE_SOURCE_UNAVAILABLE');
    await noLinks(preferencePath + '.lock.sqlite');
    await noLinks(preferencePath + '.lock.sqlite-journal');
    preferences = await readPreferences(preferencePath);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const answers = knownAnswers(preferences);
  // Stable source digests exclude timestamps/other applications and unapproved
  // sensitive/freeform answer stores; changing any eligible value needs review.
  const profileDigest = digest(profileFields.map(id => [id, profile[id as keyof Profile]]));
  const preferenceDigest = digest(answers);
  const availableFields = profileFields.flatMap(id => {
    const value = profile[id as keyof Profile];
    if (typeof value !== 'string' || !value.trim()) return [];
    if (id === 'phone_authority' && !['user_confirmed_primary', 'secondary_or_forwarded', 'unconfirmed'].includes(value)) return [];
    return [{ id, label: id.replaceAll('_', ' '), value: value.trim() }];
  });
  return { workspaceRevision: saved.revision, profileRevision: profileDigest,
    preferenceRevision: preferenceDigest, profile, answers, availableFields };
}
function normalizeExisting(input: unknown): ApprovedExtensionProfile | null {
  if (input === undefined || input === null) return null;
  if (!object(input) || Object.keys(input).some(k => !profileFields.includes(k)) ||
      Object.values(input).some(v => typeof v !== 'string' || v.length > 4096)) throw new Error('INVALID_EXISTING_PROFILE');
  const existing: ApprovedExtensionProfile = { phone_authority: typeof input.phone_authority === 'string' && input.phone_authority ? input.phone_authority : 'unconfirmed' };
  for (const id of EXTENSION_PROFILE_FIELDS) {
    const value = input[id];
    if (typeof value === 'string' && value.trim()) existing[id] = value.trim();
  }
  return Object.keys(existing).length > 1 ? existing : null;
}
function parseRequest(input: unknown): HostRequest | null {
  if (!object(input) || Object.keys(input).some(k => !['protocol','action','browserProfileId','expectedWorkspaceRevision','expectedPreferenceRevision','approvedFields','approvedAnswerIds','existingProfile','existingAnswers'].includes(k)) ||
    input.protocol !== 1 || typeof input.action !== 'string' || !['status','confirm','project'].includes(input.action) || typeof input.browserProfileId !== 'string' || !uuid.test(input.browserProfileId)) return null;
  if (input.expectedWorkspaceRevision !== undefined && (typeof input.expectedWorkspaceRevision !== 'string' || !sha.test(input.expectedWorkspaceRevision))) return null;
  if (input.expectedPreferenceRevision !== undefined && (typeof input.expectedPreferenceRevision !== 'string' || !sha.test(input.expectedPreferenceRevision))) return null;
  return input as unknown as HostRequest;
}
async function confirm(request: HostRequest, root: string, file: string) {
  if (!list(request.approvedFields, profileFields, true) || !list(request.approvedAnswerIds, SAFE_ANSWER_IDS) ||
    !request.expectedWorkspaceRevision || !request.expectedPreferenceRevision) return fail('EXPLICIT_REVIEW_REQUIRED');
  await noLinks(root); await fs.mkdir(root, { recursive: true });
  const lockFile = file + '.lock.sqlite';
  await noLinks(lockFile);
  await noLinks(lockFile + '-journal');
  await noLinks(lockFile + '-wal');
  await noLinks(lockFile + '-shm');
  const lock = new DatabaseSync(lockFile);
  let locked = false;
  try {
    for (let i = 0; i < 10; i++) {
      try { lock.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); locked = true; break; }
      catch { if (i === 9) return fail('PAIRING_BUSY'); await new Promise(resolve => setTimeout(resolve, 25 * (i + 1))); }
    }
    const prior = await readPairing(file);
    if (prior && prior.browserProfileId !== request.browserProfileId) return fail('CHROME_PROFILE_MISMATCH');
    const source = await snapshot(root);
    if (source.workspaceRevision !== request.expectedWorkspaceRevision || source.preferenceRevision !== request.expectedPreferenceRevision) return fail('SOURCE_REVISION_CHANGED');
    if (request.approvedFields.some(id => !source.availableFields.some(field => field.id === id)) || request.approvedAnswerIds.some(id => !source.answers.some(answer => answer.id === id))) return fail('UNAVAILABLE_APPROVAL');
    if (!request.approvedFields.some(id => id !== 'phone_authority')) return fail('NO_APPROVED_PROFILE');
    const binding: WorkspaceOwnerBinding = prior?.binding ?? { schema: OWNER_BINDING_SCHEMA, ownerId: randomUUID(), workspaceId: randomUUID(), installationId: randomUUID(), boundAt: new Date().toISOString(), selection: 'applicant-confirmed' };
    // Re-read immediately before persisting approvals; source files remain owned
    // by their existing writers and cannot be replaced by a browser request.
    const current = await snapshot(root);
    if (current.workspaceRevision !== source.workspaceRevision || current.preferenceRevision !== source.preferenceRevision) return fail('SOURCE_REVISION_CHANGED');
    await savePairing(file, { schema: PAIRING_SCHEMA, binding, browserProfileId: request.browserProfileId,
      profileDigest: source.profileRevision, preferenceDigest: source.preferenceRevision,
      approvedFields: [...request.approvedFields], approvedAnswerIds: [...request.approvedAnswerIds], approvedAt: new Date().toISOString() });
    return { ok: true as const, status: 'READY', ...binding, workspaceRevision: source.workspaceRevision,
      preferenceRevision: source.preferenceRevision, profileRevision: source.profileRevision };
  } finally { try { if (locked) lock.exec('ROLLBACK'); } finally { lock.close(); } }
}

/** Caller rejection precedes all private path resolution, reads and writes. */
export async function handleNativeProfileRequest(input: unknown, callerOrigin: unknown, options: HostOptions = {}) {
  if (!trustedNativeCaller(callerOrigin)) return fail('NATIVE_CALLER_REJECTED');
  const request = parseRequest(input);
  if (!request) return fail('INVALID_REQUEST');
  const root = options.dataRoot ?? userDataRoot();
  const file = path.join(root, 'extension-native-pairing.v1.json');
  try {
    if (request.action === 'confirm') return await confirm(request, root, file);
    const pairing = await readPairing(file);
    if (pairing && pairing.browserProfileId !== request.browserProfileId) return fail('CHROME_PROFILE_MISMATCH');
    const source = await snapshot(root);
    const metadata = { workspaceRevision: source.workspaceRevision, preferenceRevision: source.preferenceRevision, profileRevision: source.profileRevision,
      ...(pairing ? { ownerId: pairing.binding.ownerId, workspaceId: pairing.binding.workspaceId, installationId: pairing.binding.installationId } : {}) };
    const changed = pairing && (pairing.profileDigest !== source.profileRevision || pairing.preferenceDigest !== source.preferenceRevision);
    if (request.action === 'status') return { ok: true as const, status: !pairing ? 'REVIEW_REQUIRED' : changed ? 'REAPPROVAL_REQUIRED' : 'READY', ...metadata,
      availableFields: source.availableFields, availableAnswers: source.answers,
      approvedFields: pairing?.approvedFields ?? [], approvedAnswerIds: pairing?.approvedAnswerIds ?? [] };
    if (!pairing) return fail('OWNER_UNBOUND');
    if (changed) return fail('REAPPROVAL_REQUIRED');
    if (request.expectedWorkspaceRevision && source.workspaceRevision !== request.expectedWorkspaceRevision ||
      request.expectedPreferenceRevision && source.preferenceRevision !== request.expectedPreferenceRevision) return fail('SOURCE_REVISION_CHANGED');
    const binding = pairing.binding;
    const sources = [{ sourceId: 'private-workspace', ownerId: binding.ownerId, workspaceId: binding.workspaceId, revision: source.workspaceRevision },
      { sourceId: 'approved-question-preferences', ownerId: binding.ownerId, workspaceId: binding.workspaceId, revision: source.preferenceRevision }];
    const admission = authorizeAgentContext(binding, { schema: AGENT_CONTEXT_SCHEMA, ownerId: binding.ownerId, workspaceId: binding.workspaceId, installationId: binding.installationId,
      profileRevision: source.profileRevision, sources }, source.profileRevision, sources);
    const existing = normalizeExisting(request.existingProfile);
    const result = admitExtensionProfileProjection({ admission,
      workspace: { ...binding, profileRevision: source.profileRevision },
      pairing: { ...binding, extensionId: callerOrigin as string, browserProfileId: pairing.browserProfileId, pairingConfirmed: true },
      snapshot: { ...binding, profileRevision: source.profileRevision, profile: source.profile, approvedFields: pairing.approvedFields },
      existing: existing ? { ...binding, extensionId: callerOrigin as string, browserProfileId: pairing.browserProfileId, profile: existing } : null });
    if (!result.ok) return fail(result.reason);
    const answers = source.answers.filter(answer => pairing.approvedAnswerIds.includes(answer.id));
    if (request.existingAnswers !== undefined) {
      if (!object(request.existingAnswers) || Object.keys(request.existingAnswers).length > 100 || Object.values(request.existingAnswers).some(v => typeof v !== 'string' || v.length > 4096)) return fail('INVALID_EXISTING_ANSWERS');
      if (answers.some(answer => request.existingAnswers![answer.id]?.trim() && request.existingAnswers![answer.id].trim() !== answer.value)) return fail('EXISTING_ANSWERS_REVIEW_REQUIRED');
    }
    const current = await snapshot(root);
    const currentPairing = await readPairing(file);
    if (current.workspaceRevision !== source.workspaceRevision || current.preferenceRevision !== source.preferenceRevision || digest(currentPairing) !== digest(pairing)) return fail('SOURCE_REVISION_CHANGED');
    return { ok: true as const, status: result.action === 'ALREADY_CURRENT' ? 'ALREADY_CURRENT' : 'PROJECTED', ...metadata, profile: result.profile, answers };
  } catch (error) {
    const message = (error as Error).message;
    return fail(['WORKSPACE_REQUIRED','PROFILE_REQUIRED','PAIRING_RECOVERY_REQUIRED','PRIVATE_PATH_LINK_FORBIDDEN','INVALID_EXISTING_PROFILE'].includes(message) ? message : 'PRIVATE_SOURCE_UNAVAILABLE');
  }
}
