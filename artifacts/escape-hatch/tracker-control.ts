/**
 * Loopback-only tracker snapshot reader for the managed EscapeHatch runtime.
 * Reads %LOCALAPPDATA%\EscapeHatch\tracker-snapshot.v1.json and reports whether
 * TokenCorridor google.json exists. Never logs snapshot contents or tokens.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import type { Plugin } from 'vite';
import { isLoopbackAddress, readManagedRuntime } from './runtime-control.ts';
import { parseTrackerSnapshot } from './src/lib/tracker-bridge.ts';
import { readRememberedSources, readTrackerRefreshAvailability, refreshTrackerSnapshot } from './tracker-refresh.ts';

const PREFIX = '/__escapehatch/tracker';

function respond(res: ServerResponse, code: number, value: object) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(value));
}

export function trackerPaths(env: NodeJS.ProcessEnv = process.env) {
  const local = env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local');
  return {
    snapshot: env.ESCAPEHATCH_TRACKER_SNAPSHOT || path.join(local, 'EscapeHatch', 'tracker-snapshot.v1.json'),
    googleAuth: path.join(local, 'TokenCorridor', 'connectors', 'google.json'),
    sources: path.join(local, 'EscapeHatch', 'career-sources.v1.json'),
  };
}

export async function readTrackerStatus(env: NodeJS.ProcessEnv = process.env) {
  const paths = trackerPaths(env);
  let localGoogleAuthPresent = false;
  try {
    await fs.access(paths.googleAuth);
    localGoogleAuthPresent = true;
  } catch { /* absent */ }

  try {
    const raw = JSON.parse(await fs.readFile(paths.snapshot, 'utf8')) as unknown;
    const snapshot = parseTrackerSnapshot(raw);
    if (!snapshot) {
      return {
        ok: true as const,
        refreshed: false as const,
        connection: 'NOT_CONNECTED' as const,
        reason: 'Tracker snapshot present but invalid schema.',
        localGoogleAuthPresent,
        snapshot: null,
      };
    }
    return {
      ok: true as const,
      refreshed: false as const,
      connection: 'CONNECTED' as const,
      reason: snapshot.authPath,
      localGoogleAuthPresent: localGoogleAuthPresent || snapshot.localGoogleAuthPresent,
      snapshot: {
        ...snapshot,
        localGoogleAuthPresent: localGoogleAuthPresent || snapshot.localGoogleAuthPresent,
      },
    };
  } catch {
    return {
      ok: true as const,
      refreshed: false as const,
      connection: 'NOT_CONNECTED' as const,
      reason: localGoogleAuthPresent
        ? 'Google auth file present but no EscapeHatch tracker snapshot yet.'
        : 'NOT CONNECTED — TokenCorridor google.json absent and no private tracker snapshot.',
      localGoogleAuthPresent,
      snapshot: null,
    };
  }
}

/** Mutation endpoints require an explicit same-origin app action, not a cross-site form. */
export function trackerRefreshRequestAllowed(req: IncomingMessage, origin: string): boolean {
  const length = req.headers['content-length'];
  return req.method === 'POST' && req.headers.origin === origin &&
    req.headers['x-escapehatch-tracker'] === '1' &&
    /^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] || '')) &&
    (length === undefined || (typeof length === 'string' && /^\d+$/.test(length) && Number(length) <= 1024));
}

export function createTrackerControlPlugin(): Plugin {
  const managed = readManagedRuntime();
  return {
    name: 'escapehatch-tracker-control',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (!url.pathname.startsWith(PREFIX + '/')) return next();
        const port = Number(process.env.PORT || server.config.server.port || 5173);
        const host = String(req.headers.host || '');
        if (!managed || !isLoopbackAddress(req.socket.remoteAddress) || host !== '127.0.0.1:' + port) {
          return respond(res, 403, { ok: false, error: 'managed_local_runtime_required' });
        }
        if (url.pathname === PREFIX + '/status' && req.method === 'GET') {
          return respond(res, 200, await readTrackerStatus());
        }
        if (url.pathname === PREFIX + '/sources' && req.method === 'GET') {
          const result = await readRememberedSources(trackerPaths().sources);
          return respond(res, result.ok ? 200 : 422, { ...result, ...await readTrackerRefreshAvailability(trackerPaths().snapshot) });
        }
        if (url.pathname === PREFIX + '/refresh' && req.method === 'POST') {
          if (!trackerRefreshRequestAllowed(req, 'http://127.0.0.1:' + port)) {
            return respond(res, 403, { ok: false, refreshed: false, error: 'same_origin_action_required' });
          }
          req.resume(); // No caller-supplied target or credential is consumed.
          const result = await refreshTrackerSnapshot(trackerPaths().snapshot);
          return respond(res, result.ok ? 200 : 'error' in result && result.error === 'AUTH_REQUIRED' ? 401 : 422,
            { ...result, state: result.ok ? 'REFRESHED' : 'error' in result ? result.error : 'REFRESH_FAILED',
              reason: result.ok ? 'Tracker refreshed from Google Sheets.' : 'error' in result ? result.error : 'REFRESH_FAILED' });
        }
        return respond(res, 404, { ok: false, error: 'unknown_tracker_action' });
      });
    },
  };
}
