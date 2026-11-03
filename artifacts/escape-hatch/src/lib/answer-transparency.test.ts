import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyPreferences, parsePreferences, reusableValue, normalizeQuestion } from './application-preferences.ts';
import { savedAnswerReviewRows, talentCommunityAnswerHandoff, hasTalentCommunityAnswers, unrecognizedSavedAnswerCount } from './answer-transparency.ts';

test('saved Cognizant answers are visible with exact value, source and date; copy is limited to three fields', () => {
  const data = emptyPreferences();
  const preference = (value: string, date: string) =>
    ({ scope: 'profile_preference' as const, source: 'user' as const, value, updated_at: date });
  data.preferences['talent_community.primary_areas'] = preference('Engineering', '2026-11-03T21:01:00Z');
  data.preferences['talent_community.industry_preferences'] = preference('Healthcare', '2026-11-03T21:02:00Z');
  data.preferences['talent_community.new_graduate_interest'] = preference('No', '2026-11-03T21:03:00Z');
  data.preferences['identity.email'] = preference('private@example.test', '2026-11-03T21:04:00Z');
  const review = savedAnswerReviewRows(data);
  assert.deepEqual(review.slice(0, 3).map(row => row.id), [
    'identity.email', 'talent_community.new_graduate_interest', 'talent_community.industry_preferences',
  ]);
  assert.equal(review.find(row => row.id === 'talent_community.primary_areas')?.value, 'Engineering');
  assert.equal(review.find(row => row.id === 'talent_community.industry_preferences')?.source, 'saved_preference');
  assert.ok(hasTalentCommunityAnswers(data));
  const text = talentCommunityAnswerHandoff(data);
  assert.match(text, /Engineering/);
  assert.match(text, /Healthcare/);
  assert.match(text, /No/);
  assert.match(text, /Not proof of employer-side form selection or acceptance/);
  assert.doesNotMatch(text, /private@example\.test/);
});

test('future taxonomy answers survive save projections but remain inert to form autofill', () => {
  const data = emptyPreferences();
  data.preferences['future.new_area'] = { scope: 'profile_preference', source: 'user', value: 'Preserve', updated_at: data.exported_at };
  data.optional_omissions = ['future.new_area'];
  const parsed = parsePreferences(data);
  assert.ok(parsed);
  assert.equal(parsed.preferences['future.new_area']?.value, 'Preserve');
  assert.deepEqual(parsed.optional_omissions, ['future.new_area']);
  assert.equal(unrecognizedSavedAnswerCount(parsed), 1);
  assert.equal(savedAnswerReviewRows(parsed).length, 0);
  assert.equal(reusableValue('future.new_area', parsed), null);
  assert.match(talentCommunityAnswerHandoff(parsed), /\[not recorded\]/);
  assert.equal(hasTalentCommunityAnswers(parsed), false);
});

test('historical question memory stays review-only across new aliases', () => {
  const data = emptyPreferences();
  const question = 'Primary areas of interest';
  const key = normalizeQuestion(question);
  data.discovered_answers = {
    [key]: { question, value: 'Applied mathematics', source: 'user', accepted: false, updated_at: data.exported_at },
  };
  const parsed = parsePreferences(data);
  assert.ok(parsed);
  const row = savedAnswerReviewRows(parsed).find(item => item.id === 'discovered:' + key);
  assert.equal(row?.value, 'Applied mathematics');
  assert.equal(row?.reusable, false);
});
