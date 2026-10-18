import { expect, test } from '@playwright/test';
import { trackerOpportunityId } from '../src/lib/tracker-bridge';

test('cockpit owns Launch, Fill and Attach without a Chrome extension', async ({ page }) => {
  const seen: string[] = [];
  await page.route('**/__escapehatch/managed-assist/**', async (route) => {
    const url = new URL(route.request().url());
    const action = url.pathname.split('/').at(-1) || '';
    seen.push(action);
    const body = action === 'status'
      ? { ok: true, state: 'idle', browserOpen: false }
      : { ok: true, state: action === 'launch' ? 'application_open_review_required' :
          action === 'fill' ? 'fields_filled_review_required' : 'attachments_staged_review_required',
          filled: [], skipped: [], attachments: { resume: 'attached_to_input_review_required' } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/assist');
  await expect(page.getByTestId('managed-browser-assist')).toBeVisible();
  await expect(page.getByTestId('managed-job-url')).toHaveValue('');
  await page.getByTestId('managed-job-url').fill('https://jobs.ashbyhq.com/synthetic/entry');
  await page.getByTestId('button-managed-launch').click();
  await expect(page.getByText('Application opened — sign in if requested')).toBeVisible();
  await page.getByTestId('button-managed-fill').click();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('No fields filled');
  await page.getByTestId('managed-browser-assist').locator('input[type="file"]').first().setInputFiles({
    name: 'synthetic-resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\\nfixture'),
  });
  await page.getByTestId('button-managed-attach').click();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('resume: attached to input review required');
  expect(seen).toContain('attach');
  assertNeverSubmitted(seen);
});

function assertNeverSubmitted(actions: string[]) {
  expect(actions).toContain('launch');
  // Landing and login pages MUST NOT attempt Fill. The action order is checked
  // separately in tests that actually reach an application form.
  expect(actions).not.toContain('submit');
  expect(actions).not.toContain('next');
}

test('Home hands the ready opportunity into managed Chrome instead of reopening a submitted job', async ({ page }) => {
  const readyUrl = 'https://jobs.ashbyhq.com/synthetic/ready';
  const submittedUrl = 'https://jobs.ashbyhq.com/synthetic/submitted';
  const now = '2026-10-18T12:00:00Z';
  const apps = [
    { id: 'tracker-submitted', company: 'Synthetic Submitted', role: 'Old Role',
      url: submittedUrl, status: 'applied', priority: 'high', notes: 'Tracker row 10 · provider status: Submitted',
      nextAction: 'Do not reapply', updatedAt: now },
    { id: 'tracker-ready', company: 'Synthetic Next', role: 'Ready Role',
      url: readyUrl, status: 'saved', priority: 'high',
      notes: 'Tracker row 11 · provider status: Ready to Apply\\nApplied? unchecked',
      nextAction: 'Prepare application', updatedAt: now },
  ];
  await page.route('**/__escapehatch/managed-assist/**', async (route) => {
    const action = route.request().url().split('/').at(-1);
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, state: action === 'launch' ? 'application_open_review_required' : 'idle', browserOpen: false }) });
  });
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('escape-hatch-applications', JSON.stringify(value)), apps);
  await page.reload();
  await expect(page.getByTestId('home-next-company-role')).toContainText('Synthetic Next');
  await page.getByTestId('link-prepare-next').click();
  await expect(page.getByTestId('managed-job-url')).toHaveValue(readyUrl);
  await expect(page.getByLabel('Saved opportunity')).toHaveValue('tracker-ready');
  const launched = page.waitForRequest('**/__escapehatch/managed-assist/launch');
  await page.getByTestId('button-managed-launch').click();
  const body = (await launched).postDataJSON();
  expect(body).toEqual({ url: readyUrl, opportunityId: 'tracker-ready' });
  await expect(page.getByText('Application opened — sign in if requested')).toBeVisible();
  await page.goto('/assist?opportunityId=tracker-submitted');
  await expect(page.getByTestId('managed-job-url')).toHaveValue(readyUrl);
  await expect(page.getByTestId('managed-browser-assist').locator('option[value="tracker-submitted"]')).toHaveCount(0);
});

