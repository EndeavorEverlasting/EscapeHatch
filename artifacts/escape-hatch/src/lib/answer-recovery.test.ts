import assert from 'node:assert/strict';
import test from 'node:test';
import { projectAnswerRecovery } from './answer-recovery.ts';
import { emptyProfile, type AnswerSnippet } from './storage.ts';
import { emptyPreferences, normalizeQuestion } from './application-preferences.ts';
import { emptyAssistProfile, type AssistAnswer, type ReviewedProposal } from './assist-contract.ts';

const timestamp = '2026-10-26T12:00:00.000Z';
const summary: AnswerSnippet = { id: 'base-summary', title: 'Professional summary', category: 'Career story', content: 'Reviewed career summary.', updatedAt: timestamp };
const assist: AssistAnswer = { ...summary, id: 'assist-summary', scope: 'reusable', canonicalId: 'professional-summary' };

test('summary duplicates merge sources without mutating either owner', () => {
  const input = { answers: [summary], assistAnswers: [{ ...assist, content: 'Reviewed  career summary.' }] };
  const before = JSON.stringify(input);
  const result = projectAnswerRecovery(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'recovered');
  assert.equal(result[0].scope, 'reusable');
  assert.deepEqual(result[0].variants[0].sources.map(item => item.owner), ['answer-library', 'assist-answers']);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(projectAnswerRecovery(input), result);
});

test('conflicting versions retain both values and never choose the latest', () => {
  const result = projectAnswerRecovery({ answers: [summary], assistAnswers: [{ ...assist, content: 'Different summary.', updatedAt: '2026-10-27T12:00:00Z' }] });
  assert.equal(result[0].status, 'needs-review');
  assert.deepEqual(result[0].variants.map(item => item.content), [summary.content, 'Different summary.']);
});

test('opportunity answers and mislabeled reusable opportunity records never enter general recovery', () => {
  assert.deepEqual(projectAnswerRecovery({ assistAnswers: [{ ...assist, scope: 'opportunity', opportunityId: 'job-a' }, { ...assist, opportunityId: 'job-b' }] }), []);
});

test('saved contact and exact preferences merge by taxonomy ID; unconfirmed phone is excluded', () => {
  const preferences = emptyPreferences();
  preferences.preferences['identity.email'] = { scope: 'profile_preference', source: 'user', value: 'synthetic@example.test', updated_at: timestamp };
  const result = projectAnswerRecovery({ profile: { ...emptyProfile, email: 'synthetic@example.test', phone: '12345' }, preferences });
  assert.equal(result.length, 1);
  assert.equal(result[0].questionKey, 'identity.email');
  assert.equal(result[0].variants[0].sources.length, 2);
  assert.equal(result[0].scope, 'question');
});

test('sensitive preferences remain exact-question records without inferred answers', () => {
  const preferences = emptyPreferences();
  preferences.preferences['employment.sponsorship_required'] = { scope: 'profile_preference', source: 'user', value: 'Yes', updated_at: timestamp };
  preferences.preferences['eeo.gender'] = { scope: 'profile_preference', source: 'user', value: 'Prefer not to answer', updated_at: timestamp };
  const result = projectAnswerRecovery({ preferences, profile: { ...emptyProfile, country: 'United States' } });
  assert.equal(result.length, 3);
  assert.ok(result.every(item => item.scope === 'question'));
  assert.equal(result.some(item => item.questionKey === 'employment.us_citizenship'), false);
  assert.deepEqual(projectAnswerRecovery({}), []);
});

test('question memory preserves approval boundary and observed missing state', () => {
  const preferences = emptyPreferences();
  preferences.discovered_answers = {};
  for (const [question, source, value, accepted] of [
    ['What motivates your work?', 'user', 'Building useful things.', true],
    ['What tools do you enjoy?', 'user', 'Hand tools.', false],
    ['What is your preferred workflow?', 'observed_question', '', false],
  ] as const) preferences.discovered_answers[normalizeQuestion(question)] = { question, source, value, accepted, updated_at: timestamp };
  const result = projectAnswerRecovery({ preferences });
  assert.deepEqual(result.map(item => item.status), ['recovered', 'needs-review', 'missing']);
  assert.ok(result.every(item => item.scope === 'question'));
});

