import { expect, test } from '@playwright/test';

const job = { id: 'synthetic-completed', company: 'Example Company', role: 'Example Coordinator',
  url: 'https://synthetic.hiringplatform.com/processes/example', status: 'applied', priority: 'normal',
  notes: '', nextAction: 'Monitor employer response', updatedAt: '2026-10-28T08:00:00Z' };

for (const variant of ['pending', 'captured', 'wrong-sync', 'wrong-id', 'wrong-url', 'closed', 'unsubmitted'] as const) {
  test(`completed application outcome: ${variant}`, async ({ page }, testInfo) => {
    const mutations: string[] = [];
    const saved = { ...job, status: variant === 'closed' ? 'closed' : variant === 'unsubmitted' ? 'preparing' : 'applied' };
    const receipt = { opportunityId: job.id, sessionId: 'synthetic-session', attemptId: 'synthetic-attempt',
      applicationOrigin: 'https://synthetic.hiringplatform.com', applicationPath: '/questionnaires/456/people/example',
      opportunityPath: '/processes/example', observedAt: '2026-10-28T08:00:00Z',
      source: 'same_session_page_confirmation', evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT' };
    await page.route('**/__escapehatch/tracker/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, connection: 'NOT_CONNECTED', localGoogleAuthPresent: false, snapshot: null }) }));
    await page.route('**/__escapehatch/managed-assist/**', route => {
      const action = new URL(route.request().url()).pathname.split('/').at(-1)!;
      if (route.request().method() !== 'GET') mutations.push(action);
      const body = action === 'status' ? { ok: true, state: 'submission_tracking_armed_existing_tab', browserOpen: true,
        currentPage: { opportunityId: variant === 'wrong-id' ? 'other-job' : job.id, applicationUrl: variant === 'wrong-url' ? job.url + '-other' : job.url,
          pageUrl: 'https://synthetic.hiringplatform.com/questionnaires/456/people/example' },
        listeners: { recordingAnswers: false, savedAnswers: 0, opportunityId: job.id, error: '',
          submission: { state: ['captured', 'wrong-sync'].includes(variant) ? 'CONFIRMED' : 'PENDING', reason: 'Synthetic observation', receipt: ['captured', 'wrong-sync'].includes(variant) ? receipt : null }, receipts: [] },
        trackerSync: { opportunityId: variant === 'wrong-sync' ? 'unrelated-opportunity' : job.id, state: 'SYNCED', pending: 0, synced: 1, authRequired: 0, conflicts: 0, retryRequired: 0 } }
        : action === 'preferences' ? { ok: true, preferences: { schema_version: 'escapehatch-application-question-preferences/v1', exported_at: new Date().toISOString(), preferences: {} } }
          : { ok: true, requireReview: true, package: { opportunityId: job.id, url: job.url, documents: {} } };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/');
    await page.evaluate(saved => localStorage.setItem('escape-hatch-applications', JSON.stringify([saved])), saved);
    await page.goto('/assist');
    const outcome = page.getByTestId('application-outcome');
    if (['pending', 'wrong-id', 'wrong-url', 'closed', 'unsubmitted'].includes(variant)) {
      await expect(page.getByTestId('managed-browser-assist')).toBeVisible();
      await expect(outcome).toHaveCount(0);
      if (variant === 'pending') await expect(page.getByTestId('unverified-applied-status')).toBeVisible();
      expect(mutations).toEqual([]);
      return;
    }
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText('Example Company');
    await expect(outcome).toContainText('Captured in this session');
    await expect(outcome).toContainText(variant === 'wrong-sync'
      ? 'Not verified for this application' : 'Google Sheets readback verified for this job');
    await expect(page.getByTestId('button-managed-fill')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('outcome-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(outcome.getByRole('button', { name: 'Choose another job' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('outcome-mobile.png'), fullPage: true });
    await outcome.getByRole('button', { name: 'Choose another job' }).click();
    await expect(page.getByTestId('managed-browser-assist')).toBeVisible();
    // Let an actual polling cycle return the old binding: dismissal must persist.
    await expect(page.getByTestId('managed-browser-feedback')).toContainText('Choose a saved job');
    await page.waitForTimeout(1800);
    await expect(outcome).toHaveCount(0);
    expect(mutations).toEqual([]);
  });
}