test('Launch automatically fills permitted fields when a verified application form opens', async ({ page }) => {
  const actions: string[] = [];
  await page.route('**/__escapehatch/managed-assist/**', async (route) => {
    const action = route.request().url().split('/').at(-1) || '';
    actions.push(action);
    const data = action === 'status' ? { ok: true, state: 'idle', browserOpen: false } :
      action === 'launch' ? { ok: true, state: 'application_form_open_review_required' } :
      action === 'fill' ? { ok: true, state: 'fields_filled_review_required', filled: ['first_name'], skipped: ['unknown_question'] } :
      { ok: false, error: 'unexpected_action' };
    await route.fulfill({ status: data.ok ? 200 : 422, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/assist');
  await page.getByTestId('managed-job-url').fill('https://jobs.ashbyhq.com/synthetic/autofill');
  await page.getByTestId('button-managed-launch').click();
  await expect(page.getByText('Known fields filled — review the page')).toBeVisible();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Filled: first_name');
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Skipped: unknown_question');
  expect(actions.filter((value) => ['launch', 'fill', 'attach', 'prepare'].includes(value))).toEqual(['launch', 'fill']);
  assertNeverSubmitted(actions);
});

test('Launch does not autofill the login or posting page', async ({ page }) => {
  const actions: string[] = [];
  await page.route('**/__escapehatch/managed-assist/**', async (route) => {
    const action = route.request().url().split('/').at(-1) || '';
    actions.push(action);
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, state: action === 'launch' ? 'application_open_review_required' : 'idle' }) });
  });
  await page.goto('/assist');
  await page.getByTestId('managed-job-url').fill('https://jobs.ashbyhq.com/synthetic/login');
  await page.getByTestId('button-managed-launch').click();
  expect(actions.filter((value) => ['launch', 'fill', 'attach', 'prepare'].includes(value))).toEqual(['launch']);
  assertNeverSubmitted(actions);
});

function syntheticSnapshot(status: 'Ready to Apply' | 'Submitted') {
  const row = {
    sheetRow: 32, company: 'Thyme Care', role: 'Product Operations Lead',
    status, appliedCheckbox: status === 'Submitted', priority: 'High',
    applyUrl: 'https://jobs.ashbyhq.com/thyme-care/synthetic-position',
  };
  return {
    row,
    snapshot: {
      schema: 'escapehatch/tracker-snapshot/v1',
      provider: 'synthetic', spreadsheetId: 'synthetic', sheetName: 'Applications',
      capturedAtUtc: new Date().toISOString(), contentDigest: 'synthetic',
      authPath: 'fixture', localGoogleAuthPresent: false,
      metrics: {}, applications: [row],
    },
  };
}

