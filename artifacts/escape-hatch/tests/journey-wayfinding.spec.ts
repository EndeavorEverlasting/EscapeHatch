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
  await expect(page.getByTestId('journey-selected-step')).toContainText('Review and authorize Submit');
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

test('mascot connects sources, profile, answers and applications without claiming progress', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Explore your journey' }).click();
  await page.getByTestId('journey-open-stage').click();
  await expect(page).toHaveURL(/\/sources$/);
  const guide = page.getByTestId('workspace-journey-guide');
  await guide.getByRole('link', { name: 'Review your profile' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await guide.getByRole('link', { name: 'Open Answer library' }).click();
  await expect(page).toHaveURL(/\/answers$/);
  await guide.getByRole('link', { name: 'Choose an opportunity' }).click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(guide.getByRole('link', { name: 'Open Browser assist' })).toBeVisible();
});

test('atlas previews sign-in, signed-in and retry branches without running application actions', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/managed-assist/')) writes.push(request.url());
  });
  await page.goto('/journey?scene=APPLICATION_ENTRY');
  const preview = page.getByTestId('journey-branch-preview');
  await expect(preview).toContainText('The same employer form opens without a sign-in prompt.');
  await preview.getByRole('link', { name: /Sign in in the employer window/ }).click();
  await expect(preview.getByRole('heading', { level: 2 })).toBeFocused();
  await expect(preview).toContainText('You decide');
  await preview.getByRole('link', { name: 'Check again or continue when ready' }).click();
  await expect(preview).toContainText('The employer still requires sign-in.');
  await preview.getByRole('link', { name: 'Show the failed step and how to recover' }).click();
  await expect(preview).toContainText('The same employer tab can be checked again.');
  await expect(preview.getByRole('link', { name: 'Check again or continue when ready' })).toBeVisible();
  await page.goBack();
  await expect(preview).toContainText('The employer still requires sign-in.');
  await page.goto('/journey?scene=unknown');
  await expect(preview).toHaveCount(0);
  await expect(page.getByTestId('journey-atlas')).toBeVisible();
  expect(writes).toEqual([]);
});

test('materials detour and return keep the requested job, with no fallback to another job', async ({ page }) => {
  const secondId = 'role + two & launch=1';
  const fixture = ['role-one', secondId].map((id, index) => ({
    id, company: 'Fixture ' + index, role: 'Engineer', url: 'https://jobs.example.com/apply/' + index,
    status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: '2026-01-01T00:00:00Z',
  }));
  await page.goto('/');
  await page.evaluate(applications => localStorage.setItem('escape-hatch-applications', JSON.stringify(applications)), fixture);
  const writes: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/managed-assist/')) writes.push(request.url());
  });
  const context = new URLSearchParams({ opportunityId: secondId });
  await page.goto('/assist?' + context);
  const coach = page.getByTestId('application-journey-coach');
  await coach.getByRole('link', { name: 'Review this job’s materials' }).click();
  await expect(page.getByTestId('materials-opportunity-select')).toHaveValue(secondId);
  await page.getByRole('link', { name: 'Return to Browser assist' }).click();
  await expect(page.getByTestId('managed-job-url')).toHaveValue(fixture[1].url);
  await coach.getByRole('link', { name: 'Explore this step' }).click();
  await expect(page.getByTestId('journey-branch-preview')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('opportunityId')).toBe(secondId);
  await page.goto('/materials?opportunityId=gone');
  await expect(page.getByTestId('materials-opportunity-select')).toHaveValue('');
  await expect(page.getByText('This opportunity is unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('materials-open-assist')).toHaveCount(0);
  expect(writes).toEqual([]);
});
