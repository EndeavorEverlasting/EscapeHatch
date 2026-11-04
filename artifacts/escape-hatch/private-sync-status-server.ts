/**
 * Localhost-only status surface for private sync.
 * Serves observePrivateSyncStatus JSON — never preference values —
 * the auth corridor prototype at /corridor, and live pairing at POST /pair.
 *
 * Usage:
 *   ESCAPEHATCH_EXPERIMENTAL_SYNC=1 ESCAPEHATCH_DATA_HOME=... \
 *   node --experimental-strip-types private-sync-status-server.ts [carrierAbsPath] [port]
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { observePrivateSyncStatus } from './private-sync-status.ts';
import { exportPairingOffer } from './private-sync-device.ts';

const carrierArg = process.argv[2];
const port = Number(process.argv[3] || 18766);
const carrier = carrierArg && path.isAbsolute(carrierArg) ? carrierArg : undefined;
const here = path.dirname(fileURLToPath(import.meta.url));
const corridorHtml = path.resolve(here, '../../docs/design/prototypes/auth-sync-handoff.html');

if (process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC !== '1') {
  process.stderr.write('EXPERIMENTAL_SYNC_DISABLED\n');
  process.exit(2);
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...cors,
  });
  res.end(JSON.stringify(body, null, 2));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  try {
    if (url.pathname === '/corridor' || url.pathname === '/corridor/') {
      const html = await fs.readFile(corridorHtml, 'utf8');
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        ...cors,
      });
      res.end(html);
      return;
    }

    if (url.pathname === '/pair' && req.method === 'POST') {
      if (!carrier) {
        json(res, 422, { error: 'CARRIER_REQUIRED', detail: 'Start status server with an absolute carrier path.' });
        return;
      }
      const offer = await exportPairingOffer({
        carrier,
        dataHome: process.env.ESCAPEHATCH_DATA_HOME,
      });
      const { pairingCode, ...sealed } = offer;
      const offerPath = path.join(carrier, 'pairing-offer.json');
      await fs.writeFile(offerPath, JSON.stringify(sealed), { mode: 0o600 });
      const codePath = path.join(os.tmpdir(), 'pairing-code.local.txt');
      await fs.writeFile(codePath, pairingCode, { mode: 0o600 });
      // Localhost-only process: code is shown on the operator desktop for SAS entry.
      json(res, 200, {
        state: 'PAIRING_READY',
        vaultId: sealed.vaultId,
        expiresAt: sealed.expiresAt,
        pairingCode,
        codePath,
        offerPath,
        values: 'redacted',
      });
      return;
    }

    const report = await observePrivateSyncStatus({
      dataHome: process.env.ESCAPEHATCH_DATA_HOME,
      carrier,
    });
    json(res, 200, report);
  } catch (error) {
    json(res, 500, { error: 'STATUS_FAILED', detail: error instanceof Error ? error.message : 'unknown' });
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(
    JSON.stringify({
      state: 'LISTENING',
      port,
      bind: '127.0.0.1',
      carrier: carrier || null,
      corridor: `http://127.0.0.1:${port}/corridor`,
      pair: `POST http://127.0.0.1:${port}/pair`,
    }) + '\n',
  );
});
