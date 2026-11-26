import assert from 'node:assert/strict';
import test from 'node:test';
import taxonomy from '../../../../harness/contracts/application-form-taxonomy.v1.json' with { type: 'json' };
import scenes from '../../../../contracts/application-journey-scenes.v1.json' with { type: 'json' };
import { emptyPreferences, parsePreferences, reusableValue } from './application-preferences.ts';
import { applyBootstrapQuiz, bootstrapQuizError, BOOTSTRAP_QUESTION_IDS, emptyBootstrapQuiz } from './bootstrap-quiz.ts';

const synthetic = () => ({
  ...emptyBootstrapQuiz(),
  firstName: 'Sample', lastName: 'Applicant', email: 'sample@example.test',
  city: 'Example City', region: 'NY', country: 'United States',
  workMode: 'remote_only' as const,
});

test('bootstrap IDs belong to reusable, explicitly approved application taxonomy', () => {
  const all = new Map(taxonomy.questions.map(q => [q.id, q]));
  assert.equal(new Set(BOOTSTRAP_QUESTION_IDS).size, BOOTSTRAP_QUESTION_IDS.length);
  for (const id of BOOTSTRAP_QUESTION_IDS) {
    const entry = all.get(id);
    assert.ok(entry, id);
    assert.equal(entry?.automation_policy, 'fill_if_explicit_preference', id);
    assert.equal(entry?.answer_scope, 'profile', id);
  }
  assert.ok(scenes.scenes.some(scene => scene.id === 'PREREQUISITES'));
  assert.deepEqual([...BOOTSTRAP_QUESTION_IDS], taxonomy.bootstrap_quiz.question_ids);
  assert.equal(taxonomy.bootstrap_quiz.scene_id, 'PREREQUISITES');
  assert.equal(taxonomy.bootstrap_quiz.submission, 'operator_only');
});

test('invalid or incomplete quiz is not silently treated as ready to fill', () => {
  assert.match(bootstrapQuizError(emptyBootstrapQuiz()) || '', /first name/);
  assert.match(bootstrapQuizError({ ...synthetic(), email: 'invalid' }) || '', /email address/);
  assert.match(bootstrapQuizError({ ...synthetic(), workMode: '' }) || '', /remote/);
  assert.match(bootstrapQuizError({ ...synthetic(), firstName: 'x'.repeat(513) }) || '', /512/);
  assert.match(bootstrapQuizError({ ...synthetic(), linkedIn: 'http://linkedin.com/in/example' }) || '', /HTTPS/);
  assert.match(bootstrapQuizError({ ...synthetic(), linkedIn: 'https://user:secret@linkedin.com/in/example' }) || '', /HTTPS/);
  assert.throws(() => applyBootstrapQuiz(emptyPreferences(), { ...synthetic(), linkedIn: 'https://user:secret@linkedin.com/in/example' }));
  assert.throws(() => applyBootstrapQuiz(emptyPreferences(), emptyBootstrapQuiz()));
});

test('quiz stages only explicit user values in the canonical private preference format', () => {
  const prior = emptyPreferences();
  const result = applyBootstrapQuiz(prior, synthetic(), new Date('2026-01-01T00:00:00Z'));
  assert.notEqual(result, prior);
  assert.equal(Object.keys(prior.preferences).length, 0);
  assert.equal(result.preferences['identity.first_name']?.value, 'Sample');
  assert.equal(result.preferences['identity.email']?.source, 'user');
  assert.equal(result.preferences['identity.phone'], undefined);
  assert.equal(result.recommendation_work_mode, 'remote_only');
  assert.equal(result.require_document_review, true);
  assert.equal(result.preferences['attestation.truth_accuracy'], undefined);
  assert.equal(result.preferences['eeo.gender'], undefined);
  assert.deepEqual(parsePreferences(result), result);
  assert.equal(reusableValue('identity.email', result), 'sample@example.test');
});

test('first-run quiz cannot replace a reviewed preference or an earlier work-mode decision', () => {
  const prior = emptyPreferences();
  prior.preferences['identity.email'] = {
    scope: 'profile_preference', source: 'user', value: 'existing@example.test',
    updated_at: '2025-12-31T00:00:00Z',
  };
  prior.recommendation_work_mode = 'any';
  prior.require_document_review = false;
  const next = applyBootstrapQuiz(prior, synthetic(), new Date('2026-01-01T00:00:00Z'));
  assert.equal(next.preferences['identity.email'].value, 'existing@example.test');
  assert.equal(next.recommendation_work_mode, 'any');
  assert.equal(next.require_document_review, false);
  assert.equal(prior.preferences['identity.first_name'], undefined);
});

test('unknown legal, EEO and consent answers never appear in the quiz handoff', () => {
  const proposed = applyBootstrapQuiz(emptyPreferences(), synthetic());
  assert.ok(Object.keys(proposed.preferences).every(id => BOOTSTRAP_QUESTION_IDS.includes(id as (typeof BOOTSTRAP_QUESTION_IDS)[number])));
  assert.equal(proposed.application_privacy_acknowledgement_enabled, false);
  assert.equal(proposed.preferences['employment.sponsorship_required'], undefined);
});
