import { test, expect } from '@playwright/test';

test('standalone app mounts without requesting private workspace data', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/__escapehatch/workspace')) requests.push(request.url()); });
  await page.goto('/profile');
  await expect(page.locator('meta[name="escapehatch-runtime"]')).toHaveAttribute('content', 'standalone');
  await expect(page.getByTestId('input-first_name')).toBeVisible();
  await page.getByTestId('input-first_name').fill('Standalone');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('input-first_name')).toHaveValue('Standalone');
  expect(requests).toEqual([]);
});

test('standalone localhost entry remains usable', async ({ page, baseURL }) => {
  const local = new URL(baseURL!); local.hostname = 'localhost';
  await page.goto(new URL('/profile', local).href);
  await expect(page.getByTestId('input-first_name')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recover your workspace.' })).not.toBeVisible();
});
