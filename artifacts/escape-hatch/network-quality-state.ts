import type { IncomingMessage, ServerResponse } from 'node:http';
import { isLoopbackAddress } from './runtime-control.ts';
import type { AutomaticQualityRuntime } from './network-quality-runtime.ts';

/** Read-only status: never initiates probes and never changes the opt-in policy. */
export function readAutomaticQualityStatus(
  req: IncomingMessage, res: ServerResponse,
  runtime: AutomaticQualityRuntime, eligible: boolean,
): boolean {
  if (req.url !== '/__escapehatch/network-path-quality/monitor/health') return false;
  const host = req.headers.host;
  const port = typeof host === 'string' && /^127\.0\.0\.1:([1-9]\d{1,4})$/.exec(host)?.[1];
  const authorized = Boolean(port && Number(port) <= 65535 &&
    isLoopbackAddress(req.socket.remoteAddress) &&
    req.headers['sec-fetch-site'] === 'same-origin' &&
    (!req.headers.origin || req.headers.origin === 'http://' + host));
  const status = req.method !== 'GET' ? 405 : !authorized ? 403 : !eligible ? 503 : 200;
  res.statusCode = status;
  if (status === 405) res.setHeader('allow', 'GET');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(status === 200
    ? { ok: true, monitor: runtime.snapshot() }
    : { ok: false, error: 'monitor_status_unavailable' }));
  return true;
}
