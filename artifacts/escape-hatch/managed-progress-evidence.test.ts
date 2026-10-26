import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldProgressState, attachmentProgressState, evidenceDescription } from './managed-progress-evidence.ts';

test('zero verified fields cannot be labelled filled', () => {
  assert.equal(fieldProgressState({ filled: [], skipped: ['identity.email:not_verified'] }), 'fields_unverified_review_required');
  assert.equal(fieldProgressState({ filled: [], skipped: [] }), 'fields_unverified_review_required');
  assert.match(evidenceDescription(fieldProgressState({ filled: [], skipped: [] })), /No employer/);
});
test('partial verified fields retain review-required state', () => {
  assert.equal(fieldProgressState({ filled: ['identity.email'], skipped: ['identity.name:missing'] }), 'fields_partially_filled_review_required');
  assert.equal(fieldProgressState({ filled: ['identity.email'], skipped: [] }), 'fields_filled_review_required');
});
test('file-input staging is not employer upload acceptance', () => {
  assert.equal(attachmentProgressState({ resume: 'manual_required' }), 'attachments_unverified_review_required');
  assert.equal(attachmentProgressState({}), 'attachments_unverified_review_required');
  assert.equal(attachmentProgressState({ resume: 'attached_to_input_review_required', cover: 'manual_required' }), 'attachments_partially_staged_review_required');
  assert.equal(attachmentProgressState({ resume: 'attached_to_input_review_required' }), 'attachments_staged_review_required');
  assert.match(evidenceDescription('attachments_staged_review_required'), /unverified/);
});
