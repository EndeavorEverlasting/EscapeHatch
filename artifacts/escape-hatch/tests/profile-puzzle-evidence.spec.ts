import { expect, test } from '@playwright/test';
import { emptyPreferences } from '../src/lib/application-preferences';

// Synthetic isolated-workspace evidence only; no applicant values or employer writes.
test('evidence slots remain unknown when recovery is unavailable and keyboard inspection is inert', async ({ page }) => {
  await page.route('**/__escapehatch/managed-assist/preferences', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  const board = page.getByTestId('profile-puzzle-board');
  await expect(board.locator('.profile-puzzle-tile')).toHaveCount(10);
  await expect(page.getByTestId('profile-puzzle-coverage')).toHaveText('Coverage not measured');
  const summary = page.getByTestId('profile-puzzle-piece-professional-summary');
  await expect(summary).toHaveAttribute('data-piece-state', 'unmeasured');
  const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  await summary.focus();
  await page.keyboard.press('Space');
  await expect(summary).toHaveAttribute('aria-pressed', 'true');
  await expect(summary).toBeFocused();
  await expect(page.getByTestId('profile-puzzle-selection')).toContainText('not measured');
  await expect(page).toHaveURL(/\/$/);
  await page.keyboard.press('Enter');
  await expect(summary).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(before);
  await expect(board).toContainText('a complete board never means ready to submit');
});

test('conflicting career pieces request review without exposing private content or losing opportunity focus', async ({ page }) => {
  await page.route('**/__escapehatch/managed-assist/preferences', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ preferences: emptyPreferences() }) }));
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('escape-hatch-answers', JSON.stringify([
      { id: 'synthetic-a', title: 'Professional summary', category: 'Career story', content: 'PRIVATE_SYNTHETIC_STORY_A', updatedAt: '2026-11-04T12:00:00Z' },
      { id: 'synthetic-b', title: 'Professional summary', category: 'Career story', content: 'PRIVATE_SYNTHETIC_STORY_B', updatedAt: '2026-11-04T13:00:00Z' },
    ]));
    localStorage.setItem('escape-hatch-applications', JSON.stringify([
      { id: 'synthetic-puzzle-job', company: 'Synthetic Puzzle Employer', role: 'Engineer', url: 'https://example.invalid/apply', status: 'saved', priority: 'high', notes: '', nextAction: '', updatedAt: '2026-11-04T12:00:00Z' },
    ]));
  });
  await page.reload();
  const board = page.getByTestId('profile-puzzle-board');
  const summary = page.getByTestId('profile-puzzle-piece-professional-summary');
  await expect(summary).toHaveAttribute('data-piece-state', 'needs_review');
  await expect(page.getByTestId('mascot-next-action')).toHaveAttribute('href', '/assist?opportunityId=synthetic-puzzle-job');
  await summary.click();
  await expect(page.getByTestId('profile-puzzle-selection')).toContainText('needs review');
  await expect(board).not.toContainText('PRIVATE_SYNTHETIC_STORY');
  await expect(board).not.toContainText('synthetic-a');
  await expect(page.getByTestId('mascot-next-action')).toHaveAttribute('href', '/assist?opportunityId=synthetic-puzzle-job');
});

test('material board fits narrow and zoomed layouts and remains still under reduced motion', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const board = page.getByTestId('profile-puzzle-board');
  await board.screenshot({ path: testInfo.outputPath('profile-puzzle-desktop.png'), animations: 'disabled' });
  const piece = page.getByTestId('profile-puzzle-piece-first_name');
  await piece.focus();
  await page.keyboard.press('Enter');
  await piece.hover();
  await expect(piece).toHaveCSS('animation-name', 'none');
  await expect(piece).toHaveCSS('transition-duration', '0s');
  await expect(piece).toHaveCSS('transform', 'none');
  await expect(piece).toBeFocused();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(board).toBeVisible();
  const soundBox = await page.getByTestId('button-birdsong-control').boundingBox();
  const boardBox = await board.boundingBox();
  expect(soundBox && boardBox && soundBox.y + soundBox.height <= boardBox.y).toBeTruthy();
  expect(await board.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await board.screenshot({ path: testInfo.outputPath('profile-puzzle-mobile.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await board.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.getByTestId('profile-puzzle-selection').getByRole('link')).toBeVisible();
});


test('phone review confirms the exact number and editing it clears confirmation', async ({ page }) => {
  await page.goto('/profile');
  await page.getByTestId('input-first_name').fill('Synthetic');
  await page.getByTestId('input-last_name').fill('Example');
  await page.getByTestId('input-email').fill('synthetic@example.invalid');
  await page.getByTestId('input-phone').fill('555-0100');
  const confirm = page.getByTestId('input-phone_authority');
  await expect(confirm).not.toBeChecked();
  await confirm.check();
  await page.getByTestId('button-save-profile').click();
  await page.getByTestId('link-sidebar-today').click();
  await expect(page.getByTestId('profile-puzzle-piece-phone')).toHaveAttribute('data-piece-state', 'saved');
  await page.getByTestId('profile-puzzle-piece-phone').click();
  await page.getByRole('link', { name: 'Review profile detail', exact: true }).click();
  await expect(confirm).toBeChecked();
  await page.getByTestId('input-phone').fill('555-0101');
  await expect(confirm).not.toBeChecked();
  await page.getByTestId('button-save-profile').click();
  await page.getByTestId('link-sidebar-today').click();
  await expect(page.getByTestId('profile-puzzle-piece-phone')).toHaveAttribute('data-piece-state', 'needs_review');
});
