import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyPreferences, parsePreferences, type Preferences } from './src/lib/application-preferences.ts';

export function preferenceFile() {
  return process.env.ESCAPEHATCH_PREFERENCES_FILE || path.resolve(import.meta.dirname, '../../private/application-question-preferences.json');
}

export async function readPreferences(file = preferenceFile()): Promise<Preferences> {
  try {
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

export async function savePreferences(input: unknown, file = preferenceFile()) {
  const data = parsePreferences(input);
  if (!data) throw new Error('Invalid preferences. No saved data was changed.');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
  return data;
}

export async function clearPreferences(file = preferenceFile()) {
  await fs.rm(file, { force: true });
}
