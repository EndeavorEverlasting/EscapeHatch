import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const profileValues = {
  name_prefix: 'Dr.',
  first_name: 'Ada',
  last_name: 'Lovelace',
  preferred_name: 'Ada',
  email: 'ada@example.com',
  phone: '+1 555 0100',
  phone_authority: 'mobile',
  linkedin_url: 'https://linkedin.com/in/ada',
  street_address: '1 Analytical Engine Way',
  city: 'London',
  region: 'London',
  postal_code: 'NW1',
  country: 'United Kingdom',
};

async function fillProfile(page: import('@playwright/test').Page) {
  for (const [field, value] of Object.entries(profileValues)) {
    await page.getByTestId(`input-${field}`).fill(value);
  }
}

async function expectProfile(page: import('@playwright/test').Page) {
  for (const [field, value] of Object.entries(profileValues)) {
    await expect(page.getByTestId(`input-${field}`)).toHaveValue(value);
  }
}

async function downloadBuffer(download: import('@playwright/test').Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The export could not be read.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function readRecoverySeconds(locator: import('@playwright/test').Locator) {
  const text = await locator.textContent();
  const match = text?.match(/Recovery available for (\d+) seconds?/);
  if (!match) throw new Error(`Could not read recovery time from: ${text}`);
  return Number(match[1]);
}

async function pressRecoveryAtExactDeadline(
  page: import('@playwright/test').Page,
  recoveryButton: import('@playwright/test').Locator,
  key: 'Enter' | 'Space',
  deadline: number,
) {
  await page.clock.setSystemTime(new Date(deadline - 100));
  await recoveryButton.focus();
  await page.evaluate((exactDeadline) => {
    const pageWindow = window as Window & { __escapeHatchOriginalDateNow?: typeof Date.now };
    pageWindow.__escapeHatchOriginalDateNow = Date.now;
    Date.now = () => exactDeadline;
  }, deadline);
  try {
    await recoveryButton.press(key);
  } finally {
    await page.evaluate(() => {
      const pageWindow = window as Window & { __escapeHatchOriginalDateNow?: typeof Date.now };
      if (pageWindow.__escapeHatchOriginalDateNow) {
        Date.now = pageWindow.__escapeHatchOriginalDateNow;
        delete pageWindow.__escapeHatchOriginalDateNow;
      }
    });
  }
}

async function pressRecoveryBeforeDeadline(
  page: import('@playwright/test').Page,
  recoveryButton: import('@playwright/test').Locator,
  key: 'Enter' | 'Space',
  deadline: number,
) {
  await pressRecoveryAtExactDeadline(page, recoveryButton, key, deadline - 1);
}

async function pressRecoveryRepeatedlyBeforeDeadline(
  page: import('@playwright/test').Page,
  recoveryButton: import('@playwright/test').Locator,
  key: 'Enter' | 'Space',
  deadline: number,
) {
  await page.clock.setSystemTime(new Date(deadline - 100));
  await recoveryButton.focus();
  await page.evaluate((beforeDeadline) => {
    const pageWindow = window as Window & { __escapeHatchOriginalDateNow?: typeof Date.now };
    pageWindow.__escapeHatchOriginalDateNow = Date.now;
    Date.now = () => beforeDeadline;
  }, deadline - 1);
  try {
    await Promise.all([page.keyboard.press(key), page.keyboard.press(key)]);
  } finally {
    await page.evaluate(() => {
      const pageWindow = window as Window & { __escapeHatchOriginalDateNow?: typeof Date.now };
      if (pageWindow.__escapeHatchOriginalDateNow) {
        Date.now = pageWindow.__escapeHatchOriginalDateNow;
        delete pageWindow.__escapeHatchOriginalDateNow;
      }
    });
  }
}

test('shows malformed import errors without changing the profile draft', async ({ page }) => {
  await page.goto('/profile');
  await page.getByTestId('input-first_name').fill('Draft');
  await page.getByTestId('input-last_name').fill('Profile');

  await page.getByTestId('input-import-profile').setInputFiles({
    name: 'malformed.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not-json'),
  });

  await expect(page.getByTestId('profile-import-feedback')).toHaveText('This file is not valid JSON.');
  await expect(page.getByTestId('input-first_name')).toHaveValue('Draft');
  await expect(page.getByTestId('input-last_name')).toHaveValue('Profile');
});


test('imports a valid export with every profile field intact', async ({ page }) => {
  await page.goto('/profile');
  await fillProfile(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('button-export-profile').click();
  const exportedProfile = await downloadBuffer(await downloadPromise);

  await page.getByTestId('input-first_name').fill('Changed');
  await page.getByTestId('input-import-profile').setInputFiles({
    name: 'escape-hatch-profile.json',
    mimeType: 'application/json',
    buffer: exportedProfile,
  });

  await expect(page.getByTestId('profile-import-feedback')).toHaveText(
    'Profile imported. Review the details, then save your profile.',
  );
  await expectProfile(page);
});

test('backs up and restores the complete workspace', async ({ page }) => {
  const answerTitle = 'Why I want to build useful tools';
  const company = 'Acme Labs';

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill(answerTitle);
  await page.getByTestId('textarea-answer-content').fill('I like turning complex work into clear, useful experiences.');
  await page.getByTestId('button-save-answer').click();

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill(company);
  await page.getByTestId('input-role').fill('Product designer');
  await page.getByTestId('input-nextAction').fill('Review the role brief');
  await page.getByTestId('button-save-application').click();

  await page.goto('/profile');
  await fillProfile(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('button-export-workspace').click();
  const backup = await downloadBuffer(await downloadPromise);

  await page.getByTestId('input-first_name').fill('Changed');
  await page.getByTestId('input-import-workspace').setInputFiles({
    name: 'escape-hatch-workspace.json',
    mimeType: 'application/json',
    buffer: backup,
  });
  const restoreDialog = page.getByRole('dialog');
  await expect(restoreDialog).toBeVisible();
  await expect(page.getByTestId('workspace-restore-newer-changes-warning')).toBeVisible();
  await expect(page.getByTestId('workspace-restore-newer-profile')).toHaveText('Profile');
  await expect(page.getByTestId('workspace-restore-profile-summary')).toContainText('Ada Lovelace');
  await expect(page.getByTestId('workspace-restore-answers-summary')).toContainText(answerTitle);
  await expect(page.getByTestId('workspace-restore-applications-summary')).toContainText(`${company} · Product designer`);
  await expect(page.getByTestId('input-first_name')).toHaveValue('Changed');
  await page.getByTestId('button-confirm-restore-workspace').click();
  await expect(page.getByTestId('workspace-import-feedback')).toHaveText(
    'Workspace restored. Your profile, answers, and applications are back.',
  );
  await expect(page.getByTestId('input-first_name')).toHaveValue(profileValues.first_name);

  await page.goto('/answers');
  const restoredAnswer = page.getByRole('article').filter({ hasText: answerTitle });
  await expect(restoredAnswer).toContainText('I like turning complex work into clear, useful experiences.');
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article').filter({ hasText: answerTitle })).toContainText(
    'I like turning complex work into clear, useful experiences.',
  );

  await page.goto('/applications');
  const restoredApplication = page.getByRole('article').filter({ hasText: company });
  await expect(restoredApplication).toContainText('Product designer');
  await expect(restoredApplication).toContainText('Review the role brief');
  await page.reload();
  const reloadedApplication = page.getByRole('article').filter({ hasText: company });
  await expect(reloadedApplication).toContainText('Product designer');
  await expect(reloadedApplication).toContainText('Review the role brief');

  await page.goto('/profile');
  await page.reload();
  await expectProfile(page);
});

test('keeps the current draft, saved workspace, and storage unchanged when restore is cancelled', async ({ page }) => {
  const backupAnswerTitle = 'Backup answer';
  const backupCompany = 'Backup Labs';
  const currentAnswerTitle = 'Current answer';
  const currentCompany = 'Current Labs';

  await page.goto('/profile');
  await fillProfile(page);
  await page.getByTestId('button-save-profile').click();

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill(backupAnswerTitle);
  await page.getByTestId('textarea-answer-content').fill('This answer belongs to the validated backup.');
  await page.getByTestId('button-save-answer').click();

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill(backupCompany);
  await page.getByTestId('input-role').fill('Backup role');
  await page.getByTestId('input-nextAction').fill('Review the backup role');
  await page.getByTestId('button-save-application').click();

  await page.goto('/profile');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('button-export-workspace').click();
  const backup = await downloadBuffer(await downloadPromise);
  const expectedBackup = JSON.parse(backup.toString()) as {
    profile: typeof profileValues;
    answers: unknown[];
    applications: unknown[];
  };

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill(currentAnswerTitle);
  await page.getByTestId('textarea-answer-content').fill('This answer should remain after cancelling restore.');
  await page.getByTestId('button-save-answer').click();

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill(currentCompany);
  await page.getByTestId('input-role').fill('Current role');
  await page.getByTestId('input-nextAction').fill('Keep working on the current queue');
  await page.getByTestId('button-save-application').click();

  await page.goto('/profile');
  await page.getByTestId('input-first_name').fill('Draft only');
  const storageBeforeCancel = await page.evaluate(() => ({
    profile: localStorage.getItem('escape-hatch-profile'),
    answers: localStorage.getItem('escape-hatch-answers'),
    applications: localStorage.getItem('escape-hatch-applications'),
  }));

  await page.getByTestId('input-import-workspace').setInputFiles({
    name: 'escape-hatch-workspace.json',
    mimeType: 'application/json',
    buffer: backup,
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('workspace-restore-newer-changes-warning')).toBeVisible();
  await expect(page.getByTestId('workspace-restore-newer-profile')).toHaveText('Profile');
  await expect(page.getByTestId('workspace-restore-newer-answers')).toHaveText('Answer library');
  await expect(page.getByTestId('workspace-restore-newer-applications')).toHaveText('Application queue');
  await expect(page.getByTestId('workspace-restore-profile-summary')).toContainText('Ada Lovelace');
  await expect(page.getByTestId('workspace-restore-answers-summary')).toContainText(backupAnswerTitle);
  await expect(page.getByTestId('workspace-restore-applications-summary')).toContainText(`${backupCompany} · Backup role`);
  await page.getByTestId('button-cancel-restore-workspace').click();

  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByTestId('input-first_name')).toHaveValue('Draft only');
  await expect(page.getByTestId('workspace-import-feedback')).toHaveCount(0);
  await expect(page.evaluate(() => ({
    profile: localStorage.getItem('escape-hatch-profile'),
    answers: localStorage.getItem('escape-hatch-answers'),
    applications: localStorage.getItem('escape-hatch-applications'),
  }))).resolves.toEqual(storageBeforeCancel);

  await page.goto('/answers');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('article').filter({ hasText: backupAnswerTitle })).toContainText(
    'This answer belongs to the validated backup.',
  );
  await expect(page.getByRole('article').filter({ hasText: currentAnswerTitle })).toContainText(
    'This answer should remain after cancelling restore.',
  );

  await page.goto('/applications');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('article').filter({ hasText: backupCompany })).toContainText('Backup role');
  await expect(page.getByRole('article').filter({ hasText: currentCompany })).toContainText('Current role');

  await page.goto('/profile');
  await page.getByTestId('input-import-workspace').setInputFiles({
    name: 'escape-hatch-workspace.json',
    mimeType: 'application/json',
    buffer: backup,
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByTestId('button-confirm-restore-workspace').click();
  await expect(page.getByTestId('workspace-import-feedback')).toHaveText(
    'Workspace restored. Your profile, answers, and applications are back.',
  );
  await expectProfile(page);

  const restoredStorage = await page.evaluate(() => ({
    profile: localStorage.getItem('escape-hatch-profile'),
    answers: localStorage.getItem('escape-hatch-answers'),
    applications: localStorage.getItem('escape-hatch-applications'),
  }));
  expect(JSON.parse(restoredStorage.profile ?? 'null')).toEqual(expectedBackup.profile);
  expect(JSON.parse(restoredStorage.answers ?? 'null')).toEqual(expectedBackup.answers);
  expect(JSON.parse(restoredStorage.applications ?? 'null')).toEqual(expectedBackup.applications);

  await page.goto('/answers');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article').filter({ hasText: backupAnswerTitle })).toContainText(
    'This answer belongs to the validated backup.',
  );
  await expect(page.getByRole('article').filter({ hasText: currentAnswerTitle })).toHaveCount(0);

  await page.goto('/applications');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article').filter({ hasText: backupCompany })).toContainText('Backup role');
  await expect(page.getByRole('article').filter({ hasText: currentCompany })).toHaveCount(0);
});

