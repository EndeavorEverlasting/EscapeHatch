import { expect, test } from '@playwright/test';

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
  expect(actions).toContain('fill');
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
