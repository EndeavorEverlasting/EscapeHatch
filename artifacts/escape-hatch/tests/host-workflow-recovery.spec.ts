import { test, expect } from '@playwright/test';

test('stale companion is diagnosed in the app without an unavailable-popup instruction', async ({ page }) => {
  await page.route('**/__escapehatch/companion/status', route => route.fulfill({ json: { managed: true, state: 'OUTDATED', workspaceReviewAvailable: false, extensionRequiredForPreparation: false } }));
  await page.route('**/__escapehatch/companion/stage-update', route => route.fulfill({ json: { state: 'PACKAGE_STAGED_BROWSER_UPDATE_REQUIRED', sourceCommit: 'a'.repeat(40), extensionIdPreserved: true, browserDataChanged: false, installationVerified: false } }));
  await page.goto('/');
  const setup = page.getByTestId('companion-setup');
  await expect(setup.locator('summary')).toContainText('update available');
  await setup.locator('summary').click();
  await expect(setup).toContainText('older companion build');
  await expect(setup).not.toContainText('Open the EscapeHatch extension');
  await expect(setup.getByRole('link', { name: 'Continue in Browser assist' })).toHaveAttribute('href', '/assist');
  await setup.getByRole('button', { name: 'Prepare companion update' }).click();
  await expect(setup).toContainText('Chrome activation is still pending');
  await expect(setup).toContainText('browser data is unchanged');
  await expect(page.getByTestId('profile-puzzle-board')).toBeVisible();
});

test('failed host repair preserves a useful preparation path and never claims installation', async ({ page }) => {
  await page.route('**/__escapehatch/companion/status', route => route.fulfill({ json: { managed: true, state: 'OUTDATED' } }));
  await page.route('**/__escapehatch/companion/stage-update', route => route.fulfill({ status: 409, json: { error: 'unverified' } }));
  await page.goto('/');
  const setup = page.getByTestId('companion-setup'); await setup.locator('summary').click();
  await setup.getByRole('button', { name: 'Prepare companion update' }).click();
  await expect(setup).toContainText('could not verify');
  await expect(setup.getByRole('link', { name: 'Continue in Browser assist' })).toBeVisible();
  await expect(setup).not.toContainText('is current');
});


test('normal installed-host selection persists owner identity without any extension', async ({ request }) => {
  const current = await (await request.get('/__escapehatch/workspace/owner')).json();
  expect(current.extensionRequired).toBe(false);
  const selected = await request.post('/__escapehatch/workspace/owner', { headers: { 'x-escapehatch-workspace': '1', 'content-type': 'application/json' }, data: { selection: 'current-installed-workspace', expectedRevision: current.workspaceRevision } });
  expect(selected.ok()).toBe(true);
  const receipt = await selected.json();
  expect(receipt.state).toBe('OWNER_BOUND'); expect(receipt.factsApproved).toBe(false); expect(receipt.documentsApproved).toBe(false);
  const readback = await (await request.get('/__escapehatch/workspace/owner')).json();
  expect(readback.binding).toEqual(receipt.binding);
});