test('restores multiple saved items with full details and order after reload', async ({ page }) => {
  const answers = [
    {
      title: 'How I make complex work clear',
      category: 'Strengths',
      content: 'I turn ambiguous problems into practical, understandable steps.',
    },
    {
      title: 'Why this kind of work matters',
      category: 'Motivation',
      content: 'I enjoy building tools that help people make confident decisions.',
    },
  ];
  const opportunities = [
    {
      company: 'Northstar Systems',
      role: 'Product strategist',
      status: 'preparing',
      priority: 'high',
      notes: 'Strong mission and a thoughtful interview process.',
      nextAction: 'Outline three product questions',
    },
    {
      company: 'Lumen Works',
      role: 'Experience designer',
      status: 'follow_up',
      priority: 'low',
      notes: 'Reconnect after the hiring manager returns.',
      nextAction: 'Send a follow-up next Tuesday',
    },
  ];

  await page.goto('/answers');
  for (const answer of answers) {
    await page.getByTestId('button-add-answer').click();
    await page.getByTestId('input-answer-title').fill(answer.title);
    await page.getByTestId('select-answer-category').selectOption({ label: answer.category });
    await page.getByTestId('textarea-answer-content').fill(answer.content);
    await page.getByTestId('button-save-answer').click();
  }

  await page.goto('/applications');
  for (const opportunity of opportunities) {
    await page.getByTestId('button-add-application').click();
    await page.getByTestId('input-company').fill(opportunity.company);
    await page.getByTestId('input-role').fill(opportunity.role);
    await page.getByTestId('select-application-status').selectOption(opportunity.status);
    await page.getByTestId('select-application-priority').selectOption(opportunity.priority);
    await page.getByTestId('textarea-notes').fill(opportunity.notes);
    await page.getByTestId('input-nextAction').fill(opportunity.nextAction);
    await page.getByTestId('button-save-application').click();
  }

  await page.goto('/profile');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('button-export-workspace').click();
  const backup = await downloadBuffer(await downloadPromise);

  await page.getByTestId('input-first_name').fill('Changed');
  await page.getByTestId('input-import-workspace').setInputFiles({
    name: 'escape-hatch-workspace.json',
    mimeType: 'application/json',
    buffer: backup,
  });
  await page.getByTestId('button-confirm-restore-workspace').click();
  await expect(page.getByTestId('workspace-import-feedback')).toHaveText(
    'Workspace restored. Your profile, answers, and applications are back.',
  );

  await page.goto('/answers');
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(answers.length);
  await expect(page.getByRole('article').locator('h3')).toHaveText(answers.map((answer) => answer.title).reverse());
  for (const answer of answers) {
    const card = page.getByRole('article').filter({ hasText: answer.title });
    await expect(card).toContainText(answer.category);
    await expect(card).toContainText(answer.content);
  }

  await page.goto('/applications');
  await page.reload();
  const expectedOpportunityOrder = [...opportunities].reverse();
  await expect(page.getByRole('article')).toHaveCount(expectedOpportunityOrder.length);
  await expect(page.getByRole('article').locator('h3')).toHaveText(
    expectedOpportunityOrder.map((opportunity) => opportunity.company),
  );
  for (const opportunity of expectedOpportunityOrder) {
    const card = page.getByRole('article').filter({ hasText: opportunity.company });
    await expect(card).toContainText(opportunity.role);
    await expect(card).toContainText(opportunity.status === 'follow_up' ? 'Follow up' : 'Preparing');
    await expect(card).toContainText(opportunity.nextAction);
  }

  for (const opportunity of expectedOpportunityOrder) {
    const card = page.getByRole('article').filter({ hasText: opportunity.company });
    await card.getByRole('button', { name: 'Details' }).click();
    await expect(card).toContainText(opportunity.notes);
    await card.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByTestId('select-application-status')).toHaveValue(opportunity.status);
    await expect(page.getByTestId('select-application-priority')).toHaveValue(opportunity.priority);
    await page.getByTestId('button-cancel-application').click();
  }
});

test('returns focus to the active filter when an edited opportunity leaves the queue', async ({ page }) => {
  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Northstar Systems');
  await page.getByTestId('input-role').fill('Product strategist');
  await page.getByTestId('select-application-status').selectOption('preparing');
  await page.getByTestId('button-save-application').click();

  await page.getByTestId('button-filter-application-preparing').click();
  const opportunity = page.getByRole('article').filter({ hasText: 'Northstar Systems' });
  await opportunity.getByRole('button', { name: 'Edit' }).click();
  await page.getByTestId('select-application-status').selectOption('closed');
  await page.getByTestId('button-save-application').click();

  await expect(opportunity).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Preparing', exact: true })).toBeFocused();
});

test('keeps a restored workspace after reopening a persistent browser context', async ({ browser }) => {
  const answerTitle = 'Why I want to build useful tools';
  const answerContent = 'I like turning complex work into clear, useful experiences.';
  const company = 'Acme Labs';
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'escape-hatch-persistent-'));
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error('The browser test base URL is not configured.');
  const browserType = browser.browserType();

  const launchOptions = {
    baseURL,
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/repl/tools/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  };

  try {
    const firstContext = await browserType.launchPersistentContext(userDataDir, launchOptions);
    try {
      const page = firstContext.pages()[0] ?? (await firstContext.newPage());

      await page.goto('/answers');
      await page.getByTestId('button-add-answer').click();
      await page.getByTestId('input-answer-title').fill(answerTitle);
      await page.getByTestId('textarea-answer-content').fill(answerContent);
      await page.getByTestId('button-save-answer').click();

      await page.goto('/applications');
      await page.getByTestId('button-add-application').click();
      await page.getByTestId('input-company').fill(company);
      await page.getByTestId('input-role').fill('Product designer');
      await page.getByTestId('input-nextAction').fill('Review the role brief');
      await page.getByTestId('button-save-application').click();

      await page.goto('/profile');
      await fillProfile(page);
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('button-export-workspace').click();
      const backup = await downloadBuffer(await downloadPromise);

      await page.getByTestId('input-first_name').fill('Changed');
      await page.getByTestId('input-import-workspace').setInputFiles({
        name: 'escape-hatch-workspace.json',
        mimeType: 'application/json',
        buffer: backup,
      });
      await page.getByTestId('button-confirm-restore-workspace').click();
      await expect(page.getByTestId('workspace-import-feedback')).toHaveText(
        'Workspace restored. Your profile, answers, and applications are back.',
      );
      await expect(page.getByTestId('input-first_name')).toHaveValue(profileValues.first_name);
    } finally {
      await firstContext.close();
    }

    const reopenedContext = await browserType.launchPersistentContext(userDataDir, launchOptions);
    try {
      const reopenedPage = reopenedContext.pages()[0] ?? (await reopenedContext.newPage());

      await reopenedPage.goto('/profile');
      await expectProfile(reopenedPage);

      await reopenedPage.goto('/answers');
      await expect(reopenedPage.getByRole('article').filter({ hasText: answerTitle })).toContainText(answerContent);

      await reopenedPage.goto('/applications');
      const restoredApplication = reopenedPage.getByRole('article').filter({ hasText: company });
      await expect(restoredApplication).toContainText('Product designer');
      await expect(restoredApplication).toContainText('Review the role brief');
    } finally {
      await reopenedContext.close();
    }
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('rejects an invalid workspace backup without changing saved data', async ({ page }) => {
  await page.goto('/profile');
  await page.getByTestId('input-first_name').fill('Draft');
  await page.getByTestId('input-import-workspace').setInputFiles({
    name: 'invalid-workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      schema: 'escape-hatch-workspace',
      version: 1,
      profile: { ...Object.fromEntries(Object.keys(profileValues).map((field) => [field, ''])) },
      answers: [{ id: 'broken' }],
      applications: [],
    })),
  });

  await expect(page.getByTestId('workspace-import-feedback')).toHaveText(
    'This workspace backup has missing or invalid answer data.',
  );
  await expect(page.getByTestId('input-first_name')).toHaveValue('Draft');
});

test('keeps an empty answer form open until a valid answer is saved', async ({ page }) => {
  const answerTitle = 'Why I want to build useful tools';

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  const dialog = page.getByRole('dialog');

  await page.getByTestId('button-save-answer').click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);

  await page.getByTestId('input-answer-title').fill(answerTitle);
  await page.getByTestId('textarea-answer-content').fill('I like turning complex work into clear, useful experiences.');
  await page.getByTestId('button-save-answer').click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('article')).toContainText(answerTitle);
});