test('one explicit Home click opens the verified Thyme Care job and fills approved fields exactly once', async ({ page }) => {
  const { row, snapshot } = syntheticSnapshot('Ready to Apply');
  const actions: string[] = [];
  const launches: Array<{ url: string; opportunityId: string }> = [];
  await page.route('**/__escapehatch/tracker/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ connection: 'CONNECTED', snapshot }) }));
  await page.route('**/__escapehatch/managed-assist/**', async (route) => {
    const action = route.request().url().split('/').at(-1) || '';
    actions.push(action);
    if (action === 'launch') launches.push(route.request().postDataJSON());
    const result = action === 'status' ? { ok: true, state: 'idle', browserOpen: false } :
      action === 'launch' ? { ok: true, state: 'application_form_open_review_required' } :
      action === 'fill' ? { ok: true, state: 'fields_filled_review_required', filled: ['first_name'], skipped: ['unknown_question'] } :
      { ok: false, error: 'unexpected_action' };
    await route.fulfill({ status: result.ok ? 200 : 422, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.goto('/');
  await expect(page.getByTestId('home-next-company-role')).toContainText('Thyme Care');
  await expect(page.getByTestId('link-prepare-next')).toContainText('Launch & fill in managed Chrome');
  await page.getByTestId('link-prepare-next').click();
  await expect(page.getByTestId('managed-job-url')).toHaveValue(row.applyUrl);
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Filled: first_name');
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Skipped: unknown_question');
  expect(launches).toEqual([{ url: row.applyUrl, opportunityId: trackerOpportunityId(row) }]);
  expect(actions.filter((action) => ['launch', 'fill', 'prepare', 'attach'].includes(action))).toEqual(['launch', 'fill']);
  assertNeverSubmitted(actions);
  await page.reload();
  await expect(page.getByTestId('managed-job-url')).toHaveValue(row.applyUrl);
  expect(launches).toHaveLength(1); // Reload and direct URLs do not carry new user consent.
});

test('one-click authorization fails closed when the employer was submitted after Home loaded', async ({ page }) => {
  const ready = syntheticSnapshot('Ready to Apply');
  const submitted = syntheticSnapshot('Submitted');
  let reads = 0;
  const actions: string[] = [];
  await page.route('**/__escapehatch/tracker/status', (route) => {
    reads += 1;
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ connection: 'CONNECTED', snapshot: reads === 1 ? ready.snapshot : submitted.snapshot }) });
  });
  await page.route('**/__escapehatch/managed-assist/**', (route) => {
    actions.push(route.request().url().split('/').at(-1) || '');
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, state: 'idle', browserOpen: false }) });
  });
  await page.goto('/');
  await expect(page.getByTestId('home-next-company-role')).toContainText('Thyme Care');
  await page.getByTestId('link-prepare-next').click();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Automatic launch paused');
  expect(actions).not.toContain('launch');
  expect(actions).not.toContain('fill');
  expect(actions).not.toContain('submit');
  expect(actions).not.toContain('next');
});

test('reusable role list and binary dropdowns persist through the preferences API', async ({ page }) => {
  let saved: Record<string, unknown> = { schema_version: 'escapehatch-application-question-preferences/v1', exported_at: new Date().toISOString(), preferences: {} };
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    if (action === 'preferences' && route.request().method() === 'POST') saved = route.request().postDataJSON().preferences;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(action === 'preferences' ? { ok: true, preferences: saved } : { ok: true, state: 'idle', browserOpen: true, recorded: [] }) });
  });
  await page.goto('/assist');
  await page.evaluate(() => localStorage.setItem('escape-hatch-applications', JSON.stringify([{ id: 'synthetic-title', company: 'Synthetic', role: 'Synthetic Role', url: 'https://example.com/apply', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() }])));
  await page.reload();
  await page.getByLabel('Saved opportunity').selectOption('synthetic-title');
  await page.getByRole('button', { name: 'Add selected role to my job titles: Synthetic Role', exact: true }).click();
  await expect(page.getByLabel('job title', { exact: true })).toHaveValue('Synthetic Role');
  await expect(page.getByLabel('Salutation (Mr., Ms., Dr.)')).toHaveValue('');
  await page.getByLabel('have you ever served in the us armed forces', { exact: true }).selectOption('No');
  await page.getByLabel('Are you currently a US Citizen?', { exact: true }).selectOption('Yes');
  await page.getByLabel('gender', { exact: true }).selectOption('Male');
  await page.getByLabel('race / ethnicity', { exact: true }).selectOption('Hispanic or Latino');
  await page.getByRole('button', { name: 'Save Preferences', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Preferences saved on this computer' })).toBeVisible();
  expect(saved.job_titles).toEqual(['Synthetic Role']);
  expect((saved.preferences as Record<string, { value: string }>)['eeo.gender'].value).toBe('Male');
  expect((saved.preferences as Record<string, { value: string }>)['eeo.race_ethnicity'].value).toBe('Hispanic or Latino');
  await page.reload();
  await expect(page.getByLabel('job title', { exact: true })).toHaveValue('Synthetic Role');
  await expect(page.getByLabel('have you ever served in the us armed forces', { exact: true })).toHaveValue('No');
  await page.getByLabel('Record my veteran/service answers from this managed application').check();
  await expect(page.getByRole('status').filter({ hasText: 'Listening for a recognized' })).toBeVisible();
  await page.getByLabel('Record my veteran/service answers from this managed application').uncheck();
});
