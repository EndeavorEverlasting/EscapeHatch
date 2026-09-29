import { expect, test } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test('imports a synthetic local resume into the reusable profile with no review step', async ({ page }) => {
  const resumeText = [
    'Synthetic Candidate',
    '123 Main Street, Example City, NY 10001, United States | candidate@example.test | (555) 010-0101',
    'PROFESSIONAL SUMMARY',
    'Synthetic summary.',
    'CORE STRENGTHS',
    'Automation • Testing',
    'PROJECTS',
    '• Deterministic Import — Builds reusable profile state.',
    'PROFESSIONAL EXPERIENCE',
    'Example Org — Example Role | 2024–Present',
    'EDUCATION',
    'Example Institute | Example Credential',
  ].join('\n');

  await page.goto('/assist');
  await page.locator('[data-testid="input-import-resume"]').setInputFiles({
    name: 'synthetic-resume.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(resumeText),
  });

  await expect(page.locator('[data-testid="assist-feedback"]')).toContainText('Resume parsed locally', { timeout: 15_000 });
  await expect(page.locator('[data-testid="assist-feedback"]')).toContainText('no setup step');
  await expect(page.locator('[data-testid="resume-review-panel"]')).toHaveCount(0);

  const saved = await page.evaluate(() => ({
    profile: JSON.parse(localStorage.getItem('escape-hatch-profile') ?? '{}'),
    assist: JSON.parse(localStorage.getItem('escape-hatch-assist-profile') ?? '{}'),
  }));
  expect(saved.profile).toMatchObject({
    first_name: 'Synthetic',
    last_name: 'Candidate',
    email: 'candidate@example.test',
    phone: '(555) 010-0101',
    street_address: '123 Main Street',
    city: 'Example City',
    region: 'NY',
    postal_code: '10001',
    country: 'United States',
  });
  expect(saved.assist.contact).toMatchObject(saved.profile);
  expect(saved.assist.summary).toBe('Synthetic summary.');
  expect(saved.assist.skills).toEqual(expect.arrayContaining(['Automation', 'Testing']));
  expect(saved.assist.projects).toHaveLength(1);
  expect(saved.assist.experience).toHaveLength(1);
  expect(saved.assist.education).toHaveLength(1);

  await page.reload();
  await expect(page.getByText('candidate@example.test')).toBeVisible();
});

test('automatic resume intake preserves existing non-empty profile truth on conflict', async ({ page }) => {
  await page.goto('/assist');
  await page.evaluate(() => {
    localStorage.setItem('escape-hatch-profile', JSON.stringify({
      name_prefix: '',
      first_name: 'Existing',
      last_name: 'Candidate',
      preferred_name: '',
      email: 'keep@example.test',
      phone: '',
      phone_authority: '',
      linkedin_url: '',
      street_address: '',
      city: '',
      region: '',
      postal_code: '',
      country: '',
    }));
  });
  await page.reload();

  await page.locator('[data-testid="input-import-resume"]').setInputFiles({
    name: 'conflicting-resume.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from([
      'Resume Candidate',
      'Resume City, NJ | replace@example.test',
      'PROFESSIONAL SUMMARY',
      'Imported summary.',
    ].join('\n')),
  });

  await expect(page.locator('[data-testid="assist-feedback"]')).toContainText('preserved because the resume disagreed');
  const saved = await page.evaluate(() => ({
    profile: JSON.parse(localStorage.getItem('escape-hatch-profile') ?? '{}'),
    assist: JSON.parse(localStorage.getItem('escape-hatch-assist-profile') ?? '{}'),
  }));
  expect(saved.profile).toMatchObject({
    first_name: 'Existing',
    last_name: 'Candidate',
    email: 'keep@example.test',
    city: 'Resume City',
    region: 'NJ',
  });
  expect(saved.assist.contact).toMatchObject({
    first_name: 'Existing',
    last_name: 'Candidate',
    email: 'keep@example.test',
    city: 'Resume City',
    region: 'NJ',
  });
  expect(saved.assist.summary).toBe('Imported summary.');
});

