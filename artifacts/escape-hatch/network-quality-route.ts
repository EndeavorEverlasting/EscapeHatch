/** Strict local control surface for consented automatic path diagnostics. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isLoopbackAddress } from './runtime-control.ts';
import type { AutomaticQualityRuntime } from './network-quality-runtime.ts';

const BASE = '/__escapehatch/network-path-quality/monitor';
function reply(res: ServerResponse, code: number, payload: object) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(payload));
}
export async function handleAutomaticQualityRequest(
  req: IncomingMessage, res: ServerResponse,
  runtime: AutomaticQualityRuntime, eligible: boolean,
): Promise<boolean> {
  const path = req.url;
  if (path !== BASE + '/status' && path !== BASE + '/enable' && path !== BASE + '/disable') return false;
  const statusRoute = path === BASE + '/status';
  if (req.method !== (statusRoute ? 'GET' : 'POST')) {
    res.setHeader('allow', statusRoute ? 'GET' : 'POST');
    reply(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }
  const host = req.headers.host;
  const port = typeof host === 'string' && /^127\.0\.0\.1:([1-9]\d{1,4})$/.exec(host)?.[1];
  if (!port || Number(port) > 65535 || !isLoopbackAddress(req.socket.remoteAddress) ||
      req.headers.origin !== 'http://' + host ||
      req.headers['sec-fetch-site'] !== 'same-origin' ||
      (!statusRoute && (req.headers['x-escapehatch-operator-action'] !== 'confirmed' ||
        req.headers['x-escapehatch-network-scope'] !== 'personal'))) {
    reply(res, 403, { ok: false, error: 'local_operator_action_required' });
    return true;
  }
  if (!eligible) {
    reply(res, 503, { ok: false, error: 'personal_managed_windows_runtime_required' });
    return true;
  }
  if (statusRoute) {
    reply(res, 200, { ok: true, monitor: runtime.snapshot() });
    return true;
  }
  try {
    await runtime.configure(path === BASE + '/enable');
    reply(res, 200, { ok: true, monitor: runtime.snapshot() });
  } catch {
    reply(res, 503, { ok: false, error: 'local_monitor_preference_unavailable' });
  }
  return true;
}
