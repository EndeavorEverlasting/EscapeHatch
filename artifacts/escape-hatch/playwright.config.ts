import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  timeout: 30_000,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:21031',
    headless: true,
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : { args: ['--no-sandbox', '--disable-dev-shm-usage'] },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    env: { PORT: '21031', BASE_PATH: '/', HOST: '127.0.0.1' },
    url: 'http://127.0.0.1:21031/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
