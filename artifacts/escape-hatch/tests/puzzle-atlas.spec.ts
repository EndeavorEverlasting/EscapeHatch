import { test, expect } from '@playwright/test';

test('all ten puzzle families and three visual variations are selectable without changing user data', async ({ page }) => {
  await page.goto('/');
  const atlas = page.getByTestId('puzzle-atlas');
  await expect(atlas).toBeVisible();
  await expect(atlas.locator('.puzzle-atlas-card')).toHaveCount(10);
  await expect(page.getByTestId('puzzle-module-identity-hatch')).toHaveAttribute('aria-pressed', 'true');
  const chosen = page.getByTestId('puzzle-module-answer-constellation');
  await chosen.focus();
  await page.keyboard.press('Enter');
  await expect(chosen).toHaveAttribute('aria-pressed', 'true');
  await expect(atlas.getByRole('heading', { name: 'Answer Constellation' })).toBeVisible();
  await expect(atlas).toContainText('source coverage not fully measured');
  const variation = page.getByTestId('puzzle-atlas-variation');
  await expect(variation.locator('option')).toHaveCount(3);
  await variation.selectOption('focus');
  await expect(atlas.locator('.puzzle-atlas-stage')).toHaveAttribute('data-variation', 'focus');
  await expect(page.getByTestId('puzzle-atlas-action')).toHaveAttribute('href', '/answers');
  await page.getByTestId('puzzle-module-document-vault').click();
  await expect(page.getByTestId('puzzle-atlas-action')).toHaveAttribute('href', '/materials');
  await expect(page.getByTestId('puzzle-atlas-reward')).toHaveCount(0);
});

test('puzzle universe stays usable on narrow viewports and reduced-motion settings', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const atlas = page.getByTestId('puzzle-atlas');
  await expect(atlas).toBeVisible();
  await expect(atlas.getByTestId('puzzle-module-companion-link')).toBeAttached();
  await expect(atlas.locator('.puzzle-atlas-stage')).toHaveCSS('animation-name', 'none');
  await atlas.getByTestId('puzzle-module-companion-link').click();
  await expect(atlas.getByTestId('puzzle-atlas-action')).toHaveAttribute('href', '/assist');
  await expect(atlas.getByTestId('puzzle-atlas-status')).toContainText('source coverage not fully measured');
});
