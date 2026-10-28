import { expect, test } from '@playwright/test';
import { reconcileSubmissionReceipts } from '../src/lib/submission-reconciliation';
import type { Application } from '../src/lib/storage';

const job: Application = { id: 'synthetic-evidence-edit', company: 'Example', role: 'Coordinator',
  url: 'https://jobs.ashbyhq.com/example/a', status: 'preparing', priority: 'normal', notes: '', nextAction: 'Review', updatedAt: '2026-01-01T00:00:00Z' };
const [confirmed] = reconcileSubmissionReceipts([job], [{ opportunityId: job.id, sessionId: 'synthetic-session', attemptId: 'synthetic-attempt',
  applicationOrigin: 'https://jobs.ashbyhq.com', applicationPath: '/example/a/application', observedAt: '2026-01-02T00:00:00Z',
  source: 'same_session_page_confirmation', evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT' }]);

test.beforeEach(async ({ page }) => {
  await page.route('**/__escapehatch/tracker/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, connection: 'NOT_CONNECTED', snapshot: null }) }));
});

test('recorded evidence stays bound during user edits and reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(app => localStorage.setItem('escape-hatch-applications', JSON.stringify([app])), confirmed);
  await page.goto('/applications');
  await page.getByTestId('button-edit-application-' + job.id).click();
  await page.getByRole('textbox', { name: /^Job link/ }).fill('https://jobs.ashbyhq.com/example/other');
  await page.getByTestId('button-save-application').click();
  await expect(page.getByText('This record has application evidence. Add a separate opportunity for a different job link.')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-applications')!)[0].url)).toBe(job.url);
  await page.getByRole('textbox', { name: /^Job link/ }).fill(job.url);
  await page.getByRole('textbox', { name: 'Next action', exact: true }).fill('Review the next assessment');
  await page.getByTestId('button-save-application').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Review the next assessment', { exact: false })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-applications')!)[0]);
  expect(stored.events).toHaveLength(1);
  expect(stored.submissionEvidence.attemptId).toBe('synthetic-attempt');
});

test('tracker identity conflicts have a visible recovery action', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(app => localStorage.setItem('escape-hatch-applications', JSON.stringify([app])), { ...confirmed, reconciliationConflict: 'opportunity_url_changed' });
  await page.goto('/applications');
  await expect(page.getByRole('alert')).toContainText('Your original opportunity and evidence were preserved');
  await expect(page.getByRole('alert')).toContainText('Check the tracker link');
});
