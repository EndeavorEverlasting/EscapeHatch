import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareWithoutTrustedNavigation } from './managed-prepare-fallback.ts';

test('missing trusted registry still fills and stages PDFs without any navigation surface', async () => {
  const actions: string[] = [];
  const result = await prepareWithoutTrustedNavigation({
    fill: async () => { actions.push('fill'); return { filled: ['name'], skipped: [] }; },
    attach: async () => { actions.push('attach'); return { resume: 'attached_to_input_review_required' }; },
    expectedUploads: ['resume'],
  });
  assert.deepEqual(actions, ['fill', 'attach']);
  assert.deepEqual(result.filled, ['name']);
  assert.equal(result.preparation.state, 'REVIEW_REQUIRED');
  assert.equal(result.preparation.code, 'trusted_navigation_evidence_missing');
  assert.equal(result.preparation.pagesPrepared, 1);
  assert.equal(result.preparation.intermediateSteps, 0);
  assert.equal(result.preparation.finalActionActivated, false);
  assert.deepEqual(result.preparation.evidenceRefs, []);
  assert.ok(result.preparation.pendingManual.includes('resume_employer_upload_acceptance_unverified'));
});

test('unavailable file control and unresolved field stay visible for operator review', async () => {
  const result = await prepareWithoutTrustedNavigation({
    fill: async () => ({ filled: [], skipped: ['legal_question:current_confirmation_required'] }),
    attach: async () => ({ resume: 'manual_required', cover: 'manual_required' }),
    expectedUploads: ['resume', 'cover'],
  });
  assert.ok(result.preparation.pendingManual.includes('resume_upload_control_requires_review'));
  assert.ok(result.preparation.pendingManual.includes('cover_upload_control_requires_review'));
  assert.ok(result.preparation.pendingManual.includes('field_review:legal_question:current_confirmation_required'));
  assert.equal(result.preparation.state, 'REVIEW_REQUIRED');
  assert.equal(result.preparation.finalActionActivated, false);
});

test('a failed fill does not attempt attachments or suggest progress', async () => {
  let attached = false;
  await assert.rejects(prepareWithoutTrustedNavigation({
    fill: async () => { throw new Error('page_binding_changed'); },
    attach: async () => { attached = true; return {}; },
    expectedUploads: ['resume'],
  }), /page_binding_changed/);
  assert.equal(attached, false);
});
