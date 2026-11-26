import { questions, type Preferences } from './application-preferences.ts';

/**
 * Relative, configurable engineering weights, NOT measured ATS probabilities.
 * The greedy next-question rule maximizes estimated reusable field value per
 * operator minute, with diminishing returns for repeatedly asking one topic.
 * Only confirmed-until-changed, non-protected profile answers are eligible.
 */
export type DiscoveryQuestion = {
  id: string;
  label: string;
  why: string;
  group: 'identity' | 'career' | 'education' | 'mobility';
  reuseWeight: number;
  estimatedSeconds: number;
  privacyPenalty: number;
  multiline?: boolean;
  url?: boolean;
};

export const PROFILE_DISCOVERY_QUESTIONS: readonly DiscoveryQuestion[] = [
  { id: 'identity.website', label: 'Portfolio website (optional)', why: 'A reusable portfolio link can support applications across employers.', group: 'identity', reuseWeight: 5, estimatedSeconds: 20, privacyPenalty: 0, url: true },
  { id: 'identity.preferred_name', label: 'Preferred name (optional)', why: 'Some employers offer a separate preferred-name field.', group: 'identity', reuseWeight: 3, estimatedSeconds: 15, privacyPenalty: 0 },
  { id: 'identity.professional_title', label: 'Professional title', why: 'Your reviewed professional title can be reused without inventing job history.', group: 'career', reuseWeight: 8, estimatedSeconds: 30, privacyPenalty: 0 },
  { id: 'identity.job_title', label: 'Target job title', why: 'A target title helps tailor preparation, but is not proof of a qualification.', group: 'career', reuseWeight: 5, estimatedSeconds: 25, privacyPenalty: 0 },
  { id: 'experience.company', label: 'Reviewed employer name', why: 'Previously reviewed experience can fill matching employer fields.', group: 'career', reuseWeight: 7, estimatedSeconds: 30, privacyPenalty: 1 },
  { id: 'experience.title', label: 'Reviewed position title', why: 'A verified past title can support multiple applications.', group: 'career', reuseWeight: 7, estimatedSeconds: 25, privacyPenalty: 0 },
  { id: 'experience.description', label: 'Reviewed experience summary', why: 'A factual work summary may support repeated short-answer fields.', group: 'career', reuseWeight: 7, estimatedSeconds: 110, privacyPenalty: 1, multiline: true },
  { id: 'education.highest_completed_level', label: 'Highest completed education', why: 'A reviewed education level may answer recurring eligibility questions.', group: 'education', reuseWeight: 7, estimatedSeconds: 25, privacyPenalty: 0 },
  { id: 'education.institution', label: 'Education institution', why: 'A verified school name can be reused on applicable forms.', group: 'education', reuseWeight: 6, estimatedSeconds: 30, privacyPenalty: 0 },
  { id: 'education.credential', label: 'Completed credential or degree', why: 'A verified credential can be reused without inflating qualifications.', group: 'education', reuseWeight: 6, estimatedSeconds: 30, privacyPenalty: 0 },
  { id: 'education.field_of_study', label: 'Field of study', why: 'A verified field of study is frequently requested alongside education.', group: 'education', reuseWeight: 5, estimatedSeconds: 25, privacyPenalty: 0 },
  { id: 'talent_community.spoken_languages', label: 'Spoken languages', why: 'Languages you explicitly confirm may be reused in talent profiles.', group: 'career', reuseWeight: 4, estimatedSeconds: 30, privacyPenalty: 0 },
  { id: 'talent_community.primary_areas', label: 'Professional areas of interest', why: 'Approved areas of interest help guide future opportunities.', group: 'career', reuseWeight: 5, estimatedSeconds: 35, privacyPenalty: 0 },
  { id: 'availability.willing_to_travel', label: 'Willingness to travel', why: 'Your travel preference can narrow unsuitable opportunities.', group: 'mobility', reuseWeight: 5, estimatedSeconds: 12, privacyPenalty: 0 },
  { id: 'availability.willing_to_relocate', label: 'Willingness to relocate', why: 'Your relocation preference can prevent unwanted recommendations.', group: 'mobility', reuseWeight: 5, estimatedSeconds: 12, privacyPenalty: 0 },
  { id: 'identity.metro_area', label: 'Current residential metro area', why: 'Enter where you currently live, not your preferred work location. Employer residence fields must never reuse a job-search preference.', group: 'mobility', reuseWeight: 4, estimatedSeconds: 20, privacyPenalty: 0 },
] as const;

