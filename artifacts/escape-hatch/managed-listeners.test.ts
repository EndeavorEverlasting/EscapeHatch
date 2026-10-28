import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { ManagedListeners, readSubmissionReceipts, migrateSubmissionReceipts, submissionAdapter, submissionReceiptFile } from './managed-listeners.ts';
import { readPreferences, savePreferences, mergePreferenceEdits, updatePreferences, clearPreferences } from './preference-file.ts';
import { emptyPreferences, matchQuestion, normalizeQuestion } from './src/lib/application-preferences.ts';
import { fillSavedPreferences } from './managed-form.ts';

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

test('stable receipt recovery preserves legacy evidence and cannot overwrite newer receipt stores', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-receipt-recovery-'));
  const legacy = path.join(root, 'legacy'), stable = path.join(root, 'stable', 'receipts.json');
  const receipt = { opportunityId: 'synthetic', sessionId: 'session', attemptId: 'attempt', applicationOrigin: 'https://jobs.example.test', applicationPath: '/job', observedAt: '2026-01-01T00:00:00Z', source: 'same_session_page_confirmation', evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT' };
  try {
    await fs.mkdir(legacy);
    const old = path.join(legacy, 'managed-submission-receipts.json');
    await fs.writeFile(old, JSON.stringify([receipt]));
    await migrateSubmissionReceipts(stable, [legacy]);
    assert.deepEqual(await readSubmissionReceipts(stable), [receipt]);
    assert.deepEqual(await readSubmissionReceipts(old), [receipt]);
    await fs.writeFile(stable, '[]');
    await migrateSubmissionReceipts(stable, [legacy]);
    assert.deepEqual(await readSubmissionReceipts(stable), []);
    assert.ok(submissionReceiptFile().endsWith('managed-submission-receipts.json'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Lever adapter is exact hosted apply scope and never falls back to another job confirmation', () => {
  const url = 'https://jobs.lever.co/synthetic/11111111-1111-4111-8111-111111111111/apply';
  const adapter = submissionAdapter(url);
  assert.equal(adapter.submitSelector, '#btn-submit');
  assert.deepEqual(adapter.confirmationPaths, ['/synthetic/11111111-1111-4111-8111-111111111111/thanks']);
  assert.equal(submissionAdapter(url.replace('jobs.lever.co', 'jobs.lever.co.evil.test')).submitSelector, '#root button');
});

for (const mode of ['success', 'reject', 'captcha', 'route-only']) test(`Lever ${mode} captures only fresh employer confirmation and persists before callback`, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-lever-submission-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const receiptsFile = path.join(root, 'receipts.json');
  let callbacks = 0;
  const listeners = new ManagedListeners(receiptsFile, path.join(root, 'preferences.json'), async receipt => {
    assert.equal((await readSubmissionReceipts(receiptsFile))[0].attemptId, receipt.attemptId);
    callbacks++;
    throw new Error('Synthetic provider unavailable');
  });
  const url = 'https://jobs.lever.co/synthetic/11111111-1111-4111-8111-111111111111/apply';
  try {
    await page.route('https://jobs.lever.co/**', route => route.fulfill({ contentType: 'text/html', body: `<div class="content"><form><input id="answer" value="operator entry"><button id="btn-submit" type="submit">SUBMIT APPLICATION</button></form></div><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();const mode=${JSON.stringify(mode)};if(mode==='success'){history.pushState({},'',location.pathname.replace('/apply','/thanks'));document.querySelector('.content').innerHTML='<div class="application-confirmation"><h1>Application submitted!</h1></div>';}else if(mode==='route-only'){history.pushState({},'',location.pathname.replace('/apply','/thanks'));}else {document.querySelector('.content').insertAdjacentHTML('beforeend','<p class="application-error">'+(mode==='captcha'?'CAPTCHA verification required':'Unable to submit. Try again.')+'</p>');}}</script>` }));
    await page.goto(url);
    await listeners.attach(page, { opportunityId: 'synthetic-lever', employerName: 'Synthetic', applicationUrl: url }, false);
    assert.equal((await listeners.arm()).submission?.state, 'ARMED');
    assert.equal(await page.locator('#answer').inputValue(), 'operator entry');
    await page.locator('#btn-submit').click();
    let status = await listeners.status();
    const expected = mode === 'success' ? 'CONFIRMED' : mode === 'route-only' ? 'PENDING' : 'VALIDATION_FAILED';
    for (let i = 0; i < 50 && status.submission?.state !== expected; i++) { await new Promise(resolve => setTimeout(resolve, 20)); status = await listeners.status(); }
    assert.equal(status.submission?.state, expected);
    assert.equal(status.receipts.length, mode === 'success' ? 1 : 0);
    assert.equal(callbacks, mode === 'success' ? 1 : 0);
    if (mode === 'success') assert.match(status.error, /saved; tracker synchronization is pending/);
    else assert.equal(status.submission?.receipt, null);
  } finally { await listeners.dispose(); await browser.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('Broadcastwell inline role adapter treats button labels as candidate steps, not finality', () => {
  const a = submissionAdapter('https://broadcastwell.com/careers/ai-automation-engineer');
  assert.equal(a.acceptAnySubmitLabel, true);
  assert.deepEqual(a.continuationPathPrefixes, ['/careers/ai-automation-engineer/']);
  assert.match(a.submitSelector, /type="submit"/);
  assert.notEqual(submissionAdapter('https://broadcastwell.com/careers/another-role').acceptAnySubmitLabel, true);
  assert.notEqual(submissionAdapter('https://broadcastwell.com.evil.test/careers/ai-automation-engineer').acceptAnySubmitLabel, true);
  assert.equal(matchQuestion('LinkedIn or portfolio URL (optional)'), 'identity.website');
  assert.equal(matchQuestion('Role'), 'identity.job_title');
});

test('Broadcastwell single-page flow: missing answer -> approved fill -> armed submit -> local receipt', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-broadcastwell-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const preferencesPath = path.join(root, 'preferences.json');
  const receiptsPath = path.join(root, 'receipts.json');
  const listeners = new ManagedListeners(receiptsPath, preferencesPath);
  const applicationUrl = 'https://broadcastwell.com/careers/ai-automation-engineer';
  try {
    await page.route(applicationUrl, route => route.fulfill({ contentType: 'text/html',
      body: `<main><form id="application">
        <label>LinkedIn or portfolio URL (optional)<input type="url" /></label>
        <label>Role<input /></label>
        <label>Why this role, in five sentences or fewer<textarea></textarea></label>
        <button type="submit">Submit</button></form></main>
        <script>document.querySelector('form').onsubmit = e => {
          e.preventDefault();
          document.querySelector('main').innerHTML =
            '<p role="status">We have received your application.</p>';
        };</script>` }));
    await page.goto(applicationUrl);
    await listeners.attach(page, { opportunityId: 'synthetic-broadcastwell',
      applicationUrl, employerName: 'Broadcastwell' });
    await listeners.arm();
    assert.equal((await listeners.status()).submission?.state, 'ARMED');
    const labels = await listeners.catalog(page);
    assert.ok(labels.some(item => /why this role/i.test(item.question)));
    const fresh = await readPreferences(preferencesPath);
    const key = normalizeQuestion('Why this role, in five sentences or fewer');
    assert.equal(fresh.discovered_answers?.[key]?.source, 'observed_question');
    assert.equal(fresh.discovered_answers?.[key]?.accepted, false);
    assert.deepEqual(await readSubmissionReceipts(receiptsPath), []);
    await updatePreferences(current => ({
      ...current,
      preferences: { ...current.preferences,
        'identity.website': { scope: 'profile_preference', source: 'user', value: 'https://portfolio.example.test', updated_at: new Date().toISOString() },
        'identity.job_title': { scope: 'profile_preference', source: 'user', value: 'AI Automation Engineer', updated_at: new Date().toISOString() },
      },
      discovered_answers: { ...current.discovered_answers, [key]: {
        question: 'Why this role, in five sentences or fewer',
        value: 'Because reproducible measurement and evidence-based automation are important to my work.',
        source: 'user', accepted: true, updated_at: new Date().toISOString(),
      } },
    }), preferencesPath);
    const filled = await fillSavedPreferences(page, await readPreferences(preferencesPath), 'Broadcastwell');
    assert.ok(filled.filled.includes('identity.website'));
    assert.ok(filled.filled.includes('identity.job_title'));
    assert.ok(filled.filled.includes('discovered:' + key));
    assert.equal(await page.getByLabel('LinkedIn or portfolio URL (optional)').inputValue(), 'https://portfolio.example.test');
    assert.equal(await page.getByLabel('Role', { exact: true }).inputValue(), 'AI Automation Engineer');
    assert.match(await page.getByLabel('Why this role, in five sentences or fewer').inputValue(), /reproducible measurement/);
    assert.equal((await listeners.status()).submission?.state, 'ARMED');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    let status = await listeners.status();
    for (let i = 0; i < 80 && status.submission?.state !== 'CONFIRMED'; i++) {
      await new Promise(resolve => setTimeout(resolve, 25));
      status = await listeners.status();
    }
    assert.equal(status.submission?.state, 'CONFIRMED');
    assert.equal((await readSubmissionReceipts(receiptsPath)).length, 1);
    assert.equal((await readSubmissionReceipts(receiptsPath))[0].applicationPath, '/careers/ai-automation-engineer');
  } finally {
    await listeners.dispose(); await browser.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('managed Broadcastwell receipt is withheld through extra questions and employer processing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-broadcastwell-steps-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const listeners = new ManagedListeners(path.join(root, 'receipts.json'), path.join(root, 'preferences.json'));
  const applicationUrl = 'https://broadcastwell.com/careers/ai-automation-engineer';
  try {
    await page.route(applicationUrl, route => route.fulfill({ contentType: 'text/html', body:
      `<main><form><label>Part one<input /></label><button type="submit">Submit</button></form></main>
      <script>let step = 0; document.querySelector('form').onsubmit = event => {
        event.preventDefault(); step++;
        if (step === 1) {
          history.pushState({}, '', '/careers/ai-automation-engineer/second');
          document.querySelector('form').innerHTML =
            '<label>Part two<textarea></textarea></label><button type="submit">Next</button>';
        } else {
          document.querySelector('main').innerHTML =
            '<p role="status">Your application is being processed.</p>';
        }
      };</script>` }));
    await page.goto(applicationUrl);
    await listeners.attach(page, { opportunityId: 'synthetic-broadcastwell-multi', applicationUrl, employerName: 'Broadcastwell' }, false);
    assert.equal((await listeners.arm()).submission?.state, 'ARMED');
    await page.getByRole('button', { name: 'Submit' }).click();
    let state = (await listeners.status()).submission?.state;
    for (let i=0; i<80 && state!=='IN_PROGRESS'; i++) {
      await new Promise(resolve => setTimeout(resolve, 25)); state=(await listeners.status()).submission?.state;
    }
    assert.equal(state, 'IN_PROGRESS');
    assert.equal((await listeners.status()).receipts.length, 0);
    await page.getByRole('button', { name: 'Next' }).click();
    for (let i=0; i<80 && state!=='PROCESSING'; i++) {
      await new Promise(resolve => setTimeout(resolve, 25)); state=(await listeners.status()).submission?.state;
    }
    assert.equal(state, 'PROCESSING');
    assert.equal((await listeners.status()).receipts.length, 0);
    await page.getByRole('status').evaluate(node => node.textContent = 'Application submitted successfully.');
    for (let i=0; i<80 && state!=='CONFIRMED'; i++) {
      await new Promise(resolve => setTimeout(resolve, 25)); state=(await listeners.status()).submission?.state;
    }
    assert.equal(state, 'CONFIRMED');
    assert.equal((await listeners.status()).receipts.length, 1);
  } finally {
    await listeners.dispose(); await browser.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
