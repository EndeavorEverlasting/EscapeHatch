import type { AssistProfile, AssistExperience } from './assist-contract';

/**
 * Read-only coaching projection over approved private career state.
 * Stores, sources, and review authority remain with AssistProfile, existing
 * preference-file/answer-memory, and the opportunity document owner.
 * This projection neither persists answers nor fills an employer form.
 */
export type RoleSkillReview = AssistExperience & {
  skillsUsed?: string[];              // PR #145 compatibility; unreviewed is never assumed true
  skillsUsedReviewedAt?: string;
};
export type StudioQuestion = {
  id: string;                          // stable non-PII semantic key + private role reference
  ownerScene: 'STUDIO_TIMELINE' | 'STUDIO_ROLE_SKILLS' | 'STUDIO_SKILL_STORIES' | 'STUDIO_ANSWERS';
  roleId?: string;
  label: string;
  whyNeeded: string;
  destination: 'private_career_profile' | 'private_role_skill_review' |
    'private_skill_evidence' | 'existing_application_answer_memory';
  requiredForKit: boolean;             // does NOT mean required by employer
};
export type SkillEvidenceInventory = Readonly<Record<string, readonly string[]>>;
export type StudioSnapshot = {
  schema: 'escapehatch/preapplication-studio-projection/v1';
  questionCount: number;
  nextQuestion: StudioQuestion | null;
  questions: StudioQuestion[];
  alreadyReviewedRoles: number;
  skillsAwaitingRoleReview: number;
  kitPrepared: boolean;               // NOT employer-review or submission readiness
  employerSubmissionAuthority: false;
};
const safe = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const canonical = (value: string) => value.trim().toLocaleLowerCase('en-US');
const approved = (value: unknown) => safe(value) && Number.isFinite(Date.parse(value));
const question = (
  id: string, ownerScene: StudioQuestion['ownerScene'], label: string,
  whyNeeded: string, destination: StudioQuestion['destination'],
  requiredForKit: boolean, roleId?: string,
): StudioQuestion => ({ id, ownerScene, label, whyNeeded, destination, requiredForKit, ...(roleId ? {roleId} : {}) });

/** Never infer experience-scoped skills from a profile-wide unordered skill list. */
export function projectPreapplicationStudio(
  profile: Pick<AssistProfile,'approvedAt'|'contact'|'experience'|'skills'> | null,
  knownApprovedReusableAnswerIds: readonly string[] = [],
  roleEvidence: SkillEvidenceInventory = {},
): StudioSnapshot {
  const questions: StudioQuestion[] = [];
  let alreadyReviewedRoles = 0;
  let skillsAwaitingRoleReview = 0;
  if (!profile) {
    questions.push(question('career.review', 'STUDIO_TIMELINE', 'Review my career background',
      'Bring your existing experience into the private career workspace before applying.',
      'private_career_profile', true));
  } else {
    const roleIds = new Set<string>();
    if (!approved(profile.approvedAt)) {
      questions.push(question('career.approve', 'STUDIO_TIMELINE', 'Review my career timeline',
        'Confirm that imported career facts are yours before reusing them.',
        'private_career_profile', true));
    }
    if (!safe(profile.contact.email)) {
      questions.push(question('contact.email', 'STUDIO_ANSWERS', 'Which email should employers use?',
        'Save a reviewed contact address once for reusable, non-sensitive form fields.',
        'existing_application_answer_memory', true));
    }
    for (const role of profile.experience as RoleSkillReview[]) {
      if (!safe(role.id) || roleIds.has(role.id)) continue;
      roleIds.add(role.id);
      const title = safe(role.title) ? role.title.trim() : 'this role';
      if (!safe(role.company) || !safe(role.title) || !safe(role.dates)) {
        questions.push(question('role.timeline.' + role.id, 'STUDIO_TIMELINE',
          'Confirm the employer, role, start and end dates for ' + title,
          'ATS history sections often request both dates individually; do not reconstruct missing dates.',
          'private_career_profile', true, role.id));
      }
      const skills = Array.isArray(role.skillsUsed) ?
        [...new Set(role.skillsUsed.filter(safe).map(canonical))] : [];
      if (!approved(role.skillsUsedReviewedAt) || !skills.length) {
        skillsAwaitingRoleReview++;
        questions.push(question('role.skills.' + role.id, 'STUDIO_ROLE_SKILLS',
          'Which skills did you use in ' + title + '?',
          'Global skills do not establish which experience used them. Review only skills you can explain.',
          'private_role_skill_review', true, role.id));
      } else {
        alreadyReviewedRoles++;
        const reviewedExamples = new Set((roleEvidence[role.id] || []).map(canonical));
        if (skills.some(s => !reviewedExamples.has(s))) {
          questions.push(question('role.examples.' + role.id, 'STUDIO_SKILL_STORIES',
            'How would you explain the skills used in ' + title + '?',
            'An optional technical example helps with later interviews; never fabricate expertise.',
            'private_skill_evidence', false, role.id));
        }
      }
    }
  }
  // The taxonomy and answer-memory owner must determine eligible reusable IDs;
  // this is a coaching question, NOT a declaration that legal/EEO data may be reused.
  if (!knownApprovedReusableAnswerIds.includes('professional-summary')) {
    questions.push(question('reusable.professional-summary', 'STUDIO_ANSWERS',
      'Review a reusable professional introduction',
      'Draft once, verify the career claims, and tailor it per role later.',
      'existing_application_answer_memory', false));
  }
  return {
    schema:'escapehatch/preapplication-studio-projection/v1', questionCount: questions.length,
    nextQuestion:questions[0] || null, questions, alreadyReviewedRoles,
    skillsAwaitingRoleReview, kitPrepared: questions.every(q => !q.requiredForKit),
    employerSubmissionAuthority:false,
  };
}
