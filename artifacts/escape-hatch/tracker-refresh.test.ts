import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { IncomingMessage } from 'node:http';
import { createTrackerSnapshotFromValues, refreshTrackerSnapshot, readRememberedSources, readTrackerRefreshAvailability } from './tracker-refresh.ts';
import { readTrackerStatus, trackerRefreshRequestAllowed } from './tracker-control.ts';

const target = { spreadsheetId: 'synthetic_sheet_123', sheetName: "Applications' history" };
const heading = ['Applied?', 'Priority', 'Status', 'Company', 'Role', 'Apply Link', 'Notes', 'Next Action', 'Follow-Up Due'];
const values = [heading, [false, 'High', 'Ready to Apply', 'Synthetic Employer', 'Synthetic Role', 'https://example.test/apply', 'Synthetic note', 'Review', '2026-10-25']];
const date = new Date('2026-10-24T12:00:00Z');
function payload(rows: unknown = values) { return { range: "'Applications'' history'!A1:Z2", majorDimension: 'ROWS', values: rows }; }
const fake = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
async function fixture(run: (file: string, env: NodeJS.ProcessEnv, original: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-tracker-refresh-'));
  const file = path.join(root, 'snapshot.json');
  const original = JSON.stringify(createTrackerSnapshotFromValues(values, target, 'synthetic baseline', new Date('2026-10-18')));
  await fs.writeFile(file, original);
  try { await run(file, { LOCALAPPDATA: root, TOKEN_CORRIDOR_GOOGLE_TOKEN: 'synthetic-secret' }, original); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('valid bounded response projects every row and derives metrics', () => {
  const snapshot = createTrackerSnapshotFromValues(values, target, 'synthetic credential', date);
  assert.equal(snapshot.applications.length, 1);
  assert.equal(snapshot.applications[0].sheetRow, 2);
  assert.equal(snapshot.applications[0].followUp, '2026-10-25');
  assert.equal(snapshot.metrics.readyToApply, 1);
  assert.equal(snapshot.capturedAtUtc, date.toISOString());
  assert.match(snapshot.contentDigest, /^[a-f0-9]{64}$/);
});

test('missing, duplicate, aliased duplicate, invalid and truncated rows fail closed', () => {
  const cases: unknown[] = [[], [heading.slice(1)], [[...heading, 'Company']], [[...heading, 'Follow-Up']],
    [heading, [false, 'High', 'Ready', '', 'Role', 'https://example.test']],
    [heading, ['maybe', 'High', 'Ready', 'Employer', 'Role', 'https://example.test']],
    [heading, [false, 'High', 'Ready', 'Employer', 'Role', 'javascript:alert(1)']],
    [heading, { invalid: true }], Array.from({ length: 1500 }, () => heading)];
  for (const rows of cases) assert.throws(() => createTrackerSnapshotFromValues(rows, target, 'synthetic', date));
});

test('real request is fixed to existing binding and only a validated response updates timestamp', async () => fixture(async (file, env) => {
  const fetcher = (async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'sheets.googleapis.com');
    assert.equal(url.searchParams.get('valueRenderOption'), 'FORMATTED_VALUE');
    assert.equal(decodeURIComponent(url.pathname), `/v4/spreadsheets/${target.spreadsheetId}/values/'Applications'' history'!A1:Z1500`);
    assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer synthetic-secret');
    assert.ok(init?.signal);
    return new Response(JSON.stringify(payload()));
  }) as typeof fetch;
  const result = await refreshTrackerSnapshot(file, { env, fetch: fetcher, now: () => date });
  assert.equal(result.ok, true);
  assert.equal(result.refreshed, true);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).capturedAtUtc, date.toISOString());
  assert.equal(JSON.stringify(result).includes('synthetic-secret'), false);
}));

test('missing credentials never invokes provider and preserves snapshot bytes', async () => fixture(async (file, env, original) => {
  delete env.TOKEN_CORRIDOR_GOOGLE_TOKEN;
  const result = await refreshTrackerSnapshot(file, { env, fetch: (() => { throw new Error('MUST_NOT_CALL'); }) as typeof fetch });
  assert.deepEqual(result, { ok: false, refreshed: false, error: 'AUTH_REQUIRED' });
  assert.equal(await fs.readFile(file, 'utf8'), original);
}));

test('all supported existing credential keys are consumed without returning tokens', async () => fixture(async (file, env) => {
  delete env.TOKEN_CORRIDOR_GOOGLE_TOKEN;
  const folder = path.join(env.LOCALAPPDATA!, 'TokenCorridor', 'connectors');
  await fs.mkdir(folder, { recursive: true });
  for (const key of ['token', 'access_token', 'accessToken']) {
    await fs.writeFile(path.join(folder, 'google.json'), JSON.stringify({ [key]: 'synthetic-secret' }));
    const result = await refreshTrackerSnapshot(file, { env, fetch: fake(payload()) });
    assert.equal(result.ok, true);
    assert.equal(JSON.stringify(result).includes('synthetic-secret'), false);
  }
}));

