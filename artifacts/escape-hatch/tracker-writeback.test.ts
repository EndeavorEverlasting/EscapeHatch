import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTrackerSnapshotFromValues } from './tracker-refresh.ts';
import { trackerOpportunityId } from './src/lib/tracker-bridge.ts';
import { emptyProfile, APPLICATIONS_KEY, PROFILE_KEY } from './src/lib/storage.ts';
import { saveWorkspace, readWorkspace } from './workspace-file.ts';
import { mergeConfirmedReceiptWorkspace, WORKSPACE_SCHEMA, type SavedWorkspace } from './src/lib/workspace-bootstrap.ts';
import { reconcileSubmissionReceipts } from './src/lib/submission-reconciliation.ts';
import { enqueueSubmissionSync, retrySubmissionSync, readSubmissionSyncStatus, planSubmissionWrite } from './tracker-writeback.ts';

const url = 'https://jobs.lever.co/synthetic/00000000-0000-0000-0000-000000000000';
const values = () => [['Company', 'Role', 'Status', 'Priority', 'Apply Link', 'Applied?', 'Date Applied', 'Notes'], ['Synthetic', 'Role', 'Ready to Apply', 'Normal', url, false, '', 'preserve user notes']];
const snapshot = () => createTrackerSnapshotFromValues(values(), { spreadsheetId: 'synthetic_sheet_id', sheetName: 'Applications' }, 'synthetic', new Date('2026-01-01'));
const receipt = () => ({ opportunityId: trackerOpportunityId(snapshot().applications[0]), sessionId: 'synthetic-session', attemptId: 'synthetic-attempt',
  applicationOrigin: 'https://jobs.lever.co', applicationPath: '/synthetic/00000000-0000-0000-0000-000000000000/apply', observedAt: '2026-01-02T12:00:00Z', source: 'same_session_page_confirmation' as const, evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT' as const });

test('plan uses exact receipt, fresh headers and unique opportunity; row moves remap and unrelated cells stay untouched', () => {
  const r = receipt(), s = snapshot();
  const reordered = [values()[0], ['Other', 'Other', 'Saved', 'Normal', 'https://example.test/other', false], values()[1]];
  const plan = planSubmissionWrite(s, r, reordered);
  assert.equal(plan.row.sheetRow, 3);
  assert.deepEqual(plan.data.map(item => item.range), ["'Applications'!C3", "'Applications'!F3", "'Applications'!G3"]);
  const expectedSerial = Math.round((Date.parse('2026-01-02T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000);
  assert.deepEqual(plan.data.map(item => item.values[0][0]), ['Submitted', true, expectedSerial]);
  assert.throws(() => planSubmissionWrite(s, { ...r, opportunityId: 'other' }, values()), /CONFLICT/);
  assert.throws(() => planSubmissionWrite(s, { ...r, applicationPath: '/synthetic/other/apply' }, values()), /CONFLICT/);
  assert.throws(() => planSubmissionWrite(s, r, [...values(), values()[1]]), /CONFLICT/);
  const progressed = values(); progressed[1][2] = 'Interviewing';
  assert.throws(() => planSubmissionWrite(s, r, progressed), /CONFLICT/);
  const evening = planSubmissionWrite(s, { ...r, observedAt: '2026-01-03T02:00:00Z' }, values(), 'America/New_York');
  assert.equal(evening.day, '2026-01-02');
});

test('canonical tracker glyphs, Research status and date-validated serial survive exact readback', () => {
  // Mirrors the canonical Google Sheet (Applied? is a text dropdown, not a boolean).
  const cells: (string | number | boolean)[][] = [
    ['Applied?', 'Priority', 'Status', 'Company', 'Role', 'Apply Link', 'Date Applied', 'Notes'],
    ['☐', 'Medium', 'Research', 'Synthetic', 'Role', url, '', 'unchanged'],
  ];
  const target = { spreadsheetId: 'synthetic_sheet_id', sheetName: 'Applications' };
  const current = createTrackerSnapshotFromValues(cells, target, 'synthetic', new Date('2026-01-01'));
  const evidence = { ...receipt(), opportunityId: trackerOpportunityId(current.applications[0]) };
  const planned = planSubmissionWrite(current, evidence, cells, 'America/New_York');
  const serial = Math.round((Date.parse('2026-01-02T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000);
  assert.deepEqual(planned.data.map(item => item.values[0][0]), ['Submitted', '☑', serial]);
  const after = [
    cells[0], ['☑', 'Medium', 'Submitted', 'Synthetic', 'Role', url, serial, 'unchanged'],
  ];
  const verified = planSubmissionWrite(current, evidence, after, 'America/New_York');
  assert.equal(verified.done, true);
  assert.deepEqual(verified.data, []);
  assert.equal(after[1][7], 'unchanged');
  const progressed = [cells[0], ['☑', 'Medium', 'In Process', 'Synthetic', 'Role', url, serial, 'unchanged']];
  assert.throws(() => planSubmissionWrite(current, evidence, progressed), /CONFLICT/);
});


test('workspace collision recovery accepts only a confirmed receipt delta and keeps unrelated browser edits', () => {
  const r = receipt();
  const app = { id: r.opportunityId, company: 'Synthetic', role: 'Role', url, status: 'preparing' as const,
    priority: 'normal' as const, notes: 'original', nextAction: 'review', updatedAt: '2026-01-01' };
  const base: SavedWorkspace = { schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: emptyProfile, [APPLICATIONS_KEY]: [app] } };
  const remote = { schema: WORKSPACE_SCHEMA, values: { ...base.values, [APPLICATIONS_KEY]: reconcileSubmissionReceipts([app], [r]) } };
  const browser = { schema: WORKSPACE_SCHEMA, values: { ...base.values,
    [PROFILE_KEY]: { ...emptyProfile, first_name: 'BrowserEdit' },
    [APPLICATIONS_KEY]: [{ ...app, notes: 'browser notes', updatedAt: '2026-01-01' }] } };
  const merged = mergeConfirmedReceiptWorkspace(base, remote, browser, [r]);
  assert.equal((merged?.values[PROFILE_KEY] as typeof emptyProfile | undefined)?.first_name, 'BrowserEdit');
  const applications = merged?.values[APPLICATIONS_KEY] as typeof app[];
  assert.equal(applications[0].status, 'applied');
  assert.equal(applications[0].notes, 'browser notes');
  const unrelated = { ...remote, values: { ...remote.values,
    [PROFILE_KEY]: { ...emptyProfile, last_name: 'OtherWriter' } } };
  assert.equal(mergeConfirmedReceiptWorkspace(base, unrelated, browser, [r]), null);
  assert.equal(mergeConfirmedReceiptWorkspace(base, remote, browser, []), null);
  assert.equal(mergeConfirmedReceiptWorkspace(null, remote, browser, [r]), null);
});

test('receipt survives restart and missing auth; local workspace reconciles without a browser or agent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-outbox-auth-'));
  const r = receipt();
  try {
    await fs.writeFile(path.join(root, 'tracker-snapshot.v1.json'), JSON.stringify(snapshot()));
    await saveWorkspace({ schema: 'escapehatch-local-workspace/v1', values: { [PROFILE_KEY]: emptyProfile, [APPLICATIONS_KEY]: [{ id: r.opportunityId, company: 'Synthetic', role: 'Role', url, status: 'preparing', priority: 'normal', notes: 'keep', nextAction: 'review', updatedAt: '2026-01-01' }] } }, null, path.join(root, 'workspace.v1.json'));
    const options = { root, env: { LOCALAPPDATA: root }, fetch: (() => { throw new Error('Must not send without auth'); }) as typeof fetch };
    await enqueueSubmissionSync(r, options);
    await enqueueSubmissionSync(r, options);
    const status = await retrySubmissionSync(options);
    assert.equal(status.authRequired, 1);
    const workspace = await readWorkspace(path.join(root, 'workspace.v1.json'));
    assert.equal(workspace!.workspace.values[APPLICATIONS_KEY]![0].status, 'applied');
    assert.equal(workspace!.workspace.values[APPLICATIONS_KEY]![0].notes, 'keep');
    assert.equal((await readSubmissionSyncStatus({ root })).authRequired, 1);
    const changed = { ...snapshot(), spreadsheetId: 'other_spreadsheet_id' };
    await fs.writeFile(path.join(root, 'tracker-snapshot.v1.json'), JSON.stringify(changed));
    assert.equal((await retrySubmissionSync(options)).conflicts, 1);
    await assert.rejects(enqueueSubmissionSync({ ...r, evidenceCode: 'SUBMIT_CLICKED' }, options));
    await assert.rejects(enqueueSubmissionSync({ ...r, applicationPath: '/other' }, options), /RECEIPT_CONFLICT/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('date write readback is verified and conflicting partial provider writes never become synced', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-outbox-date-'));
  const current = values();
  const options = { root, env: { LOCALAPPDATA: root, TOKEN_CORRIDOR_GOOGLE_TOKEN: 'synthetic-only' }, timeZone: 'America/New_York', fetch: (async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { current[1][2] = 'Submitted'; current[1][5] = true; current[1][6] = 'wrong-date'; return new Response('{}'); }
    return new Response(JSON.stringify({ range: 'Applications!A1:H2', majorDimension: 'ROWS', values: current }));
  }) as typeof fetch };
  try {
    await fs.writeFile(path.join(root, 'tracker-snapshot.v1.json'), JSON.stringify(snapshot()));
    await enqueueSubmissionSync(receipt(), options);
    // A provider response that confirms status but writes an impossible date
    // is a hard source conflict, not an invitation to overwrite the user's row.
    assert.equal((await retrySubmissionSync(options)).conflicts, 1);
    const after = await retrySubmissionSync(options);
    assert.equal(after.conflicts, 1); assert.equal(after.synced, 0);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('bounded retries rotate past blocked entries rather than starving later receipts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-outbox-fairness-'));
  const options = { root, env: { LOCALAPPDATA: root } };
  try {
    await fs.writeFile(path.join(root, 'tracker-snapshot.v1.json'), JSON.stringify(snapshot()));
    for (let i = 0; i < 11; i++) await enqueueSubmissionSync({ ...receipt(), attemptId: 'attempt-' + i }, options);
    await retrySubmissionSync(options);
    assert.equal((await readSubmissionSyncStatus(options)).pending, 1);
    await retrySubmissionSync(options);
    assert.equal((await readSubmissionSyncStatus(options)).pending, 0);
    assert.equal((await readSubmissionSyncStatus(options)).authRequired, 11);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('provider sync verifies readback, preserves notes and retries an ambiguous network outcome idempotently', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-outbox-provider-'));
  let current = values(), writes = 0, loseResponse = true;
  const options = { root, env: { LOCALAPPDATA: root, TOKEN_CORRIDOR_GOOGLE_TOKEN: 'synthetic-only' }, fetch: (async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      writes++;
      const payload = JSON.parse(String(init.body));
      for (const item of payload.data) { const match = /!([A-Z])(\d+)$/.exec(item.range)!; current[Number(match[2]) - 1][match[1].charCodeAt(0) - 65] = item.values[0][0]; }
      if (loseResponse) { loseResponse = false; throw new Error('Lost provider response'); }
      return new Response('{}');
    }
    return new Response(JSON.stringify({ range: 'Applications!A1:H2', majorDimension: 'ROWS', values: current }));
  }) as typeof fetch };
  try {
    await fs.writeFile(path.join(root, 'tracker-snapshot.v1.json'), JSON.stringify(snapshot()));
    await enqueueSubmissionSync(receipt(), options);
    assert.equal((await retrySubmissionSync(options)).retryRequired, 1);
    assert.equal((await retrySubmissionSync(options)).synced, 1);
    assert.equal(writes, 1);
    assert.equal(current[1][7], 'preserve user notes');
    await enqueueSubmissionSync(receipt(), options);
    await retrySubmissionSync(options);
    assert.equal(writes, 1);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