test('explains missing answer details and focuses the first invalid field', async ({ page }) => {
  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();

  await expect(page.getByRole('dialog', { name: 'New answer' })).toBeVisible();
  const title = page.getByTestId('input-answer-title');
  const content = page.getByTestId('textarea-answer-content');
  await page.getByTestId('button-save-answer').click();

  await expect(page.getByTestId('answer-title-error')).toHaveText('Add a short title before saving.');
  await expect(page.getByTestId('answer-content-error')).toHaveText('Write an answer before saving.');
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await expect(title).toHaveAttribute('aria-describedby', 'answer-title-error');
  await expect(content).toHaveAttribute('aria-invalid', 'true');
  await expect(content).toHaveAttribute('aria-describedby', 'answer-content-error');
  await expect(title).toBeFocused();

  await title.fill('   ');
  await content.fill('\n\t');
  await page.getByTestId('button-save-answer').click();
  await expect(page.getByRole('dialog', { name: 'New answer' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  await expect(page.getByTestId('answer-title-error')).toHaveText('Add a short title before saving.');
  await expect(page.getByTestId('answer-content-error')).toHaveText('Write an answer before saving.');
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await expect(title).toHaveAttribute('aria-describedby', 'answer-title-error');
  await expect(content).toHaveAttribute('aria-invalid', 'true');
  await expect(content).toHaveAttribute('aria-describedby', 'answer-content-error');
  await expect(title).toBeFocused();

  await title.fill('Why I want to build useful tools');
  await expect(page.getByTestId('answer-title-error')).toHaveCount(0);
  await expect(page.getByTestId('answer-content-error')).toHaveText('Write an answer before saving.');
  await expect(title).not.toHaveAttribute('aria-invalid', 'true');
  await expect(title).not.toHaveAttribute('aria-describedby', 'answer-title-error');

  await content.fill('I like turning complex work into clear, useful experiences.');
  await expect(page.getByTestId('answer-content-error')).toHaveCount(0);
  await expect(content).not.toHaveAttribute('aria-invalid', 'true');
  await expect(content).not.toHaveAttribute('aria-describedby', 'answer-content-error');
});

test('keeps an application form open when company or role is missing', async ({ page }) => {
  const firstCompany = 'Acme Labs';
  const firstRole = 'Product designer';
  const secondCompany = 'Northstar Studio';
  const secondRole = 'UX researcher';

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  const firstDialog = page.getByRole('dialog');

  await page.getByTestId('input-role').fill(firstRole);
  await page.getByTestId('button-save-application').click();
  await expect(firstDialog).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);

  await page.getByTestId('input-company').fill(firstCompany);
  await page.getByTestId('button-save-application').click();
  await expect(firstDialog).not.toBeVisible();
  await expect(page.getByRole('article')).toContainText(firstCompany);

  await page.getByTestId('button-add-application').click();
  const secondDialog = page.getByRole('dialog');
  await page.getByTestId('input-company').fill(secondCompany);
  await page.getByTestId('button-save-application').click();
  await expect(secondDialog).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);

  await page.getByTestId('input-role').fill(secondRole);
  await page.getByTestId('button-save-application').click();
  await expect(secondDialog).not.toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.locator('article').filter({ hasText: secondCompany })).toContainText(secondCompany);
});

