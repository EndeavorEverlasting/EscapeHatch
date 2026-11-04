import { test, expect } from '@playwright/test';
import registry from '../../../contracts/application-journey-scenes.v1.json' with { type: 'json' };

test('desktop journey map exposes every canonical scene and every user page', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('link-sidebar-your-journey').click();
  await expect(page.getByTestId('journey-atlas')).toBeVisible();
  await expect(page.getByTestId('journey-selected-step')).toContainText('Bring your career sources');
  const scenes = page.locator('[data-testid^="journey-canonical-"]');
  await expect(scenes).toHaveCount(registry.scenes.length);
  await expect(page.getByTestId('journey-setup')).toBeVisible();
  await expect(page.getByTestId('journey-download-setup')).toHaveAttribute('href', /Get-EscapeHatch[.]cmd$/);
  await expect(page.getByTestId('journey-bundled-package')).toHaveAttribute('href', /windows-preview-package[.]yml$/);

  for (const title of ['Sources', 'Profile', 'Answer library', 'Applications', 'Materials', 'Browser assist']) {
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
  await expect(page.getByTestId('journey-atlas')).toContainText(/final Submit stay in your control/i);
  await expect(page.getByTestId('journey-open-stage')).toHaveAttribute('href','/assist');
});
test('journey respects reduced motion and preserves user-only final boundary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/journey');
  await expect(page.getByTestId('journey-canonical-final_review')).toContainText('You decide');
  await expect(page.getByTestId('journey-canonical-manual_decision')).toContainText('You decide');
  await expect(page.getByTestId('journey-canonical-auth_handoff')).toContainText('You decide');
  await expect(page.getByTestId('journey-canonical-recovery')).toContainText('recovery');
  const piece = page.getByTestId('journey-step-5');
  await piece.focus();
  await page.keyboard.press('Space');
  await piece.hover();
  await expect(piece).toBeFocused();
  await expect(piece).toHaveAttribute('aria-pressed', 'true');
  await expect(piece).toHaveCSS('transition-duration', '0s');
  await expect(piece).toHaveCSS('transform', 'none');
});


test('scene inspection preserves keyboard focus and private state until a destination is opened', async ({ page }) => {
  await page.goto('/journey');
  const piece = page.getByTestId('journey-step-3');
  const saved = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  await piece.focus();
  await page.keyboard.press('Space');
  await expect(piece).toHaveAttribute('aria-pressed', 'true');
  await expect(piece).toBeFocused();
  await expect(piece).toHaveAttribute('aria-controls', 'journey-scene-inspection');
  await expect(page.locator('#journey-scene-inspection [aria-live="polite"]')).toContainText('Select an opportunity');
  await page.keyboard.press('Enter');
  await expect(piece).toBeFocused();
  await expect(page).toHaveURL(/\/journey$/);
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(saved);
  await expect(page.getByTestId('journey-setup')).toContainText('does not require an extension');
  await expect(page.getByTestId('journey-setup')).toContainText('unsigned previews');
  await expect(page.getByTestId('journey-destination-materials')).toHaveAttribute('href', '/materials');
});

test('journey material scenes fit narrow and zoomed layouts', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/journey');
  const atlas = page.getByTestId('journey-atlas');
  await atlas.screenshot({ path: testInfo.outputPath('journey-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await atlas.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await atlas.screenshot({ path: testInfo.outputPath('journey-mobile.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await atlas.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.getByTestId('journey-open-stage')).toBeVisible();
});
