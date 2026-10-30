/** Read-only micro1 profile step recognition; never grants navigation or submission authority. */
export const MICRO1_PROFILE_ORIGIN = 'https://talent.micro1.ai';
export type ProfileScene = 'work_experience_editor' | 'work_experience_overview' | 'global_skills' | 'other_profile';
export type EmployerProfileStepInspection = {
  schema: 'escapehatch/employer-profile-step/v1';
  provider: 'micro1';
  scene: ProfileScene;
  mappedFields: { label: string; questionId: string }[];
  roleSkillsAreScoped: true;
  navigation: 'operator_review_only';
  autoAdvanceAuthorized: false;
  finalSubmissionProved: false;
};
const FIELDS: Record<string,string> = {
  'company name': 'experience.company', role: 'experience.title',
  'skills used': 'experience.skills_used', 'start date': 'experience.start_date',
  'end date': 'experience.end_date', 'currently working': 'experience.current',
  responsibilities: 'experience.description',
};
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
export function inspectMicro1ProfileStep(url: string, labels: readonly string[]): EmployerProfileStepInspection | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.origin !== MICRO1_PROFILE_ORIGIN || u.pathname.replace(/\/$/, '') !== '/complete-profile') return null;
  const step = u.searchParams.get('step')?.toUpperCase();
  const seen = new Set(labels.map(normalize));
  const mappedFields = Object.entries(FIELDS).filter(([label]) => seen.has(label)).map(([label, questionId]) => ({ label, questionId }));
  const editor = ['company name', 'role', 'skills used', 'start date', 'responsibilities'].every(label => seen.has(label));
  const scene = step === 'WORK_EXPERIENCE' ? (editor ? 'work_experience_editor' : 'work_experience_overview') :
    step === 'ADD_SKILLS' || step === 'SKILLS' ? 'global_skills' : 'other_profile';
  return { schema: 'escapehatch/employer-profile-step/v1', provider: 'micro1', scene, mappedFields,
    roleSkillsAreScoped: true, navigation: 'operator_review_only', autoAdvanceAuthorized: false, finalSubmissionProved: false };
}
export type ExperienceSkillSource = { id: string; company: string; title: string; skillsUsed?: readonly string[]; skillsUsedReviewedAt?: string };
export function reviewRoleSkills(records: readonly ExperienceSkillSource[], company: string, title: string, observedTags: readonly string[]) {
  const matches = records.filter(r => normalize(r.company) === normalize(company) && normalize(r.title) === normalize(title));
  const base = { experienceId: null as string | null, missing: [] as string[], unexpected: [] as string[],
    globalSkillsIgnored: true as const, automaticSkillFillAuthorized: false as const };
  if (!normalize(company) || !normalize(title) || !matches.length) return { ...base, state: 'role_not_found' as const };
  if (matches.length !== 1) return { ...base, state: 'role_ambiguous' as const };
  const record = matches[0];
  if (!record.skillsUsed?.length || !record.skillsUsedReviewedAt || Number.isNaN(Date.parse(record.skillsUsedReviewedAt)))
    return { ...base, experienceId: record.id, state: 'role_skills_unapproved' as const };
  const approved = [...new Set(record.skillsUsed.map(s => s.trim()).filter(Boolean))];
  const existing = [...new Set(observedTags.map(s => s.trim()).filter(Boolean))];
  const a = new Set(approved.map(normalize)), b = new Set(existing.map(normalize));
  const missing = approved.filter(s => !b.has(normalize(s))), unexpected = existing.filter(s => !a.has(normalize(s)));
  return { ...base, experienceId: record.id, state: missing.length || unexpected.length ? 'skills_mismatch' as const : 'skills_match' as const,
    missing, unexpected };
}
