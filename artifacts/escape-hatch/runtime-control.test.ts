import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {
  ESCAPEHATCH_RUNTIME_PROTOCOL,
  createShutdownGate,
  handleRuntimeControlRequest,
  isLoopbackAddress,
  readManagedRuntime,
  type ManagedRuntime,
} from './runtime-control.ts';

const fingerprint = '0123456789abcdef'.repeat(4);

function runtime(): ManagedRuntime {
  return {
    identity: {
      app: 'EscapeHatch',
      protocol: ESCAPEHATCH_RUNTIME_PROTOCOL,
      instanceId: 'instance-test-001',
      repoFingerprint: fingerprint,
      pid: process.pid,
      startedAtUtc: '2026-09-22T16:00:00.000Z',
    },
    shutdownToken: 'synthetic-secret-token',
  };
}

async function withServer(run: (baseUrl: string, shutdowns: () => number) => Promise<void>) {
  let shutdownCount = 0;
  const managed = runtime();
  const server = http.createServer((req, res) => {
    const handled = handleRuntimeControlRequest(req, res, managed, () => {
      shutdownCount += 1;
    });
    if (!handled) {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}`, () => shutdownCount);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('managed runtime environment is fail-closed and keeps the token out of identity', () => {
  assert.equal(readManagedRuntime({}), null);
  assert.throws(() => readManagedRuntime({ ESCAPEHATCH_INSTANCE_ID: 'partial' }), /incomplete/);
  const managed = readManagedRuntime({
    ESCAPEHATCH_INSTANCE_ID: 'instance-test-001',
    ESCAPEHATCH_REPO_FINGERPRINT: fingerprint,
    ESCAPEHATCH_SHUTDOWN_TOKEN: 'synthetic-secret-token',
    ESCAPEHATCH_STARTED_AT_UTC: '2026-09-22T16:00:00.000Z',
    ESCAPEHATCH_RUNTIME_PROTOCOL: '1',
  });
  assert.ok(managed);
  assert.equal(managed.identity.repoFingerprint, fingerprint);
  assert.equal('shutdownToken' in managed.identity, false);
  assert.equal(managed.shutdownToken, 'synthetic-secret-token');
});

test('loopback matcher accepts IPv4/IPv6 loopback and rejects other addresses', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.1.20'), false);
  assert.equal(isLoopbackAddress(undefined), false);
});

test('identity endpoint returns only public runtime identity', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/__escapehatch/runtime`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body, runtime().identity);
    assert.equal(JSON.stringify(body).includes('synthetic-secret-token'), false);
  });
});

test('shutdown rejects missing token and mismatched identity without invoking shutdown', async () => {
  await withServer(async (baseUrl, shutdowns) => {
    const missingToken = await fetch(`${baseUrl}/__escapehatch/shutdown`, {
      method: 'POST',
      headers: {
        'x-escapehatch-runtime-protocol': '1',
        'x-escapehatch-instance-id': 'instance-test-001',
      },
    });
    assert.equal(missingToken.status, 401);

    const wrongInstance = await fetch(`${baseUrl}/__escapehatch/shutdown`, {
      method: 'POST',
      headers: {
        'x-escapehatch-runtime-protocol': '1',
        'x-escapehatch-instance-id': 'wrong-instance',
        'x-escapehatch-shutdown-token': 'synthetic-secret-token',
      },
    });
    assert.equal(wrongInstance.status, 409);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shutdowns(), 0);
  });
});

test('shutdown gate dispatches only once across concurrent authorized completions', () => {
  let calls = 0;
  const requestShutdown = createShutdownGate(() => {
    calls += 1;
  });
  requestShutdown();
  requestShutdown();
  requestShutdown();
  assert.equal(calls, 1);
});

test('authorized shutdown responds before dispatch and never echoes the secret', async () => {
  await withServer(async (baseUrl, shutdowns) => {
    const response = await fetch(`${baseUrl}/__escapehatch/shutdown`, {
      method: 'POST',
      headers: {
        'x-escapehatch-runtime-protocol': '1',
        'x-escapehatch-instance-id': 'instance-test-001',
        'x-escapehatch-shutdown-token': 'synthetic-secret-token',
      },
    });
    assert.equal(response.status, 202);
    const body = await response.text();
    assert.equal(body.includes('synthetic-secret-token'), false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shutdowns(), 1);
  });
});
