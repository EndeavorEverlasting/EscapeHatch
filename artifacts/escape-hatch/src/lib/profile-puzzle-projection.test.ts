import test from 'node:test';
import assert from 'node:assert/strict';
import { projectProfilePuzzle } from './profile-puzzle-projection.ts';
import { projectAnswerRecovery, type RecoveredKnowledge } from './answer-recovery.ts';
import { emptyProfile, type Profile } from './storage.ts';
import { emptyAssistProfile, type AssistProfile, type AssistAnswer } from './assist-contract.ts';

const time = '2026-11-04T12:00:00.000Z';
const recovery = (items: readonly RecoveredKnowledge[] = []) => ({ items, loading: false, unavailable: [] as string[] });
const status = (snapshot: ReturnType<typeof projectProfilePuzzle>, key: string) => snapshot.pieces.find(piece => piece.key === key)?.status;
const summaryProfile = (review: 'proposed' | 'accepted', current = 'Synthetic reviewed summary'): AssistProfile => ({
  ...emptyAssistProfile(emptyProfile), summary: current, updatedAt: time,
  proposals: [{ id: 'private-proposal', section: 'summary', field: 'professional_summary', value: 'Synthetic reviewed summary',
    confidence: 'high', review, provenance: { source: 'user', label: 'Private source label', capturedAt: time } }],
});

test('fixed local inventory is stable and contains no employer readiness authority', () => {
  const snapshot = projectProfilePuzzle({ profile: emptyProfile, recovery: recovery() });
  assert.deepEqual(snapshot.pieces.map(piece => piece.key), ['first_name', 'last_name', 'email', 'phone', 'city', 'region', 'country', 'linkedin_url', 'professional-summary', 'reusable-answers']);
  assert.equal(snapshot.total, 10);
  assert.equal(snapshot.savedCount, 0);
  assert.equal(snapshot.coverageMeasured, true);
  assert.deepEqual(Object.keys(snapshot).sort(), ['coverageMeasured', 'pieces', 'savedCount', 'total']);
});

test('contact-only profile never completes career signals', () => {
  const profile: Profile = Object.fromEntries(Object.keys(emptyProfile).map(key => [key, key === 'phone_authority' ? 'user_confirmed_primary' : 'synthetic'])) as Profile;
  const snapshot = projectProfilePuzzle({ profile, recovery: recovery() });
  assert.equal(snapshot.savedCount, 8);
  assert.equal(status(snapshot, 'professional-summary'), 'missing');
  assert.equal(status(snapshot, 'reusable-answers'), 'missing');
});

test('nonempty phone requires explicit primary-phone authority', () => {
  assert.equal(status(projectProfilePuzzle({ profile: { ...emptyProfile, phone: '555-0100' } }), 'phone'), 'needs_review');
  assert.equal(status(projectProfilePuzzle({ profile: { ...emptyProfile, phone: '555-0100', phone_authority: 'user_confirmed_primary' } }), 'phone'), 'saved');
});

test('contact conflict overrides a nonempty saved value', () => {
  const group: RecoveredKnowledge = { id: 'question:identity.email', questionKey: 'identity.email', title: 'Private title', category: 'Contact', scope: 'question', status: 'needs-review', variants: [] };
  const snapshot = projectProfilePuzzle({ profile: { ...emptyProfile, email: 'sentinel@example.invalid' }, recovery: recovery([group]) });
  assert.equal(status(snapshot, 'email'), 'needs_review');
  assert.equal(snapshot.savedCount, 0);
  assert.deepEqual(snapshot.pieces.find(piece => piece.key === 'email')?.nextAction,
    { label: 'Review saved contact answers', href: '/assist' });
  assert.equal(projectProfilePuzzle({ profile: { ...emptyProfile, phone: '555-0100' } }).pieces.find(piece => piece.key === 'phone')?.nextAction.href, '/profile');
});

test('proposed summary is not saved; exact accepted summary is saved', () => {
  for (const review of ['proposed', 'accepted'] as const) {
    const items = projectAnswerRecovery({ assistProfile: summaryProfile(review) });
    assert.equal(status(projectProfilePuzzle({ profile: emptyProfile, recovery: recovery(items) }), 'professional-summary'), review === 'accepted' ? 'saved' : 'needs_review');
  }
});

test('older accepted summary does not approve changed content', () => {
  const items = projectAnswerRecovery({ assistProfile: summaryProfile('accepted', 'Changed unreviewed summary') });
  assert.equal(status(projectProfilePuzzle({ profile: emptyProfile, recovery: recovery(items) }), 'professional-summary'), 'needs_review');
});

