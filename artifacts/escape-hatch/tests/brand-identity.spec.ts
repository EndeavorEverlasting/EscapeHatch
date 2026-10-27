import { test, expect } from '@playwright/test';

test('mascot image renders in the cockpit shell', async ({ page }) => {
  await page.goto('/');
  const img = page.getByTestId('image-sidebar-mascot');
  await expect(img).toBeVisible();
  expect(await img.evaluate((node: HTMLImageElement) => node.naturalWidth > 0)).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByTestId('image-mobile-mascot')).toBeVisible();
});
