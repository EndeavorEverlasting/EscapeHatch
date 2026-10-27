import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSubmissionEvidence, reconcileSubmissionReceipts } from './submission-reconciliation';
import { mergeTrackerIntoApplications, trackerOpportunityId } from './tracker-bridge';
import { parseApplicationsStorage, type Application } from './storage';

const url = 'https://jobs.ashbyhq.com/synthetic/job';
const application: Application = { id: 'synthetic', company: 'Synthetic', role: 'Role', url, status: 'preparing',
  priority: 'normal', notes: 'User notes', nextAction: 'Review', updatedAt: '2026-01-01T00:00:00Z' };
const receipt = { opportunityId: 'synthetic', sessionId: 'session', attemptId: 'attempt', applicationOrigin: 'https://jobs.ashbyhq.com',
  applicationPath: '/synthetic/job/application', observedAt: '2026-01-02T00:00:00Z', source: 'same_session_page_confirmation', evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT' };

test('only bound confirmed evidence advances the local queue and survives storage', () => {
  const result = reconcileSubmissionReceipts([application], [receipt]);
  assert.equal(result[0].status, 'applied');
  assert.equal(result[0].notes, application.notes);
  assert.ok(parseApplicationsStorage(result));
  assert.equal(reconcileSubmissionReceipts(result, [receipt]), result);
  for (const patch of [{ opportunityId: 'other' }, { applicationPath: '/synthetic/other/application' },
    { applicationOrigin: 'https://other.test' }, { source: 'click' }, { evidenceCode: 'SUBMIT_CLICKED' },
    { observedAt: 'invalid' }, { attemptId: '' }]) {
    const original = [application];
    assert.equal(reconcileSubmissionReceipts(original, [{ ...receipt, ...patch }]), original);
  }
  assert.equal(parseSubmissionEvidence({ ...receipt, applicationOrigin: 'https://user:password@host.test' }), null);
});

test('newest receipt wins while downstream statuses and newer evidence stay intact', () => {
  const later = { ...receipt, attemptId: 'later', observedAt: '2026-01-03T00:00:00Z' };
  const result = reconcileSubmissionReceipts([application], [receipt, later]);
  assert.equal(result[0].submissionEvidence?.attemptId, 'later');
  assert.equal(reconcileSubmissionReceipts(result, [receipt]), result);
  for (const status of ['follow_up', 'closed'] as const) {
    const progressed = { ...application, status, nextAction: 'Keep current follow up' };
    const [updated] = reconcileSubmissionReceipts([progressed], [receipt]);
    assert.equal(updated.status, status);
    assert.equal(updated.nextAction, progressed.nextAction);
    assert.equal(updated.updatedAt, progressed.updatedAt);
  }
});

test('Lever listing receipts accept only that exact job apply path', () => {
  const url = 'https://jobs.lever.co/synthetic/00000000-0000-0000-0000-000000000000';
  const original = [{ ...application, url }];
  const evidence = { ...receipt, applicationOrigin: 'https://jobs.lever.co', applicationPath: new URL(url).pathname + '/apply' };
  assert.equal(reconcileSubmissionReceipts(original, [evidence])[0].status, 'applied');
  assert.equal(reconcileSubmissionReceipts(original, [{ ...evidence, applicationPath: '/synthetic/other/apply' }]), original);
});

test('stale imported Ready snapshot cannot erase a local confirmed submission', () => {
  const row = { sheetRow: 2, appliedCheckbox: false, priority: 'normal', status: 'Ready to Apply', company: 'Synthetic', role: 'Role', applyUrl: url };
  const id = trackerOpportunityId(row);
  const [confirmed] = reconcileSubmissionReceipts([{ ...application, id }], [{ ...receipt, opportunityId: id }]);
  const snapshot = { schema: 'escapehatch/tracker-snapshot/v1' as const, provider: 'synthetic', spreadsheetId: 'test', sheetName: 'Jobs',
    capturedAtUtc: '2026-01-01T00:00:00Z', contentDigest: 'test', authPath: 'fixture', localGoogleAuthPresent: false,
    metrics: { trackedRoles: 1, appliedOrSubmittedCheckbox: 0, readyToApply: 1, inProcess: 0, submittedStatus: 0, highPriority: 0 }, applications: [row] };
  const [merged] = mergeTrackerIntoApplications([confirmed], snapshot);
  assert.equal(merged.status, 'applied');
  assert.equal(merged.submissionEvidence?.attemptId, receipt.attemptId);
  const [closed] = mergeTrackerIntoApplications([confirmed], { ...snapshot, capturedAtUtc: '2026-10-20T00:00:00Z', applications: [{ ...row, status: 'Closed', nextAction: 'Archive this application' }] });
  assert.equal(closed.status, 'closed');
  assert.equal(closed.nextAction, 'Archive this application');
  assert.ok(closed.submissionEvidence);
  const operatorRecorded = { ...application, id, status: 'applied' as const };
  assert.equal(mergeTrackerIntoApplications([operatorRecorded], snapshot)[0].status, 'applied');
});
