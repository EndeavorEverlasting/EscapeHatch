import { test, expect } from '@playwright/test';
import { emptyProfile, PROFILE_KEY } from '../src/lib/storage.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

test('fresh browser recovers private context, edited state survives a fresh browser', async ({ page, browser }) => {
  await page.goto('/profile');
  await expect(page.getByTestId('input-first_name')).toHaveValue('Synthetic');
  await expect(page.getByTestId('input-email')).toHaveValue('synthetic@example.test');
  await page.getByTestId('input-first_name').fill('Updated');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Workspace saved on this computer.' })).toBeVisible();
  const second = await browser.newContext(); const fresh = await second.newPage();
  await fresh.goto('http://127.0.0.1:21039/profile');
  await expect(fresh.getByTestId('input-first_name')).toHaveValue('Updated');
  await fresh.reload(); await expect(fresh.getByTestId('input-first_name')).toHaveValue('Updated');
  await second.close();
});
test('a fresh browser on another port recovers the same saved revision with edits visible to the original port', async ({ browser, request }) => {
  const first = await (await request.get('/__escapehatch/workspace')).json();
  const second = await browser.newContext();
  try {
    const page = await second.newPage();
    await page.goto('http://127.0.0.1:21040/profile');
    await expect(page.getByTestId('input-first_name')).toHaveValue('Updated');
    const recovered = await (await page.request.get('http://127.0.0.1:21040/__escapehatch/workspace')).json();
    expect(recovered.revision).toBe(first.revision);
    expect(recovered.workspace).toEqual(first.workspace);
    await page.getByTestId('input-last_name').fill('CrossPort');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Workspace saved on this computer.' })).toBeVisible();
    const saved = await (await request.get('/__escapehatch/workspace')).json();
    expect(saved.revision).not.toBe(first.revision);
    expect(saved.workspace.values[PROFILE_KEY].last_name).toBe('CrossPort');
    await page.reload();
    await expect(page.getByTestId('input-last_name')).toHaveValue('CrossPort');
  } finally { await second.close(); }
});