test('explains missing application details and focuses the first invalid field', async ({ page }) => {
  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();

  const company = page.getByTestId('input-company');
  const role = page.getByTestId('input-role');
  await page.getByTestId('button-save-application').click();

  await expect(page.getByTestId('company-error')).toHaveText('Add a company before saving.');
  await expect(page.getByTestId('role-error')).toHaveText('Add a role before saving.');
  await expect(company).toHaveAttribute('aria-invalid', 'true');
  await expect(company).toHaveAttribute('aria-describedby', 'company-error');
  await expect(role).toHaveAttribute('aria-invalid', 'true');
  await expect(role).toHaveAttribute('aria-describedby', 'role-error');
  await expect(company).toBeFocused();

  await company.fill(' \t ');
  await role.fill('\n');
  await page.getByTestId('button-save-application').click();
  await expect(page.getByRole('dialog', { name: 'Add opportunity' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  await expect(page.getByTestId('company-error')).toHaveText('Add a company before saving.');
  await expect(page.getByTestId('role-error')).toHaveText('Add a role before saving.');
  await expect(company).toHaveAttribute('aria-invalid', 'true');
  await expect(company).toHaveAttribute('aria-describedby', 'company-error');
  await expect(role).toHaveAttribute('aria-invalid', 'true');
  await expect(role).toHaveAttribute('aria-describedby', 'role-error');
  await expect(company).toBeFocused();

  await company.fill('Acme Labs');
  await expect(page.getByTestId('company-error')).toHaveCount(0);
  await expect(page.getByTestId('role-error')).toHaveText('Add a role before saving.');
  await expect(company).not.toHaveAttribute('aria-invalid', 'true');
  await expect(company).not.toHaveAttribute('aria-describedby', 'company-error');

  await role.fill('Product designer');
  await expect(page.getByTestId('role-error')).toHaveCount(0);
  await expect(role).not.toHaveAttribute('aria-invalid', 'true');
  await expect(role).not.toHaveAttribute('aria-describedby', 'role-error');
});

test('rejects edits that clear an answer title or content', async ({ page }) => {
  const answerTitle = 'Why I want to build useful tools';
  const answerContent = 'I like turning complex work into clear, useful experiences.';

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill(answerTitle);
  await page.getByTestId('textarea-answer-content').fill(answerContent);
  await page.getByTestId('button-save-answer').click();

  const savedAnswer = page.locator('article').filter({ hasText: answerTitle });
  await expect(savedAnswer).toContainText(answerContent);

  await savedAnswer.getByRole('button', { name: `Edit ${answerTitle}` }).click();
  const dialog = page.getByRole('dialog');

  await page.getByTestId('input-answer-title').fill('');
  await page.getByTestId('button-save-answer').click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText(answerTitle);
  await expect(page.getByRole('article')).toContainText(answerContent);

  await page.getByTestId('input-answer-title').fill(answerTitle);
  await page.getByTestId('textarea-answer-content').fill('');
  await page.getByTestId('button-save-answer').click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText(answerTitle);
  await expect(page.getByRole('article')).toContainText(answerContent);

  await page.getByTestId('button-close-dialog').click();
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText(answerTitle);
  await expect(page.getByRole('article')).toContainText(answerContent);
});

test('rejects edits that clear an application company or role', async ({ page }) => {
  const company = 'Acme Labs';
  const role = 'Product designer';

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill(company);
  await page.getByTestId('input-role').fill(role);
  await page.getByTestId('button-save-application').click();

  const savedApplication = page.locator('article').filter({ hasText: company });
  await expect(savedApplication).toContainText(role);

  await savedApplication.locator('[data-testid^="button-edit-application-"]').click();
  const dialog = page.getByRole('dialog');

  await page.getByTestId('input-company').fill('');
  await page.getByTestId('button-save-application').click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText(company);
  await expect(page.getByRole('article')).toContainText(role);

  await page.getByTestId('input-company').fill(company);
  await page.getByTestId('input-role').fill('');
  await page.getByTestId('button-save-application').click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText(company);
  await expect(page.getByRole('article')).toContainText(role);

  await page.getByTestId('button-close-dialog').click();
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText(company);
  await expect(page.getByRole('article')).toContainText(role);
});

test('keeps answer add, edit, and delete changes after reloads', async ({ page }) => {
  const answerTitle = 'Why I want to build useful tools';
  const editedTitle = 'Why I build useful tools';

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill(answerTitle);
  await page.getByTestId('select-answer-category').selectOption({ label: 'Motivation' });
  await page.getByTestId('textarea-answer-content').fill('I like turning complex work into clear, useful experiences.');
  await page.getByTestId('button-save-answer').click();
  await expect(page.getByRole('article')).toContainText(answerTitle);

  await page.reload();
  const savedAnswer = page.locator('article').filter({ hasText: answerTitle });
  await expect(savedAnswer).toBeVisible();

  await savedAnswer.getByRole('button', { name: `Edit ${answerTitle}` }).click();
  await page.getByTestId('input-answer-title').fill(editedTitle);
  await page.getByTestId('textarea-answer-content').fill('I make complex work clearer and more useful.');
  await page.getByTestId('button-save-answer').click();
  await expect(page.getByRole('article')).toContainText(editedTitle);

  await page.reload();
  const editedAnswer = page.locator('article').filter({ hasText: editedTitle });
  await expect(editedAnswer).toContainText('I make complex work clearer and more useful.');

  page.once('dialog', (dialog) => dialog.accept());
  await editedAnswer.getByRole('button', { name: `Delete ${editedTitle}` }).click();
  await expect(page.getByRole('heading', { name: 'Your good answers belong here.' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your good answers belong here.' })).toBeVisible();
});

test('undoes answer and application deletions with complete entries in their original positions', async ({ page }) => {
  const answers = [
    ['First answer', 'First answer content'],
    ['Second answer', 'Second answer content'],
    ['Third answer', 'Third answer content'],
  ];

  await page.goto('/answers');
  for (const [title, content] of answers) {
    await page.getByTestId('button-add-answer').click();
    await page.getByTestId('input-answer-title').fill(title);
    await page.getByTestId('textarea-answer-content').fill(content);
    await page.getByTestId('button-save-answer').click();
  }

  const answerCards = page.locator('article');
  const secondAnswer = answerCards.filter({ hasText: 'Second answer' });
  page.once('dialog', (dialog) => dialog.accept());
  await secondAnswer.getByRole('button', { name: 'Delete Second answer' }).click();
  await expect(page.getByTestId('answer-undo-notice')).toContainText('Answer deleted.');
  await page.getByTestId('button-undo-answer').click();
  await expect(answerCards).toHaveCount(3);
  await expect(answerCards.nth(0)).toContainText('Third answer content');
  await expect(answerCards.nth(1)).toContainText('Second answer content');
  await expect(answerCards.nth(2)).toContainText('First answer content');

  await page.reload();
  await expect(page.locator('article').filter({ hasText: 'Second answer' })).toContainText('Second answer content');

  const applications = [
    ['First Company', 'First role'],
    ['Second Company', 'Second role'],
    ['Third Company', 'Third role'],
  ];
  await page.goto('/applications');
  for (const [company, role] of applications) {
    await page.getByTestId('button-add-application').click();
    await page.getByTestId('input-company').fill(company);
    await page.getByTestId('input-role').fill(role);
    await page.getByTestId('button-save-application').click();
  }

  const applicationRows = page.locator('article');
  const secondApplication = applicationRows.filter({ hasText: 'Second Company' });
  page.once('dialog', (dialog) => dialog.accept());
  await secondApplication.getByRole('button', { name: 'Details' }).click();
  await secondApplication.getByTestId(/button-delete-application-/).click();
  await expect(page.getByTestId('application-undo-notice')).toContainText('Opportunity deleted.');
  await page.getByTestId('button-undo-application').click();
  await expect(applicationRows).toHaveCount(3);
  await expect(applicationRows.nth(0)).toContainText('Third Company');
  await expect(applicationRows.nth(1)).toContainText('Second Company');
  await expect(applicationRows.nth(2)).toContainText('First Company');

  await page.reload();
  await expect(page.locator('article').filter({ hasText: 'Second Company' })).toContainText('Second role');
});

test('keeps application add, edit, and delete changes after reloads', async ({ page }) => {
  const company = 'Acme Labs';
  const editedCompany = 'Acme Research';

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill(company);
  await page.getByTestId('input-role').fill('Product designer');
  await page.getByTestId('input-url').fill('https://acme.example/jobs/1');
  await page.getByTestId('select-application-status').selectOption('preparing');
  await page.getByTestId('select-application-priority').selectOption('high');
  await page.getByTestId('input-nextAction').fill('Review the role brief');
  await page.getByTestId('textarea-notes').fill('Strong fit for the research team.');
  await page.getByTestId('button-save-application').click();
  await expect(page.getByRole('article')).toContainText(company);

  await page.reload();
  const savedApplication = page.locator('article').filter({ hasText: company });
  await expect(savedApplication).toContainText('Product designer');

  await savedApplication.locator('[data-testid^="button-edit-application-"]').click();
  await page.getByTestId('input-company').fill(editedCompany);
  await page.getByTestId('input-role').fill('Senior product designer');
  await page.getByTestId('select-application-status').selectOption('applied');
  await page.getByTestId('input-nextAction').fill('Send a follow-up');
  await page.getByTestId('textarea-notes').fill('Updated notes after the interview.');
  await page.getByTestId('button-save-application').click();
  await expect(page.getByRole('article')).toContainText(editedCompany);

  await page.reload();
  const editedApplication = page.locator('article').filter({ hasText: editedCompany });
  await expect(editedApplication).toContainText('Senior product designer');
  await editedApplication.getByRole('button', { name: 'Details' }).click();
  await expect(editedApplication).toContainText('Updated notes after the interview.');

  page.once('dialog', (dialog) => dialog.accept());
  await editedApplication.locator('[data-testid^="button-delete-application-"]').click();
  await expect(page.getByRole('heading', { name: 'Your next move starts here.' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your next move starts here.' })).toBeVisible();
});

test('removes the home mark-applied shortcut after reload', async ({ page }) => {
  const company = 'Northstar Studio';
  const role = 'UX researcher';
  const inMotion = page.getByTestId('link-stat-0');
  const onDeck = page.getByTestId('link-stat-1');

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill(company);
  await page.getByTestId('input-role').fill(role);
  await page.getByTestId('button-save-application').click();

  await page.goto('/');
  await expect(inMotion).toContainText('0');
  await expect(onDeck).toContainText('1');
  await page.getByRole('button', { name: 'Mark applied' }).click();
  await expect(inMotion).toContainText('1');
  await expect(onDeck).toContainText('0');

  await page.reload();
  await expect(inMotion).toContainText('1');
  await expect(onDeck).toContainText('0');
  await expect(page.getByRole('button', { name: 'Mark applied' })).toHaveCount(0);
  await expect(page.getByText('Applied', { exact: true })).toBeVisible();

  const savedApplication = page.locator('article').filter({ hasText: company });
  await page.getByTestId('link-stat-0').click();
  await expect(savedApplication).toContainText(role);
  await expect(savedApplication).toContainText('Applied');

  await page.reload();
  const reloadedApplication = page.locator('article').filter({ hasText: company });
  await expect(reloadedApplication).toContainText(role);
  await expect(reloadedApplication).toContainText('Applied');
});

test('undoes the home mark-applied shortcut and persists the complete opportunity', async ({ page }) => {
  const opportunity = {
    company: 'Undoable Studio',
    role: 'Product researcher',
    url: 'https://undoable.example/jobs/1',
    nextAction: 'Prepare a thoughtful application',
    notes: 'Keep the research case study ready for this role.',
  };

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill(opportunity.company);
  await page.getByTestId('input-role').fill(opportunity.role);
  await page.getByTestId('input-url').fill(opportunity.url);
  await page.getByTestId('select-application-priority').selectOption('high');
  await page.getByTestId('input-nextAction').fill(opportunity.nextAction);
  await page.getByTestId('textarea-notes').fill(opportunity.notes);
  await page.getByTestId('button-save-application').click();

  await page.goto('/');
  const inMotion = page.getByTestId('link-stat-0');
  const onDeck = page.getByTestId('link-stat-1');
  await expect(inMotion).toContainText('0');
  await expect(onDeck).toContainText('1');
  await page.getByRole('button', { name: 'Mark applied' }).click();
  await expect(page.getByTestId('home-applied-undo-notice')).toContainText(`Marked ${opportunity.company} applied.`);
  await expect(page.getByTestId('button-undo-mark-applied')).toBeVisible();
  await expect(inMotion).toContainText('1');
  await expect(onDeck).toContainText('0');

  await page.getByTestId('button-undo-mark-applied').click();
  await expect(page.getByTestId('home-applied-undo-notice')).toHaveCount(0);
  await expect(inMotion).toContainText('0');
  await expect(onDeck).toContainText('1');

  await page.goto('/applications');
  const restored = page.locator('article').filter({ hasText: opportunity.company });
  await expect(restored).toContainText(opportunity.role);
  await expect(restored).toContainText('Saved');
  await expect(restored).toContainText(opportunity.nextAction);
  await restored.getByRole('button', { name: 'Details' }).click();
  await expect(restored).toContainText(opportunity.notes);
  await expect(restored.getByRole('link', { name: opportunity.url })).toBeVisible();

  await page.reload();
  const reloaded = page.locator('article').filter({ hasText: opportunity.company });
  await expect(reloaded).toContainText(opportunity.role);
  await expect(reloaded).toContainText('Saved');
  await expect(reloaded).toContainText(opportunity.nextAction);
  await reloaded.getByRole('button', { name: 'Details' }).click();
  await expect(reloaded).toContainText(opportunity.notes);
  await expect(reloaded.getByRole('link', { name: opportunity.url })).toBeVisible();
});

test('excludes closed opportunities from dashboard counts after reload', async ({ page }) => {
  const company = 'Closed Loop Labs';
  const role = 'Operations researcher';

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill(company);
  await page.getByTestId('input-role').fill(role);
  await page.getByTestId('button-save-application').click();

  const application = page.locator('article').filter({ hasText: company });
  await application.locator('[data-testid^="button-edit-application-"]').click();
  await page.getByTestId('select-application-status').selectOption('closed');
  await page.getByTestId('button-save-application').click();

  await page.reload();
  const reloadedApplication = page.locator('article').filter({ hasText: company });
  await expect(reloadedApplication).toContainText(role);
  await expect(reloadedApplication).toContainText('Closed');

  const inMotion = page.getByTestId('link-stat-0');
  const onDeck = page.getByTestId('link-stat-1');
  await page.goto('/');
  await expect(inMotion).toContainText('0');
  await expect(onDeck).toContainText('0');

  await page.reload();
  await expect(inMotion).toContainText('0');
  await expect(onDeck).toContainText('0');
});

test('syncs answer and application changes across open tabs', async ({ page }) => {
  const secondPage = await page.context().newPage();
  try {
    await page.goto('/answers');
    await secondPage.goto('/answers');

    await page.getByTestId('button-add-answer').click();
    await page.getByTestId('input-answer-title').fill('Shared answer');
    await page.getByTestId('textarea-answer-content').fill('Saved from the first tab.');
    await page.getByTestId('button-save-answer').click();
    await expect(secondPage.locator('article').filter({ hasText: 'Shared answer' })).toContainText('Saved from the first tab.');

    const answer = page.locator('article').filter({ hasText: 'Shared answer' });
    await answer.getByRole('button', { name: 'Edit Shared answer' }).click();
    await page.getByTestId('input-answer-title').fill('Edited shared answer');
    await page.getByTestId('textarea-answer-content').fill('Updated from the first tab.');
    await page.getByTestId('button-save-answer').click();
    await expect(secondPage.locator('article').filter({ hasText: 'Edited shared answer' })).toContainText('Updated from the first tab.');

    const secondAnswer = secondPage.locator('article').filter({ hasText: 'Edited shared answer' });
    secondPage.once('dialog', (dialog) => dialog.accept());
    await secondAnswer.getByRole('button', { name: 'Delete Edited shared answer' }).click();
    await expect(page.locator('article').filter({ hasText: 'Edited shared answer' })).toHaveCount(0);

    await page.goto('/applications');
    await secondPage.goto('/applications');

    await page.getByTestId('button-add-application').click();
    await page.getByTestId('input-company').fill('Shared Company');
    await page.getByTestId('input-role').fill('Shared role');
    await page.getByTestId('button-save-application').click();
    await expect(secondPage.locator('article').filter({ hasText: 'Shared Company' })).toContainText('Shared role');

    const application = page.locator('article').filter({ hasText: 'Shared Company' });
    await application.locator('[data-testid^="button-edit-application-"]').click();
    await page.getByTestId('input-company').fill('Edited Shared Company');
    await page.getByTestId('input-role').fill('Edited shared role');
    await page.getByTestId('button-save-application').click();
    await expect(secondPage.locator('article').filter({ hasText: 'Edited Shared Company' })).toContainText('Edited shared role');

    const secondApplication = secondPage.locator('article').filter({ hasText: 'Edited Shared Company' });
    await secondApplication.getByRole('button', { name: 'Details' }).click();
    secondPage.once('dialog', (dialog) => dialog.accept());
    await secondApplication.getByTestId(/button-delete-application-/).click();
    await expect(page.locator('article').filter({ hasText: 'Edited Shared Company' })).toHaveCount(0);
  } finally {
    await secondPage.close();
  }
});

test('returns focus to the answer form launch control after closing', async ({ page }) => {
  await page.goto('/answers');

  const pageAddButton = page.getByTestId('button-add-answer');
  await pageAddButton.click();
  await page.getByTestId('button-cancel-answer').click();
  await expect(page.getByTestId('answer-form-announcement')).toHaveText('No changes were saved.');
  await expect(pageAddButton).toBeFocused();

  await pageAddButton.click();
  await page.getByTestId('input-answer-title').fill('A concise answer');
  await page.getByTestId('textarea-answer-content').fill('A useful answer.');
  await page.getByTestId('button-save-answer').click();
  await expect(page.getByTestId('answer-form-announcement')).toHaveText('Answer saved.');
  await expect(pageAddButton).toBeFocused();

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const emptyAddButton = page.getByTestId('button-empty-add-answer');
  await emptyAddButton.click();
  await page.getByTestId('button-cancel-answer').click();
  await expect(emptyAddButton).toBeFocused();
});

test('returns focus to the opportunity form launch control after closing', async ({ page }) => {
  await page.goto('/applications');

  const pageAddButton = page.getByTestId('button-add-application');
  await pageAddButton.click();
  await page.getByTestId('button-cancel-application').click();
  await expect(page.getByTestId('application-form-announcement')).toHaveText('No changes were saved.');
  await expect(pageAddButton).toBeFocused();

  await pageAddButton.click();
  await page.getByTestId('input-company').fill('Focus Labs');
  await page.getByTestId('input-role').fill('Accessibility designer');
  await page.getByTestId('button-save-application').click();
  await expect(page.getByTestId('application-form-announcement')).toHaveText('Opportunity saved.');
  await expect(pageAddButton).toBeFocused();

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const emptyAddButton = page.getByTestId('button-empty-add-application');
  await emptyAddButton.click();
  await page.getByTestId('button-cancel-application').click();
  await expect(emptyAddButton).toBeFocused();
});

test('recovers a dismissed answer draft without changing a saved answer', async ({ page }) => {
  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Saved answer');
  await page.getByTestId('select-answer-category').selectOption({ label: 'Motivation' });
  await page.getByTestId('textarea-answer-content').fill('The original answer.');
  await page.getByTestId('button-save-answer').click();

  const savedAnswer = page.getByRole('article').filter({ hasText: 'Saved answer' });
  await savedAnswer.getByRole('button', { name: 'Edit Saved answer' }).click();
  await page.getByTestId('input-answer-title').fill('Recovered answer');
  await page.getByTestId('select-answer-category').selectOption({ label: 'Motivation' });
  await page.getByTestId('textarea-answer-content').fill('The recovered content.');
  await page.getByTestId('button-close-dialog').click();

  await expect(page.getByTestId('answer-draft-notice')).toContainText('You have an unsaved answer draft.');
  await expect(savedAnswer).toContainText('Saved answer');
  await expect(savedAnswer).toContainText('The original answer.');
  await page.getByTestId('button-recover-answer-draft').click();
  const recoveredDialog = page.getByRole('dialog', { name: 'Edit answer' });
  await expect(recoveredDialog).toBeVisible();
  await expect(page.getByTestId('input-answer-title')).toHaveValue('Recovered answer');
  await expect(page.getByTestId('select-answer-category')).toHaveValue('Motivation');
  await expect(page.getByTestId('textarea-answer-content')).toHaveValue('The recovered content.');
  await page.getByTestId('button-save-answer').click();

  await expect(page.getByRole('article').filter({ hasText: 'Recovered answer' })).toContainText('The recovered content.');
  await expect(page.getByRole('article').filter({ hasText: 'Saved answer' })).toHaveCount(0);

  await page.reload();
  const reloadedAnswer = page.getByRole('article').filter({ hasText: 'Recovered answer' });
  await expect(reloadedAnswer).toContainText('Motivation');
  await expect(reloadedAnswer).toContainText('The recovered content.');
});

test('recovers a dismissed opportunity draft after Cancel and saves it normally', async ({ page }) => {
  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Draft Labs');
  await page.getByTestId('input-role').fill('Product designer');
  await page.getByTestId('input-url').fill('https://draft.example/jobs/1');
  await page.getByTestId('select-application-status').selectOption('follow_up');
  await page.getByTestId('select-application-priority').selectOption('high');
  await page.getByTestId('input-nextAction').fill('Review the role brief');
  await page.getByTestId('textarea-notes').fill('Remember the accessibility work.');
  await page.getByTestId('button-cancel-application').click();

  await expect(page.getByTestId('application-draft-notice')).toContainText('You have an unsaved opportunity draft.');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByTestId('button-recover-application-draft').click();
  const recoveredDialog = page.getByRole('dialog', { name: 'Add opportunity' });
  await expect(recoveredDialog).toBeVisible();
  await expect(page.getByTestId('input-company')).toHaveValue('Draft Labs');
  await expect(page.getByTestId('input-url')).toHaveValue('https://draft.example/jobs/1');
  await expect(page.getByTestId('select-application-status')).toHaveValue('follow_up');
  await expect(page.getByTestId('select-application-priority')).toHaveValue('high');
  await expect(page.getByTestId('input-nextAction')).toHaveValue('Review the role brief');
  await expect(page.getByTestId('textarea-notes')).toHaveValue('Remember the accessibility work.');
  await page.getByTestId('button-save-application').click();

  await expect(page.getByRole('article').filter({ hasText: 'Draft Labs' })).toContainText('Product designer');
  await expect(page.getByRole('article').filter({ hasText: 'Draft Labs' })).toContainText('Review the role brief');

  await page.reload();
  const reloadedOpportunity = page.getByRole('article').filter({ hasText: 'Draft Labs' });
  await expect(reloadedOpportunity).toContainText('Follow up');
  await reloadedOpportunity.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('select-application-status')).toHaveValue('follow_up');
  await expect(page.getByTestId('select-application-priority')).toHaveValue('high');
});

test('shows and updates the recovery time for answer and opportunity drafts', async ({ page }) => {
  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Timed answer');
  await page.getByTestId('textarea-answer-content').fill('This answer has a recovery window.');
  await page.getByTestId('button-cancel-answer').click();

  const answerRecoveryTime = page.getByTestId('answer-draft-recovery-time');
  await expect(answerRecoveryTime).toHaveText(/Recovery available for [1-8] seconds?/);
  const initialAnswerRecoveryTime = await answerRecoveryTime.textContent();
  await expect.poll(() => answerRecoveryTime.textContent()).not.toBe(initialAnswerRecoveryTime);

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Timed Labs');
  await page.getByTestId('input-role').fill('Product designer');
  await page.getByTestId('button-cancel-application').click();

  await expect(page.getByTestId('application-draft-recovery-time')).toHaveText(/Recovery available for [1-8] seconds?/);
});

test('persists the selected recovery window and uses it for both draft notices', async ({ page }) => {
  await page.goto('/profile');
  const recoverySelect = page.getByTestId('select-draft-recovery-duration');
  await expect(recoverySelect).toHaveValue('8');
  await recoverySelect.selectOption('30');
  await expect(recoverySelect).toHaveValue('30');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('escape-hatch-draft-recovery-seconds'))).toBe('30');

  await page.reload();
  await expect(page.getByTestId('select-draft-recovery-duration')).toHaveValue('30');

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Longer-lived answer');
  await page.getByTestId('textarea-answer-content').fill('This answer has more time to recover.');
  await page.getByTestId('button-cancel-answer').click();
  await expect(page.getByTestId('answer-draft-recovery-time')).toHaveText('Recovery available for 30 seconds');

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Longer-lived Labs');
  await page.getByTestId('input-role').fill('Product designer');
  await page.getByTestId('button-cancel-application').click();
  await expect(page.getByTestId('application-draft-recovery-time')).toHaveText('Recovery available for 30 seconds');
});

test('expires answer and opportunity drafts at the selected recovery deadline', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('30');
  await expect(page.getByTestId('select-draft-recovery-duration')).toHaveValue('30');

  await page.getByTestId('link-sidebar-answer-library').click();
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Selected-window answer');
  await page.getByTestId('textarea-answer-content').fill('This answer should last for the selected window.');
  await page.getByTestId('button-cancel-answer').click();
  await expect(page.getByTestId('answer-draft-notice')).toBeVisible();

  await page.getByTestId('link-sidebar-applications').click();
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Selected-window Labs');
  await page.getByTestId('input-role').fill('Deadline researcher');
  await page.getByTestId('button-cancel-application').click();
  await expect(page.getByTestId('application-draft-notice')).toBeVisible();

  await page.clock.fastForward(29_000);
  await page.getByTestId('link-sidebar-answer-library').click();
  await expect(page.getByTestId('answer-draft-notice')).toBeVisible();
  await expect(page.getByTestId('button-recover-answer-draft')).toBeVisible();

  await page.getByTestId('link-sidebar-applications').click();
  await expect(page.getByTestId('application-draft-notice')).toBeVisible();
  await expect(page.getByTestId('button-recover-application-draft')).toBeVisible();

  await page.clock.fastForward(1_500);
  await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('application-form-announcement')).toHaveText(
    'Your unsaved opportunity draft is no longer available.',
  );

  await page.getByTestId('link-sidebar-answer-library').click();
  await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('answer-form-announcement')).toHaveText(
    'Your unsaved answer draft is no longer available.',
  );
});

test('uses the selected recovery deadline for edited answer and opportunity drafts', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('30');
  await expect(page.getByTestId('select-draft-recovery-duration')).toHaveValue('30');

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Saved answer');
  await page.getByTestId('textarea-answer-content').fill('The original saved answer.');
  await page.getByTestId('button-save-answer').click();

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Saved Labs');
  await page.getByTestId('input-role').fill('Original role');
  await page.getByTestId('button-save-application').click();

  await page.goto('/answers');
  const savedAnswer = page.getByRole('article').filter({ hasText: 'Saved answer' });
  await savedAnswer.getByRole('button', { name: 'Edit Saved answer' }).click();
  await page.getByTestId('input-answer-title').fill('Edited answer');
  await page.getByTestId('textarea-answer-content').fill('The edited answer should be recoverable.');
  await page.getByTestId('button-cancel-answer').click();

  const answerDeadline = (await page.evaluate(() => Date.now())) + 30_000;
  await page.clock.setSystemTime(new Date(answerDeadline - 100));
  await expect(page.getByTestId('answer-draft-notice')).toBeVisible();
  await page.getByTestId('button-recover-answer-draft').click();
  await expect(page.getByRole('dialog', { name: 'Edit answer' })).toBeVisible();
  await expect(page.getByTestId('input-answer-title')).toHaveValue('Edited answer');
  await expect(page.getByTestId('textarea-answer-content')).toHaveValue('The edited answer should be recoverable.');
  await page.getByTestId('button-save-answer').click();

  const editedAnswer = page.getByRole('article').filter({ hasText: 'Edited answer' });
  await editedAnswer.getByRole('button', { name: 'Edit Edited answer' }).click();
  await page.getByTestId('textarea-answer-content').fill('This edited answer should expire.');
  await page.getByTestId('button-cancel-answer').click();
  await expect(page.getByTestId('answer-draft-notice')).toBeVisible();
  await page.clock.fastForward(30_001);
  await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('answer-form-announcement')).toHaveText(
    'Your unsaved answer draft is no longer available.',
  );

  await page.goto('/applications');
  const savedOpportunity = page.getByRole('article').filter({ hasText: 'Saved Labs' });
  await savedOpportunity.getByRole('button', { name: 'Edit' }).click();
  await page.getByTestId('input-role').fill('Edited role');
  await page.getByTestId('textarea-notes').fill('The edited opportunity should be recoverable.');
  await page.getByTestId('button-cancel-application').click();

  const opportunityDeadline = (await page.evaluate(() => Date.now())) + 30_000;
  await page.clock.setSystemTime(new Date(opportunityDeadline - 100));
  await expect(page.getByTestId('application-draft-notice')).toBeVisible();
  await page.getByTestId('button-recover-application-draft').click();
  await expect(page.getByRole('dialog', { name: 'Edit opportunity' })).toBeVisible();
  await expect(page.getByTestId('input-role')).toHaveValue('Edited role');
  await expect(page.getByTestId('textarea-notes')).toHaveValue('The edited opportunity should be recoverable.');
  await page.getByTestId('button-save-application').click();

  await savedOpportunity.getByRole('button', { name: 'Edit' }).click();
  await page.getByTestId('input-role').fill('Expired role');
  await page.getByTestId('button-cancel-application').click();
  await expect(page.getByTestId('application-draft-notice')).toBeVisible();
  await page.clock.fastForward(30_001);
  await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('application-form-announcement')).toHaveText(
    'Your unsaved opportunity draft is no longer available.',
  );
});

