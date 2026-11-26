import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import taxonomy from '../../../../harness/contracts/application-form-taxonomy.v1.json' with { type: 'json' };
import { emptyPreferences, type Preferences } from './application-preferences.ts';
import { PROFILE_DISCOVERY_QUESTIONS, projectProfileDiscovery, validateDiscoveryAnswer, reconcileGuidedReadback } from './profile-question-planner.ts';

test('every discovery field has one canonical non-protected reusable owner', () => {
  const owned = new Map(taxonomy.questions.map(q => [q.id, q]));
  assert.equal(new Set(PROFILE_DISCOVERY_QUESTIONS.map(q => q.id)).size, PROFILE_DISCOVERY_QUESTIONS.length);
  assert.ok(PROFILE_DISCOVERY_QUESTIONS.length >= 12);
  for (const question of PROFILE_DISCOVERY_QUESTIONS) {
    const owner = owned.get(question.id);
    assert.equal(owner?.answer_scope, 'profile', question.id);
    assert.equal(owner?.automation_policy, 'fill_if_explicit_preference', question.id);
    assert.equal(owner?.confirmation_policy, 'until_changed', question.id);
    assert.ok(question.reuseWeight > 0 && question.estimatedSeconds > 0);
    assert.doesNotMatch(question.id, /^(eeo|legal|attestation|compensation|accommodation|marketing|employment)/);
  }
});

test('deterministic greedy ranking favors high yield per minute, not private disclosures', () => {
  const empty = emptyPreferences();
  const first = projectProfileDiscovery(empty);
  assert.equal(first.answered, 0);
  assert.equal(first.total, PROFILE_DISCOVERY_QUESTIONS.length);
  assert.equal(first.reusableCoveragePercent, 0);
  assert.equal(first.next?.id, projectProfileDiscovery(empty).next?.id);
  const clone = { ...empty, preferences: {
    [first.next!.id]: { scope: 'profile_preference' as const, source: 'user' as const, value: 'Reviewed', updated_at: '2026-11-25T00:00:00Z' },
  }};
  const second = projectProfileDiscovery(clone);
  assert.equal(second.answered, 1);
  assert.equal(second.remaining, first.remaining - 1);
  assert.ok(second.reusableCoveragePercent > 0);
  assert.notEqual(second.next?.id, first.next?.id);
  assert.ok(second.next!.marginalValuePerMinute > 0);
});

test('skip is session-only, preserves answers and never masquerades as progress', () => {
  const data = emptyPreferences();
  const first = projectProfileDiscovery(data);
  const skipped = projectProfileDiscovery(data, [first.next!.id]);
  assert.equal(skipped.answered, 0);
  assert.equal(skipped.reusableCoveragePercent, 0);
  assert.equal(skipped.skippedThisVisit, 1);
  assert.notEqual(skipped.next?.id, first.next?.id);
  assert.equal(projectProfileDiscovery(data).next?.id, first.next?.id);
  const full: Preferences = { ...data, preferences: Object.fromEntries(PROFILE_DISCOVERY_QUESTIONS.map(q =>
    [q.id, { scope: 'profile_preference' as const, source: 'user' as const, value: 'Confirmed', updated_at: '2026-11-25T00:00:00Z' }])) };
  const finished = projectProfileDiscovery(full);
  assert.equal(finished.reusableCoveragePercent, 100);
  assert.equal(finished.remaining, 0);
  assert.equal(finished.next, null);
});

test('reject empty, overlong and unsafe URL answers without making claims', () => {
  const website = PROFILE_DISCOVERY_QUESTIONS.find(q => q.id === 'identity.website')!;
  assert.match(validateDiscoveryAnswer(website, '') || '', /Enter/);
  assert.match(validateDiscoveryAnswer(website, 'https://name:password@example.org') || '', /without credentials/);
  assert.match(validateDiscoveryAnswer(website, 'http://example.org') || '', /HTTPS/);
  assert.equal(validateDiscoveryAnswer(website, 'https://example.org/portfolio'), null);
  assert.match(validateDiscoveryAnswer(website, 'a'.repeat(513)) || '', /513/);
});

test('avatar coach is reachable from the actual profile route and existing assist surface', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const managed = readFileSync(new URL('../components/managed-browser-assist.tsx', import.meta.url), 'utf8');
  const preferences = readFileSync(new URL('../components/application-preferences.tsx', import.meta.url), 'utf8');
  assert.ok(app.includes('<Route path="/profile"'), 'profile route must mount the reused answers editor');
  assert.match(app, /<ApplicationPreferences/);
  assert.match(managed, /<ApplicationPreferences/);
  assert.match(preferences, /<ProfileDiscoveryCoach/);
  assert.match(preferences, /bootstrapDefaults/);
});

test('guided save merges only confirmed facts without persisting unrelated editor drafts', () => {
  const persisted = emptyPreferences();
  persisted.preferences['identity.website'] = {
    scope: 'profile_preference', source: 'user', value: 'https://example.test/portfolio',
    updated_at: '2026-11-25T12:00:00Z',
  };
  const unsaved = emptyPreferences();
  unsaved.preferences['identity.phone'] = {
    scope: 'profile_preference', source: 'user', value: '555-0100',
    updated_at: '2026-11-25T12:01:00Z',
  };
  unsaved.optional_omissions = ['identity.pronouns'];
  const result = reconcileGuidedReadback(unsaved, persisted, ['identity.website'], ['identity.website', 'identity.phone']);
  assert.equal(result.editor.preferences['identity.website']?.value, 'https://example.test/portfolio');
  assert.equal(result.editor.preferences['identity.phone']?.value, '555-0100');
  assert.deepEqual(result.editor.optional_omissions, ['identity.pronouns']);
  assert.deepEqual(result.removedQuestions, ['identity.phone']);
  assert.equal(persisted.preferences['identity.phone'], undefined);
  assert.equal(unsaved.preferences['identity.website'], undefined);
  const differentDraft: Preferences = { ...unsaved, preferences: {
    ...unsaved.preferences,
    'identity.website': { scope: 'profile_preference', source: 'user',
      value: 'https://draft.example.test/', updated_at: '2026-11-25T12:02:00Z' },
  } };
  const kept = reconcileGuidedReadback(differentDraft, persisted, ['identity.website'], []);
  assert.equal(kept.editor.preferences['identity.website']?.value, 'https://draft.example.test/');
});

test('the residential metro question never teaches a search-location answer as residence', () => {
  const metro = PROFILE_DISCOVERY_QUESTIONS.find(question => question.id === 'identity.metro_area');
  assert.equal(metro?.label, 'Current residential metro area');
  assert.match(metro?.why || '', /currently live/);
});