export type DiscoveryCandidate = DiscoveryQuestion & { marginalValuePerMinute: number };
export type DiscoveryPlan = {
  next: DiscoveryCandidate | null;
  remaining: number;
  answered: number;
  total: number;
  reusableCoveragePercent: number;
  skippedThisVisit: number;
};

export function projectProfileDiscovery(data: Preferences, skippedIds: readonly string[] = []): DiscoveryPlan {
  const canonical = new Map(questions.map(question => [question.id, question]));
  const eligible = PROFILE_DISCOVERY_QUESTIONS.filter(question => {
    const owner = canonical.get(question.id);
    return owner?.answer_scope === 'profile' &&
      owner.automation_policy === 'fill_if_explicit_preference' &&
      owner.confirmation_policy === 'until_changed';
  });
  const answered = eligible.filter(question => Boolean(data.preferences[question.id]?.value.trim()));
  const skipped = new Set(skippedIds);
  const groupAnswers = new Map<string, number>();
  for (const question of answered) groupAnswers.set(question.group, (groupAnswers.get(question.group) || 0) + 1);
  const pending: DiscoveryCandidate[] = eligible
    .filter(question => !data.preferences[question.id]?.value.trim() && !skipped.has(question.id))
    .map(question => ({
      ...question,
      marginalValuePerMinute: 60 * question.reuseWeight /
        ((question.estimatedSeconds + 5) * (1 + question.privacyPenalty) *
          (1 + 0.15 * (groupAnswers.get(question.group) || 0))),
    }))
    .sort((a, b) => b.marginalValuePerMinute - a.marginalValuePerMinute || a.id.localeCompare(b.id));
  const totalValue = eligible.reduce((sum, question) => sum + question.reuseWeight, 0);
  const completedValue = answered.reduce((sum, question) => sum + question.reuseWeight, 0);
  return {
    next: pending[0] || null,
    remaining: pending.length,
    answered: answered.length,
    total: eligible.length,
    reusableCoveragePercent: totalValue ? Math.round(100 * completedValue / totalValue) : 0,
    skippedThisVisit: eligible.length - answered.length - pending.length,
  };
}

export function validateDiscoveryAnswer(question: DiscoveryQuestion, rawValue: string): string | null {
  const answer = rawValue.trim();
  if (!answer) return 'Enter an answer or use Skip for now.';
  if (answer.length > 512) return 'Keep the answer under 513 characters.';
  if (question.url) {
    try {
      const url = new URL(answer);
      if (url.protocol !== 'https:' || url.username || url.password) return 'Use an HTTPS link without credentials.';
    } catch { return 'Enter a complete HTTPS link.'; }
  }
  return null;
}

/**
 * A guided answer is committed independently of unrelated full-editor drafts.
 * Merge only confirmed saved facts back into the visible editor, preserving all
 * other unsaved answers, opt-outs and pending removals.
 */
export function reconcileGuidedReadback(editor: Preferences, persisted: Preferences,
  confirmedIds: readonly string[], pendingRemovals: readonly string[]) {
  const preferences = { ...editor.preferences };
  for (const id of confirmedIds) {
    if (!preferences[id] && persisted.preferences[id]) preferences[id] = persisted.preferences[id];
  }
  return {
    editor: {
      ...editor, preferences,
      recommendation_work_mode: editor.recommendation_work_mode ?? persisted.recommendation_work_mode,
      require_document_review: editor.require_document_review ?? persisted.require_document_review,
    } satisfies Preferences,
    removedQuestions: pendingRemovals.filter(id => !confirmedIds.includes(id)),
  };
}
