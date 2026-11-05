import { test, expect } from '@playwright/test';

test('saved local profile signals reveal the matching original-art slices; missing ones remain covered', async ({ page }) => {
  await page.goto('/profile');
  await page.getByTestId('input-first_name').fill('Synthetic');
  await page.getByTestId('input-last_name').fill('Example');
  await page.getByTestId('input-email').fill('synthetic@example.invalid');
  await page.getByTestId('button-save-profile').click();
  await page.getByTestId('link-sidebar-today').click();
  await expect(page.getByTestId('profile-puzzle-piece-first_name')).toHaveAttribute('data-piece-state', 'saved');
  const slices = page.getByTestId('profile-puzzle-gallery').locator('.profile-gallery-art-overlay span');
  await expect(slices).toHaveCount(10);
  await expect(slices.nth(0)).toHaveAttribute('data-state', 'saved');
  await expect(slices.nth(0)).toHaveCSS('background-image', /identity-hatch-v1.png/);
  await expect(slices.nth(3)).toHaveAttribute('data-state', 'missing');
  await expect(slices.nth(3)).toHaveCSS('background-image', 'none');
  await expect(page.getByTestId('profile-puzzle-reward')).toContainText('unlocks when');
});
