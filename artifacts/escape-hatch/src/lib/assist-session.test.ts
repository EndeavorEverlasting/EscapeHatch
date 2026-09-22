import assert from 'node:assert/strict';
import test from 'node:test';
import { initialSession, observePage, parseAssistSessionStatus, recordFill, recordScan } from './assist-session';

const page = (text: string, title = 'Application') => ({ body: { innerText: text }, title } as unknown as Document);
const field = (status: 'fillable' | 'already-populated' | 'blocked' | 'manual-review' | 'unknown') => ({ id: status, kind: 'text' as const, label: status, element: {} as HTMLInputElement, value: '', proposedValue: status === 'fillable' ? 'value' : '', status });

test('same-origin page changes preserve the session and wait for a fresh scan', () => {
  let session = observePage(initialSession(), 'https://jobs.example/app?page=one', page('first page'));
  session = { ...session, active: true, origin: 'https://jobs.example', currentPageKey: 'https://jobs.example/app?page=one::first page' };
  session = observePage(session, 'https://jobs.example/app?page=two', page('second page'));
  assert.equal(session.paused, false);
  assert.equal(session.pages.length, 1);
  assert.match(session.message, /New application page/);
  assert.equal(session.undoHistory.length, 0);
});

test('cross-origin navigation pauses before any new writes', () => {
  const session = { ...initialSession(), active: true, origin: 'https://jobs.example', currentPageKey: 'current' };
  const next = observePage(session, 'https://other.example/app', page('other'));
  assert.equal(next.paused, true);
  assert.match(next.message, /origin changed/);
});

test('page progress separates fillable, populated, manual, blocked, and unknown controls', () => {
  let session = observePage(initialSession(), 'https://jobs.example/app', page('form'));
  session = { ...session, active: true };
  session = recordScan(session, [field('fillable'), field('already-populated'), field('manual-review'), field('blocked'), field('unknown')], 'https://jobs.example/app', 'Application');
  assert.deepEqual(session.pages[0], {
    key: session.currentPageKey,
    url: 'https://jobs.example/app',
    title: 'Application',
    scannedAt: session.pages[0].scannedAt,
    filled: 1,
    alreadyPopulated: 1,
    manualReview: 1,
    blocked: 1,
    unknown: 1,
    status: 'ready-to-fill',
  });
  session = recordFill(session, [{ id: 'fillable', element: {} as HTMLInputElement, previousValue: '', value: 'value' }]);
  assert.equal(session.undoHistory.length, 1);
  assert.match(session.message, /Review this page/);
});

test('extension status imports as session-only cockpit progress', () => {
  const imported = parseAssistSessionStatus({
    active: true,
    paused: true,
    emergencyStopped: true,
    origin: 'https://jobs.example',
    pageKey: 'page-two',
    pages: [
      { key: 'page-one', url: 'https://jobs.example/one', title: 'Page one', scannedAt: '2026-09-20T12:00:00.000Z', filled: 2, alreadyPopulated: 1, status: 'filled' },
      { key: 'page-two', url: 'https://jobs.example/two', title: 'Page two', filled: 0, status: 'ready-to-fill' },
    ],
    message: 'Emergency stop latched.',
    history: [{ pageKey: 'page-one', records: [{ id: 'name', previousValue: '', value: 'Ada' }] }],
  });
  assert.ok(imported);
  assert.equal(imported.active, true);
  assert.equal(imported.paused, true);
  assert.equal(imported.emergencyStopped, true);
  assert.equal(imported.origin, 'https://jobs.example');
  assert.equal(imported.currentPageKey, 'page-two');
  assert.equal(imported.pages.length, 2);
  assert.equal(imported.pages[0].filled, 2);
  assert.equal(imported.pages[1].status, 'ready-to-fill');
  assert.equal(imported.undoHistory.length, 0);
});