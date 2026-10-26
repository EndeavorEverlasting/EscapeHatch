import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const port = process.env.ESCAPEHATCH_TEST_PORT || process.env.PLAYWRIGHT_PORT || '21031';
export default defineConfig({
  testDir: './tests',
  testIgnore: 'workspace-startup.spec.ts',
  fullyParallel: false,
  timeout: 30_000,
  reporter: 'list',
  outputDir: process.env.ESCAPEHATCH_TEST_OUTPUT || 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : { ...(process.platform === 'win32' ? { channel: 'chrome' } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    env: { PORT: port, BASE_PATH: '/', HOST: '127.0.0.1' },
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
