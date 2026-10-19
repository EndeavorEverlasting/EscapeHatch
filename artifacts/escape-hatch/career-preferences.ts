import { parseAssistProfile } from './src/lib/assist-contract.ts';
import type { Preferences } from './src/lib/application-preferences.ts';

// Project the selected canonical records for this one explicit Fill action; never duplicate their storage.
export function withCareerPreferences(saved: Preferences, raw: unknown, targetRole: unknown): Preferences {
  const result = { ...saved, preferences: { ...saved.preferences } };
  for (const id of Object.keys(result.preferences)) if (id.startsWith('experience.') || (id.startsWith('education.') && id !== 'education.highest_completed_level')) delete result.preferences[id];
  const profile = parseAssistProfile(raw);
  const values: Record<string, unknown> = {};
  const first = saved.preferences['identity.first_name']?.value, last = saved.preferences['identity.last_name']?.value;
  if (first && last && !saved.preferences['identity.full_name']?.value.trim()) values['identity.full_name'] = first.trim() + ' ' + last.trim();
  if (profile) {
    const work = profile.experience.filter(item => item && item.id === profile.selectedExperienceId);
    const education = profile.education.filter(item => item && item.id === profile.selectedEducationId);
    if (work.length === 1 && work[0].provenance?.source && ['user', 'resume', 'import'].includes(work[0].provenance.source)) {
      values['experience.company'] = work[0].company;
      values['experience.title'] = work[0].title;
      values['experience.description'] = Array.isArray(work[0].bullets) && work[0].bullets.every(value => typeof value === 'string') ? work[0].bullets.join('\n') : '';
    }
    if (education.length === 1 && education[0].provenance?.source && ['user', 'resume', 'import'].includes(education[0].provenance.source)) {
      values['education.institution'] = education[0].institution;
      values['education.credential'] = education[0].credential;
      values['education.field_of_study'] = education[0].fieldOfStudy;
      values['education.dates'] = education[0].dates;
      values['education.details'] = education[0].details;
    }
  }
  // An old desired role must not leak into a different opportunity.
  delete result.preferences['identity.job_title'];
  values['identity.job_title'] = targetRole;
  for (const [id, value] of Object.entries(values)) {
    if (typeof value === 'string' && value.trim() && value.length <= (id.endsWith('description') || id.endsWith('details') ? 8000 : 512)) {
      result.preferences[id] = { scope: 'profile_preference', source: 'user', value: value.trim(), updated_at: new Date().toISOString() };
    }
  }
  return result;
}