test('unauthorized, forbidden, unavailable, malformed, partial and oversized responses preserve prior snapshot', async () => fixture(async (file, env, original) => {
  const fetchers = [fake({ private: 'must not leak' }, 401), fake({}, 403), fake({}, 500), fake({}),
    fake({ ...payload(), majorDimension: 'COLUMNS' }), fake({ ...payload(), range: 'Other!A1:Z2' }),
    fake({ ...payload(), range: "'Applications'' history'!A1:Z2000" }), fake(payload([heading, [true]])),
    (async () => new Response('{broken')) as typeof fetch,
    (async () => new Response('x', { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } })) as typeof fetch,
    (async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))) as typeof fetch,
    (async () => { throw new Error('private url or token must not leak'); }) as typeof fetch];
  for (const fetcher of fetchers) {
    const result = await refreshTrackerSnapshot(file, { env, fetch: fetcher });
    assert.equal(result.ok, false);
    assert.equal(result.refreshed, false);
    assert.equal(JSON.stringify(result).includes('private'), false);
    assert.equal(await fs.readFile(file, 'utf8'), original);
  }
}));

test('source changed while provider request ran is not overwritten', async () => fixture(async (file, env) => {
  const changed = JSON.stringify({ preserved: 'synthetic newer local state' });
  const fetcher = (async () => { await fs.writeFile(file, changed); return new Response(JSON.stringify(payload())); }) as typeof fetch;
  const result = await refreshTrackerSnapshot(file, { env, fetch: fetcher });
  assert.deepEqual(result, { ok: false, refreshed: false, error: 'SOURCE_CHANGED_RETRY' });
  assert.equal(await fs.readFile(file, 'utf8'), changed);
}));

test('invalid existing binding prevents any provider call', async () => fixture(async (file, env) => {
  await fs.writeFile(file, JSON.stringify({ schema: 'wrong' }));
  const result = await refreshTrackerSnapshot(file, { env, fetch: (() => { throw new Error('MUST_NOT_CALL'); }) as typeof fetch });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error, 'TRACKER_BINDING_REQUIRED');
}));

test('read-only status never claims a refresh', async () => fixture(async (file, env) => {
  const status = await readTrackerStatus({ ...env, ESCAPEHATCH_TRACKER_SNAPSHOT: file });
  assert.equal(status.refreshed, false);
}));

test('refresh action rejects cross-origin, missing header, wrong content type and oversized bodies', () => {
  const origin = 'http://127.0.0.1:21031';
  const request = { method: 'POST', headers: { origin, 'x-escapehatch-tracker': '1', 'content-type': 'application/json' } } as unknown as IncomingMessage;
  assert.equal(trackerRefreshRequestAllowed(request, origin), true);
  for (const override of [{ origin: 'https://external.test' }, { origin: undefined }, { 'x-escapehatch-tracker': undefined }, { 'content-type': 'text/plain' }, { 'content-length': '2048' }]) {
    assert.equal(trackerRefreshRequestAllowed({ ...request, headers: { ...request.headers, ...override } } as IncomingMessage, origin), false);
  }
});

test('remembered sources list verified domains and selected local metadata without reading target', async () => fixture(async (file) => {
  const sources = [{ kind: 'drive_folder', label: 'Career', locator: 'https://drive.google.com/drive/folders/synthetic_folder' },
    { kind: 'google_doc', label: 'Master', locator: 'https://docs.google.com/document/d/synthetic_doc/edit' },
    { kind: 'local_file', label: 'Local master', locator: 'C:\\nonexistent\\synthetic-master.json' }];
  await fs.writeFile(file, JSON.stringify({ schema: 'escapehatch-career-sources/v1', sources }));
  assert.deepEqual(await readRememberedSources(file), { ok: true, sources });
  for (const locator of ['https://external.test/drive/folders/id', 'file:///etc/passwd', 'https://drive.google.com.evil.test/drive/folders/id']) {
    await fs.writeFile(file, JSON.stringify({ schema: 'escapehatch-career-sources/v1', sources: [{ ...sources[0], locator }] }));
    assert.equal((await readRememberedSources(file)).ok, false);
  }
}));


test('provider wait is aborted at the ten-second bound and cannot advance timestamp', async () => fixture(async (file, env, original) => {
  const started = Date.now();
  const fetcher = ((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('private abort details')), { once: true });
  })) as typeof fetch;
  const result = await refreshTrackerSnapshot(file, { env, fetch: fetcher });
  assert.deepEqual(result, { ok: false, refreshed: false, error: 'TIMEOUT' });
  assert.ok(Date.now() - started >= 9_900 && Date.now() - started < 12_000);
  assert.equal(await fs.readFile(file, 'utf8'), original);
}));


test('availability distinguishes an attempt from verified authentication and keeps missing auth actionable', async () => fixture(async (file, env) => {
  assert.equal((await readTrackerRefreshAvailability(file, env)).refreshState, 'AVAILABLE');
  delete env.TOKEN_CORRIDOR_GOOGLE_TOKEN;
  assert.equal((await readTrackerRefreshAvailability(file, env)).refreshState, 'AUTH_REQUIRED');
  await fs.writeFile(file, '{}');
  assert.equal((await readTrackerRefreshAvailability(file, env)).refreshState, 'NOT_CONFIGURED');
}));
