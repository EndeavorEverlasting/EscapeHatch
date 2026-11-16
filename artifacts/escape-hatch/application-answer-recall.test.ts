import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { importContext } from "./import-context.ts";
import { readPreferences, mergePreferenceEdits } from "./preference-file.ts";
import { saveWorkspace } from "./workspace-file.ts";
import { WORKSPACE_SCHEMA } from "./src/lib/workspace-bootstrap.ts";
import { APPLICATIONS_KEY } from "./src/lib/storage.ts";
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

test('private import round-trips a long reviewed role answer and preserves newer approval', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'escapehatch-reviewed-answer-'));
  try {
    const url = 'https://jobs.lever.co/fixture/11111111-1111-4111-8111-111111111111';
    const stamp = '2026-11-15T00:00:00Z';
    const value = ['Fixture automation. '.repeat(17).trim(), 'Fixture review. '.repeat(24).trim()].join('\n\n');
    assert.ok(value.length > 512);
    const question = 'What excites you about this role? 1–4 sentences';
    const file = path.join(root, 'application-question-preferences.json');
    const application = { id: 'job-a', company: 'Fixture', role: 'Engineer', url, status: 'saved',
      priority: 'normal', notes: '', nextAction: '', updatedAt: stamp };
    await saveWorkspace({ schema: WORKSPACE_SCHEMA, values: { [APPLICATIONS_KEY]: [application] } },
      null, path.join(root, 'workspace.v1.json'));
    const raw = { url: url + '/apply', question, value, approvedAt: stamp };
    assert.equal(await importContext('role-answer', raw, root), 'ROLE_ANSWER_SAVED_AND_READ_BACK');
    const stored = await readPreferences(file);
    assert.deepEqual(stored.reviewed_role_answers, [{ ...raw, url, opportunityId: 'job-a' }]);
    assert.deepEqual(mergePreferenceEdits(stored, emptyPreferences()).reviewed_role_answers, stored.reviewed_role_answers);
    await assert.rejects(importContext('role-answer', { ...raw, value: 'older' }, root), /NEWER_ROLE_ANSWER_PRESERVED/);
    await assert.rejects(importContext('role-answer', { ...raw, question: 'Privacy consent' }, root), /INVALID_REVIEWED_ROLE_ANSWER/);
    await assert.rejects(importContext('role-answer', { ...raw, opportunityId: 'job-b' }, root), /JOB_NOT_VERIFIED/);
    assert.deepEqual((await readPreferences(file)).reviewed_role_answers, stored.reviewed_role_answers);
  } finally { await rm(root, { recursive: true, force: true }); }
});
