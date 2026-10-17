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
  await expect(page.getByTestId('managed-job-url')).toHaveValue(/google\.com\/about\/careers/);
  await page.getByTestId('button-managed-launch').click();
  await expect(page.getByText('Application opened — sign in if requested')).toBeVisible();
  await page.getByTestId('button-managed-fill').click();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('No fields filled');
  assertNeverSubmitted(seen);
});

function assertNeverSubmitted(actions: string[]) {
  expect(actions).toContain('launch');
  expect(actions).toContain('fill');
  expect(actions).not.toContain('submit');
  expect(actions).not.toContain('next');
}