test('conflicting reusable answers require review', () => {
  const items = projectAnswerRecovery({ answers: [
    { id: 'one', title: 'Strengths', category: 'Strengths', content: 'Version one', updatedAt: time },
    { id: 'two', title: 'Strengths', category: 'Strengths', content: 'Version two', updatedAt: time },
  ] });
  assert.equal(status(projectProfilePuzzle({ profile: emptyProfile, recovery: recovery(items) }), 'reusable-answers'), 'needs_review');
});

test('opportunity-bound and legacy opportunity-tagged answers stay excluded', () => {
  const base: AssistAnswer = { id: 'role-answer', title: 'Strengths', category: 'Strengths', content: 'Private role answer', updatedAt: time, canonicalId: 'strengths', scope: 'opportunity', opportunityId: 'private-role' };
  for (const scope of ['opportunity', 'reusable'] as const) {
    const items = projectAnswerRecovery({ assistAnswers: [{ ...base, scope }] });
    assert.equal(status(projectProfilePuzzle({ profile: emptyProfile, recovery: recovery(items) }), 'reusable-answers'), 'missing');
  }
});

test('sensitive exact-question answers cannot complete reusable signal', () => {
  const items = projectAnswerRecovery({ answers: [{ id: 'legal', title: 'Legal attestation', category: 'Other', content: 'Synthetic protected answer', updatedAt: time }] });
  assert.equal(status(projectProfilePuzzle({ profile: emptyProfile, recovery: recovery(items) }), 'reusable-answers'), 'missing');
});

test('unavailable, loading and uninspected recovery remain unmeasured', () => {
  for (const input of [undefined, { ...recovery(), loading: true }, { ...recovery(), unavailable: ['Private unavailable source'] }]) {
    const snapshot = projectProfilePuzzle({ profile: { ...emptyProfile, first_name: 'Sentinel' }, recovery: input });
    assert.equal(snapshot.coverageMeasured, false);
    assert.equal(status(snapshot, 'professional-summary'), 'unmeasured');
    assert.equal(status(snapshot, 'reusable-answers'), 'unmeasured');
    assert.equal(status(snapshot, 'first_name'), 'saved');
  }
});

test('output contains only fixed public labels, owner names and safe timestamps', () => {
  const items = projectAnswerRecovery({ assistProfile: summaryProfile('accepted') });
  const snapshot = projectProfilePuzzle({ profile: { ...emptyProfile, email: 'sentinel@example.invalid' }, recovery: recovery(items) });
  const serialized = JSON.stringify(snapshot);
  for (const privateValue of ['sentinel@example.invalid', 'Synthetic reviewed summary', 'private-proposal', 'Private source label']) assert.equal(serialized.includes(privateValue), false);
  assert.equal(snapshot.pieces.find(piece => piece.key === 'professional-summary')?.updatedAt, time);
});

test('duplicate equal answers do not create extra pieces and projector leaves inputs unchanged', () => {
  const items = projectAnswerRecovery({ answers: ['one', 'two'].map(id => ({ id, title: 'Strengths', category: 'Strengths', content: 'Same synthetic answer', updatedAt: time })) });
  const input = { profile: { ...emptyProfile }, recovery: recovery(items) };
  const before = JSON.stringify(input);
  const freeze = (value: unknown): void => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };
  freeze(input);
  const snapshot = projectProfilePuzzle(input);
  assert.equal(snapshot.total, 10);
  assert.equal(snapshot.savedCount, 1);
  assert.equal(status(snapshot, 'reusable-answers'), 'saved');
  assert.equal(JSON.stringify(input), before);
});

test('source timestamps are normalized and invalid timestamps are omitted', () => {
  const items = projectAnswerRecovery({ answers: [{ id: 'one', title: 'Strengths', category: 'Strengths', content: 'Synthetic answer', updatedAt: 'November 4, 2026 12:00:00 GMT' }] });
  const snapshot = projectProfilePuzzle({ profile: emptyProfile, recovery: recovery(items) });
  assert.equal(snapshot.pieces.find(piece => piece.key === 'reusable-answers')?.updatedAt, time);
  items[0].variants[0].sources[0].updatedAt = 'not a timestamp';
  assert.equal(projectProfilePuzzle({ profile: emptyProfile, recovery: recovery(items) }).pieces.find(piece => piece.key === 'reusable-answers')?.updatedAt, undefined);
});