test('keeps visible answer and opportunity notices on their original deadline after the preference changes', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  const recoverySelect = page.getByTestId('select-draft-recovery-duration');
  await recoverySelect.selectOption('30');

  await page.getByTestId('link-sidebar-answer-library').click();
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Original-window answer');
  await page.getByTestId('textarea-answer-content').fill('This answer keeps its original recovery deadline.');
  await page.getByTestId('button-cancel-answer').click();
  await expect(page.getByTestId('answer-draft-recovery-time')).toHaveText('Recovery available for 30 seconds');

  await page.getByTestId('link-sidebar-applications').click();
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Original-window Labs');
  await page.getByTestId('input-role').fill('Deadline researcher');
  await page.getByTestId('button-cancel-application').click();
  await expect(page.getByTestId('application-draft-recovery-time')).toHaveText('Recovery available for 30 seconds');

  await page.getByTestId('link-sidebar-profile').click();
  await recoverySelect.selectOption('8');
  await recoverySelect.selectOption('60');
  await recoverySelect.selectOption('8');

  await page.getByTestId('link-sidebar-answer-library').click();
  await expect(page.getByTestId('answer-draft-recovery-time')).toHaveText('Recovery available for 30 seconds');
  await page.getByTestId('link-sidebar-applications').click();
  await expect(page.getByTestId('application-draft-recovery-time')).toHaveText('Recovery available for 30 seconds');

  await page.clock.fastForward(29_000);
  await page.getByTestId('link-sidebar-profile').click();
  await recoverySelect.selectOption('60');
  await recoverySelect.selectOption('8');
  await page.getByTestId('link-sidebar-applications').click();
  await expect(page.getByTestId('application-draft-notice')).toBeVisible();
  await expect(page.getByTestId('application-draft-recovery-time')).toHaveText('Recovery available for 1 second');
  await expect(page.getByTestId('button-recover-application-draft')).toBeVisible();
  await page.getByTestId('link-sidebar-answer-library').click();
  await expect(page.getByTestId('answer-draft-notice')).toBeVisible();
  await expect(page.getByTestId('answer-draft-recovery-time')).toHaveText('Recovery available for 1 second');
  await expect(page.getByTestId('button-recover-answer-draft')).toBeVisible();

  await page.clock.fastForward(1_500);
  await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('answer-form-announcement')).toHaveText(
    'Your unsaved answer draft is no longer available.',
  );
  await page.getByTestId('link-sidebar-applications').click();
  await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('application-form-announcement')).toHaveText(
    'Your unsaved opportunity draft is no longer available.',
  );
});

