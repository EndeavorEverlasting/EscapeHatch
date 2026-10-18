import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeTrackerMetrics,
  connectionFromSnapshot,
  isSubmittedLocked,
  mergeTrackerIntoApplications,
  parseTrackerSnapshot,
  selectNextActionableOpportunity,
  trackerOpportunityId,
  trackerRowToApplication,
  type TrackerRow,
  type TrackerSnapshot,
} from './tracker-bridge.ts';

function row( partial: Partial<TrackerRow> & Pick<TrackerRow, 'sheetRow' | 'company' | 'role' | 'status'>): TrackerRow {
  return {
    appliedCheckbox: false,
    priority: 'Medium',
    applyUrl: '',
    ...partial,
  };
}

function snapshot(applications: TrackerRow[]): TrackerSnapshot {
  return {
    schema: 'escapehatch/tracker-snapshot/v1',
    provider: 'synthetic',
    spreadsheetId: 'synthetic-sheet',
    sheetName: 'Applications',
    capturedAtUtc: new Date().toISOString(),
    contentDigest: 'abc',
    authPath: 'fixture',
    localGoogleAuthPresent: false,
    metrics: computeTrackerMetrics(applications),
    applications,
  };
}

test('metrics distinguish Applied? checkbox from Submitted status text', () => {
  const rows = [
    row({ sheetRow: 1, company: 'Alpha', role: 'A', status: 'Submitted', appliedCheckbox: true, priority: 'High' }),
    row({ sheetRow: 2, company: 'Beta', role: 'B', status: 'Ready to Apply', appliedCheckbox: false, priority: 'Medium' }),
    row({ sheetRow: 3, company: 'Gamma', role: 'C', status: 'In Process', appliedCheckbox: true, priority: 'High' }),
    row({ sheetRow: 4, company: 'Delta', role: 'D', status: 'Ready to Apply', appliedCheckbox: false }),
    row({ sheetRow: 5, company: 'Epsilon', role: 'E', status: 'Saved', appliedCheckbox: true }),
  ];
  const metrics = computeTrackerMetrics(rows);
  assert.equal(metrics.trackedRoles, 5);
  assert.equal(metrics.appliedOrSubmittedCheckbox, 3);
  assert.equal(metrics.submittedStatus, 1);
  assert.equal(metrics.readyToApply, 2);
  assert.equal(metrics.inProcess, 1);
  assert.equal(metrics.highPriority, 2);
});

test('checkbox alone does not mark application as applied/submitted', () => {
  const application = trackerRowToApplication(row({
    sheetRow: 9, company: 'Synth Co', role: 'Lead', status: 'Saved', appliedCheckbox: true,
    applyUrl: 'https://jobs.example.test/x',
  }));
  assert.notEqual(application.status, 'applied');
  assert.equal(application.status, 'preparing');
});

test('Submitted Google/Mandiant is locked against reapply invitation', () => {
  const google = row({
    sheetRow: 31, company: 'Google (Mandiant Consulting)', role: 'PMO', status: 'Submitted',
    appliedCheckbox: true, applyUrl: 'https://www.google.com/about/careers/applications/jobs/results/1',
  });
  assert.equal(isSubmittedLocked(google), true);
  const mapped = trackerRowToApplication(google);
  assert.equal(mapped.status, 'applied');
  assert.match(mapped.nextAction, /Do not reapply/i);
});

test('Thyme Care Ready row is selected as next actionable opportunity', () => {
  const snap = snapshot([
    row({ sheetRow: 31, company: 'Google (Mandiant Consulting)', role: 'PMO', status: 'Submitted', appliedCheckbox: true }),
    row({
      sheetRow: 32, company: 'Thyme Care', role: 'Product Operations Lead', status: 'Ready to Apply',
      priority: 'Medium', applyUrl: 'https://jobs.ashbyhq.com/thyme-care/example',
    }),
    row({ sheetRow: 10, company: 'Other Ready', role: 'Ops', status: 'Ready to Apply', priority: 'High' }),
  ]);
  const next = selectNextActionableOpportunity(snap);
  assert.equal(next?.company, 'Thyme Care');
  assert.equal(next?.priority, 'Medium');
  assert.equal(trackerOpportunityId(next!).includes('thyme'), true);
});

test('dedupe uses stable tracker ids; merge preserves prior local edit marker', () => {
  const snap = snapshot([
    row({ sheetRow: 32, company: 'Thyme Care', role: 'Product Operations Lead', status: 'Ready to Apply',
      applyUrl: 'https://jobs.ashbyhq.com/thyme-care/example' }),
  ]);
  const first = mergeTrackerIntoApplications([], snap);
  assert.equal(first.length, 1);
  const edited = [{ ...first[0], notes: 'local edit: keep my annotation' }];
  const second = mergeTrackerIntoApplications(edited, snap);
  assert.equal(second.length, 1);
  assert.match(second[0].notes, /local edit/);
});

test('missing snapshot is NOT_CONNECTED; old snapshot is STALE; never fake zeros as verified', () => {
  assert.equal(connectionFromSnapshot(null).status, 'NOT_CONNECTED');
  const old = snapshot([row({ sheetRow: 1, company: 'X', role: 'Y', status: 'Ready to Apply' })]);
  old.capturedAtUtc = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  assert.equal(connectionFromSnapshot(old).status, 'STALE');
  const fresh = snapshot([]);
  const connected = connectionFromSnapshot(fresh);
  assert.equal(connected.status, 'CONNECTED');
  if (connected.status === 'CONNECTED') {
    assert.equal(connected.snapshot.metrics.trackedRoles, 0);
  }
});

test('parseTrackerSnapshot rejects wrong schema and recomputes metrics from rows', () => {
  assert.equal(parseTrackerSnapshot({ schema: 'wrong' }), null);
  const parsed = parseTrackerSnapshot(snapshot([
    row({ sheetRow: 1, company: 'A', role: 'B', status: 'Submitted', appliedCheckbox: true }),
  ]));
  assert.equal(parsed?.metrics.submittedStatus, 1);
  assert.equal(parsed?.metrics.trackedRoles, 1);
});
