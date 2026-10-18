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
        connection: 'NOT_CONNECTED' as const,
        reason: 'Tracker snapshot present but invalid schema.',
        localGoogleAuthPresent,
        snapshot: null,
      };
    }
    return {
      ok: true as const,
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
      connection: 'NOT_CONNECTED' as const,
      reason: localGoogleAuthPresent
        ? 'Google auth file present but no EscapeHatch tracker snapshot yet.'
        : 'NOT CONNECTED — TokenCorridor google.json absent and no private tracker snapshot.',
      localGoogleAuthPresent,
      snapshot: null,
    };
  }
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
        return respond(res, 404, { ok: false, error: 'unknown_tracker_action' });
      });
    },
  };
}
