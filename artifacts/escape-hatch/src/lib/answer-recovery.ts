import type { AnswerSnippet, Profile } from './storage.ts';
import type { AssistAnswer, Provenance } from './assist-contract.ts';
import { matchQuestion, normalizeQuestion, questions, safeDiscoveredQuestion, type Preferences } from './application-preferences.ts';

export type RecoveredSource = {
  owner: 'answer-library' | 'assist-answers' | 'profile' | 'application-preferences' | 'question-memory';
  recordId: string;
  label: string;
  updatedAt?: string;
  provenance?: Provenance;
};
export type RecoveredKnowledge = {
  id: string;
  questionKey: string;
  title: string;
  category: string;
  status: 'recovered' | 'needs-review' | 'missing';
  scope: 'reusable' | 'question';
  variants: { content: string; sources: RecoveredSource[] }[];
};
export type AnswerRecoveryInput = {
  answers?: readonly AnswerSnippet[];
  assistAnswers?: readonly AssistAnswer[];
  profile?: Profile;
  preferences?: Preferences;
};

const contactFields: Partial<Record<keyof Profile, string>> = {
  name_prefix: 'identity.title', first_name: 'identity.first_name', last_name: 'identity.last_name',
  preferred_name: 'identity.preferred_name', email: 'identity.email', phone: 'identity.phone',
  linkedin_url: 'identity.linkedin', street_address: 'identity.street_address', city: 'identity.city',
  region: 'identity.region', postal_code: 'identity.postal_code', country: 'identity.country',
};
const reusableQuestions = new Set(['professional-summary', 'strengths', 'relevant-experience']);
const canonicalTitles: Record<string, string> = {
  'professional summary': 'professional-summary', strengths: 'strengths',
  'relevant experience': 'relevant-experience', 'why this role': 'why-this-role',
  'why this company': 'why-this-company', 'work authorization': 'work-authorization',
  sponsorship: 'sponsorship', compensation: 'compensation', demographic: 'demographic',
  'legal attestation': 'legal-attestation',
};

/** Read-only view of existing owners. This grants no new approval or fill authority. */
export function projectAnswerRecovery(input: AnswerRecoveryInput): RecoveredKnowledge[] {
  const groups = new Map<string, RecoveredKnowledge>();
  const pending = new Set<string>();
  const add = (questionKey: string, title: string, category: string, scope: RecoveredKnowledge['scope'],
    content: string, source: RecoveredSource, review = false) => {
    const id = scope + ':' + questionKey;
    let group = groups.get(id);
    if (!group) {
      group = { id, questionKey, title, category, scope, status: 'missing', variants: [] };
      groups.set(id, group);
    }
    if (review) pending.add(id);
    const normalized = content.normalize('NFKC').trim().replace(/\s+/g, ' ');
    const existing = group.variants.find(item => item.content.normalize('NFKC').trim().replace(/\s+/g, ' ') === normalized);
    if (existing) {
      if (!existing.sources.some(item => item.owner === source.owner && item.recordId === source.recordId)) existing.sources.push(source);
    } else group.variants.push({ content, sources: [source] });
  };
  const snippet = (answer: AnswerSnippet, owner: 'answer-library' | 'assist-answers', canonicalId?: string, provenance?: Provenance) => {
    if (!answer.content.trim()) return;
    const normalized = normalizeQuestion(answer.title);
    const known = matchQuestion(answer.title);
    const canonical = canonicalId && canonicalId !== 'unknown' ? canonicalId : canonicalTitles[normalized];
    const key = known || canonical || 'prompt:' + normalized;
    const scope = !known && canonical && reusableQuestions.has(canonical) && safeDiscoveredQuestion(answer.title) ? 'reusable' : 'question';
    add(key, answer.title, answer.category, scope, answer.content,
      { owner, recordId: answer.id, label: owner === 'answer-library' ? 'Answer Library' : 'Saved Assist answer', updatedAt: answer.updatedAt, ...(provenance ? { provenance } : {}) });
  };
  for (const answer of input.answers || []) snippet(answer, 'answer-library');
  for (const answer of input.assistAnswers || []) {
    // A legacy opportunityId on a supposedly reusable record still limits its scope.
    if (answer.scope === 'reusable' && !answer.opportunityId) snippet(answer, 'assist-answers', answer.canonicalId, answer.provenance);
  }
  for (const [field, id] of Object.entries(contactFields)) {
    const value = input.profile?.[field as keyof Profile];
    if (!value?.trim() || field === 'phone' && input.profile?.phone_authority !== 'user_confirmed_primary') continue;
    const question = questions.find(item => item.id === id)!;
    add(id, question.aliases[0], 'Contact', 'question', value, { owner: 'profile', recordId: field, label: 'Saved profile contact' });
  }
  for (const [id, answer] of Object.entries(input.preferences?.preferences || {})) {
    const question = questions.find(item => item.id === id);
    if (!question || answer.source !== 'user' || !answer.value.trim()) continue;
    // Even explicitly saved sensitive choices retain their exact-question boundary.
    add(id, question.aliases[0], question.family, 'question', answer.value,
      { owner: 'application-preferences', recordId: id, label: 'Saved application preference', updatedAt: answer.updated_at });
  }
  for (const [key, answer] of Object.entries(input.preferences?.discovered_answers || {})) {
    if (!safeDiscoveredQuestion(answer.question) || normalizeQuestion(answer.question) !== key) continue;
    const content = answer.source === 'user' ? answer.value : '';
    add('prompt:' + key, answer.question, 'Remembered questions', 'question', content,
      { owner: 'question-memory', recordId: key, label: 'Exact-question memory', updatedAt: answer.updated_at },
      answer.source === 'user' && answer.accepted !== true);
  }
  for (const group of groups.values()) {
    const filled = group.variants.filter(item => item.content.trim()).length;
    group.status = filled > 1 || pending.has(group.id) ? 'needs-review' : filled ? 'recovered' : 'missing';
  }
  return [...groups.values()];
}
