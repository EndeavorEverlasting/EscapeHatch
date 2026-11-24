import { expect, test } from '@playwright/test';

test('recorded Indeed outcome survives listener outage and offers a distinct direct posting', async ({ page }) => {
  const job = { id: 'synthetic-completed', company: 'Example Company', role: 'Engineer',
    url: 'https://www.indeed.com/viewjob?jk=0123456789abcdef&from=search', status: 'applied',
    priority: 'normal', notes: '', nextAction: '', updatedAt: '2026-10-28T08:00:00Z' };
  const alias = { ...job, id: 'duplicate', status: 'saved', url: 'https://indeed.com/viewjob?jk=0123456789abcdef' };
  const next = { ...job, id: 'next', company: 'Next Company', status: 'saved',
    url: 'https://www.indeed.com/viewjob?jk=1111111111111111&from=search' };
  let interrupted = false;
  let failedPolls = 0;
  const mutations: string[] = [];
  await page.route('**/__escapehatch/tracker/**', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ ok: true, connection: 'NOT_CONNECTED', localGoogleAuthPresent: false, snapshot: null }) }));
  await page.route('**/__escapehatch/managed-assist/**', route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1)!;
    if (route.request().method() !== 'GET' && action !== 'requirements') mutations.push(action);
    if (action === 'status' && interrupted) { failedPolls++; return route.abort('connectionclosed'); }
    const body = action === 'status' ? { ok: true, state: 'submission_tracking_armed_existing_tab', browserOpen: true,
      currentPage: { opportunityId: job.id, applicationUrl: job.url, pageUrl: job.url },
      listeners: { recordingAnswers: false, savedAnswers: 0, opportunityId: job.id, error: '', submission: { state: 'PENDING', reason: 'Synthetic observation', receipt: null }, receipts: [] } }
      : action === 'preferences' ? { ok: true, preferences: { schema_version: 'escapehatch-application-question-preferences/v1', exported_at: new Date().toISOString(), preferences: {} } }
        : { ok: true, requireReview: true, package: { opportunityId: job.id, url: job.url, documents: {} } };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/');
  await page.evaluate(saved => localStorage.setItem('escape-hatch-applications', JSON.stringify(saved)), [job, alias, next]);
  await page.goto('/assist');
  const outcome = page.getByTestId('application-outcome');
  await expect(outcome).toBeVisible();
  interrupted = true;
  await expect.poll(() => failedPolls).toBeGreaterThan(0);
  await expect(outcome).toBeVisible();
  await expect(outcome).toContainText('Applied');
  await expect(page.getByTestId('next-indeed-posting')).toHaveAttribute('href', 'https://www.indeed.com/viewjob?jk=1111111111111111');
  await expect(page.getByTestId('next-indeed-posting')).toContainText('Next Company');
  expect(mutations).toEqual([]);
});
