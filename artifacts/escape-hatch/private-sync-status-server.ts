/**
 * Localhost-only status surface for private sync.
 * Serves observePrivateSyncStatus JSON — never preference values —
 * and the auth corridor prototype at /corridor.
 *
 * Usage:
 *   ESCAPEHATCH_EXPERIMENTAL_SYNC=1 ESCAPEHATCH_DATA_HOME=... \
 *   node --experimental-strip-types private-sync-status-server.ts [carrierAbsPath] [port]
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { observePrivateSyncStatus } from './private-sync-status.ts';

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
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

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
    const report = await observePrivateSyncStatus({
      dataHome: process.env.ESCAPEHATCH_DATA_HOME,
      carrier,
    });
    const body = JSON.stringify(report, null, 2);
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...cors,
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', ...cors });
    res.end(JSON.stringify({ error: 'STATUS_FAILED', detail: error instanceof Error ? error.message : 'unknown' }));
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
    }) + '\n',
  );
});
