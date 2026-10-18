import taxonomy from '../../../../harness/contracts/application-form-taxonomy.v1.json' with { type: 'json' };

export const PREFERENCE_KEY = 'escapeHatch.applicationQuestionPreferences.v1';
export const PREFERENCE_SCHEMA = 'escapehatch-application-question-preferences/v1';
export type Preference = { scope: 'profile_preference'; value: string; source: 'user'; updated_at: string };
export type Preferences = { schema_version: typeof PREFERENCE_SCHEMA; exported_at: string; preferences: Record<string, Preference>; job_titles?: string[] };
export const questions = taxonomy.questions;
export const emptyPreferences = (): Preferences => ({ schema_version: PREFERENCE_SCHEMA, exported_at: new Date().toISOString(), preferences: {} });

export function parsePreferences(input: unknown): Preferences | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Preferences;
  if (data.schema_version !== PREFERENCE_SCHEMA || typeof data.exported_at !== 'string' || Number.isNaN(Date.parse(data.exported_at)) ||
      !data.preferences || typeof data.preferences !== 'object' || Array.isArray(data.preferences) ||
      new TextEncoder().encode(JSON.stringify(data)).length > 65536) return null;
  const known = new Set(questions.map(q => q.id));
  const clean = emptyPreferences();
  clean.exported_at = data.exported_at;
  if (data.job_titles !== undefined) {
    if (!Array.isArray(data.job_titles) || data.job_titles.length > 100 ||
        data.job_titles.some(value => typeof value !== 'string' || !value.trim() || value.length > 160)) return null;
    clean.job_titles = [...new Set(data.job_titles.map(value => value.trim()))];
  }
  for (const [id, entry] of Object.entries(data.preferences)) {
    if (!known.has(id) || !entry || typeof entry !== 'object' || entry.scope !== 'profile_preference' || entry.source !== 'user' ||
        typeof entry.value !== 'string' || !entry.value.trim() || entry.value.length > 512 ||
        typeof entry.updated_at !== 'string' || Number.isNaN(Date.parse(entry.updated_at))) return null;
    clean.preferences[id] = { scope: 'profile_preference', value: entry.value.trim(), source: 'user', updated_at: entry.updated_at };
  }
  return clean;
}

export function normalizeQuestion(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/\bu\.s\.(?:a\.)?/g, 'us').replace(/\((?:required|optional|voluntary|select one|please select)\)|\[(?:required|optional)\]|\brequired\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function matchQuestion(prompt: string): string | null {
  const text = normalizeQuestion(prompt);
  const matches = questions.filter(q => q.aliases.some(alias => normalizeQuestion(alias) === text));
  return matches.length === 1 ? matches[0].id : null;
}

export function reusableValue(id: string, data: Preferences): string | null {
  const question = questions.find(q => q.id === id);
  if (!question || question.automation_policy !== 'fill_if_explicit_preference' || question.confirmation_policy !== 'until_changed') return null;
  return data.preferences[id]?.value || null;
}

// Only explicit semantic equivalents. No substring matching (Male must never match Female).
export function optionMatches(value: string, option: string): boolean {
  const a = normalizeQuestion(value), b = normalizeQuestion(option);
  if (a === b) return true;
  const groups = [
    ['no', 'no i do not have a disability and have not had one in the past', 'no i don t have a disability or a history record of having a disability'],
    ['prefer not to answer', 'decline to answer', 'i do not wish to answer', 'i don t wish to answer'],
    ['hispanic or latino', 'hispanic latino'],
  ];
  return groups.some(group => group.includes(a) && group.includes(b));
}

export const preferenceChoices: Record<string, string[]> = {
  'eeo.gender': ['Male', 'Female', 'Non-binary', 'Prefer to self-describe', 'Prefer not to answer'],
  'eeo.race_ethnicity': ['American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino', 'Native Hawaiian or Other Pacific Islander', 'White', 'Two or more races', 'Prefer not to answer'],
  'employment.us_citizenship': ['Yes', 'No'],
  'employment.current_clearance': ['Yes', 'No'],
  'employment.sponsorship_required': ['Yes', 'No'],
  'military.service_history': ['Yes', 'No', 'Prefer not to answer'],
  'eeo.disability_status': ['Yes', 'No', 'Prefer not to answer'],
  'eeo.veteran_status': ['I am not a protected veteran', 'I identify as one or more classifications of a protected veteran', 'Prefer not to answer'],
};
