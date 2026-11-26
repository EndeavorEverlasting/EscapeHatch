import { expect, test } from '@playwright/test';

type PreferenceRow = { scope: 'profile_preference'; source: 'user'; value: string; updated_at: string };
type StoredAnswers = {
  schema_version: 'escapehatch-application-question-preferences/v1';
  exported_at: string;
  preferences: Record<string, PreferenceRow>;
  recommendation_work_mode?: 'remote_only' | 'any';
  vpn_recovery_assist_enabled: boolean;
  application_privacy_acknowledgement_enabled: boolean;
  require_document_review?: boolean;
};

function fixture(): StoredAnswers {
  return {
    schema_version: 'escapehatch-application-question-preferences/v1',
    exported_at: '2026-01-01T00:00:00.000Z',
    preferences: {},
    vpn_recovery_assist_enabled: true,
    application_privacy_acknowledgement_enabled: false,
  };
}

test('first-run quiz saves reusable answers to managed private preference endpoint and never submits', async ({ page }) => {
  let persisted = fixture();
  let writes = 0;
  let submissions = 0;
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const request = route.request();
    const routePath = new URL(request.url()).pathname;
    if (routePath === '/__escapehatch/managed-assist/preferences' && request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, preferences: persisted, store: { exists: writes > 0, source: 'synthetic', preferenceStore: 'synthetic-private-store' } }) });
    }
    if (routePath === '/__escapehatch/managed-assist/preferences' && request.method() === 'POST') {
      expect(request.headers()['x-escapehatch-operator-action']).toBe('confirmed');
      const payload = request.postDataJSON() as { preferences: StoredAnswers };
      persisted = payload.preferences;
      writes++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, preferences: persisted }) });
    }
    if (routePath === '/__escapehatch/managed-assist/preferences/clear' && request.method() === 'POST') {
      persisted = fixture();
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (request.method() === 'POST' && /(?:submit|prepare|upload)/.test(routePath)) submissions++;
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false,"error":"synthetic_no_backend"}' });
  });

  await page.goto('/assist');
  const quiz = page.getByTestId('bootstrap-application-quiz');
  await expect(quiz).toBeVisible();
  await quiz.getByLabel('First name').fill('Sample');
  await quiz.getByLabel('Last name').fill('Applicant');
  await quiz.getByLabel('Email').fill('sample@example.test');
  await quiz.getByRole('button', { name: 'Continue to work preferences' }).click();
  await quiz.getByLabel('Which jobs should EscapeHatch recommend?').selectOption('remote_only');
  await quiz.getByRole('button', { name: 'Save quiz to my private profile' }).click();
  await expect(quiz).toHaveCount(0);
  expect(writes).toBe(1);
  expect(persisted.preferences['identity.first_name']?.value).toBe('Sample');
  expect(persisted.preferences['identity.email']?.value).toBe('sample@example.test');
  expect(persisted.recommendation_work_mode).toBe('remote_only');
  expect(persisted.require_document_review).toBe(true);
  expect(persisted.preferences['attestation.truth_accuracy']).toBeUndefined();
  expect(submissions).toBe(0);

  // Explicit Clear must erase the staged React quiz as well as the private disk snapshot.
  await page.getByRole('button', { name: 'Clear Preferences' }).click();
  await page.getByRole('button', { name: 'Confirm clear' }).click();
  await expect(quiz).toBeVisible();
  await expect(quiz.getByLabel('First name')).toHaveValue('');
  await expect(quiz.getByLabel('Email')).toHaveValue('');
  expect(submissions).toBe(0);
});

test('partially reviewed private answers prefill missing-essential quiz without rewriting known facts', async ({ page }) => {
  const persisted = fixture();
  persisted.preferences['identity.first_name'] = { scope: 'profile_preference', source: 'user', value: 'Reviewed', updated_at: persisted.exported_at };
  persisted.preferences['identity.email'] = { scope: 'profile_preference', source: 'user', value: 'reviewed@example.test', updated_at: persisted.exported_at };
  persisted.recommendation_work_mode = 'any';
  await page.route('**/__escapehatch/managed-assist/preferences', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, preferences: persisted, store: { exists: true, source: 'synthetic', preferenceStore: 'synthetic-private-store' } }),
  }));
  await page.goto('/assist');
  const quiz = page.getByTestId('bootstrap-application-quiz');
  await expect(quiz).toBeVisible();
  await expect(quiz.getByLabel('First name')).toHaveValue('Reviewed');
  await expect(quiz.getByLabel('Last name')).toHaveValue('');
  await expect(quiz.getByLabel('Email')).toHaveValue('reviewed@example.test');
  await quiz.getByLabel('Last name').fill('Person');
  await quiz.getByRole('button', { name: 'Continue to work preferences' }).click();
  await expect(quiz.getByLabel('Which jobs should EscapeHatch recommend?')).toHaveValue('any');
});
 
test('workspace contact defaults survive deferred private-store hydration on the profile route', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/__escapehatch/managed-assist/preferences', async route => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 404, body: '{}' });
    await gate;
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, preferences: fixture(), store: { exists: false, source: 'synthetic', preferenceStore: 'synthetic-private-store' } }) });
  });
  await page.goto('/profile');
  await page.getByTestId('input-first-name').fill('Workspace');
  await page.getByTestId('input-last-name').fill('Applicant');
  await page.getByTestId('input-profile-email').fill('workspace@example.test');
  await page.getByTestId('button-save-profile').click();
  release();
  const quiz = page.getByTestId('bootstrap-application-quiz');
  await expect(quiz).toBeVisible();
  await expect(quiz.getByLabel('First name')).toHaveValue('Workspace');
  await expect(quiz.getByLabel('Last name')).toHaveValue('Applicant');
  await expect(quiz.getByLabel('Email')).toHaveValue('workspace@example.test');
});
