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
  await page.keyboard.press('Escape');
  await page.getByTestId('button-mascot-chirp').click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __chirpCreated?: number }).__chirpCreated ?? 0)).toBe(1);
});

test('birdsong stays opted in across cockpit navigation and can be stopped', async ({ page }) => {
  await page.goto('/');
  const sound = page.getByTestId('button-birdsong-control');
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await expect(sound).toHaveAccessibleName('Turn birdsong on');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('link-sidebar-browser-assist').click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
});

test('live tracker selection makes current employer the first puzzle, without fixture identity defaults', async ({ page }) => {
  await page.route('**/__escapehatch/tracker/status', async route => {
    const applications = [
      { sheetRow: 30, company: 'Old Employer', role: 'Coordinator', priority: 'Medium',
        status: 'Ready to Apply', appliedCheckbox: false, applyUrl: 'https://example.com/old' },
      { sheetRow: 38, company: 'Current Employer', role: 'Operations PM', priority: 'High',
        status: 'Ready to Apply', appliedCheckbox: false, applyUrl: 'https://example.com/new' },
    ];
    const metrics = { trackedRoles: 2, appliedOrSubmittedCheckbox: 0, readyToApply: 2,
      inProcess: 0, submittedStatus: 0, highPriority: 1 };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      connection: 'CONNECTED',
      snapshot: { schema: 'escapehatch/tracker-snapshot/v1', provider: 'synthetic',
        spreadsheetId: 'synthetic-sheet', sheetName: 'Applications',
        capturedAtUtc: new Date().toISOString(), contentDigest: 'synthetic-digest',
        authPath: 'synthetic', localGoogleAuthPresent: false, metrics, applications },
    }) });
  });
  await page.goto('/');
  await expect(page.getByTestId('home-next-company-role')).toContainText('Current Employer');
  await expect(page.getByTestId('mascot-chirp-message')).toContainText('Current Employer');
  await expect(page.getByTestId('mascot-next-action')).toHaveAttribute('href', /\/assist\?opportunityId=tracker-/);
  await expect(page.getByTestId('button-birdsong-control')).toHaveAttribute('aria-pressed', 'false');
});
