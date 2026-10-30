import assert from 'node:assert/strict';
import test from 'node:test';
import { projectMaterialsReviewStatus } from './materials-review-status.ts';

test('reviewed resume and cover with review required are upload-ready', () => {
  const status = projectMaterialsReviewStatus({
    opportunityId: 'opp-1',
    applicationUrl: 'https://employer.example/jobs/1',
    requireReview: true,
    documents: {
      resume: { name: 'resume.pdf', reviewedAt: '2026-10-30T12:00:00.000Z' },
      cover: { name: 'cover.pdf', reviewedAt: '2026-10-30T12:05:00.000Z' },
    },
  });
  assert.equal(status.readyForUploadPolicy, true);
  assert.deepEqual(status.unreviewedKinds, []);
  assert.match(status.summary, /meet your current review setting/i);
});

test('saved but unreviewed documents stay blocked while review is required', () => {
  const status = projectMaterialsReviewStatus({
    opportunityId: 'opp-2',
    applicationUrl: 'https://employer.example/jobs/2',
    requireReview: true,
    documents: { resume: { name: 'resume.pdf' }, cover: { name: 'cover.pdf' } },
  });
  assert.equal(status.readyForUploadPolicy, false);
  assert.deepEqual(status.unreviewedKinds, ['resume', 'cover']);
  assert.match(status.summary, /Confirm review/i);
});

test('operator-disabled review checkpoint allows present resume without reviewedAt', () => {
  const status = projectMaterialsReviewStatus({
    opportunityId: 'opp-3',
    applicationUrl: 'https://employer.example/jobs/3',
    requireReview: false,
    documents: { resume: { name: 'resume.pdf' } },
  });
  assert.equal(status.readyForUploadPolicy, true);
  assert.equal(status.requireReview, false);
});