test('keeps expired drafts unavailable after changing the recovery preference', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  const recoverySelect = page.getByTestId('select-draft-recovery-duration');
  await recoverySelect.selectOption('8');

  await page.getByTestId('link-sidebar-answer-library').click();
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Expired answer');
  await page.getByTestId('textarea-answer-content').fill('This answer must not return.');
  await page.getByTestId('button-cancel-answer').click();

  await page.getByTestId('link-sidebar-applications').click();
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Expired Labs');
  await page.getByTestId('input-role').fill('Deadline researcher');
  await page.getByTestId('button-cancel-application').click();

  const currentTime = await page.evaluate(() => Date.now());
  await page.clock.setSystemTime(new Date(currentTime + 8_001));
  await page.getByTestId('link-sidebar-profile').click();
  await recoverySelect.selectOption('30');
  await recoverySelect.selectOption('60');
  await recoverySelect.selectOption('8');

  await page.getByTestId('link-sidebar-answer-library').click();
  await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('answer-form-announcement')).toHaveText(
    'Your unsaved answer draft is no longer available.',
  );

  await page.getByTestId('link-sidebar-applications').click();
  await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('application-form-announcement')).toHaveText(
    'Your unsaved opportunity draft is no longer available.',
  );
});

test('uses the default recovery window when stored preference is invalid', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('escape-hatch-draft-recovery-seconds', JSON.stringify(999)));
  await page.goto('/profile');
  await expect(page.getByTestId('select-draft-recovery-duration')).toHaveValue('8');

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Default recovery answer');
  await page.getByTestId('textarea-answer-content').fill('This uses the safe default.');
  await page.getByTestId('button-cancel-answer').click();
  await expect(page.getByTestId('answer-draft-recovery-time')).toHaveText('Recovery available for 8 seconds');
});

test('announces when answer and opportunity drafts are discarded', async ({ page }) => {
  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Discarded answer');
  await page.getByTestId('textarea-answer-content').fill('This answer will be discarded.');
  await page.getByTestId('button-cancel-answer').click();

  await page.getByTestId('button-discard-answer-draft').click();
  await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('answer-form-announcement')).toHaveText(
    'Unsaved answer draft discarded.',
  );

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Discarded Labs');
  await page.getByTestId('input-role').fill('Discarded role');
  await page.getByTestId('button-cancel-application').click();

  await page.getByTestId('button-discard-application-draft').click();
  await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('application-form-announcement')).toHaveText(
    'Unsaved opportunity draft discarded.',
  );
});

test('keeps answer and opportunity drafts separate when switching views', async ({ page }) => {
  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Cross-view answer');
  await page.getByTestId('textarea-answer-content').fill('Keep this answer while I check an opportunity.');
  await page.getByTestId('button-cancel-answer').click();

  await page.getByTestId('link-sidebar-applications').click();
  await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Cross-view Labs');
  await page.getByTestId('input-role').fill('Product researcher');
  await page.getByTestId('button-cancel-application').click();
  await expect(page.getByTestId('application-draft-notice')).toBeVisible();

  await page.getByTestId('link-sidebar-answer-library').click();
  await expect(page.getByTestId('answer-draft-notice')).toBeVisible();
  await page.getByTestId('button-recover-answer-draft').click();
  await expect(page.getByTestId('input-answer-title')).toHaveValue('Cross-view answer');
  await expect(page.getByTestId('textarea-answer-content')).toHaveValue('Keep this answer while I check an opportunity.');
  await page.getByTestId('button-save-answer').click();

  await page.getByTestId('link-sidebar-applications').click();
  await expect(page.getByTestId('application-draft-notice')).toBeVisible();
  await page.getByTestId('button-recover-application-draft').click();
  await expect(page.getByTestId('input-company')).toHaveValue('Cross-view Labs');
  await expect(page.getByTestId('input-role')).toHaveValue('Product researcher');
  await page.getByTestId('button-save-application').click();

  await expect(page.getByRole('article').filter({ hasText: 'Cross-view Labs' })).toContainText('Product researcher');
  await page.getByTestId('link-sidebar-answer-library').click();
  await expect(page.getByRole('article').filter({ hasText: 'Cross-view answer' })).toContainText(
    'Keep this answer while I check an opportunity.',
  );
});

test('keeps draft recovery available through browser back and forward navigation', async ({ page }) => {
  await page.clock.install();
  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('History answer');
  await page.getByTestId('textarea-answer-content').fill('This answer should survive browser navigation.');
  await page.getByTestId('button-cancel-answer').click();

  await page.getByTestId('link-sidebar-profile').click();
  await page.getByTestId('link-sidebar-applications').click();
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('History Labs');
  await page.getByTestId('input-role').fill('Product researcher');
  await page.getByTestId('button-cancel-application').click();

  await page.goBack();
  await expect(page).toHaveURL(/\/profile$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/answers$/);
  await expect(page.getByTestId('answer-draft-notice')).toBeVisible();
  await page.getByTestId('button-recover-answer-draft').click();
  await expect(page.getByRole('dialog', { name: 'New answer' })).toBeVisible();
  await expect(page.getByTestId('input-answer-title')).toHaveValue('History answer');
  await expect(page.getByTestId('textarea-answer-content')).toHaveValue(
    'This answer should survive browser navigation.',
  );
  await page.getByTestId('button-save-answer').click();

  await page.goForward();
  await expect(page).toHaveURL(/\/profile$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByTestId('application-draft-notice')).toBeVisible();
  await expect(page.getByTestId('button-recover-application-draft')).toBeVisible();
  await page.getByTestId('button-recover-application-draft').click();
  await expect(page.getByRole('dialog', { name: 'Add opportunity' })).toBeVisible();
  await expect(page.getByTestId('input-company')).toHaveValue('History Labs');
  await expect(page.getByTestId('input-role')).toHaveValue('Product researcher');
  await page.getByTestId('button-save-application').click();

  await page.getByTestId('link-sidebar-answer-library').click();
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Expired history answer');
  await page.getByTestId('textarea-answer-content').fill('This answer should expire after navigation.');
  await page.getByTestId('button-cancel-answer').click();

  await page.getByTestId('link-sidebar-profile').click();
  await page.getByTestId('link-sidebar-applications').click();
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Expired History Labs');
  await page.getByTestId('input-role').fill('Deadline researcher');
  await page.getByTestId('button-cancel-application').click();

  await page.clock.fastForward(8_100);
  await page.goBack();
  await expect(page).toHaveURL(/\/profile$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/answers$/);
  await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('answer-form-announcement')).toHaveText(
    'Your unsaved answer draft is no longer available.',
  );

  await page.goForward();
  await expect(page).toHaveURL(/\/profile$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('application-form-announcement')).toHaveText(
    'Your unsaved opportunity draft is no longer available.',
  );
});

test('does not restore a recovered draft notice during repeated browser history traversal', async ({ page }) => {
  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Recovered history answer');
  await page.getByTestId('textarea-answer-content').fill('Keep this reopened answer until I decide what to do.');
  await page.getByTestId('button-cancel-answer').click();

  await page.getByTestId('link-sidebar-profile').click();
  await page.getByTestId('link-sidebar-applications').click();
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Recovered History Labs');
  await page.getByTestId('input-role').fill('History researcher');
  await page.getByTestId('button-cancel-application').click();

  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/answers$/);
  await page.getByTestId('button-recover-answer-draft').click();
  await expect(page.getByRole('dialog', { name: 'New answer' })).toBeVisible();
  await expect(page.getByTestId('input-answer-title')).toHaveValue('Recovered history answer');
  await expect(page.getByTestId('textarea-answer-content')).toHaveValue(
    'Keep this reopened answer until I decide what to do.',
  );
  await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);

  await page.goForward();
  await page.goBack();
  await page.goForward();
  await page.goBack();
  await expect(page).toHaveURL(/\/answers$/);
  await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('button-recover-answer-draft')).toHaveCount(0);

  await page.goForward();
  await page.goForward();
  await expect(page).toHaveURL(/\/applications$/);
  await page.getByTestId('button-recover-application-draft').click();
  await expect(page.getByRole('dialog', { name: 'Add opportunity' })).toBeVisible();
  await expect(page.getByTestId('input-company')).toHaveValue('Recovered History Labs');
  await expect(page.getByTestId('input-role')).toHaveValue('History researcher');
  await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);

  await page.goBack();
  await page.goForward();
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('button-recover-application-draft')).toHaveCount(0);
});

