import { PROFILE_KEY, ANSWERS_KEY, APPLICATIONS_KEY, emptyProfile, parseProfileStorage, parseAnswersStorage, parseApplicationsStorage, type Profile } from './storage.ts';
import { ASSIST_KEY, ASSIST_ANSWERS_KEY, parseAssistProfile, parseAssistAnswers } from './assist-contract.ts';
import { SOURCE_BINDINGS_KEY, parseSourceBindings } from './source-bridge.ts';

export const WORKSPACE_SCHEMA = 'escapehatch-local-workspace/v1';
export const workspaceParsers = {
  [PROFILE_KEY]: parseProfileStorage,
  [ANSWERS_KEY]: parseAnswersStorage,
  [APPLICATIONS_KEY]: parseApplicationsStorage,
  [ASSIST_KEY]: parseAssistProfile,
  [ASSIST_ANSWERS_KEY]: parseAssistAnswers,
  [SOURCE_BINDINGS_KEY]: parseSourceBindings,
};
export type WorkspaceValues = Record<string, unknown>;
export type SavedWorkspace = { schema: typeof WORKSPACE_SCHEMA; values: WorkspaceValues };
export type BootstrapResponse = { managed: boolean; revision: string | null; workspace: SavedWorkspace | null; state: 'READY' | 'NEEDS_CONTEXT' | 'RECOVERY_REQUIRED'; message: string };

export function parseSavedWorkspace(value: unknown): SavedWorkspace | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.schema !== WORKSPACE_SCHEMA || !item.values || typeof item.values !== 'object' || Array.isArray(item.values)) return null;
  const values: WorkspaceValues = {};
  for (const [key, raw] of Object.entries(item.values)) {
    const parser = workspaceParsers[key as keyof typeof workspaceParsers];
    if (!parser || parser(raw) === null) return null;
    values[key] = raw;
  }
  return { schema: WORKSPACE_SCHEMA, values };
}

export function hasContext(values: WorkspaceValues): boolean {
  const profile = parseProfileStorage(values[PROFILE_KEY]);
  return Boolean(profile && Object.values(profile).some(value => value.trim()) ||
    [ANSWERS_KEY, APPLICATIONS_KEY].some(key => Array.isArray(values[key]) && (values[key] as unknown[]).length));
}

/** Only previously explicit contact answers contribute. Legal/EEO never become profile facts. */
export function profileFromPreferences(preferences: Record<string, { value: string }>): Profile {
  const profile = { ...emptyProfile };
  const fields: Partial<Record<keyof Profile, string>> = { first_name: 'first_name', last_name: 'last_name', email: 'email', phone: 'phone',
    linkedin_url: 'linkedin', street_address: 'street_address', city: 'city', region: 'region', postal_code: 'postal_code', country: 'country' };
  for (const [field, id] of Object.entries(fields)) {
    const answer = preferences['identity.' + id];
    if (answer) profile[field as keyof Profile] = answer.value;
  }
  if (profile.phone) profile.phone_authority = 'user_confirmed_primary';
  return profile;
}

export function readBrowserWorkspace(storage: Pick<Storage, 'getItem'>): SavedWorkspace {
  const values: WorkspaceValues = {};
  for (const [key, parser] of Object.entries(workspaceParsers)) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    const value: unknown = JSON.parse(raw);
    if (parser(value) === null) throw new Error('Existing browser data needs recovery. Nothing has been replaced.');
    values[key] = value;
  }
  return { schema: WORKSPACE_SCHEMA, values };
}

/** Merge only empty areas. Divergent nonempty copies remain intact until reviewed. */
export function reconcileWorkspace(local: SavedWorkspace, saved: SavedWorkspace): { workspace: SavedWorkspace; conflicts: string[] } {
  const values = { ...local.values };
  const conflicts: string[] = [];
  const empty = (key: string, value: unknown) => value === undefined ||
    (key === PROFILE_KEY ? !Object.values(value as Profile).some(item => item.trim()) : Array.isArray(value) && !value.length);
  for (const [key, value] of Object.entries(saved.values)) {
    if (empty(key, values[key])) values[key] = value;
    else if (!empty(key, value) && JSON.stringify(values[key]) !== JSON.stringify(value)) conflicts.push(key);
  }
  const profile = parseProfileStorage(values[PROFILE_KEY]);
  const assist = parseAssistProfile(values[ASSIST_KEY]);
  if (profile && assist) {
    const contact = { ...assist.contact };
    for (const key of Object.keys(profile) as (keyof Profile)[]) {
      if (!contact[key]?.trim()) contact[key] = profile[key];
    }
    values[ASSIST_KEY] = { ...assist, contact };
  }
  return { workspace: { schema: WORKSPACE_SCHEMA, values }, conflicts };
}

export function applyBrowserWorkspace(storage: Storage, workspace: SavedWorkspace) {
  const prior = new Map<string, string | null>();
  try {
    for (const [key, value] of Object.entries(workspace.values)) {
      prior.set(key, storage.getItem(key));
      storage.setItem(key, JSON.stringify(value));
    }
  } catch {
    for (const [key, raw] of prior) {
      try { if (raw === null) storage.removeItem(key); else storage.setItem(key, raw); } catch { /* report below */ }
    }
    throw new Error('Browser storage could not save the workspace. Your private artifact is unchanged.');
  }
}
