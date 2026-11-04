import { defineConfig } from '@playwright/test';
import { createIsolatedBrowserTestEnvironment } from './browser-test-isolation.ts';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
// Local interaction tests must not wait on third-party font network availability.
// Product typography stays unchanged; these tests exercise the CSS fallback stack.
const browserArgs = ['--no-sandbox', '--disable-dev-shm-usage',
  '--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND, MAP fonts.gstatic.com ~NOTFOUND'];
const { port, serverEnv } = createIsolatedBrowserTestEnvironment();
export default defineConfig({
  testDir: './tests',
  testIgnore: 'workspace-startup.spec.ts',
  metadata: { syntheticWorkspace: true },
  fullyParallel: false,
  timeout: 30_000,
  reporter: 'list',
  outputDir: process.env.ESCAPEHATCH_TEST_OUTPUT || 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    launchOptions: executablePath ? { executablePath, args: browserArgs } : { ...(process.platform === 'win32' ? { channel: 'chrome' } : {}), args: browserArgs },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    env: serverEnv,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