test('expires dismissed answer and opportunity drafts before stale recovery is possible', async ({ page }) => {
  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Expired answer');
  await page.getByTestId('textarea-answer-content').fill('This answer should expire.');
  await page.getByTestId('button-cancel-answer').click();
  await expect(page.getByTestId('answer-draft-notice')).toBeVisible();

  await page.waitForTimeout(8_100);
  await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('answer-form-announcement')).toHaveText(
    'Your unsaved answer draft is no longer available.',
  );
  await page.getByTestId('button-add-answer').click();
  await expect(page.getByTestId('input-answer-title')).toHaveValue('');
  await expect(page.getByTestId('textarea-answer-content')).toHaveValue('');
  await page.getByTestId('button-cancel-answer').click();

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Expired Labs');
  await page.getByTestId('input-role').fill('Expired role');
  await page.getByTestId('button-cancel-application').click();
  await expect(page.getByTestId('application-draft-notice')).toBeVisible();

  await page.waitForTimeout(8_100);
  await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('application-form-announcement')).toHaveText(
    'Your unsaved opportunity draft is no longer available.',
  );
  await page.getByTestId('button-add-application').click();
  await expect(page.getByTestId('input-company')).toHaveValue('');
  await expect(page.getByTestId('input-role')).toHaveValue('');
});

test('announces expired drafts after switching away and back', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('8');

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Cross-view expired answer');
  await page.getByTestId('textarea-answer-content').fill('This answer expires while I view opportunities.');
  await page.getByTestId('button-cancel-answer').click();

  await page.getByTestId('link-sidebar-applications').click();
  await page.clock.fastForward(8_001);
  await page.getByTestId('link-sidebar-answer-library').click();
  await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('answer-form-announcement')).toHaveText(
    'Your unsaved answer draft is no longer available.',
  );
  await expect(page.getByTestId('button-add-answer')).toBeFocused();
  await expect(page.getByRole('dialog', { name: 'New answer' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Edit answer' })).toHaveCount(0);

  await page.getByTestId('link-sidebar-applications').click();
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Cross-view Expired Labs');
  await page.getByTestId('input-role').fill('Deadline researcher');
  await page.getByTestId('button-cancel-application').click();

  await page.getByTestId('link-sidebar-answer-library').click();
  await page.clock.fastForward(8_001);
  await page.getByTestId('link-sidebar-applications').click();
  await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
  await expect(page.getByTestId('application-form-announcement')).toHaveText(
    'Your unsaved opportunity draft is no longer available.',
  );
  await expect(page.getByTestId('button-add-application')).toBeFocused();
  await expect(page.getByRole('dialog', { name: 'Add opportunity' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Edit opportunity' })).toHaveCount(0);
});

test('keeps answer draft recovery time monotonic after focus returns', async ({ page }) => {
  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Backgrounded answer');
  await page.getByTestId('textarea-answer-content').fill('This draft should keep its deadline.');
  await page.getByTestId('button-cancel-answer').click();

  const notice = page.getByTestId('answer-draft-notice');
  const recoveryTime = page.getByTestId('answer-draft-recovery-time');
  await expect(notice).toBeVisible();
  const initialSeconds = await readRecoverySeconds(recoveryTime);
  const recoveryStartedAt = Date.now();
  const backgroundPage = await page.context().newPage();
  try {
    await backgroundPage.bringToFront();
    await backgroundPage.waitForTimeout(2_000);
    await page.bringToFront();

    await expect(notice).toBeVisible();
    expect(await readRecoverySeconds(recoveryTime)).toBeLessThanOrEqual(initialSeconds);
    await expect(notice).toHaveCount(0, { timeout: 7_000 });
    expect(Date.now() - recoveryStartedAt).toBeGreaterThanOrEqual(7_500);
    await expect(page.getByTestId('answer-form-announcement')).toHaveText(
      'Your unsaved answer draft is no longer available.',
    );
  } finally {
    await backgroundPage.close();
  }
});

test('expires an opportunity draft at its deadline after focus returns', async ({ page }) => {
  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Backgrounded Labs');
  await page.getByTestId('input-role').fill('Deadline researcher');
  await page.getByTestId('button-cancel-application').click();

  const notice = page.getByTestId('application-draft-notice');
  await expect(notice).toBeVisible();
  const backgroundPage = await page.context().newPage();
  try {
    await backgroundPage.bringToFront();
    await backgroundPage.waitForTimeout(8_200);
    await page.bringToFront();

    await expect(notice).toHaveCount(0);
    await expect(page.getByTestId('application-form-announcement')).toHaveText(
      'Your unsaved opportunity draft is no longer available.',
    );
  } finally {
    await backgroundPage.close();
  }
});

test('does not recover an answer draft clicked at its exact deadline', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('8');

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Boundary answer');
  await page.getByTestId('textarea-answer-content').fill('This answer expires at the click boundary.');
  await page.getByTestId('button-cancel-answer').click();

  const exactDeadline = await page.evaluate(() => Date.now() + 8_000);
  await expect(page.getByTestId('button-recover-answer-draft')).toBeVisible();
  await page.evaluate((deadline) => {
    const originalDateNow = Date.now;
    Date.now = () => deadline;
    try {
      document.querySelector<HTMLElement>('[data-testid="button-recover-answer-draft"]')?.click();
    } finally {
      Date.now = originalDateNow;
    }
  }, exactDeadline);

  await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'New answer' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Edit answer' })).toHaveCount(0);
  await expect(page.getByTestId('answer-form-announcement')).toHaveText(
    'Your unsaved answer draft is no longer available.',
  );
});

test('does not recover an opportunity draft clicked at its exact deadline', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('8');

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Boundary Labs');
  await page.getByTestId('input-role').fill('Deadline researcher');
  await page.getByTestId('button-cancel-application').click();

  const exactDeadline = await page.evaluate(() => Date.now() + 8_000);
  await expect(page.getByTestId('button-recover-application-draft')).toBeVisible();
  await page.evaluate((deadline) => {
    const originalDateNow = Date.now;
    Date.now = () => deadline;
    try {
      document.querySelector<HTMLElement>('[data-testid="button-recover-application-draft"]')?.click();
    } finally {
      Date.now = originalDateNow;
    }
  }, exactDeadline);

  await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Add opportunity' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Edit opportunity' })).toHaveCount(0);
  await expect(page.getByTestId('application-form-announcement')).toHaveText(
    'Your unsaved opportunity draft is no longer available.',
  );
});

test('recovers an answer draft with Enter before its recovery deadline', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('8');

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Keyboard answer');
  await page.getByTestId('select-answer-category').selectOption({ label: 'Motivation' });
  await page.getByTestId('textarea-answer-content').fill('Recovered with Enter before the deadline.');
  const dismissalTime = await page.evaluate(() => Date.now());
  await page.getByTestId('button-cancel-answer').click();

  const recoveryDeadline = dismissalTime + 8_000;
  const recoveryButton = page.getByTestId('button-recover-answer-draft');
  await expect(recoveryButton).toBeVisible();
  await page.clock.setSystemTime(new Date(recoveryDeadline - 100));
  await pressRecoveryBeforeDeadline(page, recoveryButton, 'Enter', recoveryDeadline);

  await expect(page.getByRole('dialog', { name: 'New answer' })).toBeVisible();
  await expect(page.getByTestId('input-answer-title')).toHaveValue('Keyboard answer');
  await expect(page.getByTestId('select-answer-category')).toHaveValue('Motivation');
  await expect(page.getByTestId('textarea-answer-content')).toHaveValue(
    'Recovered with Enter before the deadline.',
  );
  await expect(page.getByTestId('answer-form-announcement')).toHaveText(
    'Your saved answer draft was reopened.',
  );
});

test('keeps one answer form after repeated Enter or Space recovery activation', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('8');

  for (const [index, key] of ['Enter', 'Space'].entries() as Iterable<[number, 'Enter' | 'Space']>) {
    await page.goto('/answers');
    await page.getByTestId('button-add-answer').click();
    await page.getByTestId('input-answer-title').fill(`Repeated keyboard answer ${index}`);
    await page.getByTestId('select-answer-category').selectOption({ label: 'Motivation' });
    await page.getByTestId('textarea-answer-content').fill('This answer should be recovered exactly once.');
    const dismissalTime = await page.evaluate(() => Date.now());
    await page.getByTestId('button-cancel-answer').click();

    const recoveryDeadline = dismissalTime + 8_000;
    const recoveryButton = page.getByTestId('button-recover-answer-draft');
    await expect(recoveryButton).toBeVisible();
    await pressRecoveryRepeatedlyBeforeDeadline(page, recoveryButton, key, recoveryDeadline);

    await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'New answer' })).toHaveCount(1);
    await expect(page.getByTestId('input-answer-title')).toHaveValue(`Repeated keyboard answer ${index}`);
    await expect(page.getByTestId('select-answer-category')).toHaveValue('Motivation');
    await expect(page.getByTestId('textarea-answer-content')).toHaveValue(
      'This answer should be recovered exactly once.',
    );
    await expect(page.getByTestId('answer-form-announcement')).toHaveText(
      'Your saved answer draft was reopened.',
    );
  }
});

test('recovers an answer draft with Space before its recovery deadline', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('8');

  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Keyboard answer with Space');
  await page.getByTestId('select-answer-category').selectOption({ label: 'Motivation' });
  await page.getByTestId('textarea-answer-content').fill('Recovered with Space before the deadline.');
  const dismissalTime = await page.evaluate(() => Date.now());
  await page.getByTestId('button-cancel-answer').click();

  const recoveryDeadline = dismissalTime + 8_000;
  const recoveryButton = page.getByTestId('button-recover-answer-draft');
  await expect(recoveryButton).toBeVisible();
  await page.clock.setSystemTime(new Date(recoveryDeadline - 100));
  await pressRecoveryBeforeDeadline(page, recoveryButton, 'Space', recoveryDeadline);

  await expect(page.getByRole('dialog', { name: 'New answer' })).toBeVisible();
  await expect(page.getByTestId('select-answer-category')).toHaveValue('Motivation');
  await expect(page.getByTestId('answer-form-announcement')).toHaveText(
    'Your saved answer draft was reopened.',
  );
});

