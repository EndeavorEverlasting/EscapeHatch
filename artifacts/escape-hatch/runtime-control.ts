import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

export const ESCAPEHATCH_RUNTIME_PROTOCOL = 1;
export const ESCAPEHATCH_APP = 'EscapeHatch';

const IDENTITY_PATH = '/__escapehatch/runtime';
const SHUTDOWN_PATH = '/__escapehatch/shutdown';
const INSTANCE_HEADER = 'x-escapehatch-instance-id';
const PROTOCOL_HEADER = 'x-escapehatch-runtime-protocol';
const TOKEN_HEADER = 'x-escapehatch-shutdown-token';

export type RuntimeIdentity = {
  app: typeof ESCAPEHATCH_APP;
  protocol: typeof ESCAPEHATCH_RUNTIME_PROTOCOL;
  instanceId: string;
  repoFingerprint: string;
  pid: number;
  startedAtUtc: string;
};

export type ManagedRuntime = {
  identity: RuntimeIdentity;
  shutdownToken: string;
};

type RuntimeEnvironment = Record<string, string | undefined>;

type RuntimeControlOptions = {
  env?: RuntimeEnvironment;
  shutdown?: (server: ViteDevServer) => Promise<void> | void;
};

function oneHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function json(res: ServerResponse, statusCode: number, body: object): void {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(payload);
}

export function isLoopbackAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase();
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1';
}

function requireManagedValue(env: RuntimeEnvironment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Managed EscapeHatch runtime is missing ${name}`);
  return value;
}

export function readManagedRuntime(env: RuntimeEnvironment = process.env): ManagedRuntime | null {
  const managedNames = [
    'ESCAPEHATCH_INSTANCE_ID',
    'ESCAPEHATCH_REPO_FINGERPRINT',
    'ESCAPEHATCH_SHUTDOWN_TOKEN',
    'ESCAPEHATCH_STARTED_AT_UTC',
  ] as const;
  const present = managedNames.filter((name) => Boolean(env[name]?.trim()));
  if (present.length === 0) return null;
  if (present.length !== managedNames.length) {
    throw new Error('Managed EscapeHatch runtime environment is incomplete');
  }

  const instanceId = requireManagedValue(env, 'ESCAPEHATCH_INSTANCE_ID');
  const repoFingerprint = requireManagedValue(env, 'ESCAPEHATCH_REPO_FINGERPRINT').toLowerCase();
  const shutdownToken = requireManagedValue(env, 'ESCAPEHATCH_SHUTDOWN_TOKEN');
  const startedAtUtc = requireManagedValue(env, 'ESCAPEHATCH_STARTED_AT_UTC');
  if (!/^[a-f0-9]{64}$/.test(repoFingerprint)) {
    throw new Error('ESCAPEHATCH_REPO_FINGERPRINT must be a lowercase 64-character SHA-256 hex digest');
  }
  if (Number.isNaN(Date.parse(startedAtUtc))) {
    throw new Error('ESCAPEHATCH_STARTED_AT_UTC must be an ISO-8601 timestamp');
  }
  if (env.ESCAPEHATCH_RUNTIME_PROTOCOL && env.ESCAPEHATCH_RUNTIME_PROTOCOL !== String(ESCAPEHATCH_RUNTIME_PROTOCOL)) {
    throw new Error(`Unsupported ESCAPEHATCH_RUNTIME_PROTOCOL: ${env.ESCAPEHATCH_RUNTIME_PROTOCOL}`);
  }

  return {
    identity: {
      app: ESCAPEHATCH_APP,
      protocol: ESCAPEHATCH_RUNTIME_PROTOCOL,
      instanceId,
      repoFingerprint,
      pid: process.pid,
      startedAtUtc,
    },
    shutdownToken,
  };
}

export function handleRuntimeControlRequest(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: ManagedRuntime,
  requestShutdown: () => void,
): boolean {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== IDENTITY_PATH && url.pathname !== SHUTDOWN_PATH) return false;

  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    json(res, 403, { ok: false, error: 'loopback_required' });
    return true;
  }

  if (url.pathname === IDENTITY_PATH) {
    if (req.method !== 'GET') {
      res.setHeader('allow', 'GET');
      json(res, 405, { ok: false, error: 'method_not_allowed' });
      return true;
    }
    json(res, 200, runtime.identity);
    return true;
  }

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    json(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }

  const protocol = oneHeader(req.headers[PROTOCOL_HEADER]);
  const instanceId = oneHeader(req.headers[INSTANCE_HEADER]);
  const shutdownToken = oneHeader(req.headers[TOKEN_HEADER]);
  if (protocol !== String(runtime.identity.protocol) || instanceId !== runtime.identity.instanceId) {
    json(res, 409, { ok: false, error: 'runtime_identity_mismatch' });
    return true;
  }
  if (!shutdownToken || shutdownToken !== runtime.shutdownToken) {
    json(res, 401, { ok: false, error: 'unauthorized' });
    return true;
  }

  res.once('finish', requestShutdown);
  json(res, 202, { ok: true, status: 'shutting_down' });
  return true;
}

export function createRuntimeControlPlugin(options: RuntimeControlOptions = {}): Plugin {
  const runtime = readManagedRuntime(options.env);
  return {
    name: 'escapehatch-runtime-control',
    configureServer(server) {
      if (!runtime) return;
      server.middlewares.use((req, res, next) => {
        const handled = handleRuntimeControlRequest(req, res, runtime, () => {
          setTimeout(() => {
            void Promise.resolve(options.shutdown ? options.shutdown(server) : server.close())
              .then(() => {
                if (!options.shutdown) process.exit(0);
              })
              .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`EscapeHatch graceful shutdown failed: ${message}`);
                process.exitCode = 1;
              });
          }, 0);
        });
        if (!handled) next();
      });
    },
  };
}
