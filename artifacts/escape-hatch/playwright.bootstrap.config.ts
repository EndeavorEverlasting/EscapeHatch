import { defineConfig } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { emptyProfile, PROFILE_KEY } from './src/lib/storage.ts';

const dataHome = process.env.ESCAPEHATCH_BOOTSTRAP_TEST_HOME || mkdtempSync(path.join(tmpdir(), 'eh-bootstrap-browser-'));
writeFileSync(path.join(dataHome, 'workspace.v1.json'), JSON.stringify({ schema: 'escapehatch-local-workspace/v1', values: {
  [PROFILE_KEY]: { ...emptyProfile, first_name: 'Synthetic', last_name: 'Recovery', email: 'synthetic@example.test' },
} }));
export default defineConfig({
  testDir: './tests', testMatch: 'workspace-startup.spec.ts', workers: 1, fullyParallel: false,
  outputDir: path.join(dataHome, 'browser-proof'), reporter: 'list',
  metadata: { dataHome },
  use: { baseURL: 'http://127.0.0.1:21039', headless: true, launchOptions: process.platform === 'win32' ? { channel: 'chrome' } : {} },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:21039/', reuseExistingServer: false,
    env: { PORT: '21039', ESCAPEHATCH_DATA_HOME: dataHome, ESCAPEHATCH_PREFERENCES_FILE: path.join(dataHome, 'preferences.json'),
      ESCAPEHATCH_TRACKER_SNAPSHOT: path.join(dataHome, 'tracker.json'),
      ESCAPEHATCH_INSTANCE_ID: 'bootstrap-proof', ESCAPEHATCH_REPO_FINGERPRINT: 'b'.repeat(64),
      ESCAPEHATCH_SHUTDOWN_TOKEN: 'synthetic-test-only', ESCAPEHATCH_STARTED_AT_UTC: new Date().toISOString() },
  },
});
