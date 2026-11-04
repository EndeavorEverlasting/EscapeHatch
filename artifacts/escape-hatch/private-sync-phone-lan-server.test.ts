/**
 * LAN phone-install server must serve APK + sealed ciphertext only.
 * Never expose pairing codes or preference values.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const here = path.dirname(fileURLToPath(import.meta.url));

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (!addr || typeof addr === 'string') {
        s.close();
        reject(new Error('NO_PORT'));
        return;
      }
      const port = addr.port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

async function waitHealth(port: number, attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('LAN_SERVER_HEALTH_TIMEOUT');
}

test('phone LAN server serves apk/offer/capsule and never pairing codes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-lan-'));
  const apkBytes = Buffer.from('PK-synthetic-apk');
  const offer = {
    schema: 'escapehatch/private-sync-pairing/v1',
    vaultId: 'v'.repeat(32),
    createdAt: '2026-11-04T00:00:00.000Z',
    expiresAt: '2026-11-04T01:00:00.000Z',
    nonce: 'n',
    ciphertext: 'c',
    tag: 't',
  };
  const capsuleName = 'deadbeef.ehsync';
  await fs.writeFile(path.join(root, 'EscapeHatchAssist-debug.apk'), apkBytes);
  await fs.writeFile(path.join(root, 'pairing-offer.json'), JSON.stringify(offer));
  await fs.writeFile(path.join(root, capsuleName), Buffer.from('ciphertext-only'));

  const port = await freePort();
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', path.join(here, 'private-sync-phone-lan-server.ts'), root, String(port)],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });
  try {
    await waitHealth(port);
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(health.pairingCode, 'never');
    assert.deepEqual(health.serves, ['apk', 'offer', 'capsule']);

    const index = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(index, /Download EscapeHatchAssist-debug\.apk/);
    assert.doesNotMatch(index, /pairingCode|pairing-code\.local/i);

    const apk = await fetch(`http://127.0.0.1:${port}/apk`);
    assert.equal(apk.status, 200);
    assert.equal(Buffer.compare(Buffer.from(await apk.arrayBuffer()), apkBytes), 0);

    const offerRes = await (await fetch(`http://127.0.0.1:${port}/offer`)).json();
    assert.equal(offerRes.schema, offer.schema);
    assert.equal(offerRes.vaultId, offer.vaultId);
    assert.equal('pairingCode' in offerRes, false);

    const capsule = await fetch(`http://127.0.0.1:${port}/capsule`);
    assert.equal(capsule.status, 200);
    assert.match(capsule.headers.get('content-disposition') || '', /deadbeef\.ehsync/);
    assert.equal(Buffer.from(await capsule.arrayBuffer()).toString('utf8'), 'ciphertext-only');
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    await fs.rm(root, { recursive: true, force: true });
  }
  assert.equal(stderr.includes('pairingCode'), false);
});
