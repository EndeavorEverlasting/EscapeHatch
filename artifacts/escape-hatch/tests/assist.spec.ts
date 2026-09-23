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

test('keeps a multi-page application review-only through popup reopen', async ({ browser }) => {
  test.setTimeout(60_000);

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

  const sync = {
    schema: 'escape-hatch-assist-sync',
    profile: {
      contact: {
        first_name: 'Ada',
        email: 'ada@example.com',
        city: 'London',
      },
    },
    answers: [],
  };

  try {
    await cp(sourceExtension, extensionDirectory, { recursive: true });
    const manifestPath = resolve(extensionDirectory, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      host_permissions?: string[];
    };
    manifest.host_permissions = [`${baseURL}/*`];
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const context = await browserType.launchPersistentContext(userDataDirectory, {
      baseURL,
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/repl/tools/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--disable-extensions-except=${extensionDirectory}`,
        `--load-extension=${extensionDirectory}`,
      ],
    });

    try {
      const application = await context.newPage();
      await application.goto('/');
      await application.setContent(fixturePage);

      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const extensionId = new URL(serviceWorker.url()).hostname;
      const openPopup = async () => {
        await application.bringToFront();
        const popup = await context.newPage();
        await popup.goto(`chrome-extension://${extensionId}/popup.html`);
        await expect(popup.locator('#start')).toBeEnabled();
        return popup;
      };

      const popup = await openPopup();
      await popup.getByText('Profile bridge', { exact: true }).click();
      await popup.locator('#sync').fill(JSON.stringify(sync));
      await popup.locator('#start').click();
      await popup.locator('#scan').click();

      await expect(popup.locator('[data-field="first-name"]')).toBeChecked();
      await expect(popup.locator('[data-field="password"]')).toBeDisabled();
      await expect(popup.locator('[data-field="resume"]')).toBeDisabled();
      await expect(popup.locator('[data-field="ssn"]')).toBeDisabled();
      await expect(popup.locator('[data-field="edited-notes"]')).toBeDisabled();
      await expect(popup.locator('[data-field="submit"]')).toBeDisabled();

      await popup.locator('#fill').click();
      await expect(application.locator('#first-name')).toHaveValue('Ada');
      await expect(application.locator('#email')).toHaveValue('ada@example.com');
      await expect(application.locator('#city')).toHaveValue('London');
      await expect(application.locator('#edited-notes')).toHaveValue('Keep my wording');
      await expect(application.locator('#password')).toHaveValue('');
      await expect(application.locator('#resume')).toHaveValue('');
      await expect(application.locator('#ssn')).toHaveValue('manual-only');
      await expect(application.locator('#submit')).toBeVisible();
      await expect(application).toHaveURL(/\/$/);
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

      await popup.locator('#scan').click();
      await expect(popup.locator('[data-field="page-two-first-name"]')).toBeChecked();
      await expect(popup.locator('[data-field="work-authorization"]')).toBeDisabled();
      await expect(popup.locator('[data-field="continue"]')).toBeDisabled();
      await expect(popup.locator('[data-field="submit-page-two"]')).toBeDisabled();

      await popup.locator('#fill').click();
      await expect(application.locator('#page-two-first-name')).toHaveValue('Ada');
      await popup.locator('#undo').click();
      await expect(application.locator('#page-two-first-name')).toHaveValue('');

      await popup.locator('#pause').click();
      await expect(popup.locator('#pause')).toHaveText('Resume');
      await expect(popup.locator('#fill')).toBeDisabled();
      await popup.locator('#pause').click();
      await expect(popup.locator('#pause')).toHaveText('Pause');

      await popup.locator('#stop').click();
      await expect(popup.locator('#stop')).toBeDisabled();
      await expect(popup.locator('#fill')).toBeDisabled();
      await expect(popup.locator('#notice')).toContainText('Emergency stop latched');
      await expect(application.locator('#work-authorization')).toHaveValue('manual answer');
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
      const reopenedPopup = await openPopup();
      await expect(reopenedPopup.locator('#summary')).toContainText('Emergency stop latched');
      await expect(reopenedPopup.locator('#summary')).toContainText(`Origin: ${new URL(baseURL).origin}`);
      const exportedStatus = JSON.parse(await reopenedPopup.locator('#session').inputValue()) as {
        pages: Array<{ url: string }>;
        history: Array<unknown>;
        emergencyStopped: boolean;
      };
      expect(exportedStatus.emergencyStopped).toBe(true);
      expect(exportedStatus.history).toHaveLength(1);
      expect(exportedStatus.pages.map((page) => page.url)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/\/$/),
          expect.stringMatching(/\/application\?page=2$/),
        ]),
      );
      await expect(reopenedPopup.locator('#export-session')).toBeEnabled();
      const importedSessionFile = resolve(userDataDirectory, 'assist-session.json');
      await writeFile(importedSessionFile, JSON.stringify(exportedStatus));
      await reopenedPopup.locator('#session-file').setInputFiles(importedSessionFile);
      await expect(reopenedPopup.locator('#notice')).toContainText('Session status imported');
      await expect(reopenedPopup.locator('#summary')).toContainText('Emergency stop latched');
      await reopenedPopup.close();
    } finally {
      await context.close();
    }
  } finally {
    await rm(extensionDirectory, { recursive: true, force: true });
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
