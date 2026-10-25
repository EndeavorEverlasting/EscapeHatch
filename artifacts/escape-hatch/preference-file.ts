import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { userDataRoot, legacyPrivateRoots } from './user-data.ts';
import { emptyPreferences, parsePreferences, type Preferences } from './src/lib/application-preferences.ts';

export function preferenceFile() {
  return process.env.ESCAPEHATCH_PREFERENCES_FILE || path.join(userDataRoot(), 'application-question-preferences.json');
}

/** Resolve the original repository through Git, not a remembered checkout path. */
export function legacyPreferenceFile() {
  const root = legacyPrivateRoots().at(-1);
  return root ? path.join(root, 'application-question-preferences.json') : null;
}

export async function migrateLegacyPreferences(destination = preferenceFile(), legacy?: string | null) {
  try { await fs.access(destination); return; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (legacy === undefined) legacy = legacyPreferenceFile();
  if (!legacy || path.resolve(destination) === path.resolve(legacy)) return;
  let bytes;
  try { bytes = await fs.readFile(legacy); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  if (bytes.length > 65536 || !parsePreferences(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')))) throw new Error('Legacy preferences need review. Original data was preserved.');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try { await fs.writeFile(destination, bytes, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
}

export async function readPreferences(file = preferenceFile()): Promise<Preferences> {
  try {
    if (file === preferenceFile() && !process.env.ESCAPEHATCH_PREFERENCES_FILE) await migrateLegacyPreferences(file);
    const bytes = await fs.readFile(file);
    if (bytes.length > 65536) throw new Error('Invalid saved preferences; restore a valid preference export.');
    const data = parsePreferences(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')));
    if (!data) throw new Error('Invalid saved preferences; restore a valid preference export.');
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyPreferences();
    throw new Error('Saved preferences could not be read. Existing data was preserved.');
  }
}

const queueKey = Symbol.for('escapehatch.preference-transactions');
const queueHost = globalThis as typeof globalThis & { [queueKey]?: Map<string, Promise<unknown>> };
const queues = queueHost[queueKey] ||= new Map<string, Promise<unknown>>();
function transaction<T>(file: string, operation: () => Promise<T>): Promise<T> {
  const key = path.resolve(file);
  const result = (queues.get(key) || Promise.resolve()).catch(() => {}).then(operation);
  queues.set(key, result);
  void result.finally(() => { if (queues.get(key) === result) queues.delete(key); }).catch(() => {});
  return result;
}

async function writePreferences(input: unknown, file: string) {
  const data = parsePreferences(input);
  if (!data) throw new Error('Invalid preferences. No saved data was changed.');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
  return data;
}

export function savePreferences(input: unknown, file = preferenceFile()) {
  return transaction(file, () => writePreferences(input, file));
}

export function updatePreferences(update: (current: Preferences) => Preferences, file = preferenceFile()) {
  return transaction(file, async () => writePreferences(update(await readPreferences(file)), file));
}

/** Merge cockpit edits with answers captured since that cockpit loaded. */
export function mergePreferenceEdits(current: Preferences, input: unknown, removedQuestions: unknown = []): Preferences {
  const incoming = parsePreferences(input);
  if (!incoming || !Array.isArray(removedQuestions) || removedQuestions.some(id => typeof id !== 'string')) throw new Error('Invalid preference edit.');
  const merged: Preferences = { ...incoming, preferences: { ...current.preferences },
    discovered_answers: { ...current.discovered_answers } };
  for (const [id, answer] of Object.entries(incoming.preferences)) {
    const prior = current.preferences[id];
    if (!prior || Date.parse(answer.updated_at) >= Date.parse(prior.updated_at)) merged.preferences[id] = answer;
  }
  for (const id of removedQuestions) delete merged.preferences[id];
  for (const [key, answer] of Object.entries(incoming.discovered_answers || {})) {
    const prior = current.discovered_answers?.[key];
    if (!prior || Date.parse(answer.updated_at) >= Date.parse(prior.updated_at)) merged.discovered_answers![key] = answer;
  }
  const parsed = parsePreferences(merged);
  if (!parsed) throw new Error('Invalid preference edit.');
  return parsed;
}

export async function clearPreferences(file = preferenceFile()) {
  await transaction(file, () => fs.rm(file, { force: true }));
}
