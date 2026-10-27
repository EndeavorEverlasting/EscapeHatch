import { expect, test } from '@playwright/test';

test('mascot gives one truthful missing-profile prompt and a keyboard-safe tutorial overlay', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('mascot-tutorial-avatar')).toBeVisible();
  await expect(page.getByTestId('mascot-chirp-message')).toContainText('first name');
  await expect(page.getByTestId('mascot-profile-progress')).toContainText('0 of 8');
  await expect(page.getByTestId('mascot-next-action')).toHaveAttribute('href', '/profile');
  await expect(page.getByTestId('button-mascot-chirp')).toHaveAccessibleName('Play optional chick chirp');
  await page.getByTestId('button-mascot-puzzle').click();
  const overlay = page.getByTestId('mascot-tutorial-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByText('First name')).toBeVisible();
  await expect(overlay.getByText('LinkedIn URL')).toBeVisible();
  await expect(overlay.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByTestId('mascot-overlay-avatar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay).not.toBeVisible();
  await expect(page.getByTestId('button-mascot-puzzle')).toBeFocused();
});

test('saved profile and opportunities update the chirp without claiming employer readiness', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const profile = { name_prefix: '', first_name: 'Taylor', last_name: 'River', preferred_name: '', email: 't@example.invalid',
      phone: '', phone_authority: '', linkedin_url: '', street_address: '', city: '', region: '', postal_code: '', country: '' };
    localStorage.setItem('escape-hatch-profile', JSON.stringify(profile));
  });
  await page.reload();
  await expect(page.getByTestId('mascot-profile-progress')).toContainText('3 of 8');
  await expect(page.getByTestId('mascot-chirp-message')).toContainText('optional');
  await expect(page.getByTestId('mascot-next-action')).toHaveAttribute('href', '/applications');
  await page.evaluate(() => localStorage.setItem('escape-hatch-applications', JSON.stringify([
    { id: 'synthetic', company: 'Example', role: 'Analyst', url: 'https://example.invalid/apply',
      status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() },
  ])));
  await page.reload();
  await expect(page.getByTestId('mascot-chirp-message')).toContainText('does not block');
  await page.getByTestId('button-mascot-puzzle').click();
  await expect(page.getByTestId('mascot-overlay-progress')).toContainText('3 / 8');
  await expect(page.getByTestId('mascot-overlay-action')).toHaveAttribute('href', '/profile');
  await expect(page.getByTestId('mascot-tutorial-overlay')).toContainText('not a claim about a particular employer');
});

test('mobile tutorial remains available and chick sound never auto-plays', async ({ page }) => {
  await page.addInitScript(() => {
    (window as typeof window & { __chirpCreated?: number }).__chirpCreated = 0;
    const NativeAudio = window.AudioContext;
    if (typeof NativeAudio === 'function') {
      class TrackedAudio extends NativeAudio {
        constructor(...args: ConstructorParameters<typeof AudioContext>) {
          super(...args);
          (window as typeof window & { __chirpCreated?: number }).__chirpCreated! += 1;
        }
      }
      window.AudioContext = TrackedAudio;
    }
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByTestId('mascot-guidance')).toBeVisible();
  await expect(page.getByTestId('mascot-tutorial-avatar')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __chirpCreated?: number }).__chirpCreated ?? 0)).toBe(0);
  await page.getByTestId('button-mascot-puzzle').click();
  await expect(page.getByTestId('mascot-tutorial-overlay')).toBeVisible();
  await expect(page.getByTestId('mascot-overlay-avatar')).toBeVisible();
});