test('recovers an opportunity draft with Space before its recovery deadline', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('8');

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Keyboard Labs');
  await page.getByTestId('input-role').fill('Keyboard researcher');
  await page.getByTestId('input-url').fill('https://keyboard.example/jobs/1');
  await page.getByTestId('select-application-status').selectOption('follow_up');
  await page.getByTestId('select-application-priority').selectOption('high');
  await page.getByTestId('input-nextAction').fill('Review the keyboard flow');
  await page.getByTestId('textarea-notes').fill('Keep the saved opportunity details intact.');
  const dismissalTime = await page.evaluate(() => Date.now());
  await page.getByTestId('button-cancel-application').click();

  const recoveryDeadline = dismissalTime + 8_000;
  const recoveryButton = page.getByTestId('button-recover-application-draft');
  await expect(recoveryButton).toBeVisible();
  await page.clock.setSystemTime(new Date(recoveryDeadline - 100));
  await pressRecoveryBeforeDeadline(page, recoveryButton, 'Space', recoveryDeadline);

  await expect(page.getByRole('dialog', { name: 'Add opportunity' })).toBeVisible();
  await expect(page.getByTestId('input-company')).toHaveValue('Keyboard Labs');
  await expect(page.getByTestId('input-role')).toHaveValue('Keyboard researcher');
  await expect(page.getByTestId('input-url')).toHaveValue('https://keyboard.example/jobs/1');
  await expect(page.getByTestId('select-application-status')).toHaveValue('follow_up');
  await expect(page.getByTestId('select-application-priority')).toHaveValue('high');
  await expect(page.getByTestId('input-nextAction')).toHaveValue('Review the keyboard flow');
  await expect(page.getByTestId('textarea-notes')).toHaveValue(
    'Keep the saved opportunity details intact.',
  );
  await expect(page.getByTestId('application-form-announcement')).toHaveText(
    'Your saved opportunity draft was reopened.',
  );
});

test('recovers an opportunity draft with Enter before its recovery deadline', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('8');

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Keyboard Enter Labs');
  await page.getByTestId('input-role').fill('Keyboard researcher');
  await page.getByTestId('select-application-status').selectOption('follow_up');
  await page.getByTestId('select-application-priority').selectOption('high');
  const dismissalTime = await page.evaluate(() => Date.now());
  await page.getByTestId('button-cancel-application').click();

  const recoveryDeadline = dismissalTime + 8_000;
  const recoveryButton = page.getByTestId('button-recover-application-draft');
  await expect(recoveryButton).toBeVisible();
  await page.clock.setSystemTime(new Date(recoveryDeadline - 100));
  await pressRecoveryBeforeDeadline(page, recoveryButton, 'Enter', recoveryDeadline);

  await expect(page.getByRole('dialog', { name: 'Add opportunity' })).toBeVisible();
  await expect(page.getByTestId('select-application-status')).toHaveValue('follow_up');
  await expect(page.getByTestId('select-application-priority')).toHaveValue('high');
  await expect(page.getByTestId('application-form-announcement')).toHaveText(
    'Your saved opportunity draft was reopened.',
  );
});

test('does not recover an answer draft with Enter or Space at its exact deadline', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('8');
  await page.goto('/answers');

  for (const [index, key] of ['Enter', 'Space'].entries() as Iterable<[number, 'Enter' | 'Space']>) {
    await page.getByTestId('button-add-answer').click();
    await page.getByTestId('input-answer-title').fill(`Keyboard boundary answer ${index}`);
    await page.getByTestId('textarea-answer-content').fill('This answer expires at the keyboard boundary.');
    await page.getByTestId('button-cancel-answer').click();

    const exactDeadline = await page.evaluate(() => Date.now() + 8_000);
    const recoveryButton = page.getByTestId('button-recover-answer-draft');
    await expect(recoveryButton).toBeVisible();
    await pressRecoveryAtExactDeadline(page, recoveryButton, key, exactDeadline);

    await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'New answer' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Edit answer' })).toHaveCount(0);
    await expect(page.getByTestId('answer-form-announcement')).toHaveText(
      'Your unsaved answer draft is no longer available.',
    );
    await expect(page.getByTestId('button-add-answer')).toBeFocused();
  }
});

test('does not recover an opportunity draft with Enter or Space at its exact deadline', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('8');
  await page.goto('/applications');

  for (const [index, key] of ['Enter', 'Space'].entries() as Iterable<[number, 'Enter' | 'Space']>) {
    await page.getByTestId('button-add-application').click();
    await page.getByTestId('input-company').fill(`Keyboard Boundary Labs ${index}`);
    await page.getByTestId('input-role').fill('Deadline researcher');
    await page.getByTestId('button-cancel-application').click();

    const exactDeadline = await page.evaluate(() => Date.now() + 8_000);
    const recoveryButton = page.getByTestId('button-recover-application-draft');
    await expect(recoveryButton).toBeVisible();
    await pressRecoveryAtExactDeadline(page, recoveryButton, key, exactDeadline);

    await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Add opportunity' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Edit opportunity' })).toHaveCount(0);
    await expect(page.getByTestId('application-form-announcement')).toHaveText(
      'Your unsaved opportunity draft is no longer available.',
    );
    await expect(page.getByTestId('button-add-application')).toBeFocused();
  }
});

test('does not recover an answer draft with Enter or Space at its exact deadline after repeated view changes', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('8');
  await page.goto('/answers');

  for (const [index, key] of ['Enter', 'Space'].entries() as Iterable<[number, 'Enter' | 'Space']>) {
    await page.getByTestId('button-add-answer').click();
    await page.getByTestId('input-answer-title').fill(`Cross-view keyboard answer ${index}`);
    await page.getByTestId('textarea-answer-content').fill('This answer expires after changing views.');
    await page.getByTestId('button-cancel-answer').click();

    for (let viewChange = 0; viewChange < 3; viewChange += 1) {
      await page.getByTestId('link-sidebar-applications').click();
      await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
      await page.getByTestId('link-sidebar-answer-library').click();
      await expect(page.getByTestId('answer-draft-notice')).toBeVisible();
    }

    const exactDeadline = await page.evaluate(() => Date.now() + 8_000);
    const recoveryButton = page.getByTestId('button-recover-answer-draft');
    await expect(page.getByTestId('answer-draft-notice')).toBeVisible();
    await expect(recoveryButton).toBeVisible();
    await pressRecoveryAtExactDeadline(page, recoveryButton, key, exactDeadline);

    await expect(page.getByTestId('answer-draft-notice')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'New answer' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Edit answer' })).toHaveCount(0);
    await expect(page.getByTestId('answer-form-announcement')).toHaveText(
      'Your unsaved answer draft is no longer available.',
    );
  }
});

test('does not recover an opportunity draft with Enter or Space at its exact deadline after repeated view changes', async ({ page }) => {
  await page.clock.install();
  await page.goto('/profile');
  await page.getByTestId('select-draft-recovery-duration').selectOption('8');
  await page.goto('/applications');

  for (const [index, key] of ['Enter', 'Space'].entries() as Iterable<[number, 'Enter' | 'Space']>) {
    await page.getByTestId('button-add-application').click();
    await page.getByTestId('input-company').fill(`Cross-view keyboard Labs ${index}`);
    await page.getByTestId('input-role').fill('Deadline researcher');
    await page.getByTestId('button-cancel-application').click();

    for (let viewChange = 0; viewChange < 3; viewChange += 1) {
      await page.getByTestId('link-sidebar-answer-library').click();
      await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
      await page.getByTestId('link-sidebar-applications').click();
      await expect(page.getByTestId('application-draft-notice')).toBeVisible();
    }

    const exactDeadline = await page.evaluate(() => Date.now() + 8_000);
    const recoveryButton = page.getByTestId('button-recover-application-draft');
    await expect(page.getByTestId('application-draft-notice')).toBeVisible();
    await expect(recoveryButton).toBeVisible();
    await pressRecoveryAtExactDeadline(page, recoveryButton, key, exactDeadline);

    await expect(page.getByTestId('application-draft-notice')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Add opportunity' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Edit opportunity' })).toHaveCount(0);
    await expect(page.getByTestId('application-form-announcement')).toHaveText(
      'Your unsaved opportunity draft is no longer available.',
    );
  }
});

test('closes answer and opportunity forms with Escape without saving edits', async ({ page }) => {
  await page.goto('/answers');
  await page.getByTestId('button-add-answer').click();
  const answerDialog = page.getByRole('dialog', { name: 'New answer' });
  await expect(answerDialog).toBeVisible();
  await page.getByTestId('input-answer-title').fill('Unsaved answer');
  await page.getByTestId('textarea-answer-content').fill('This should not be saved.');
  await page.keyboard.press('Escape');
  await expect(answerDialog).toBeHidden();
  await expect(page.getByRole('article')).toHaveCount(0);

  await page.getByTestId('button-add-answer').click();
  await page.getByTestId('input-answer-title').fill('Saved answer');
  await page.getByTestId('textarea-answer-content').fill('The original answer.');
  await page.getByTestId('button-save-answer').click();
  const savedAnswer = page.getByRole('article').filter({ hasText: 'Saved answer' });
  await expect(savedAnswer).toContainText('The original answer.');

  await savedAnswer.getByRole('button', { name: 'Edit Saved answer' }).click();
  const answerEditDialog = page.getByRole('dialog', { name: 'Edit answer' });
  await page.getByTestId('input-answer-title').fill('Changed answer');
  await page.getByTestId('textarea-answer-content').fill('Changed content.');
  await page.keyboard.press('Escape');
  await expect(answerEditDialog).toBeHidden();
  await expect(page.getByRole('article')).toContainText('Saved answer');
  await expect(page.getByRole('article')).toContainText('The original answer.');
  await expect(page.getByRole('article')).not.toContainText('Changed answer');
  await expect(page.getByRole('article')).not.toContainText('Changed content.');

  await page.goto('/applications');
  await page.getByTestId('button-add-application').click();
  const applicationDialog = page.getByRole('dialog', { name: 'Add opportunity' });
  await expect(applicationDialog).toBeVisible();
  await page.getByTestId('input-company').fill('Unsaved Company');
  await page.getByTestId('input-role').fill('Unsaved Role');
  await page.keyboard.press('Escape');
  await expect(applicationDialog).toBeHidden();
  await expect(page.getByRole('article')).toHaveCount(0);

  await page.getByTestId('button-add-application').click();
  await page.getByTestId('input-company').fill('Saved Company');
  await page.getByTestId('input-role').fill('Saved Role');
  await page.getByTestId('button-save-application').click();
  const savedApplication = page.getByRole('article').filter({ hasText: 'Saved Company' });
  await expect(savedApplication).toContainText('Saved Role');

  await savedApplication.getByRole('button', { name: 'Edit' }).click();
  const applicationEditDialog = page.getByRole('dialog', { name: 'Edit opportunity' });
  await page.getByTestId('input-company').fill('Changed Company');
  await page.getByTestId('input-role').fill('Changed Role');
  await page.keyboard.press('Escape');
  await expect(applicationEditDialog).toBeHidden();
  await expect(page.getByRole('article')).toContainText('Saved Company');
  await expect(page.getByRole('article')).toContainText('Saved Role');
  await expect(page.getByRole('article')).not.toContainText('Changed Company');
  await expect(page.getByRole('article')).not.toContainText('Changed Role');
});