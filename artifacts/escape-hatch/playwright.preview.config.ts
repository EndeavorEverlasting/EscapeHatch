import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

export default defineConfig({
  ...base, testMatch: 'standalone-startup.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:21040' },
  webServer: {
    command: 'npm run build && npm run serve -- --host 0.0.0.0 --port 21040',
    url: 'http://127.0.0.1:21040', reuseExistingServer: false,
    timeout: 120_000,
  },
});
