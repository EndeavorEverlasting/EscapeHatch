import { questions, type Preferences } from './application-preferences.ts';

// A stale or concurrent read must not replace edits made after its request began.
export function canReplaceEditorFromDisk(
  requestVersion: number,
  latestRequestVersion: number,
  editVersionAtStart: number,
  currentEditVersion: number,
): boolean {
  return requestVersion === latestRequestVersion && editVersionAtStart === currentEditVersion;
}

// This is an explicit user-facing projection of the private local store, not an
// employer-side form readback. Unknown IDs are deliberately not displayed.
export type SavedAnswerReviewRow = {
  id: string;
  label: string;
  value: string;
  updatedAt: string;
  source: 'saved_preference' | 'approved_question_memory' | 'unapproved_question_memory';
  reusable: boolean;
};

const talentFields = [
  ['talent_community.primary_areas', 'Primary professional areas'],
  ['talent_community.industry_preferences', 'Preferred industries'],
  ['talent_community.new_graduate_interest', 'New-graduate opportunities'],
] as const;

export function savedAnswerReviewRows(data: Preferences): SavedAnswerReviewRow[] {
  const known = new Map(questions.map(question => [question.id, question]));
  const rows: SavedAnswerReviewRow[] = [];
  for (const [id, answer] of Object.entries(data.preferences)) {
    const question = known.get(id);
    if (!question || answer.source !== 'user' || !answer.value.trim()) continue;
    rows.push({
      id, label: question.aliases[0] || id, value: answer.value, updatedAt: answer.updated_at,
      source: 'saved_preference',
      reusable: question.automation_policy === 'fill_if_explicit_preference' && question.confirmation_policy === 'until_changed',
    });
  }
  for (const [key, answer] of Object.entries(data.discovered_answers || {})) {
    if (answer.source !== 'user' || !answer.value.trim()) continue;
    rows.push({
      id: 'discovered:' + key, label: answer.question, value: answer.value, updatedAt: answer.updated_at,
      source: answer.accepted ? 'approved_question_memory' : 'unapproved_question_memory',
      reusable: answer.accepted,
    });
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

export function unrecognizedSavedAnswerCount(data: Preferences): number {
  const known = new Set(questions.map(question => question.id));
  return Object.keys(data.preferences).filter(id => !known.has(id)).length;
}

// Copying is an explicit operator action. Only these three known, non-contact
// Cognizant-interest fields are included. No automatic upload, public log or sync.
export function talentCommunityAnswerHandoff(data: Preferences): string {
  const lines = [
    'EscapeHatch — talent-community saved answer handoff',
    'Evidence: private local preference store. Not proof of employer-side form selection or acceptance.',
    '',
  ];
  for (const [id, label] of talentFields) {
    const answer = data.preferences[id];
    lines.push(label + ' (' + id + ')');
    lines.push('Saved answer: ' + (answer?.source === 'user' ? answer.value : '[not recorded]'));
    lines.push('Saved at: ' + (answer?.source === 'user' ? answer.updated_at : '[not recorded]'));
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function hasTalentCommunityAnswers(data: Preferences): boolean {
  return talentFields.some(([id]) => Boolean(data.preferences[id]?.value?.trim()));
}