test('fresh browser Answer Library recovers saved owners across ports without duplicating or rewriting answers', async ({ browser, request }) => {
  const directory = test.info().config.metadata.dataHome as string;
  const preferenceFile = path.join(directory, 'preferences.json');
  const beforePreferences = await fs.readFile(preferenceFile, 'utf8');
  const before = await (await request.get('/__escapehatch/workspace')).json();
  for (const port of [21039, 21040]) {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    try {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/answers`);
      const summary = page.getByTestId('recovered-answer').filter({ hasText: 'Professional summary' });
      await expect(summary).toHaveCount(1);
      await expect(summary).toContainText('Recovered');
      await expect(summary).toContainText('answer-library');
      await expect(summary).toContainText('assist-answers');
      await summary.getByRole('button', { name: 'Copy saved answer', exact: true }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Synthetic reviewed summary.');
      await expect(page.getByRole('status').filter({ hasText: 'Saved answer copied.' })).toHaveText('Saved answer copied.');
      const memory = page.getByTestId('recovered-answer').filter({ hasText: 'What motivates your work?' });
      await expect(memory).toContainText('Building useful things.');
      const sensitive = page.getByTestId('recovered-answer').filter({ hasText: 'application-preferences' }).filter({ hasText: 'sponsorship' });
      await expect(sensitive).toContainText('This exact question only');
      await expect(page.getByText('Your good answers belong here.')).not.toBeVisible();
      await page.reload();
      await expect(memory).toContainText('Building useful things.');
    } finally { await context.close(); }
  }
  expect(await fs.readFile(preferenceFile, 'utf8')).toBe(beforePreferences);
  const after = await (await request.get('/__escapehatch/workspace')).json();
  expect(after.workspace.values['escape-hatch-answers']).toEqual(before.workspace.values['escape-hatch-answers']);
  expect(after.workspace.values['escape-hatch-assist-answers']).toEqual(before.workspace.values['escape-hatch-assist-answers']);
});

test('unavailable answer source is explicit and never masquerades as empty memory', async ({ page }) => {
  await page.route('**/__escapehatch/managed-assist/preferences', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.goto('/answers');
  await expect(page.getByRole('status').filter({ hasText: 'Could not read: Application preferences and question memory' })).toBeVisible();
  await expect(page.getByTestId('recovered-answer').filter({ hasText: 'Professional summary' })).toHaveCount(1);
});

test('divergent browser state is preserved and normal dashboard is held', async ({ page }) => {
  await page.addInitScript(({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)), { key: PROFILE_KEY, profile: { ...emptyProfile, first_name: 'Existing browser edit' } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Review your saved copies.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Make room for momentum|Keep going,/ })).not.toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).first_name, PROFILE_KEY)).toBe('Existing browser edit');
});
test('missing context opens recovery with actionable import, not a zero dashboard', async ({ page }) => {
  await page.route('**/__escapehatch/workspace', route => route.fulfill({ json: { managed: true, revision: null, workspace: null, state: 'NEEDS_CONTEXT', message: 'Choose your existing local backup.' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bring your work with you.' })).toBeVisible();
  await expect(page.getByLabel('Import local workspace')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Make room for momentum|Keep going,/ })).not.toBeVisible();
});
test('corrupt artifact blocks state-writing hooks and preserves the existing browser copy', async ({ page }) => {
  await page.route('**/__escapehatch/workspace', route => route.fulfill({ json: { managed: true, revision: null, workspace: null, state: 'RECOVERY_REQUIRED', message: 'Saved context could not be read.' } }));
  await page.goto('/');
  await expect(page.getByText('Saved context could not be read.')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), PROFILE_KEY)).toBeNull();
});

test('corrupt browser values recover through the offered UI and raw bytes are archived', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, 'invalid synthetic browser bytes'), PROFILE_KEY);
  await page.goto('/profile');
  await expect(page.getByText('This browser’s saved copy needs recovery.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Restore saved workspace', exact: true }).click();
  await expect(page.getByTestId('input-first_name')).toHaveValue('Updated');
  const directory = test.info().config.metadata.dataHome as string;
  const archives = (await fs.readdir(directory)).filter(name => name.startsWith('browser-recovery-'));
  expect(archives.length).toBeGreaterThan(0);
  const raw = JSON.parse(await fs.readFile(path.join(directory, archives.at(-1)!), 'utf8'));
  expect(raw[PROFILE_KEY]).toBe('invalid synthetic browser bytes');
});

test('corrupt saved file and browser copy can both be archived before importing a backup', async ({ page }) => {
  const directory = test.info().config.metadata.dataHome as string;
  const file = path.join(directory, 'workspace.v1.json');
  await fs.writeFile(file, 'unreadable synthetic saved bytes');
  await page.addInitScript(key => localStorage.setItem(key, 'unreadable synthetic browser bytes'), PROFILE_KEY);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Export this browser' })).toBeVisible();
  const backup = { schema: 'escapehatch-local-workspace/v1', values: { [PROFILE_KEY]: { ...emptyProfile, first_name: 'Restored' } } };
  await page.getByLabel('Import local workspace').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByRole('heading', { name: 'Keep going, Restored.' })).toBeVisible();
  const names = await fs.readdir(directory);
  const savedArchive = names.find(name => name.startsWith('workspace.v1.json.recovery-'))!;
  expect(await fs.readFile(path.join(directory, savedArchive), 'utf8')).toBe('unreadable synthetic saved bytes');
  const archives = await Promise.all(names.filter(name => name.startsWith('browser-recovery-')).map(async name => JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))));
  expect(archives.some(raw => raw[PROFILE_KEY] === 'unreadable synthetic browser bytes')).toBe(true);
  expect(JSON.parse(await fs.readFile(file, 'utf8')).values[PROFILE_KEY].first_name).toBe('Restored');
});

for (const failure of ['html', 'missing']) test(`managed runtime rejects ${failure} workspace responses instead of showing an empty dashboard`, async ({ page }) => {
  await page.route('**/__escapehatch/workspace', route => route.fulfill({ status: failure === 'missing' ? 404 : 200, contentType: 'text/html', body: '<html>Unavailable</html>' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Recover your workspace.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Review Sources' })).not.toBeVisible();
});

test('keeping browser details retains both conflict copies after another edit', async ({ page }) => {
  const directory = test.info().config.metadata.dataHome as string;
  const file = path.join(directory, 'workspace.v1.json');
  const displaced = await fs.readFile(file, 'utf8');
  await page.addInitScript(({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)), { key: PROFILE_KEY, profile: { ...emptyProfile, first_name: 'Browser choice' } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Keep this browser’s details' }).click();
  await expect(page.getByRole('heading', { name: 'Keep going, Browser choice.' })).toBeVisible();
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await page.getByTestId('input-first_name').fill('Later edit');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect.poll(async () => JSON.parse(await fs.readFile(file, 'utf8')).values[PROFILE_KEY].first_name).toBe('Later edit');
  const names = await fs.readdir(directory);
  const savedCopies = await Promise.all(names.filter(name => name.startsWith('workspace.v1.json.conflict-')).map(name => fs.readFile(path.join(directory, name), 'utf8')));
  expect(savedCopies).toContain(displaced);
  const browserCopies = await Promise.all(names.filter(name => name.startsWith('browser-recovery-')).map(async name => JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))));
  expect(browserCopies.some(raw => raw[PROFILE_KEY] === JSON.stringify({ ...emptyProfile, first_name: 'Browser choice' }))).toBe(true);
});
