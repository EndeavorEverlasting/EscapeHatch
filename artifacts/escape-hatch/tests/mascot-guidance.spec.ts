import { expect, test } from '@playwright/test';
import registry from '../../../contracts/application-journey-scenes.v1.json' with { type: 'json' };

test('mascot gives one truthful missing-profile prompt and a keyboard-safe tutorial overlay', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('mascot-tutorial-avatar')).toBeVisible();
  await expect(page.getByTestId('mascot-chirp-message')).toContainText('first name');
  await expect(page.getByTestId('mascot-profile-progress')).toContainText('0 of 8');
  await expect(page.getByTestId('mascot-next-action')).toHaveAttribute('href', '/profile');
  await expect(page.getByTestId('mascot-first-run-quiz')).toHaveAttribute('href', '/assist');
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
  const journey = page.locator('.guided-journey');
  await expect(journey).not.toHaveAttribute('open');
  await journey.locator('summary').click();
  await expect(journey).toHaveAttribute('open', '');
  await expect(page.getByText('Bring your career sources')).toBeVisible();
  await expect(page.getByTestId('button-birdsong-control')).toHaveAttribute('aria-pressed', 'false');
});


test('Today puzzle uses inspectable local slots, not an invented employer readiness score', async ({ page }) => {
  await page.goto('/');
  const board = page.getByTestId('profile-puzzle-board');
  await expect(board).toBeVisible();
  await expect(board.locator('.profile-puzzle-tile')).toHaveCount(10);
  await expect(page.getByTestId('profile-puzzle-count')).toContainText('0 / 8 contact details saved locally');
  const first = page.getByTestId('profile-puzzle-piece-first_name');
  await expect(first).toHaveAttribute('data-piece-state', 'missing');
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('profile-puzzle-selection')).toContainText('First name: open slot.');
  await expect(board.getByRole('link', { name: 'Review profile detail' })).toHaveAttribute('href', '/profile');
  await expect(board).toContainText('a complete board never means ready to submit');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(first).toHaveCSS('animation-name', 'none');
});

test('avatar walks independent opportunity decision scenes and persists the chosen application', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('escape-hatch-applications', JSON.stringify([{ id: 'decision-guide', company: 'Synthetic', role: 'Engineer', url: 'https://example.invalid/job', status: 'saved', priority: 'normal', notes: 'EscapeHatch rubric v2: on_site; remote_only; unacceptable; unknown; undecided; unknown', nextAction: '', updatedAt: '2026-01-01T00:00:00Z' }])));
  await page.goto('/applications?opportunityId=decision-guide');
  const guide = page.getByTestId('opportunity-decision-guide');
  await expect(guide).toHaveAttribute('data-scene', 'MATCH_REVIEW');
  await expect(guide.getByTestId('decision-avatar')).toBeVisible();
  await expect(guide).toContainText('Work arrangement: mismatch');
  await guide.getByRole('button', { name: 'Next step' }).click();
  await expect(guide).toHaveAttribute('data-scene', 'JOB_DESIRE');
  await guide.getByLabel('Job desire').selectOption('do_not_want');
  await guide.getByRole('button', { name: 'Next step' }).click();
  await expect(guide).toHaveAttribute('data-scene', 'APPLICATION_DECISION');
  await guide.getByLabel('Application decision').selectOption('apply');
  await guide.getByLabel('Application purpose').selectOption('interview_practice');
  await expect(guide.getByRole('link', { name: 'Prepare this application' })).toHaveAttribute('href', '/assist?opportunityId=decision-guide');
  await page.reload();
  await guide.getByRole('button', { name: 'Next step' }).click();
  await expect(guide.getByLabel('Job desire')).toHaveValue('do_not_want');
  await guide.getByRole('button', { name: 'Next step' }).click();
  await expect(guide.getByLabel('Application decision')).toHaveValue('apply');
  await expect(guide.getByLabel('Application purpose')).toHaveValue('interview_practice');
});

// Instrument only the browser speech API; this proves the application requests
// narration, not audible output from the host speaker.
async function stubTutorialSpeech(page: import('@playwright/test').Page, blockFirst = false) {
  await page.addInitScript(block => {
    const evidence = { spoken: [] as string[], cancels: 0, attempts: 0 };
    Object.defineProperty(window, '__tutorialSpeech', { value: evidence });
    class Utterance {
      onstart?: () => void;
      onend?: () => void;
      onerror?: (event: { error: string }) => void;
      constructor(public text: string) {}
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [],
      speak: (utterance: Utterance) => {
        evidence.attempts++;
        if (block && evidence.attempts === 1) {
          utterance.onerror?.({ error: 'not-allowed' });
          return;
        }
        evidence.spoken.push(utterance.text);
        utterance.onstart?.();
      },
      cancel: () => { evidence.cancels++; },
    } });
  }, blockFirst);
}

