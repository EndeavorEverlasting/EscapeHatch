import { test, expect } from '@playwright/test';

test('Identity Hatch artwork, gallery selection and rewards preserve user data', async ({ page }) => {
  await page.goto('/');
  const gallery = page.getByTestId('profile-puzzle-gallery');
  await expect(gallery).toBeVisible();
  const art = page.getByTestId('profile-puzzle-artwork');
  await expect(art).toBeVisible();
  await expect(art).toHaveAttribute('src', '/puzzles/identity-hatch-v1.png');
  await expect.poll(() => art.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1448);
  await expect(page.getByTestId('profile-puzzle-gallery-count')).toContainText('of 10 profile pieces');
  await expect(page.getByTestId('profile-puzzle-reward')).toContainText('unlocks when');
  const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  await page.getByTestId('profile-puzzle-set-select').selectOption('classic-board-v1');
  await expect(page.getByTestId('profile-puzzle-classic')).toBeVisible();
  await expect(art).toHaveCount(0);
  await expect(page.getByTestId('profile-puzzle-gallery-count')).toContainText('of 10 profile pieces');
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(before);
  await page.getByTestId('profile-puzzle-set-select').selectOption('identity-hatch-v1');
  await expect(page.getByTestId('profile-puzzle-artwork')).toBeVisible();
});

test('Puzzle gallery remains contained at 320px and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  const gallery = page.getByTestId('profile-puzzle-gallery');
  await expect(gallery).toBeVisible();
  expect(await gallery.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.getByTestId('profile-puzzle-set-select')).toBeVisible();
});
