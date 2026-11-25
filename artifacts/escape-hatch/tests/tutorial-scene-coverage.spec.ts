import { test, expect } from '@playwright/test';
import ontology from '../../../harness/contracts/feature-ontology.v1.json' with { type: 'json' };

test('every registered cockpit route provides a visible guide avatar and honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of Object.keys(ontology.journey.routes)) {
    await page.goto(route);
    const avatar = page.locator('.tutorial-scene-avatar').first();
    await expect(avatar, route).toBeVisible();
    await expect(avatar, route).toHaveCSS('animation-name', 'none');
  }
});

test('every canonical journey scene has an avatar in its branch preview', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const scene of Object.keys(ontology.journey.scenes)) {
    await page.goto('/journey?scene=' + encodeURIComponent(scene));
    const preview = page.getByTestId('journey-branch-preview');
    await expect(preview, scene).toBeVisible();
    await expect(preview.locator('.tutorial-scene-avatar'), scene).toBeVisible();
  }
});
