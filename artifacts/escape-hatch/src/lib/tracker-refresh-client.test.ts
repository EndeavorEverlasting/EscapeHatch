import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshBoundTrackerOnStartup } from './tracker-refresh-client';

test('startup does not refresh without existing bound provider authorization', async () => {
  let called = 0;
  const fake = (async () => { called++; throw new Error('must not call'); }) as typeof fetch;
  assert.equal(await refreshBoundTrackerOnStartup({ snapshot: {}, localGoogleAuthPresent: false }, fake), null);
  assert.equal(await refreshBoundTrackerOnStartup({ localGoogleAuthPresent: true }, fake), null);
  assert.equal(called, 0);
});

test('read-only startup refresh keeps existing provider target, then verifies readback', async () => {
  const calls: string[] = [];
  const fake = (async (input, init) => {
    calls.push(String(input));
    if (calls.length === 1) {
      assert.equal(init?.method, 'POST');
      assert.equal((init?.headers as Record<string, string>)['x-escapehatch-tracker'], '1');
      assert.equal(init?.credentials, 'same-origin');
      assert.equal(init?.body, '{}');
      return new Response(JSON.stringify({ ok: true, refreshed: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ connection: 'CONNECTED', snapshot: { schema: 'synthetic-test-only' } }));
  }) as typeof fetch;
  const refreshed = await refreshBoundTrackerOnStartup({ snapshot: { old: true }, localGoogleAuthPresent: true }, fake);
  assert.deepEqual(refreshed?.snapshot, { schema: 'synthetic-test-only' });
  assert.deepEqual(calls, ['/__escapehatch/tracker/refresh', '/__escapehatch/tracker/status']);
});

test('refresh errors, invalid refresh receipts and missing readback preserve last snapshot', async () => {
  const cases = [
    async () => new Response('no', { status: 401 }),
    async () => new Response(JSON.stringify({ ok: false, refreshed: false }), { status: 200 }),
    async () => { throw new Error('provider down'); },
  ];
  for (const first of cases) {
    const stub = (async () => first()) as typeof fetch;
    assert.equal(await refreshBoundTrackerOnStartup({ snapshot: { old: true }, localGoogleAuthPresent: true }, stub), null);
  }
});
