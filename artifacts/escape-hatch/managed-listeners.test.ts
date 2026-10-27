import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { ManagedListeners, readSubmissionReceipts } from './managed-listeners.ts';
import { readPreferences, savePreferences, mergePreferenceEdits, updatePreferences, clearPreferences } from './preference-file.ts';
import { emptyPreferences } from './src/lib/application-preferences.ts';

test('preference transactions preserve concurrent updates and order clear after accepted writes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-preference-race-'));
  const file = path.join(root, 'preferences.json');
  const stamp = new Date().toISOString();
  try {
    const large = emptyPreferences();
    large.discovered_answers = Object.fromEntries(Array.from({ length: 76 }, (_, index) => [
      'favorite work tool ' + index, { question: 'Favorite work tool ' + index, value: 'x'.repeat(512),
        source: 'user' as const, updated_at: stamp, accepted: true },
    ]));
    await savePreferences(large, file);
    assert.equal(Object.keys((await readPreferences(file)).discovered_answers!).length, 76);
    await clearPreferences(file);
    await Promise.all(['identity.website', 'identity.pronouns'].map(id => updatePreferences(current => ({ ...current,
      preferences: { ...current.preferences, [id]: { value: id === 'identity.website' ? 'https://example.test' : 'he/him',
        scope: 'profile_preference', source: 'user', updated_at: stamp } } }), file)));
    assert.equal(Object.keys((await readPreferences(file)).preferences).length, 2);
    const write = updatePreferences(current => ({ ...current, require_document_review: false }), file);
    const clear = clearPreferences(file);
    await Promise.all([write, clear]);
    await assert.rejects(fs.stat(file), { code: 'ENOENT' });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('listeners save explicit answers and a durable receipt only after confirmed synthetic submission', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-listener-proof-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const preferencesFile = path.join(root, 'preferences.json');
  const receiptsFile = path.join(root, 'receipts.json');
  const listeners = new ManagedListeners(receiptsFile, preferencesFile);
  try {
    await page.route('https://jobs.ashbyhq.com/**', route => route.fulfill({ contentType: 'text/html', body:
      '<div id="root"><label>Portfolio website<input></label><label>Favorite work tool<input></label><button id="submit" type="button" onclick="document.getElementById(\'root\').innerHTML=\'<h1>We have received your application.</h1>\'">Submit Application</button></div>' }));
    await page.goto('https://jobs.ashbyhq.com/synthetic/job/application');
    await listeners.attach(page, { opportunityId: 'synthetic', employerName: 'Synthetic', applicationUrl: page.url() });
    await listeners.arm();
    await listeners.catalog(page);
    const catalog = await readPreferences(preferencesFile);
    assert.equal(catalog.discovered_answers?.['favorite work tool']?.source, 'observed_question');
    await page.getByLabel('Portfolio website').fill('https://portfolio.example.test');
    for (let i = 0; i < 50 && !(await readPreferences(preferencesFile)).preferences['identity.website']; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal((await readPreferences(preferencesFile)).preferences['identity.website']?.value, 'https://portfolio.example.test');
    assert.deepEqual(await readSubmissionReceipts(receiptsFile), []);
    await page.getByRole('button', { name: 'Submit Application', exact: true }).click();
    let status = await listeners.status();
    for (let i = 0; i < 50 && !status.receipts.length; i++) { await new Promise(resolve => setTimeout(resolve, 20)); status = await listeners.status(); }
    assert.equal(status.submission?.state, 'CONFIRMED');
    assert.equal((await readSubmissionReceipts(receiptsFile)).length, 1);
    await listeners.dispose();
    assert.equal((await readSubmissionReceipts(receiptsFile))[0].opportunityId, 'synthetic');
    await fs.writeFile(receiptsFile, '[{"observedAt":"invalid"}]');
    await assert.rejects(readSubmissionReceipts(receiptsFile));
  } finally { await listeners.dispose(); await browser.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('cockpit preference save preserves newer capture and supports explicit deletion', () => {
  const current = emptyPreferences();
  current.preferences['identity.first_name'] = { scope: 'profile_preference', source: 'user', value: 'New', updated_at: '2026-02-02T00:00:00Z' };
  const stale = emptyPreferences();
  stale.preferences['identity.first_name'] = { ...current.preferences['identity.first_name'], value: 'Old', updated_at: '2026-01-01T00:00:00Z' };
  assert.equal(mergePreferenceEdits(current, stale).preferences['identity.first_name'].value, 'New');
  assert.equal(mergePreferenceEdits(current, stale, ['identity.first_name']).preferences['identity.first_name'], undefined);
});
