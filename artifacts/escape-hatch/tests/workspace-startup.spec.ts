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
test('divergent browser state is preserved and normal dashboard is held', async ({ page }) => {
  await page.addInitScript(({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)), { key: PROFILE_KEY, profile: { ...emptyProfile, first_name: 'Existing browser edit' } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Review your saved copies.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Make room for momentum.' })).not.toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).first_name, PROFILE_KEY)).toBe('Existing browser edit');
});
test('missing context opens recovery with actionable import, not a zero dashboard', async ({ page }) => {
  await page.route('**/__escapehatch/workspace', route => route.fulfill({ json: { managed: true, revision: null, workspace: null, state: 'NEEDS_CONTEXT', message: 'Choose your existing local backup.' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bring your work with you.' })).toBeVisible();
  await expect(page.getByLabel('Import local workspace')).toBeVisible();
  await expect(page.getByText('PROFILE READINESS', { exact: true })).not.toBeVisible();
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