test('explains unsupported PDF layouts without creating a review panel', async ({ page }) => {
  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'escape-hatch-resume-'));
  const filePath = resolve(temporaryDirectory, 'unsupported-layout.pdf');
  try {
    await writeFile(filePath, [
      '%PDF-1.4',
      '1 0 obj',
      '<< /Length 6 >>',
      'stream',
      'BT ET',
      'endstream',
      'endobj',
      '%%EOF',
    ].join('\n'));
    await page.goto('/assist');
    await page.locator('[data-testid="input-import-resume"]').setInputFiles(filePath);
    await expect(page.locator('[data-testid="assist-feedback"]')).toContainText('could not be fully read locally');
    await expect(page.locator('[data-testid="resume-review-panel"]')).toHaveCount(0);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('hydrates the app-owned resume profile and keeps a multi-page application review-only through popup reopen', async ({ browser }) => {
  test.setTimeout(120_000);
  const mark = (stage: string) => console.log(`ASSIST_LIVE_CERT:${stage}`);
  mark('BEGIN');

  const testDirectory = resolve(fileURLToPath(import.meta.url), '..');
  const sourceExtension = resolve(testDirectory, '../../../browser/application-assist');
  const extensionDirectory = await mkdtemp(resolve(tmpdir(), 'escape-hatch-assist-extension-'));
  const userDataDirectory = await mkdtemp(resolve(tmpdir(), 'escape-hatch-assist-profile-'));
  const browserType = browser.browserType();
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error('The browser test base URL is not configured.');

  const fixturePage = `
    <title>Application page one</title>
    <main>
      <h1>Application</h1>
      <form id="application-form">
        <label for="first-name">First name</label>
        <input id="first-name" name="first_name">
        <label for="email">Email</label>
        <input id="email" name="email">
        <label for="city">City</label>
        <input id="city" name="city">
        <label for="edited-notes">Notes</label>
        <textarea id="edited-notes" name="notes">Keep my wording</textarea>
        <label for="password">Password</label>
        <input id="password" name="password" type="password">
        <label for="resume">Resume upload</label>
        <input id="resume" name="resume" type="file">
        <label for="ssn">Social Security number</label>
        <input id="ssn" name="ssn" value="manual-only">
        <button id="next" type="button">Next</button>
        <button id="submit" type="submit">Submit</button>
      </form>
    </main>
    <script>
      window.__controlClicks = [];
      window.__submitCount = 0;
      document.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => window.__controlClicks.push(button.id));
      });
      document.querySelector('#application-form').addEventListener('submit', (event) => {
        event.preventDefault();
        window.__submitCount += 1;
      });
      document.querySelector('#next').addEventListener('click', () => {
        history.pushState({}, '', '/application?page=2');
        document.body.innerHTML = \`
          <main>
            <h1>Application page two</h1>
            <form id="application-form">
              <label for="page-two-first-name">First name</label>
              <input id="page-two-first-name" name="first_name">
              <label for="work-authorization">Work authorization</label>
              <textarea id="work-authorization" name="work_authorization">manual answer</textarea>
              <button id="continue" type="button">Continue</button>
              <button id="submit-page-two" type="submit">Submit</button>
            </form>
          </main>
        \`;
        document.querySelectorAll('button').forEach((button) => {
          button.addEventListener('click', () => window.__controlClicks.push(button.id));
        });
        document.querySelector('#application-form').addEventListener('submit', (event) => {
          event.preventDefault();
          window.__submitCount += 1;
        });
      });
    </script>
  `;

  try {
    await cp(sourceExtension, extensionDirectory, { recursive: true });
    const manifestPath = resolve(extensionDirectory, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      host_permissions?: string[];
      background?: { service_worker: string };
    };
    // Test-only: host access + ephemeral SW so Playwright can discover the extension ID.
    // The committed repo manifest must remain without `background` (harness gate).
    manifest.host_permissions = [`${baseURL}/*`, '*://127.0.0.1/*'];
    manifest.background = { service_worker: 'background.js' };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    await writeFile(
      resolve(extensionDirectory, 'background.js'),
      'chrome.runtime.onInstalled.addListener(() => undefined);\n',
    );

    mark('LAUNCH_CONTEXT');
    const context = await browserType.launchPersistentContext(userDataDirectory, {
      baseURL,
      headless: true,
      viewport: { width: 1280, height: 900 },
      // Full Chromium (not headless shell) is required for MV3 extension loading.
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
        : { channel: 'chromium' as const }),
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--disable-extensions-except=${extensionDirectory}`,
        `--load-extension=${extensionDirectory}`,
      ],
    });

    try {
      mark('CONTEXT_READY');
      for (const existing of context.pages()) {
        if (existing.url() === 'about:blank') {
          await existing.close().catch(() => undefined);
        }
      }

      await context.route('**/assist-application-fixture*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: `<!doctype html><html><head><meta charset="utf-8"></head><body>${fixturePage}</body></html>`,
        });
      });

      mark('IMPORT_RESUME');
      const cockpit = await context.newPage();
      await cockpit.goto(`${baseURL}/assist`);
      await cockpit.locator('[data-testid="input-import-resume"]').setInputFiles({
        name: 'live-cert-resume.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from([
          'Ada Lovelace',
          '1 Test Street, London, NY 10001, United States | ada@example.com',
          'PROFESSIONAL SUMMARY',
          'Deterministic application profile.',
          'CORE STRENGTHS',
          'Automation • Testing',
        ].join('\n')),
      });
      await expect(cockpit.locator('[data-testid="assist-feedback"]')).toContainText('Resume parsed locally');
      await expect(cockpit.locator('[data-testid="assist-feedback"]')).toContainText('no setup step');
      mark('RESUME_READY');

      const application = await context.newPage();
      await application.goto(`${baseURL}/assist-application-fixture`);

      mark('WAIT_EXTENSION');
      const serviceWorker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker', { timeout: 30_000 }));
      const extensionId = new URL(serviceWorker.url()).hostname;
      mark('EXTENSION_READY');
      const openPopup = async (activePage = application) => {
        await activePage.bringToFront();
        const popup = await context.newPage();
        await popup.goto(`chrome-extension://${extensionId}/popup.html`);
        await expect(popup.locator('#startAssist')).toBeEnabled({ timeout: 30_000 });
        return popup;
      };
      const activateApplicationTab = async (popup: import('@playwright/test').Page) => {
        await application.bringToFront();
        const applicationUrl = application.url();
        await popup.evaluate(async (targetUrl) => {
          const tabs = await chrome.tabs.query({});
          const matches = tabs.filter((tab) => typeof tab.id === 'number' && tab.url === targetUrl);
          if (matches[0]?.id != null) {
            await chrome.tabs.update(matches[0].id, { active: true });
            return;
          }
          // Fallback: exact pathname match on same origin (history.pushState may differ slightly).
          let target: URL;
          try {
            target = new URL(targetUrl);
          } catch {
            return;
          }
          const samePath = tabs.filter((tab) => {
            if (typeof tab.id !== 'number' || typeof tab.url !== 'string') return false;
            try {
              const candidate = new URL(tab.url);
              return candidate.origin === target.origin && candidate.pathname === target.pathname;
            } catch {
              return false;
            }
          });
          samePath.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
          if (samePath[0]?.id != null) {
            await chrome.tabs.update(samePath[0].id, { active: true });
          }
        }, applicationUrl);
      };

      mark('OPEN_POPUP_ON_COCKPIT');
      const popup = await openPopup(cockpit);
      await expect(popup.locator('#modeChip')).toContainText('Mode: mouse');
      await expect(popup.locator('.mouse-actions')).toBeVisible();
      await expect(popup.locator('#profileReady')).toHaveText('Ready', { timeout: 20_000 });
      await expect(popup.locator('#status')).toContainText('Profile hydrated automatically from EscapeHatch app', { timeout: 20_000 });
      await expect(popup.locator('#first_name')).toHaveValue('Ada');
      await expect(popup.locator('#email')).toHaveValue('ada@example.com');
      await expect(popup.locator('#city')).toHaveValue('London');
      mark('PROFILE_HYDRATED');

      await activateApplicationTab(popup);
      await popup.bringToFront();
      mark('START_ASSIST');
      await popup.locator('#startAssist').click();
      await expect(popup.locator('#sessionState')).toContainText('Session: active', { timeout: 15_000 });
      // Start Assist is the normal fill trigger: no extension profile typing/save,
      // JSON shuttle, explicit refresh, or Fill now setup step is allowed here.
      await expect(popup.locator('#status')).toContainText(/Filled [1-9]/, { timeout: 20_000 });
      mark('FIRST_FILL_DONE');

      await expect(application.locator('#first-name')).toHaveValue('Ada', { timeout: 20_000 });
      await expect(application.locator('#email')).toHaveValue('ada@example.com');
      await expect(application.locator('#city')).toHaveValue('London');
      await expect(application.locator('#edited-notes')).toHaveValue('Keep my wording');
      await expect(application.locator('#password')).toHaveValue('');
      await expect(application.locator('#resume')).toHaveValue('');
      await expect(application.locator('#ssn')).toHaveValue('manual-only');
      await expect(application.locator('#submit')).toBeVisible();
      await expect(application).toHaveURL(/assist-application-fixture/);
      expect(
        await application.evaluate(
          () => (window as Window & { __controlClicks?: string[] }).__controlClicks,
        ),
      ).toEqual([]);
      expect(
        await application.evaluate(
          () => (window as Window & { __submitCount?: number }).__submitCount,
        ),
      ).toBe(0);

      mark('FIRST_PAGE_VERIFIED');
      await application.locator('#next').click();
      await expect(application).toHaveURL(/\/application\?page=2$/);
      await expect(application.locator('#page-two-first-name')).toBeVisible();
      expect(
        await application.evaluate(
          () => (window as Window & { __controlClicks?: string[] }).__controlClicks,
        ),
      ).toEqual(['next']);
      expect(
        await application.evaluate(
          () => (window as Window & { __submitCount?: number }).__submitCount,
        ),
      ).toBe(0);

      await activateApplicationTab(popup);
      await popup.bringToFront();
      await popup.evaluate(() => {
        const status = document.getElementById('status');
        if (status) status.textContent = 'Awaiting page-two fill';
      });
      // Keyboard 'f' routes fill_allowed without click dual-dispatch dedupe races on CI.
      await popup.keyboard.press('f');
      // Require a fresh page-two fill (stale "Filled 3…" from page one previously masked failures).
      await expect(popup.locator('#status')).toContainText('Filled 1 ', { timeout: 20_000 });
      await expect(application.locator('#page-two-first-name')).toHaveValue('Ada', { timeout: 20_000 });
      await expect(application.locator('#work-authorization')).toHaveValue('manual answer');
      mark('SECOND_FILL_DONE');

      await popup.bringToFront();
      await expect(popup.locator('#undoLast')).toBeVisible();
      await popup.locator('#undoLast').click();
      await expect(popup.locator('#status')).toContainText('Undo restored', { timeout: 20_000 });
      await expect(application.locator('#page-two-first-name')).toHaveValue('');
      mark('UNDO_DONE');

      await popup.locator('#pause').click();
      await expect(popup.locator('#sessionState')).toContainText('Session: paused');
      await expect(popup.locator('#status')).toContainText('Assist paused');
      await popup.locator('#fillAllowed').click();
      await expect(popup.locator('#status')).toContainText('Fill blocked', { timeout: 20_000 });
      await popup.locator('#resume').click();
      await expect(popup.locator('#sessionState')).toContainText('Session: active');

      await popup.locator('#emergencyStop').click();
      await expect(popup.locator('#sessionState')).toContainText('Session: stopped');
      await expect(popup.locator('#status')).toContainText('Emergency Stop latched');
      await popup.locator('#fillAllowed').click();
      await expect(popup.locator('#status')).toContainText(/Emergency Stop(?: is)? latched/, { timeout: 20_000 });
      await expect(application.locator('#work-authorization')).toHaveValue('manual answer');
      mark('STOP_PROVEN');
      expect(
        await application.evaluate(
          () => (window as Window & { __controlClicks?: string[] }).__controlClicks,
        ),
      ).toEqual(['next']);
      expect(
        await application.evaluate(
          () => (window as Window & { __submitCount?: number }).__submitCount,
        ),
      ).toBe(0);

      await popup.close();
      mark('REOPEN_POPUP');
      const reopenedPopup = await openPopup();
      await expect(reopenedPopup.locator('#sessionState')).toContainText('Session: stopped');
      await expect(reopenedPopup.locator('#sessionState')).toContainText(`origin=${new URL(baseURL).origin}`);
      await reopenedPopup.locator('#fillAllowed').click();
      await expect(reopenedPopup.locator('#status')).toContainText(/Emergency Stop(?: is)? latched/);
      await reopenedPopup.close();
      mark('COMPLETE');
    } finally {
      await context.close();
    }
  } finally {
    await rm(extensionDirectory, { recursive: true, force: true });
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
