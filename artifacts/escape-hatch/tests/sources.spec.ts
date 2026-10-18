import { expect, test } from '@playwright/test';

test('local source approval reaches the same candidate and opportunity in Assist after reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('link-sidebar-sources')).toBeVisible();
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('escape-hatch-applications', JSON.stringify([{ id: 'synthetic-opportunity', company: 'Synthetic Company', role: 'Synthetic Engineer', url: '', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: '2026-10-18T00:00:00Z' }]));
  });
  await page.goto('/sources');
  await expect(page.getByRole('heading', { name: 'Sources & identity' })).toBeVisible();
  await expect(page.getByText('Google connection is unavailable', { exact: false })).toBeVisible();
  await page.getByLabel('Résumé source').setInputFiles({ name: 'synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic Candidate\nsynthetic@example.invalid\nSummary\nBuilds deterministic tools.') });
  await expect(page.getByRole('heading', { name: 'Review synthetic.txt' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-profile') ?? '{}').email ?? '')).toBe('');
  await page.getByLabel('Opportunity', { exact: true }).selectOption('synthetic-opportunity');
  await page.getByRole('checkbox').first().check();
  const email = page.locator('label').filter({ hasText: 'contact / email' }).getByRole('checkbox');
  await email.check();
  await page.getByRole('button', { name: 'Approve selected claims' }).click();
  await expect(page.getByTestId('source-binding')).toContainText('Synthetic Engineer');
  await page.getByRole('link', { name: 'Continue to application assist' }).click();
  await expect(page.getByTestId('source-binding')).toContainText('synthetic.txt');
  await expect(page.getByTestId('source-binding')).toContainText('unverified');
  await page.reload();
  await expect(page.getByTestId('source-binding')).toContainText('synthetic.txt');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-assist-profile')!).contact.email)).toBe('synthetic@example.invalid');
  await page.goto('/sources');
  await page.getByRole('button', { name: 'Forget source bindings' }).click();
  await expect(page.getByTestId('source-binding')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-profile')!).email)).toBe('synthetic@example.invalid');
});

test('empty read cannot approve a source or alter candidate state', async ({ page }) => {
  await page.goto('/sources');
  const before = await page.evaluate(() => localStorage.getItem('escape-hatch-profile'));
  await page.getByLabel('Résumé source').setInputFiles({ name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.from(' ') });
  await expect(page.getByRole('status').filter({ hasText: 'could not be read' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve selected claims' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('escape-hatch-profile'))).toBe(before);
});

test('Sources can directly launch the next fresh verified application through EscapeHatch, without attaching unapproved PDFs', async ({ page }) => {
  const nextUrl = 'https://jobs.ashbyhq.com/thyme-care/synthetic-source';
  const snapshot = {
    schema: 'escapehatch/tracker-snapshot/v1', provider: 'synthetic',
    spreadsheetId: 'sheet', sheetName: 'Applications', contentDigest: 'synthetic',
    capturedAtUtc: new Date().toISOString(), authPath: 'fixture',
    localGoogleAuthPresent: false, metrics: {},
    applications: [{
      sheetRow: 32, company: 'Thyme Care', role: 'Product Operations Lead',
      status: 'Ready to Apply', appliedCheckbox: false, priority: 'High', applyUrl: nextUrl,
    }],
  };
  const actions: string[] = [];
  await page.route('**/__escapehatch/tracker/status', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ connection: 'CONNECTED', snapshot }),
  }));
  await page.route('**/__escapehatch/managed-assist/**', (route) => {
    const action = route.request().url().split('/').at(-1) || '';
    actions.push(action);
    const state = action === 'launch' ? 'application_form_open_review_required' :
      action === 'fill' ? 'fields_filled_review_required' : 'idle';
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, state, browserOpen: false,
        filled: action === 'fill' ? ['email'] : [], skipped: [] }) });
  });
  await page.goto('/sources');
  await expect(page.getByTestId('sources-launch-next')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Next managed application' })).toContainText('Thyme Care');
  await expect(page.getByRole('region', { name: 'Next managed application' })).toContainText('files still require your review');
  await page.getByTestId('sources-launch-next').click();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Filled: email');
  expect(actions.filter(action => ['launch', 'fill', 'attach', 'prepare'].includes(action))).toEqual(['launch', 'fill']);
  expect(actions).not.toContain('submit');
});
