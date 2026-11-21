import { matchQuestion, normalizeQuestion, parsePreferences, questions, roleQuestionKey, safeDiscoveredQuestion,
  sameRoleAnswerSlot, sameApplicationAnswerSlot, MAX_ROLE_ANSWER_LENGTH, type Preferences, type ReviewedRoleAnswer,
  type ReviewedApplicationAnswer } from './src/lib/application-preferences.ts';
import { assertEmployerFacingDocumentUrl } from './src/lib/employer-facing-document-url.ts';
import { mergeApplicationAnswers, mergeReviewedRoleAnswers, updateAndVerifyPreferences } from './preference-file.ts';

type Field = { question: string; kind: string; value: string };
type Scope = { opportunityId: string; url: string; employerName: string };
const KINDS = ['text', 'email', 'tel', 'url', 'number', 'textarea', 'select-one', 'select-multiple', 'radio', 'checkbox'];
const PROTECTED = /\b(?:password|secret|token|privacy|disclosure|terms|acknowledg\w*|attest\w*|certif\w*|signature|sign|agree\w*|consent\w*|date|voluntary)\b/;

// Shared entry for the explicitly reviewed form, never for passive keystrokes.
export async function syncReviewedApplicationAnswers(input: unknown, scope: Scope, file?: string,
  assertSourceCurrent?: () => void | Promise<void>) {
  if (!Array.isArray(input) || input.length > 160 || !input.every((row): row is Field =>
    row && typeof row.question === 'string' && row.question.length <= 512 &&
    typeof row.value === 'string' && row.value.length <= 16384 && KINDS.includes(row.kind))) {
    throw new Error('INVALID_REVIEWED_FORM');
  }
  const rows = input.map(({ question, kind, value }) => {
    const label = normalizeQuestion(question);
    const role = kind === 'textarea' ? roleQuestionKey(question) : null;
    const matched = matchQuestion(question, scope.employerName);
    const key = role ? 'role:' + role : matched ?? label;
    return { question, kind, value, label, role, matched, key };
  });
  const approvedAt = new Date().toISOString();
  let expected: Preferences | undefined;
  const receipt = { updated: 0, unchanged: 0, skipped: 0, applicationAnswers: { updated: 0, unchanged: 0 } };
  await updateAndVerifyPreferences(async current => {
    await assertSourceCurrent?.();
    const preferences = { ...current.preferences };
    const discovered = { ...current.discovered_answers };
    const roleAnswers: ReviewedRoleAnswer[] = [];
    const applicationAnswers: ReviewedApplicationAnswer[] = [];
    const keepForApplication = (question: string, value: string) => {
      if (value.length > MAX_ROLE_ANSWER_LENGTH) return;
      const answer = { opportunityId: scope.opportunityId, url: scope.url, question, value, approvedAt };
      if (current.application_answers?.some(prior => sameApplicationAnswerSlot(prior, answer) && prior.value === value)) {
        receipt.applicationAnswers.unchanged++;
      } else { applicationAnswers.push(answer); receipt.applicationAnswers.updated++; }
    };
    const duplicates = new Set<string>();
    const keys = new Set<string>();
    for (const row of rows) {
      if (keys.has(row.key)) duplicates.add(row.key);
      keys.add(row.key);
    }
    for (const { question, kind, value, label, role, matched, key } of rows) {
      if (!value.trim()) continue;
      if (duplicates.has(key) || PROTECTED.test(label) || (matched && /^(eeo|accommodation|military|veteran|legal|marketing|attestation)\./.test(matched))) {
        receipt.skipped++; continue;
      }
      if (role) {
        if (value.length > MAX_ROLE_ANSWER_LENGTH) throw new Error('REVIEWED_ROLE_ANSWER_TOO_LONG');
        const answer = { opportunityId: scope.opportunityId, url: scope.url, question, value, approvedAt };
        if (current.reviewed_role_answers?.some(prior => sameRoleAnswerSlot(prior, answer) && prior.value === value)) receipt.unchanged++;
        else { roleAnswers.push(answer); receipt.updated++; }
        continue;
      }
      const trimmed = value.trim();
      if (/^(?:please )?(?:select|choose)(?: one)?[ .…-]*$/i.test(trimmed)) {
        receipt.skipped++; continue;
      }
      try { assertEmployerFacingDocumentUrl(question, trimmed); }
      catch { receipt.skipped++; continue; }
      if (trimmed.length > 512) {
        if (kind === 'textarea') keepForApplication(question, value);
        receipt.skipped++; continue;
      }
      const definition = questions.find(item => item.id === matched);
      const profileWide = Boolean(definition && definition.answer_scope === 'profile' &&
          definition.automation_policy === 'fill_if_explicit_preference' && definition.confirmation_policy === 'until_changed' &&
          !/^employment\.(?:current_employee|previous_employee|prior_employer_relationship)$/.test(definition.id));
      if (!profileWide) keepForApplication(question, kind === 'textarea' ? value : trimmed);
      if (profileWide && definition) {
        const prior = preferences[definition.id];
        if (prior?.value === trimmed) receipt.unchanged++;
        else if (prior && Date.parse(prior.updated_at) > Date.parse(approvedAt)) receipt.skipped++;
        else {
          preferences[definition.id] = { scope: 'profile_preference', value: trimmed, source: 'user', updated_at: approvedAt };
          receipt.updated++;
        }
      } else if (safeDiscoveredQuestion(question) && !roleQuestionKey(question)) {
        const prior = discovered[label];
        if (prior?.value === trimmed) receipt.unchanged++;
        else if (prior && Date.parse(prior.updated_at) > Date.parse(approvedAt)) receipt.skipped++;
        else {
          // A new unknown prompt is saved for review. A reviewed correction
          // inherits reuse permission only when that same prompt already had it.
          discovered[label] = { question, value: trimmed, source: 'user', updated_at: approvedAt, accepted: prior?.accepted === true };
          receipt.updated++;
        }
      } else receipt.skipped++;
    }
    if (!receipt.updated && !receipt.applicationAnswers.updated) { expected = current; return current; }
    const next = mergeApplicationAnswers(
      mergeReviewedRoleAnswers({ ...current, preferences, discovered_answers: discovered }, roleAnswers), applicationAnswers);
    expected = parsePreferences(next) || undefined;
    if (!expected) throw new Error('REVIEWED_PROFILE_CAPACITY_OR_VALIDATION_FAILED');
    return expected;
  }, stored => JSON.stringify(stored) === JSON.stringify(expected), file);
  return { status: 'REVIEWED_ANSWERS_SAVED_AND_READ_BACK' as const, ...receipt };
}
