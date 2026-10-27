import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const RESERVED_PORTS = new Set([21031, 21033, 21039, 21040]);

/** Never let the general Playwright suite impersonate the live or bootstrap sessions. */
export function resolveBrowserTestPort(raw: string | undefined): string {
  const value = raw ?? '21041';
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) ||
      Number(value) < 1024 || Number(value) > 65535 || RESERVED_PORTS.has(Number(value))) {
    throw new Error('Browser regression tests require an isolated port (not 21031, 21033, 21039 or 21040).');
  }
  return String(Number(value));
}

/** Overrides inherited user data paths even when the shell points at a real workspace. */
export function createIsolatedBrowserTestEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const port = resolveBrowserTestPort(env.ESCAPEHATCH_TEST_PORT || env.PLAYWRIGHT_PORT);
  const dataHome = mkdtempSync(path.join(tmpdir(), 'escapehatch-browser-test-'));
  return {
    port,
    dataHome,
    serverEnv: {
      PORT: port,
      BASE_PATH: '/',
      HOST: '127.0.0.1',
      LOCALAPPDATA: dataHome,
      ESCAPEHATCH_DATA_HOME: dataHome,
      ESCAPEHATCH_PREFERENCES_FILE: path.join(dataHome, 'preferences.json'),
      ESCAPEHATCH_TRACKER_SNAPSHOT: path.join(dataHome, 'tracker.json'),
      ESCAPEHATCH_ALLOW_SYNTHETIC_ATS: '0',
      VITE_ESCAPEHATCH_SYNTHETIC_TEST_WORKSPACE: '1',
    },
  };
}
