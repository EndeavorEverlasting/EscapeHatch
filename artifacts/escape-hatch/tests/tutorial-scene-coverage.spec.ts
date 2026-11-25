import { test, expect } from '@playwright/test';

test('every registered cockpit route provides a visible guide avatar and honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/', '/journey', '/sources', '/profile', '/answers', '/applications', '/materials', '/assist']) {
    await page.goto(route);
    const avatar = page.locator('.tutorial-scene-avatar').first();
    await expect(avatar, route).toBeVisible();
    await expect(avatar, route).toHaveCSS('animation-name', 'none');
  }
});