test('same exact question deduplicates saved snippet and memory and preserves pending review', () => {
  const question = 'What motivates your work?';
  const preferences = emptyPreferences();
  preferences.discovered_answers = { [normalizeQuestion(question)]: { question, source: 'user', value: 'Useful things.', accepted: false, updated_at: timestamp } };
  const result = projectAnswerRecovery({ preferences, answers: [{ ...summary, title: question, content: 'Useful things.' }] });
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'needs-review');
  assert.equal(result[0].variants[0].sources.length, 2);
});

test('defensive memory filtering does not recover credential or malformed question records', () => {
  const preferences = emptyPreferences();
  preferences.discovered_answers = {
    'password please': { question: 'Password please', value: 'never surfaced', accepted: true, source: 'user', updated_at: timestamp },
    mismatch: { question: 'What motivates your work?', value: 'not bound', accepted: true, source: 'user', updated_at: timestamp },
  };
  assert.deepEqual(projectAnswerRecovery({ preferences }), []);
});

test('role-specific Assist answers retain question scope and provenance', () => {
  const provenance = { source: 'user' as const, label: 'Explicit response', capturedAt: timestamp };
  const result = projectAnswerRecovery({ assistAnswers: [{ ...assist, title: 'Why this role', canonicalId: 'why-this-role', provenance }] });
  assert.equal(result[0].scope, 'question');
  assert.deepEqual(result[0].variants[0].sources[0].provenance, provenance);
});

const proposal = (review: ReviewedProposal['review'], value = summary.content): ReviewedProposal => ({
  id: 'summary-proposal', section: 'summary', field: 'professional_summary', value, review, confidence: 'high',
  provenance: { source: 'resume', label: 'Synthetic reviewed résumé', capturedAt: timestamp },
});

test('accepted and edited exact Assist profile summaries recover without Assist Answers', () => {
  for (const review of ['accepted', 'edited'] as const) {
    const assistProfile = { ...emptyAssistProfile(emptyProfile), summary: summary.content, proposals: [proposal(review)] };
    const before = JSON.stringify(assistProfile);
    const result = projectAnswerRecovery({ assistProfile });
    assert.equal(result.length, 1);
    assert.equal(result[0].status, 'recovered');
    assert.equal(result[0].variants[0].sources.length, 2);
    assert.ok(result[0].variants[0].sources.every(source => source.owner === 'assist-profile'));
    assert.equal(JSON.stringify(assistProfile), before);
  }
});

test('changed summary does not inherit stale accepted approval and both values remain reviewable', () => {
  const assistProfile = { ...emptyAssistProfile(emptyProfile), summary: 'Changed summary.', proposals: [proposal('accepted')] };
  const result = projectAnswerRecovery({ assistProfile });
  assert.equal(result[0].status, 'needs-review');
  assert.deepEqual(result[0].variants.map(item => item.content), ['Changed summary.', summary.content]);
  assert.equal(result[0].variants[0].sources[0].provenance, undefined);
});

test('proposed summary requires review and rejected proposals are excluded', () => {
  const base = emptyAssistProfile(emptyProfile);
  assert.equal(projectAnswerRecovery({ assistProfile: { ...base, proposals: [proposal('proposed')] } })[0].status, 'needs-review');
  assert.deepEqual(projectAnswerRecovery({ assistProfile: { ...base, proposals: [proposal('rejected')] } }), []);
  assert.equal(projectAnswerRecovery({ assistProfile: { ...base, summary: summary.content, proposals: [proposal('rejected')] } })[0].status, 'needs-review');
});

test('answer proposal approval is explicit and never inferred from résumé facts', () => {
  const accepted = { ...proposal('accepted', 'A directly reviewed answer.'), section: 'answer' as const, field: 'What motivates your work?' };
  const base = emptyAssistProfile(emptyProfile);
  assert.equal(projectAnswerRecovery({ assistProfile: { ...base, proposals: [accepted] } })[0].status, 'recovered');
  assert.equal(projectAnswerRecovery({ assistProfile: { ...base, proposals: [{ ...accepted, review: 'proposed' }] } })[0].status, 'needs-review');
  assert.deepEqual(projectAnswerRecovery({ assistProfile: { ...base, proposals: [{ ...accepted, review: 'rejected' }] } }), []);
  assert.deepEqual(projectAnswerRecovery({ assistProfile: { ...base, skills: ['Canadian law'], proposals: [] } }), []);
});
