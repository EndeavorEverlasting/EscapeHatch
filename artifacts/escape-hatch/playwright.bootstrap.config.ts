import { defineConfig } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ASSIST_ANSWERS_KEY } from './src/lib/assist-contract.ts';
import { emptyPreferences, normalizeQuestion } from './src/lib/application-preferences.ts';
import { emptyProfile, PROFILE_KEY, ANSWERS_KEY, APPLICATIONS_KEY } from './src/lib/storage.ts';

const dataHome = mkdtempSync(path.join(process.env.ESCAPEHATCH_BOOTSTRAP_TEST_HOME || tmpdir(), 'eh-bootstrap-browser-'));
const summary = { id: 'library-summary', title: 'Professional summary', category: 'Career story', content: 'Synthetic reviewed summary.', updatedAt: '2026-10-26T12:00:00Z' };
const preferences = emptyPreferences();
preferences.preferences['employment.sponsorship_required'] = { scope: 'profile_preference', source: 'user', value: 'Yes', updated_at: summary.updatedAt };
const question = 'What motivates your work?';
preferences.discovered_answers = { [normalizeQuestion(question)]: { question, value: 'Building useful things.', source: 'user', accepted: true, updated_at: summary.updatedAt } };
writeFileSync(path.join(dataHome, 'preferences.json'), JSON.stringify(preferences));
writeFileSync(path.join(dataHome, 'workspace.v1.json'), JSON.stringify({ schema: 'escapehatch-local-workspace/v1', values: {
  [APPLICATIONS_KEY]: [{ id: 'pending-job', company: 'Synthetic', role: 'Pending role', url: 'https://jobs.example.com/job/pending', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: summary.updatedAt }],
  [ANSWERS_KEY]: [summary],
  [ASSIST_ANSWERS_KEY]: [{ ...summary, id: 'assist-summary', scope: 'reusable', canonicalId: 'professional-summary' }],
  [PROFILE_KEY]: { ...emptyProfile, first_name: 'Synthetic', last_name: 'Recovery', email: 'synthetic@example.test' },
} }));
export default defineConfig({
  testDir: './tests', testMatch: 'workspace-startup.spec.ts', workers: 1, fullyParallel: false,
  outputDir: path.join(dataHome, 'browser-proof'), reporter: 'list',
  metadata: { dataHome },
  use: { baseURL: 'http://127.0.0.1:21039', headless: true, launchOptions: process.platform === 'win32' ? { channel: 'chrome' } : {} },
  webServer: ['21039', '21040'].map(port => ({
    command: 'npm run dev -- --host 127.0.0.1', url: `http://127.0.0.1:${port}/`, reuseExistingServer: false,
    env: { PORT: port, ESCAPEHATCH_DATA_HOME: dataHome, ESCAPEHATCH_PREFERENCES_FILE: path.join(dataHome, 'preferences.json'),
      ESCAPEHATCH_TRACKER_SNAPSHOT: path.join(dataHome, 'tracker.json'),
      ESCAPEHATCH_INSTANCE_ID: `bootstrap-proof-${port}`, ESCAPEHATCH_REPO_FINGERPRINT: 'b'.repeat(64),
      ESCAPEHATCH_SHUTDOWN_TOKEN: 'synthetic-test-only', ESCAPEHATCH_STARTED_AT_UTC: new Date().toISOString(),
      VITE_ESCAPEHATCH_SYNTHETIC_TEST_WORKSPACE: '1' },
  })),
});
