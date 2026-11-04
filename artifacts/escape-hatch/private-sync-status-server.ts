/**
 * Localhost-only status surface for private sync.
 * Serves observePrivateSyncStatus JSON — never preference values.
 *
 * Usage:
 *   ESCAPEHATCH_EXPERIMENTAL_SYNC=1 ESCAPEHATCH_DATA_HOME=... \
 *   node --experimental-strip-types private-sync-status-server.ts [carrierAbsPath] [port]
 */
import http from 'node:http';
import path from 'node:path';
import { observePrivateSyncStatus } from './private-sync-status.ts';

const carrierArg = process.argv[2];
const port = Number(process.argv[3] || 18766);
const carrier = carrierArg && path.isAbsolute(carrierArg) ? carrierArg : undefined;

if (process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC !== '1') {
  process.stderr.write('EXPERIMENTAL_SYNC_DISABLED\n');
  process.exit(2);
}

const server = http.createServer(async (_req, res) => {
  try {
    const report = await observePrivateSyncStatus({
      dataHome: process.env.ESCAPEHATCH_DATA_HOME,
      carrier,
    });
    const body = JSON.stringify(report, null, 2);
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'STATUS_FAILED', detail: error instanceof Error ? error.message : 'unknown' }));
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ state: 'LISTENING', port, bind: '127.0.0.1', carrier: carrier || null }) + '\n');
});
