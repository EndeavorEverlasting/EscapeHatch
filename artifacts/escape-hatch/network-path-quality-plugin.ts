/** Narrow same-origin, on-demand local network diagnostics endpoint.
 *
 * This is NOT an automatic sensor, browser navigation, health beacon, or
 * permission to inspect employer pages. Never runs in synthetic preview.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { isLoopbackAddress, readManagedRuntime } from './runtime-control.ts';
import { measureNetworkPath, type PathQualityReceipt } from './network-path-quality.ts';

const ENDPOINT = '/__escapehatch/network-path-quality';
const CONSENT_HEADER = 'x-escapehatch-operator-action';

type DiagnosticState = { inFlight: boolean; lastStartedAt: number | null };
type Options = {
  managed: boolean;
  platform: string;
  measure: () => Promise<PathQualityReceipt>;
  now: () => number;
  state: DiagnosticState;
};

function respond(res: ServerResponse, status: number, value: object): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.end(JSON.stringify(value));
}

/** Testable security boundary: never probe before checking source and authority. */
export async function handleNetworkPathRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: Options,
): Promise<boolean> {
  // No URL parser ambiguity, query-driven targets, or alternate methods.
  if (req.url !== ENDPOINT) return false;
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    respond(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }
  const host = req.headers.host;
  const origin = req.headers.origin;
  const port = typeof host === 'string' && /^127\.0\.0\.1:([1-9]\d{1,4})$/.exec(host)?.[1];
  if (!port || Number(port) > 65535 ||
      !isLoopbackAddress(req.socket.remoteAddress) ||
      origin !== 'http://' + host ||
      req.headers['sec-fetch-site'] !== 'same-origin' ||
      req.headers[CONSENT_HEADER] !== 'confirmed' ||
      req.headers['x-escapehatch-network-scope'] !== 'personal') {
    respond(res, 403, { ok: false, error: 'local_operator_action_required' });
    return true;
  }
  if (!options.managed || options.platform !== 'win32') {
    respond(res, 503, { ok: false, error: 'installed_personal_windows_runtime_required' });
    return true;
  }
  if (options.state.inFlight ||
      (options.state.lastStartedAt !== null &&
       options.now() - options.state.lastStartedAt < 10000)) {
    respond(res, 429, { ok: false, error: 'diagnostic_temporarily_rate_limited' });
    return true;
  }
  options.state.inFlight = true;
  options.state.lastStartedAt = options.now();
  try {
    const receipt = await options.measure();
    respond(res, 200, { ok: true, receipt });
  } catch {
    // Do not reflect OS exceptions, DNS addresses or socket targets to browsers.
    respond(res, 503, { ok: false, error: 'diagnostic_sensor_unavailable' });
  } finally {
    options.state.inFlight = false;
  }
  return true;
}

export function createNetworkPathQualityPlugin(): Plugin {
  const managed = Boolean(readManagedRuntime());
  const state: DiagnosticState = { inFlight: false, lastStartedAt: null };
  return {
    name: 'escapehatch-network-path-quality',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleNetworkPathRequest(req, res, {
          managed, platform: process.platform, measure: measureNetworkPath,
          now: Date.now, state,
        }).then(handled => { if (!handled) next(); })
          .catch(() => respond(res, 503, { ok: false, error: 'diagnostic_sensor_unavailable' }));
      });
    },
  };
}
