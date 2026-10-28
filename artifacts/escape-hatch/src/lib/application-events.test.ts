import assert from 'node:assert/strict';
import test from 'node:test';
import { APPLICATION_EVENT_SCHEMA, MAX_APPLICATION_EVENTS, appendApplicationEvent, applicationEventId, eventFromSubmissionReceipt,
  applicationEventUrl, applyApplicationDetails, measureApplicationOutcomes, parseApplicationEvent, projectApplicationEvents, type ApplicationEvent, type ApplicationEventKind } from './application-events';
import { parseApplicationsStorage, type Application } from './storage';
import { reconcileSubmissionReceipts } from './submission-reconciliation';
import { mergeTrackerIntoApplications, trackerOpportunityId, type TrackerSnapshot } from './tracker-bridge';
import { APPLICATIONS_KEY } from './storage';
import { parseSavedWorkspace, WORKSPACE_SCHEMA } from './workspace-bootstrap';

const job: Application = { id: 'synthetic-a', company: 'Example', role: 'Coordinator', url: 'https://jobs.ashbyhq.com/example/a?source=fixture',
  status: 'preparing', priority: 'normal', notes: 'Keep private notes', nextAction: 'Review documents', updatedAt: '2026-01-01T00:00:00Z' };
const receipt = { opportunityId: job.id, sessionId: 'session-a', attemptId: 'attempt-a', applicationOrigin: 'https://jobs.ashbyhq.com',
  applicationPath: '/example/a/application', observedAt: '2026-01-02T00:00:00Z', source: 'same_session_page_confirmation' as const,
  evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT' as const };
function event(kind: ApplicationEventKind, patch: Partial<ApplicationEvent> = {}): ApplicationEvent {
  const raw = { schema: APPLICATION_EVENT_SCHEMA, opportunityId: job.id, applicationUrl: 'https://jobs.ashbyhq.com/example/a',
    sourceEventId: kind, kind, authority: 'user_confirmed' as const, occurredAt: '2026-01-03T00:00:00Z', observedAt: '2026-01-03T00:00:00Z', ...patch };
  return { ...raw, eventId: applicationEventId(raw) };
}

test('click, pending and validation observations never count as employer success', () => {
  for (const kind of ['submission_attempted', 'confirmation_pending', 'validation_failed'] as const) {
    for (const authority of ['local_observation', 'user_confirmed'] as const) {
      const result = appendApplicationEvent(job, event(kind, { authority }));
      assert.equal(result.status, 'preparing');
      assert.equal(result.nextAction, job.nextAction);
      assert.equal(measureApplicationOutcomes([result]).counts.employerConfirmed, 0);
    }
  }
  assert.equal(parseApplicationEvent(event('submission_confirmed', { authority: 'local_observation' })), null);
  assert.equal(parseApplicationEvent(event('submission_confirmed', { authority: 'employer_confirmation' })), null);
});

test('confirmed receipt appends once, replays after restart and migrates legacy evidence without invented history', () => {
  const [confirmed] = reconcileSubmissionReceipts([job], [receipt, receipt]);
  assert.equal(confirmed.status, 'applied');
  assert.equal(confirmed.events?.length, 1);
  assert.equal(confirmed.notes, job.notes);
  const restored = parseApplicationsStorage(JSON.parse(JSON.stringify([confirmed])))!;
  assert.equal(reconcileSubmissionReceipts(restored, [receipt]), restored);
  assert.ok(parseSavedWorkspace({ schema: WORKSPACE_SCHEMA, values: { [APPLICATIONS_KEY]: restored } }));
  const legacy = { ...job, status: 'applied' as const, submissionEvidence: receipt };
  assert.equal(projectApplicationEvents(legacy).submission, 'employer_confirmed');
  const [migrated] = reconcileSubmissionReceipts([legacy], []);
  assert.equal(migrated.events?.length, 1);
  assert.equal(migrated.updatedAt, legacy.updatedAt);
  assert.equal(migrated.nextAction, legacy.nextAction);
  assert.ok(parseApplicationsStorage([job])); // Existing v1 records need no reset.
  assert.equal(projectApplicationEvents({ ...job, status: 'applied' }).submission, 'legacy_recorded');
});

test('all attempts remain in history while latest receipt compatibility and later progress survive', () => {
  const later = { ...receipt, attemptId: 'attempt-b', observedAt: '2026-01-04T00:00:00Z' };
  const [confirmed] = reconcileSubmissionReceipts([job], [later, receipt]);
  assert.equal(confirmed.events?.length, 2);
  assert.equal(confirmed.submissionEvidence?.attemptId, 'attempt-b');
  const assessed = appendApplicationEvent(confirmed, event('assessment_requested', {
    occurredAt: '2026-01-05T00:00:00Z', observedAt: '2026-01-05T00:00:00Z', nextAction: 'Review assessment', dueAt: '2026-01-08T00:00:00Z' }));
  const [replayed] = reconcileSubmissionReceipts([assessed], [{ ...later, attemptId: 'attempt-c', observedAt: '2026-01-06T00:00:00Z' }]);
  assert.equal(replayed.status, 'follow_up');
  assert.equal(replayed.nextAction, 'Review assessment');
  assert.equal(projectApplicationEvents(replayed).relationship, 'assessment_requested');
  assert.equal(projectApplicationEvents(replayed).submittedAt, receipt.observedAt);
  assert.equal(measureApplicationOutcomes([replayed]).counts.employerConfirmed, 1);
  assert.equal(replayed.events?.length, 4);
});

test('exact opportunity, source and URL bind events; forged authority and unknown private fields fail closed', () => {
  const confirmed = eventFromSubmissionReceipt(receipt, job.url)!;
  for (const patch of [{ opportunityId: 'other' }, { applicationUrl: 'https://jobs.ashbyhq.com/example/b' },
    { sourceEventId: 'forged' }, { occurredAt: '2025-01-01' }, { authority: 'user_confirmed' as const }]) {
    const forged = { ...confirmed, ...patch }; forged.eventId = applicationEventId(forged);
    assert.equal(parseApplicationEvent(forged), null);
  }
  assert.equal(appendApplicationEvent({ ...job, id: 'other' }, confirmed).events, undefined);
  for (const patch of [{ answer: 'private' }, { observedAt: 'invalid' }, { applicationUrl: 'https://user:password@example.test/a' },
    { eventId: 'forged' }, { occurredAt: '2027-01-01' }, { dueAt: 'invalid' }, { occurredAt: '01/02/26' }, { occurredAt: '2026-02-30T00:00:00Z' }]) {
    assert.equal(parseApplicationEvent({ ...event('assessment_requested'), ...patch }), null);
  }
  assert.equal(parseApplicationsStorage([{ ...job, events: [{ ...confirmed, opportunityId: 'other' }] }]), null);
  assert.equal(parseApplicationsStorage([{ ...job, events: [confirmed, confirmed] }]), null);
});

test('semantic duplicates ignore object key order; source conflicts and capacity preserve prior bytes', () => {
  const original = event('interview_scheduled', { nextAction: 'Prepare questions' });
  const recorded = appendApplicationEvent(job, original);
  const reordered = Object.fromEntries(Object.entries(original).reverse());
  assert.equal(appendApplicationEvent(recorded, reordered), recorded);
  const before = JSON.stringify(recorded);
  assert.throws(() => appendApplicationEvent(recorded, { ...original, nextAction: 'Different claim' }), /APPLICATION_EVENT_CONFLICT/);
  assert.equal(JSON.stringify(recorded), before);
  const full = { ...job, events: Array.from({ length: MAX_APPLICATION_EVENTS }, (_, i) => event('submission_attempted', { sourceEventId: String(i) })) };
  assert.throws(() => appendApplicationEvent(full, event('submission_attempted')), /APPLICATION_EVENT_CAPACITY/);
  assert.equal(full.events.length, MAX_APPLICATION_EVENTS);
});

test('posting closure and application rejection preserve historical submission as separate dimensions', () => {
  const [confirmed] = reconcileSubmissionReceipts([job], [receipt]);
  const closedPosting = appendApplicationEvent(confirmed, event('posting_closed'));
  assert.equal(closedPosting.status, 'applied');
  assert.equal(projectApplicationEvents(closedPosting).postingHealth, 'posting_closed');
  const rejected = appendApplicationEvent(closedPosting, event('application_rejected'));
  assert.equal(rejected.status, 'closed');
  assert.equal(projectApplicationEvents(rejected).submission, 'employer_confirmed');
  assert.equal(projectApplicationEvents(rejected).relationship, 'application_rejected');
});

test('old evidence preserves newer user edits; out-of-order input projects deterministically', () => {
  const edited = { ...job, updatedAt: '2026-01-05T00:00:00Z', nextAction: 'My newer action' };
  const [confirmed] = reconcileSubmissionReceipts([edited], [receipt]);
  assert.equal(confirmed.status, 'applied');
  assert.equal(confirmed.nextAction, edited.nextAction);
  assert.equal(confirmed.updatedAt, edited.updatedAt);
  const olderAction = appendApplicationEvent(edited, event('assessment_requested', { nextAction: 'Stale imported action', dueAt: '2026-01-04T00:00:00Z' }));
  assert.equal(projectApplicationEvents(olderAction).nextAction, edited.nextAction);
  assert.equal(projectApplicationEvents(olderAction).dueAt, null);
  const first = event('assessment_requested');
  const second = event('interview_scheduled', { occurredAt: '2026-01-04T00:00:00Z', observedAt: '2026-01-04T00:00:00Z' });
  assert.deepEqual(projectApplicationEvents({ ...job, events: [first, second] }), projectApplicationEvents({ ...job, events: [second, first] }));
});

test('same-time conflicting stages require explicit resolution in either arrival order', () => {
  const a = event('assessment_requested', { nextAction: 'Assessment' });
  const b = event('interview_scheduled', { nextAction: 'Interview' });
  for (const [first, second] of [[a, b], [b, a]]) {
    const prior = appendApplicationEvent(job, first);
    const bytes = JSON.stringify(prior);
    assert.throws(() => appendApplicationEvent(prior, second), /APPLICATION_EVENT_TIME_CONFLICT/);
    assert.equal(JSON.stringify(prior), bytes);
    assert.equal(parseApplicationsStorage([{ ...job, events: [first, second] }]), null);
  }
});

test('storage and workspace imports keep canonical receipt fields, never nested page payloads', () => {
  const clean = eventFromSubmissionReceipt(receipt, job.url)!;
  const raw = { ...job, submissionEvidence: { ...receipt, rawDOM: 'PRIVATE_SENTINEL' },
    events: [{ ...clean, receipt: { ...receipt, rawDOM: 'PRIVATE_SENTINEL' } }] };
  const parsed = parseApplicationsStorage([raw]);
  assert.ok(parsed);
  assert.equal(JSON.stringify(parsed).includes('PRIVATE_SENTINEL'), false);
  const workspace = parseSavedWorkspace({ schema: WORKSPACE_SCHEMA, values: { [APPLICATIONS_KEY]: [raw] } });
  assert.ok(workspace);
  assert.equal(JSON.stringify(workspace).includes('PRIVATE_SENTINEL'), false);
});

test('editing rechecks the current record and cannot transfer evidence when a receipt arrives during editing', () => {
  const [confirmed] = reconcileSubmissionReceipts([job], [receipt]);
  const edits = { ...job, url: 'https://jobs.ashbyhq.com/example/other', notes: 'New user note' };
  const guarded = applyApplicationDetails(confirmed, edits, '2026-01-03T00:00:00Z');
  assert.equal(guarded.url, job.url);
  assert.equal(guarded.notes, edits.notes);
  assert.deepEqual(guarded.events, confirmed.events);
  assert.equal(guarded.reconciliationConflict, 'opportunity_url_changed');
  assert.ok(parseApplicationsStorage([guarded]));
  assert.equal(applyApplicationDetails(job, edits, edits.updatedAt).url, edits.url);
});

test('query requisitions remain distinct and legacy path receipts cannot certify them', () => {
  const one = 'https://ats.example.test/apply?job=one';
  const two = 'https://ats.example.test/apply?job=two';
  assert.notEqual(applicationEventUrl(one), applicationEventUrl(two));
  const first = appendApplicationEvent({ ...job, url: one }, event('submission_confirmed', { applicationUrl: one }));
  assert.equal(appendApplicationEvent({ ...job, url: two }, first.events![0]).events, undefined);
  const legacy = { ...receipt, applicationOrigin: 'https://ats.example.test', applicationPath: '/apply' };
  const apps = [{ ...job, url: one }];
  assert.equal(reconcileSubmissionReceipts(apps, [legacy]), apps);
  assert.equal(eventFromSubmissionReceipt(legacy, one), null);
});

test('metrics have explicit workspace denominator, deduplicate attempts and do not infer success from closed status', () => {
  const [confirmed] = reconcileSubmissionReceipts([job], [receipt]);
  const user = appendApplicationEvent({ ...job, id: 'synthetic-b' }, event('submission_confirmed', { opportunityId: 'synthetic-b' }));
  const legacy = { ...job, id: 'synthetic-c', status: 'closed' as const };
  const pending = appendApplicationEvent({ ...job, id: 'synthetic-d' }, event('confirmation_pending', { opportunityId: 'synthetic-d', authority: 'local_observation' }));
  const result = measureApplicationOutcomes([confirmed, user, legacy, pending]);
  assert.equal(result.denominator.length, 4);
  assert.deepEqual(result.counts, { employerConfirmed: 1, userConfirmedOnly: 1, legacyRecorded: 1, unconfirmedAttempts: 1 });
  assert.throws(() => measureApplicationOutcomes([job, job]), /APPLICATION_METRIC_IDENTITY_CONFLICT/);
  assert.equal(measureApplicationOutcomes([]).denominator.length, 0); // another private workspace
  assert.deepEqual(result, measureApplicationOutcomes([pending, legacy, user, confirmed]));
});

test('tracker import retains journal and cannot downgrade assessment/interview/closed to Submitted', () => {
  const row = { sheetRow: 2, appliedCheckbox: true, priority: 'normal', status: 'Submitted', company: 'Example', role: 'Coordinator', applyUrl: job.url };
  const id = trackerOpportunityId(row);
  const [confirmed] = reconcileSubmissionReceipts([{ ...job, id }], [{ ...receipt, opportunityId: id }]);
  const progressed = appendApplicationEvent(confirmed, event('interview_scheduled', { opportunityId: id, nextAction: 'Attend interview' }));
  const snapshot = { schema: 'escapehatch/tracker-snapshot/v1', provider: 'synthetic', spreadsheetId: 'synthetic', sheetName: 'Jobs', capturedAtUtc: '2026-02-01T00:00:00Z',
    contentDigest: 'fixture', authPath: 'fixture', localGoogleAuthPresent: false, applications: [row], metrics: {} } as TrackerSnapshot;
  for (const prior of [progressed, { ...progressed, status: 'closed' as const }]) {
    const [merged] = mergeTrackerIntoApplications([prior], snapshot);
    assert.equal(merged.status, prior.status);
    assert.equal(merged.nextAction, prior.nextAction);
    assert.deepEqual(merged.events, prior.events);
    assert.ok(parseApplicationsStorage([merged]));
  }
  const originalUrl = 'https://ats.example.test/apply?job=one';
  const changed = { ...row, applyUrl: 'https://ats.example.test/apply?job=two' };
  const sameId = trackerOpportunityId(changed);
  const original = { ...progressed, id: sameId, url: originalUrl, events: undefined, submissionEvidence: undefined };
  const [conflict] = mergeTrackerIntoApplications([original], { ...snapshot, applications: [changed] });
  assert.equal(conflict.url, originalUrl);
  assert.equal(conflict.reconciliationConflict, 'opportunity_url_changed');
  assert.ok(parseApplicationsStorage([conflict]));
});
