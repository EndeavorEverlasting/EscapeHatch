import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPreferences, matchQuestion, parsePreferences, reusableValue } from './src/lib/application-preferences.ts';

test('cross-application answer slots distinguish employment eligibility, notice, coding comfort and source', () => {
  assert.equal(matchQuestion('Country legally registered to work in *'), 'employment.legal_work_country');
  assert.equal(matchQuestion('Notice period *'), 'employment.availability_to_start');
  assert.equal(matchQuestion('Are you comfortable completing a live coding exercise as part of the interview process? *'), 'interview.live_coding_comfort');
  assert.equal(matchQuestion('How did you hear about us? *'), 'recruitment.discovery_source');
  assert.equal(matchQuestion('Country of residence'), 'identity.country');
  assert.equal(matchQuestion('Previously employed by Magnet Forensics or acquired/merged company? *', 'Magnet Forensics'), 'employment.prior_employer_relationship');
});

test('approved user correction persists, while opportunity source must not bleed between jobs', () => {
  const preferences = emptyPreferences();
  assert.equal(reusableValue('interview.live_coding_comfort', preferences), null);
  preferences.preferences['interview.live_coding_comfort'] = {
    scope: 'profile_preference', value: 'No', source: 'user', updated_at: preferences.exported_at,
  };
  preferences.preferences['employment.availability_to_start'] = {
    scope: 'profile_preference', value: '1–2 weeks', source: 'user', updated_at: preferences.exported_at,
  };
  preferences.preferences['recruitment.discovery_source'] = {
    scope: 'profile_preference', value: 'LinkedIn', source: 'user', updated_at: preferences.exported_at,
  };
  assert.equal(parsePreferences(preferences)?.preferences['interview.live_coding_comfort'].value, 'No');
  assert.equal(reusableValue('interview.live_coding_comfort', preferences), 'No');
  assert.equal(reusableValue('employment.availability_to_start', preferences), '1–2 weeks');
  assert.equal(reusableValue('recruitment.discovery_source', preferences), null);
  assert.equal(reusableValue('employment.legal_work_country', preferences), null);
});