const voiceEvidence = (page: import('@playwright/test').Page) => page.evaluate(() =>
  (window as unknown as { __tutorialSpeech: { spoken: string[]; cancels: number; attempts: number } }).__tutorialSpeech);

test('new workspaces speak tutorial automatically, preserve mute across navigation and reload', async ({ page }) => {
  await stubTutorialSpeech(page);
  await page.goto('/');
  const voice = page.getByTestId('button-tutorial-voice');
  await expect(voice).toHaveAccessibleName('Turn tutorial voice off');
  await expect(voice).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await voiceEvidence(page)).spoken).toEqual([expect.stringContaining('Welcome to EscapeHatch')]);
  await expect(page.getByTestId('button-birdsong-control')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('link-sidebar-profile').click();
  await expect.poll(async () => (await voiceEvidence(page)).spoken.at(-1)).toContain('Build your reusable profile');
  const beforeMute = await voiceEvidence(page);
  await voice.click();
  await expect(voice).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await voiceEvidence(page)).cancels).toBeGreaterThan(beforeMute.cancels);
  await page.getByTestId('link-sidebar-applications').click();
  await expect.poll(async () => (await voiceEvidence(page)).spoken.length).toBe(beforeMute.spoken.length);
  await page.reload();
  await expect(voice).toHaveAccessibleName('Turn tutorial voice on');
  expect((await voiceEvidence(page)).spoken).toEqual([]);
  await voice.click();
  await expect.poll(async () => (await voiceEvidence(page)).spoken.at(-1)).toContain('Select an opportunity');
});

test('tutorial retries a blocked initial speech request after a real gesture, without enabling birdsong', async ({ page }) => {
  await stubTutorialSpeech(page, true);
  await page.goto('/');
  await expect(page.getByTestId('tutorial-voice-status')).toContainText('next interaction');
  await page.getByTestId('mascot-chirp-message').click();
  await expect.poll(async () => (await voiceEvidence(page)).spoken).toEqual([expect.stringContaining('Welcome to EscapeHatch')]);
  await expect(page.getByTestId('button-birdsong-control')).toHaveAttribute('aria-pressed', 'false');
});

test('muting before browser activation never triggers the deferred tutorial', async ({ page }) => {
  await stubTutorialSpeech(page, true);
  await page.goto('/');
  await expect(page.getByTestId('tutorial-voice-status')).toContainText('next interaction');
  await page.getByTestId('button-tutorial-voice').click();
  await page.getByTestId('mascot-chirp-message').click();
  await expect(page.getByTestId('button-tutorial-voice')).toHaveAttribute('aria-pressed', 'false');
  expect((await voiceEvidence(page)).spoken).toEqual([]);
  expect((await voiceEvidence(page)).attempts).toBe(1);
});


test('each canonical scene preview resolves public avatar narration from the scene registry', async ({ page }) => {
  test.setTimeout(90_000);
  await stubTutorialSpeech(page);
  for (const scene of registry.scenes) {
    await page.goto('/journey?scene=' + scene.id);
    await expect(page.getByTestId('tutorial-voice-avatar')).toBeVisible();
    await expect(page.getByTestId('tutorial-voice-current')).toHaveText(scene.coach_prompt);
    await expect.poll(async () => (await voiceEvidence(page)).spoken.at(-1)).toContain(scene.coach_prompt);
  }
});

test('changing the active managed scene updates narration without changing the route', async ({ page }) => {
  await stubTutorialSpeech(page);
  await page.goto('/assist');
  const job = page.getByTestId('managed-job-url');
  await expect(job).toBeVisible();
  await expect(page.getByTestId('tutorial-voice-current')).toHaveText('Check this job and show me what is missing');
  await job.fill('https://jobs.example.invalid/application');
  await expect(page.getByTestId('tutorial-voice-current')).toHaveText('Ask me only for information you cannot verify');
  await expect.poll(async () => (await voiceEvidence(page)).spoken.at(-1)).toContain('Ask me only for information you cannot verify');
  await expect(page.getByTestId('button-tutorial-voice')).toHaveAttribute('aria-pressed', 'true');
});
