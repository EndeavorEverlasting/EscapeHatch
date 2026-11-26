import { parsePreferences, questions, type Preferences } from './application-preferences.ts';

/**
 * First-run questions stage only user-provided, reusable profile facts.
 * Saved answers are the canonical private preference store; the quiz is not
 * a competing profile database and never starts or submits an application.
 */
export type BootstrapQuiz = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  region: string;
  country: string;
  linkedIn: string;
  workMode: '' | 'remote_only' | 'any';
};

export const emptyBootstrapQuiz = (): BootstrapQuiz => ({
  firstName: '', lastName: '', email: '', phone: '', city: '',
  region: '', country: '', linkedIn: '', workMode: '',
});

/** Keep quiz field IDs joined to the shared ATS taxonomy, not label guesses. */
export const BOOTSTRAP_QUESTION_IDS = [
  'identity.first_name', 'identity.last_name', 'identity.email',
  'identity.phone', 'identity.city', 'identity.region',
  'identity.country', 'identity.linkedin',
] as const;

export function bootstrapQuizError(quiz: BootstrapQuiz): string | null {
  if (!quiz.firstName.trim() || !quiz.lastName.trim() || !quiz.email.trim())
    return 'Enter your first name, last name and email. Other profile fields may be left blank.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quiz.email.trim()))
    return 'Enter a valid email address.';
  if (!['remote_only', 'any'].includes(quiz.workMode))
    return 'Choose whether your job recommendations must be remote.';
  if (Object.entries(quiz).some(([key, value]) => key !== 'workMode' && (typeof value !== 'string' || value.trim().length > 512)))
    return 'Each answer must be 512 characters or fewer.';
  if (quiz.linkedIn.trim()) {
    try {
      const url = new URL(quiz.linkedIn.trim());
      if (url.protocol !== 'https:' || url.username || url.password || !['linkedin.com', 'www.linkedin.com'].includes(url.hostname))
        return 'Use an HTTPS LinkedIn profile URL, or leave it blank.';
    } catch { return 'Use an HTTPS LinkedIn profile URL, or leave it blank.'; }
  }
  return null;
}

export function applyBootstrapQuiz(saved: Preferences, quiz: BootstrapQuiz, now = new Date()): Preferences {
  const error = bootstrapQuizError(quiz);
  if (error) throw new Error(error);
  if (Number.isNaN(now.getTime())) throw new Error('The profile date is invalid.');
  const timestamp = now.toISOString();
  const values: Record<(typeof BOOTSTRAP_QUESTION_IDS)[number], string> = {
    'identity.first_name': quiz.firstName,
    'identity.last_name': quiz.lastName,
    'identity.email': quiz.email,
    'identity.phone': quiz.phone,
    'identity.city': quiz.city,
    'identity.region': quiz.region,
    'identity.country': quiz.country,
    'identity.linkedin': quiz.linkedIn,
  };
  const permitted = new Set(questions.filter(q => q.automation_policy === 'fill_if_explicit_preference').map(q => q.id));
  const draft: Preferences = { ...saved, preferences: { ...saved.preferences },
    recommendation_work_mode: saved.recommendation_work_mode ?? (quiz.workMode === 'remote_only' ? 'remote_only' : 'any'),
    require_document_review: saved.require_document_review ?? true,
    exported_at: timestamp,
  };
  for (const id of BOOTSTRAP_QUESTION_IDS) {
    if (!permitted.has(id)) throw new Error('Bootstrap question is not approved by the application taxonomy: ' + id);
    // Existing reviewed answers outrank first-run input. No silent replacement.
    if (draft.preferences[id]) continue;
    const value = values[id].trim();
    if (!value) continue;
    draft.preferences[id] = { scope: 'profile_preference', source: 'user', value, updated_at: timestamp };
  }
  const parsed = parsePreferences(draft);
  if (!parsed) throw new Error('The staged profile failed validation; nothing was saved.');
  return parsed;
}
