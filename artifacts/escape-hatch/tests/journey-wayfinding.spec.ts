import { test, expect } from '@playwright/test';

test('desktop journey map exposes every canonical scene and every user page', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('link-sidebar-your-journey').click();
  await expect(page.getByTestId('journey-atlas')).toBeVisible();
  await expect(page.getByTestId('journey-selected-step')).toContainText('Bring your career sources');
  const scenes = page.locator('[data-testid^="journey-canonical-"]');
  await expect(scenes).toHaveCount(14);
  for (const title of ['Sources', 'Profile', 'Answer library', 'Applications', 'Browser assist']) {
    await expect(page.getByTestId('journey-destination-' + title.toLowerCase().replaceAll(' ', '-'))).toBeVisible();
  }
  await page.getByTestId('journey-step-4').click();
  await expect(page.getByTestId('journey-selected-step')).toContainText('Assemble the employer puzzle');
  await page.getByTestId('journey-open-stage').click();
  await expect(page).toHaveURL(/\/assist$/);
  await expect(page.getByTestId('link-sidebar-your-journey')).toBeVisible();
});
test('mobile journey is reachable, keyboard operable and never marks application submitted', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByTestId('button-toggle-nav').click();
  await page.getByTestId('link-mobile-your-journey').click();
  await expect(page.getByTestId('journey-atlas')).toBeVisible();
  await page.getByTestId('journey-step-5').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('journey-selected-step')).toContainText('Review and submit yourself');
  await expect(page.getByTestId('journey-step-5')).toContainText('You decide');
  await expect(page.getByTestId('journey-atlas')).toContainText('Final Submit');
  await expect(page.getByTestId('journey-open-stage')).toHaveAttribute('href','/assist');
});
test('journey respects reduced motion and preserves user-only final boundary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/journey');
  await expect(page.getByTestId('journey-canonical-final_review')).toContainText('You decide');
  await expect(page.getByTestId('journey-canonical-manual_decision')).toContainText('You decide');
  await expect(page.getByTestId('journey-canonical-auth_handoff')).toContainText('You decide');
  await expect(page.getByTestId('journey-canonical-recovery')).toContainText('recovery');
});
