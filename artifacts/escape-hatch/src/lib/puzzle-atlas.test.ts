import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRecoveredAnswer, projectPuzzleAtlas, PUZZLE_ATLAS_MODULES } from './puzzle-atlas.ts';
import type { ProfilePuzzleSnapshot } from './profile-puzzle-projection.ts';
import type { RecoveredKnowledge } from './answer-recovery.ts';

const snapshot: ProfilePuzzleSnapshot = {
  coverageMeasured: true, savedCount: 2, total: 3,
  pieces: [
    { key: 'first_name', label: 'First name', status: 'saved', sourceOwner: 'profile', nextAction: { label: 'Review', href: '/profile' } },
    { key: 'last_name', label: 'Last name', status: 'saved', sourceOwner: 'profile', nextAction: { label: 'Review', href: '/profile' } },
    { key: 'email', label: 'Email', status: 'needs_review', sourceOwner: 'profile', nextAction: { label: 'Review', href: '/profile' } },
  ],
};
const answer = (questionKey: string, scope: RecoveredKnowledge['scope'], status: RecoveredKnowledge['status'] = 'recovered', category = 'Other'): RecoveredKnowledge => ({
  id: scope + ':' + questionKey, questionKey, scope, status, category, title: questionKey, variants: []
});

test('all ten independently named modules have safe varied presentations', () => {
  assert.equal(PUZZLE_ATLAS_MODULES.length, 10);
  assert.equal(new Set(PUZZLE_ATLAS_MODULES.map(x => x.id)).size, 10);
  assert.equal(PUZZLE_ATLAS_MODULES.every(x => x.variations.length >= 3), true);
  assert.equal(PUZZLE_ATLAS_MODULES.filter(x => x.artwork.path).length, 10, 'all ten original illustrations have shipped browser paths');
  assert.equal(PUZZLE_ATLAS_MODULES.some(x => x.id === 'answer-constellation'), true);
  assert.equal(PUZZLE_ATLAS_MODULES.some(x => x.id === 'document-vault'), true);
});

test('standard, narrative, rare, and restricted answers remain distinct', () => {
  assert.equal(classifyRecoveredAnswer(answer('employment.sponsorship_required', 'question')), 'standard');
  assert.equal(classifyRecoveredAnswer(answer('professional-summary', 'reusable')), 'narrative');
  assert.equal(classifyRecoveredAnswer(answer('prompt:unusual employer scenario', 'question')), 'rare');
  assert.equal(classifyRecoveredAnswer(answer('eeo.gender', 'question')), 'restricted');
  assert.equal(classifyRecoveredAnswer(answer('legal.acknowledge', 'reusable')), 'restricted', 'restricted outranks reusable');
});

test('unavailable sources never become missing, saved, or reward-unlocked', () => {
  const result = projectPuzzleAtlas(snapshot);
  const education = result.find(x => x.id === 'education-lantern')!;
  const documents = result.find(x => x.id === 'document-vault')!;
  assert.equal(education.pieces[0].status, 'unmeasured');
  assert.equal(documents.pieces.every(x => x.status === 'unmeasured'), true);
  assert.equal(documents.fullyMeasured, false);
  assert.equal(documents.unlocked, false);
  const answers = result.find(x => x.id === 'answer-constellation')!;
  assert.equal(answers.pieces.every(x => x.status === 'unmeasured'), true);
  assert.equal(answers.unlocked, false);
});

test('saved and conflicting source-backed fields update only their own modules', () => {
  const old = JSON.stringify(snapshot);
  const recovery = { loading: false, unavailable: [], items: [
    answer('strengths', 'reusable'),
    answer('relevant-experience', 'reusable', 'needs-review'),
    answer('employment.work_authorization_proof', 'question'),
    answer('prompt:rare scenario', 'question'),
    answer('eeo.gender', 'question'),
  ] };
  const modules = projectPuzzleAtlas(snapshot, recovery);
  assert.equal(modules.find(x => x.id === 'skills-garden')!.pieces[0].status, 'saved');
  assert.equal(modules.find(x => x.id === 'experience-ladder')!.pieces[0].status, 'needs_review');
  assert.equal(modules.find(x => x.id === 'work-passport')!.pieces[0].status, 'saved');
  assert.equal(modules.find(x => x.id === 'answer-constellation')!.pieces.find(x => x.key === 'answers:rare')!.status, 'saved');
  assert.equal(modules.find(x => x.id === 'answer-constellation')!.pieces.find(x => x.key === 'answers:standard')!.status, 'saved');
  assert.equal(modules.find(x => x.id === 'document-vault')!.unlocked, false);
  assert.equal(JSON.stringify(snapshot), old, 'projections are read-only');
});

test('a complete module does not infer overall ATS readiness or another module completion', () => {
  const full: ProfilePuzzleSnapshot = {
    ...snapshot, pieces: [
      ...snapshot.pieces,
      { key: 'linkedin_url', label: 'LinkedIn URL', status: 'saved', sourceOwner: 'profile', nextAction: { label: 'Review', href: '/profile' } },
    ],
  };
  const result = projectPuzzleAtlas(full);
  assert.equal(result.find(x => x.id === 'identity-hatch')!.unlocked, true);
  assert.equal(result.find(x => x.id === 'document-vault')!.unlocked, false);
  assert.equal(result.find(x => x.id === 'companion-link')!.unlocked, false);
});
