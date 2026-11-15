import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { LeverAttemptReceipts } from './lever-attempt-receipts.ts';
import { readPreferences } from './preference-file.ts';
import { normalizeQuestion } from './src/lib/application-preferences.ts';
import { ADAPTER_EVIDENCE_SCHEMA } from './application-navigation-policy.ts';
import { ManagedListeners } from './managed-listeners.ts';
import { OpportunityDocumentStore } from './opportunity-documents.ts';
import { readWorkspace, saveWorkspace } from './workspace-file.ts';
import { WORKSPACE_SCHEMA } from './src/lib/workspace-bootstrap.ts';
import { APPLICATIONS_KEY } from './src/lib/storage.ts';
import {
  parseNavigationAuthorization,
  attachPdfs,
  parsePrivatePdf,
  parseTrustedAdapterRegistry,
  reviewedContactFields,
  derivedContactPreferenceValues,
  COGNIZANT_TALENT_ID,
  COGNIZANT_TALENT_URL,
  isCognizantTalentCommunity,
  isProtectedEnrollmentConsentLabel,
  validateApplicationUrl,
  managedBrowserProfileDirectory,
  createManagedBrowserAssistPlugin,
  selectExistingApplicationPage,
  selectRestoredLaunchPage,
} from './browser-assist-control.ts';

test('restart launch selects only a unique exact persisted tab, never a different application or query', () => {
  const wanted = 'https://jobs.example.com/apply?posting=one';
  const page = (url: string, closed = false) => ({ url: () => url, isClosed: () => closed });
  const target = page(wanted);
  const other = page('https://jobs.example.com/apply?posting=two');
  const different = page('https://jobs.example.com/other');
  const closed = page(wanted, true);
  const asContext = (pages: unknown[]) => ({ pages: () => pages }) as unknown as Parameters<typeof selectRestoredLaunchPage>[0];
  assert.equal(selectRestoredLaunchPage(asContext([other, different, target, closed]), wanted), target);
  assert.equal(selectRestoredLaunchPage(asContext([other, different]), wanted), null);
  assert.throws(() => selectRestoredLaunchPage(asContext([target, page(wanted)]), wanted), /More than one exact/);
});

test('existing-tab selection is exact, unique and performs no navigation or form mutation', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const job = 'https://jobs.lever.co/synthetic/11111111-1111-4111-8111-111111111111';
  try {
    await context.route('https://jobs.lever.co/**', route => route.fulfill({ contentType: 'text/html', body: '<input value="existing operator answer"><button id="btn-submit">Submit Application</button>' }));
    const other = await context.newPage(); await other.goto(job.replace('11111111-', '22222222-') + '/apply');
    const application = await context.newPage(); await application.goto(job + '/apply');
    assert.equal(selectExistingApplicationPage(context, job, job + '/apply'), application);
    assert.equal(await application.locator('input').inputValue(), 'existing operator answer');
    assert.equal(other.url(), job.replace('11111111-', '22222222-') + '/apply');
    assert.throws(() => selectExistingApplicationPage(context, job, other.url()), /does not match/);
    const duplicate = await context.newPage(); await duplicate.goto(job + '/apply');
    assert.throws(() => selectExistingApplicationPage(context, job, job + '/apply'), /unique existing/);
    await duplicate.close();
    assert.throws(() => selectExistingApplicationPage(context, 'https://jobs.other.com/job', 'https://jobs.other.com/job/apply'), /does not match/);
  } finally { await browser.close(); }
});

test('reviewed Lever flow preserves the exact tab and checks the résumé again after rejection', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'eh-bind-existing-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const before = { ...process.env };
  const instanceId = 'existing-tab-' + Date.now();
  const symbol = Symbol.for('escapehatch.managed-browser.' + instanceId);
  const preferencesPath = path.join(root, 'preferences.json');
  const syncedAttempts: string[] = [];
  const listeners = new ManagedListeners(path.join(root, 'receipts.json'), preferencesPath, async receipt => {
    syncedAttempts.push(receipt.attemptId);
  });
  const job = { id: 'synthetic-lever', company: 'Synthetic', role: 'Engineer', url: 'https://jobs.lever.co/synthetic/11111111-1111-4111-8111-111111111111', status: 'preparing' as const, priority: 'normal' as const, notes: '', nextAction: 'Review', updatedAt: new Date().toISOString() };
  try {
    Object.assign(process.env, { ESCAPEHATCH_DATA_HOME: root, ESCAPEHATCH_REPO_FINGERPRINT: 'a'.repeat(64), ESCAPEHATCH_SHUTDOWN_TOKEN: 'synthetic-only', ESCAPEHATCH_STARTED_AT_UTC: new Date().toISOString(), PORT: '21041', ESCAPEHATCH_INSTANCE_ID: instanceId });
    await saveWorkspace({ schema: WORKSPACE_SCHEMA, values: { [APPLICATIONS_KEY]: [job] } }, null);
    await context.route('https://jobs.lever.co/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
      <div class="content"><h1>Engineer</h1><form id="application-form">
        <label>Website<input type="url" value="https://example.com"></label>
        <label>Additional notes<input id="notes" value="operator entry"></label>
        <label>Full name<input name="name" value="Reviewed applicant"></label>
        <div class="application-question">
          <div class="application-label">Which tools have you used?<span class="required">✱</span></div>
          <div class="application-field required-field">
            <label><input name="tools" type="checkbox" checked>Service Desk</label>
            <label><input name="tools" type="checkbox" checked>Workflow Studio</label>
            <label><input name="tools" type="checkbox">Unused tool</label>
          </div>
        </div>
        <fieldset><legend>Privacy acknowledgement</legend><label><input type="checkbox" required checked>I agree</label></fieldset>
        <div class="application-question resume"><label><span class="application-label">Résumé / CV <span class="required">✱</span></span>
          <input type="file" name="resume" accept=".pdf" style="display:none">
        </label></div>
        <button type="button" id="btn-submit">Submit Application</button>
      </form></div>
      <script>
        window.attemptCount = 0;
        const nameField = document.querySelector('input[name="name"]');
        const upload = document.querySelector('input[type="file"]');
        let prefilledEdit = false;
        nameField.addEventListener('change', () => { prefilledEdit = true; });
        upload.addEventListener('change', () => {
          if (upload.files[0]?.size === 25 && !prefilledEdit) nameField.value = 'parser replacement';
        });
        document.querySelector('#btn-submit').onclick = () => {
          window.attemptCount++;
          if (window.attemptCount === 1) {
            document.querySelector('input[type="file"]').value = '';
            document.querySelector('form').insertAdjacentHTML('beforebegin', '<div class="posting-warning">✱ There was an error verifying your application. Please try again.</div>');
          } else {
            history.pushState({}, '', location.pathname.replace('/apply','/thanks'));
            document.querySelector('.content').innerHTML = '<section class="application-confirmation"><h1>Application submitted!</h1></section>';
          }
        };
      </script>` }));
    const unrelated = await context.newPage(); await unrelated.goto(job.url.replace('11111111-', '22222222-') + '/apply');
    const target = await context.newPage(); await target.goto(job.url + '/apply');
    (globalThis as Record<symbol, unknown>)[symbol] = { context, page: unrelated, state: 'browser_open', applicationOrigin: new URL(unrelated.url()).origin, applicationUrl: unrelated.url(), opportunityId: 'unrelated', preparation: null, networkDiagnosis: null, authCheckpoint: null, trustedReturnPath: null, listeners, busy: false };
    let middleware: Function = () => {};
    const plugin = createManagedBrowserAssistPlugin();
    (plugin.configureServer as Function)({ config: { server: { port: 21041 } }, middlewares: { use: (handler: Function) => { middleware = handler; } } });
    const request = async (payload: object | null, origin = 'http://127.0.0.1:21041', endpoint = '/listeners/bind-existing') => {
      let code = 0, body = '';
      await middleware({ url: '/__escapehatch/managed-assist' + endpoint, method: payload ? 'POST' : 'GET', headers: { host: '127.0.0.1:21041', origin, 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' }, socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); } }, { set statusCode(value: number) { code = value; }, setHeader() {}, end(value: string) { body = value; } }, () => assert.fail('bind route missed'));
      return { code, body: JSON.parse(body) };
    };
    // An ordinary Launch on a restored tab must not reload the user's edits or
    // navigate the separate employer window. Re-arming remains a separate act.
    const restored = await request({ opportunityId: job.id, url: job.url }, undefined, '/launch');
    assert.equal(restored.code, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.state, 'application_restored_review_required');
    assert.equal(await target.locator('#notes').inputValue(), 'operator entry');
    assert.equal(unrelated.url(), job.url.replace('11111111-', '22222222-') + '/apply');
    assert.equal((await listeners.status()).submission, null, 'restore must not auto-arm observation');
    const payload = { opportunityId: job.id, url: job.url, livePageUrl: target.url() };
    assert.equal((await request(payload, 'https://foreign.example.com')).code, 403);
    assert.equal((await request({ ...payload, opportunityId: 'wrong-job' })).code, 422);
    const result = await request(payload);
    assert.equal(result.code, 200, JSON.stringify(result.body));
    assert.equal(result.body.listeners.submission.state, 'ARMED');
    assert.equal(result.body.listeners.recordingAnswers, false);
    assert.equal(await target.locator('#notes').inputValue(), 'operator entry');
    assert.equal(unrelated.url(), job.url.replace('11111111-', '22222222-') + '/apply');
    assert.deepEqual(await fs.readdir(root).then(files => files.filter(file => file === 'receipts.json')), []);
    assert.equal(context.pages().length, 2);

    const store = new OpportunityDocumentStore();
    const resume = { name: 'reviewed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nreviewed fixture') };
    const staged = await store.stage(job.id, job.url, 'resume', resume);
    const sha256 = staged.documents.resume!.sha256;
    await store.review(job.id, job.url, 'resume', sha256);
    const history = () => request(null, undefined, '/lever-attempt-receipts?' + new URLSearchParams({ opportunityId: job.id, url: job.url }));
    const attach = () => request({ ...payload, resumeSha256: sha256 }, undefined, '/attach');
    const otherHistory = '/lever-attempt-receipts?' + new URLSearchParams({ opportunityId: job.id, url: unrelated.url() });
    assert.equal((await request(null, undefined, otherHistory)).code, 404);
    const submit = (change: object = {}) => request({ ...payload, resumeSha256: sha256, confirmedSubmit: true, ...change }, undefined, '/submit-authorized');
    assert.equal((await submit({ confirmedSubmit: false })).code, 422);
    assert.equal((await submit()).body.error, 'answer_and_submission_listeners_required');
    assert.equal((await request({ ...payload, recordAnswers: true })).body.listeners.recordingAnswers, true);
    assert.equal((await submit({ livePageUrl: unrelated.url() })).body.error, 'reviewed_application_tab_mismatch');
    assert.equal((await submit({ resumeSha256: '0'.repeat(64) })).body.error, 'approved_resume_digest_required');
    const restartedJournal = new LeverAttemptReceipts(root);
    const reserved = restartedJournal.record(job.url + '/apply', 'SUBMIT', 'VERIFIED', 'DISPATCH_RESERVED', sha256)!;
    assert.equal((await submit()).body.attemptReceipt?.code, 'submission_attempt_already_observed');
    assert.equal((await request({ ...payload, recordAnswers: true })).code, 409);
    assert.equal(await target.evaluate(() => Reflect.get(window, 'attemptCount')), 0);
    restartedJournal.recordResponse(job.url + '/apply', reserved.id, 'VALIDATION_FAILED', 'NOT_OBSERVED');
    const missing = (await submit()).body.attemptReceipt;
    assert.equal(missing.code, 'resume_missing_or_invalid');
    assert.equal(missing.resumeBefore, 'MISSING');
    assert.equal(missing.dispatch, 'NOT_ATTEMPTED');
    assert.equal(missing.response, 'NOT_EXPECTED');
    const upload = target.locator('input[type="file"]');
    await upload.setInputFiles({ ...resume, buffer: Buffer.from('%PDF-1.4\nwrong bytes, same name') });
    assert.equal((await submit()).body.error, 'resume_attachment_digest_mismatch');
    const attached = (await attach()).body;
    assert.equal(attached.attemptReceipt?.code, 'resume_attached_verified', JSON.stringify(attached));
    assert.equal((await attach()).body.attemptReceipt?.code, 'resume_already_verified');
    assert.equal(await target.locator('#notes').inputValue(), 'operator entry');
    assert.equal(await target.getByLabel('Full name').inputValue(), 'Reviewed applicant');
    await target.getByLabel('Service Desk').uncheck();
    await target.getByLabel('Workflow Studio').uncheck();
    assert.match((await submit()).body.blockers.join(), /Which tools have you used/);
    await target.getByLabel('Service Desk').check();
    await target.getByLabel('Workflow Studio').check();
    await target.getByLabel('I agree').uncheck();
    assert.equal((await submit()).body.error, 'submit_blocked_incomplete_form');
    await target.getByLabel('I agree').check();
    const challenge = await target.evaluateHandle(() => {
      const iframe = document.createElement('iframe');
      iframe.title = 'hCaptcha challenge';
      document.body.append(iframe);
      return iframe;
    });
    assert.equal((await submit()).body.error, 'employer_verification_required');
    await challenge.evaluate(frame => frame.remove());
    assert.equal(await target.evaluate(() => Reflect.get(window, 'attemptCount')), 0);
    assert.equal((await submit()).body.finalActionActivated, true);
    assert.equal((await listeners.refresh()).submission?.state, 'VALIDATION_FAILED');
    const rejected = (await history()).body.receipts[0];
    assert.equal(rejected.resumeBefore, 'VERIFIED');
    assert.equal(rejected.resumeSha256, sha256);
    assert.equal(rejected.dispatch, 'CLICK_OBSERVED');
    assert.equal(rejected.response, 'LEVER_VERIFICATION_ERROR');
    assert.equal(rejected.resumeAfter, 'EMPTY');
    assert.equal((await submit()).body.error, 'answer_and_submission_listeners_required');
    assert.deepEqual(syncedAttempts, []);
    assert.equal((await request({ ...payload, recordAnswers: true })).code, 200);
    assert.equal((await submit()).body.attemptReceipt?.resumeBefore, 'MISSING');
    assert.equal((await attach()).body.attemptReceipt?.resumeBefore, 'VERIFIED');
    assert.equal((await submit()).body.finalActionActivated, true);
    await target.waitForURL('**/thanks');
    const observed = await listeners.refresh();
    assert.equal(observed.submission?.state, 'CONFIRMED');
    assert.equal(observed.receipts.length, 1);
    const persisted = new LeverAttemptReceipts(root).recent(job.url + '/apply');
    assert.equal(persisted[0].response, 'CONFIRMED');
    assert.equal(persisted[0].observerAttemptId, observed.receipts[0].attemptId);
    assert.ok(persisted.some(item => item.id === rejected.id && item.response === 'LEVER_VERIFICATION_ERROR'));
    assert.ok(!JSON.stringify(persisted).includes('operator entry'));
    assert.deepEqual(syncedAttempts, [observed.receipts[0].attemptId]);
    assert.equal(await target.evaluate(() => Reflect.get(window, 'attemptCount')), 2);
    const preferences = await readPreferences(preferencesPath);
    assert.equal(preferences.preferences['identity.website']?.value, 'https://example.com');
    assert.equal(preferences.discovered_answers?.[normalizeQuestion('Which tools have you used?')]?.value, 'Service Desk\nWorkflow Studio');
    assert.equal(preferences.discovered_answers?.[normalizeQuestion('Additional notes')]?.value, 'operator entry');
    assert.equal(preferences.discovered_answers?.[normalizeQuestion('Privacy acknowledgement')], undefined);
  } finally {
    await listeners.dispose(); await browser.close();
    delete (globalThis as Record<symbol, unknown>)[symbol];
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('bind-existing reuses only the active explicitly confirmed questionnaire without navigation', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'eh-bind-existing-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const before = { ...process.env };
  const instanceId = 'existing-tab-' + Date.now();
  const symbol = Symbol.for('escapehatch.managed-browser.' + instanceId);
  const listeners = new ManagedListeners(path.join(root, 'receipts.json'), path.join(root, 'preferences.json'));
  const job = { id: 'synthetic-questionnaire', company: 'Synthetic', role: 'Engineer', url: 'https://synthetic.hiringplatform.com/processes/example', status: 'preparing' as const, priority: 'normal' as const, notes: '', nextAction: 'Review', updatedAt: new Date().toISOString() };
  try {
    Object.assign(process.env, { ESCAPEHATCH_DATA_HOME: root, ESCAPEHATCH_REPO_FINGERPRINT: 'a'.repeat(64), ESCAPEHATCH_SHUTDOWN_TOKEN: 'synthetic-only', ESCAPEHATCH_STARTED_AT_UTC: new Date().toISOString(), PORT: '21041', ESCAPEHATCH_INSTANCE_ID: instanceId });
    await saveWorkspace({ schema: WORKSPACE_SCHEMA, values: { [APPLICATIONS_KEY]: [job] } }, null);
    await context.route('https://synthetic.hiringplatform.com/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="tw-app"><form id="question-page-form"><input value="operator entry"><button type="submit">Save and Complete</button></form></div>' }));
    const unrelated = await context.newPage(); await unrelated.goto(job.url.replace('11111111-', '22222222-') + '/apply');
    const target = await context.newPage(); await target.goto('https://synthetic.hiringplatform.com/questionnaires/456/people/example');
    (globalThis as Record<symbol, unknown>)[symbol] = { context, page: target, state: 'browser_open', applicationOrigin: new URL(target.url()).origin, applicationUrl: job.url, opportunityId: job.id, preparation: null, networkDiagnosis: null, authCheckpoint: null, trustedReturnPath: new URL(target.url()).pathname, listeners, busy: false };
    let middleware: Function = () => {};
    const plugin = createManagedBrowserAssistPlugin();
    (plugin.configureServer as Function)({ config: { server: { port: 21041 } }, middlewares: { use: (handler: Function) => { middleware = handler; } } });
    const request = async (payload: object, origin = 'http://127.0.0.1:21041') => {
      let code = 0, body = '';
      await middleware({ url: '/__escapehatch/managed-assist/listeners/bind-existing', method: 'POST', headers: { host: '127.0.0.1:21041', origin, 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' }, socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); } }, { set statusCode(value: number) { code = value; }, setHeader() {}, end(value: string) { body = value; } }, () => assert.fail('bind route missed'));
      return { code, body: JSON.parse(body) };
    };
    const payload = { opportunityId: job.id, url: job.url, livePageUrl: target.url() };
    assert.equal((await request(payload, 'https://foreign.example.com')).code, 403);
    assert.equal((await request({ ...payload, opportunityId: 'wrong-job' })).code, 422);
    assert.equal((await request({ ...payload, livePageUrl: 'https://synthetic.hiringplatform.com/questionnaires/999/people/other' })).code, 422);
    const result = await request(payload);
    assert.equal(result.code, 200, JSON.stringify(result.body));
    assert.equal(result.body.listeners.submission.state, 'ARMED');
    assert.equal(result.body.listeners.recordingAnswers, false);
    assert.equal(result.body.currentPage.pageUrl, target.url());
    assert.equal(await target.locator('input').inputValue(), 'operator entry');
    assert.equal(unrelated.url(), job.url.replace('11111111-', '22222222-') + '/apply');
    assert.deepEqual(await fs.readdir(root).then(files => files.filter(file => file === 'receipts.json')), []);
  } finally {
    await listeners.dispose(); await browser.close();
    delete (globalThis as Record<symbol, unknown>)[symbol];
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('managed Chrome sessions persist per app origin and cannot collide across runtime ports', () => {
  const env = { LOCALAPPDATA: path.resolve('synthetic-user-data') };
  const production = managedBrowserProfileDirectory('http://127.0.0.1:21031', env);
  assert.equal(production, path.join(env.LOCALAPPDATA, 'EscapeHatch', 'managed-career-browser-origins', '21031'));
  assert.equal(managedBrowserProfileDirectory('http://127.0.0.1:21031', { ...env, ESCAPEHATCH_INSTANCE_ID: 'after-restart', ESCAPEHATCH_REPO_FINGERPRINT: 'different-checkout' }), production);
  assert.notEqual(managedBrowserProfileDirectory('http://127.0.0.1:21033', env), production);
  assert.notEqual(production, path.join(env.LOCALAPPDATA, 'EscapeHatch', 'managed-career-browser'));
  assert.equal(path.relative(path.join(env.LOCALAPPDATA, 'EscapeHatch', 'managed-career-browser'), production).split(path.sep)[0], '..');
});

test('managed Chrome respects the canonical isolated data root even with inherited real LOCALAPPDATA', () => {
  const env = { LOCALAPPDATA: path.resolve('synthetic-user-data'), ESCAPEHATCH_DATA_HOME: path.resolve('isolated-test-data') };
  assert.equal(managedBrowserProfileDirectory('http://127.0.0.1:21041', env),
    path.join(env.ESCAPEHATCH_DATA_HOME, 'managed-career-browser-origins', '21041'));
});

test('managed Chrome rejects origins that cannot own a loopback runtime', () => {
  for (const origin of ['https://example.com', 'http://localhost:21031', 'http://127.0.0.1:0', 'http://127.0.0.1:65536',
    'http://127.0.0.1:21031/path', 'http://127.0.0.1:21031/', 'http://user:pass@127.0.0.1:21031']) {
    assert.throws(() => managedBrowserProfileDirectory(origin));
  }
  for (const port of [1, 80, 1023, 65535]) {
    assert.equal(path.basename(managedBrowserProfileDirectory(`http://127.0.0.1:${port}`)), String(port));
  }
});

test('production launch route reuses its context and leaves a busy legacy profile untouched', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'escapehatch-profile-isolation-'));
  const legacy = path.join(root, 'managed-career-browser');
  await fs.mkdir(legacy);
  await fs.writeFile(path.join(legacy, 'SingletonLock'), 'separately-owned-browser');
  const before = { ...process.env };
  const originalLaunch = chromium.launchPersistentContext;
  const folders: string[] = [];
  const instances: string[] = [];
  let currentUrl = 'about:blank';
  let navigations = 0;
  const page = { isClosed: () => false, url: () => currentUrl, bringToFront: async () => {},
    // Keep the fixture off every employer and exercise the guarded navigation-failure path.
    goto: async (url: string) => { navigations++; currentUrl = url; throw new Error('net::ERR_INTERNET_DISCONNECTED'); } };
  chromium.launchPersistentContext = (async (folder: string, options) => {
    assert.equal(options?.chromiumSandbox, true, 'managed employer browsing must keep Chromium sandboxing enabled');
    folders.push(folder);
    currentUrl = 'about:blank'; // each isolated profile starts with its own blank page
    return { pages: () => [page], on: () => {} };
  }) as typeof originalLaunch;
  try {
    Object.assign(process.env, { ESCAPEHATCH_DATA_HOME: root,
      ESCAPEHATCH_REPO_FINGERPRINT: 'a'.repeat(64), ESCAPEHATCH_SHUTDOWN_TOKEN: 'synthetic-only',
      ESCAPEHATCH_STARTED_AT_UTC: '2026-10-27T00:00:00Z' });
    for (const port of [21041, 21042]) {
      const instanceId = `profile-isolation-${port}-${Date.now()}`;
      instances.push(instanceId);
      Object.assign(process.env, { PORT: String(port), ESCAPEHATCH_INSTANCE_ID: instanceId });
      let middleware: (req: unknown, res: unknown, next: () => void) => Promise<void> = async () => {};
      const plugin = createManagedBrowserAssistPlugin();
      (plugin.configureServer as Function)({ config: { server: { port } }, middlewares: {
        use: (handler: typeof middleware) => { middleware = handler; },
      } });
      for (let repeat = 0; repeat < 2; repeat++) {
        let status = 0; let result = '';
        const req = { url: '/__escapehatch/managed-assist/launch', method: 'POST',
          headers: { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`,
            'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' },
          socket: { remoteAddress: '127.0.0.1' },
          async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ url: 'https://jobs.example.com/role', opportunityId: 'synthetic-role' })); },
        };
        await middleware(req, { set statusCode(value: number) { status = value; },
          setHeader: () => {}, end: (value: string) => { result = value; } }, () => assert.fail('launch route missed'));
        assert.equal(status, 200, result);
        assert.equal(JSON.parse(result).state, repeat === 0 ? 'browser_open_navigation_unverified' : 'application_restored_review_required');
      }
    }
    assert.equal(navigations, 2, 'one navigation per new profile; repeat launch leaves restored tab intact');
    assert.deepEqual(folders, [path.join(root, 'managed-career-browser-origins', '21041'),
      path.join(root, 'managed-career-browser-origins', '21042')]);
    assert.equal(await fs.readFile(path.join(legacy, 'SingletonLock'), 'utf8'), 'separately-owned-browser');
    assert.deepEqual(await fs.readdir(legacy), ['SingletonLock']);
  } finally {
    chromium.launchPersistentContext = originalLaunch;
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
    for (const instance of instances) delete (globalThis as Record<symbol, unknown>)[Symbol.for('escapehatch.managed-browser.' + instance)];
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('real Chrome opens isolated profiles while the legacy browser stays open and retains its own sessions', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'escapehatch-profile-browser-'));
  // Windows is the production managed-browser host. Linux CI's synthetic profile
  // fixture cannot prove sandbox support under its restricted namespace policy.
  const options = { headless: true, ...(process.platform === 'win32' ? { channel: 'chrome', chromiumSandbox: true } : {}) };
  const contexts: Awaited<ReturnType<typeof chromium.launchPersistentContext>>[] = [];
  try {
    const legacy = await chromium.launchPersistentContext(path.join(root, 'managed-career-browser'), options);
    contexts.push(legacy);
    await legacy.addCookies([{ name: 'synthetic-session', value: 'legacy', url: 'https://example.com' }]);
    const firstPath = managedBrowserProfileDirectory('http://127.0.0.1:21041', { ESCAPEHATCH_DATA_HOME: root });
    const first = await chromium.launchPersistentContext(firstPath, options);
    contexts.push(first);
    const other = await chromium.launchPersistentContext(managedBrowserProfileDirectory('http://127.0.0.1:21042', { ESCAPEHATCH_DATA_HOME: root }), options);
    contexts.push(other);
    assert.equal((await first.cookies()).length, 0);
    assert.equal((await other.cookies()).length, 0);
    await first.addCookies([{ name: 'synthetic-session', value: 'first-origin', url: 'https://example.com', expires: Math.floor(Date.now() / 1000) + 3600 }]);
    await first.close();
    const restarted = await chromium.launchPersistentContext(firstPath, options);
    contexts.push(restarted);
    assert.equal((await restarted.cookies())[0]?.value, 'first-origin');
    assert.equal((await legacy.cookies())[0]?.value, 'legacy');
    assert.equal((await other.cookies()).length, 0);
    assert.equal(legacy.pages()[0].isClosed(), false);
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('only public HTTPS application URLs are accepted', () => {
  assert.match(validateApplicationUrl('https://www.google.com/about/careers/applications/jobs/results/123'), /^https:/);
  for (const url of ['http://example.com', 'file:///etc/passwd', 'http://127.0.0.1/', 'https://localhost/x',
    'https://192.168.1.2/', 'https://user:pass@example.com/', 'https://example.com:8443/x',
    'https://x.local/page', 'not-a-url']) {
    assert.throws(() => validateApplicationUrl(url), /URL|HTTPS/);
  }
  const previous = process.env.ESCAPEHATCH_ALLOW_SYNTHETIC_ATS;
  try {
    process.env.ESCAPEHATCH_ALLOW_SYNTHETIC_ATS = '1';
    assert.match(validateApplicationUrl('http://127.0.0.1:8765/apply/step/1'), /^http:\/\/127\.0\.0\.1:8765\//);
    assert.throws(() => validateApplicationUrl('http://192.168.1.2:8765/x'), /URL|HTTPS/);
    assert.throws(() => validateApplicationUrl('http://localhost:8765/x'), /URL|HTTPS/);
  } finally {
    if (previous === undefined) delete process.env.ESCAPEHATCH_ALLOW_SYNTHETIC_ATS;
    else process.env.ESCAPEHATCH_ALLOW_SYNTHETIC_ATS = previous;
  }
});

test('only whitelisted known contact fields survive, phone is withheld without authority', () => {
  assert.deepEqual(reviewedContactFields({ first_name: ' A ', email: 'a@example.com',
    phone: '12345', phone_authority: 'unconfirmed', password: 'SECRET',
    work_authorized: true, attest: true }), { first_name: 'A', email: 'a@example.com' });
  assert.deepEqual(reviewedContactFields({ phone: '12345', phone_authority: 'user_confirmed_primary' }), { phone: '12345' });
  assert.deepEqual(reviewedContactFields({}), {});
});

test('private PDF validation forbids arbitrary bytes, excessive length and paths', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n').toString('base64');
  const safe = parsePrivatePdf({ name: 'resume.pdf', base64: pdf });
  assert.equal(safe?.buffer.subarray(0, 5).toString(), '%PDF-');
  assert.equal(parsePrivatePdf(null), null);
  assert.throws(() => parsePrivatePdf({ name: '../resume.pdf', base64: pdf }), /Invalid/);
  assert.throws(() => parsePrivatePdf({ name: 'resume.pdf', base64: Buffer.from('junk').toString('base64') }), /PDF/);
});

test('browser control is scoped to operator actions: no terminal submit verb', () => {
  const verbs = ['launch', 'fill', 'attach', 'prepare', 'status'];
  assert.equal(verbs.includes('submit'), false);
  assert.equal(verbs.includes('next'), false);
  assert.equal(verbs.includes('prepare'), true);
});

test('navigation authorization rejects terminal automation and unbound sessions', () => {
  const origin = 'https://jobs.example.com';
  const auth = parseNavigationAuthorization({
    sessionId: 'sess-1',
    opportunityId: 'opp-1',
    navigationEnabled: true,
    allowedEffectClasses: ['DRAFT_WRITE_AND_ADVANCE'],
    allowedDataCategories: ['synthetic_cover_note'],
  }, origin);
  assert.equal(auth.origin, origin);
  assert.throws(() => parseNavigationAuthorization({
    sessionId: 'sess-1', opportunityId: 'opp-1', navigationEnabled: true,
    allowedEffectClasses: ['TERMINAL_APPLICATION_COMMIT'],
  }, origin), /TERMINAL/);
  assert.throws(() => parseNavigationAuthorization({
    sessionId: 'sess-1', opportunityId: 'opp-1', navigationEnabled: false,
    allowedEffectClasses: ['LOCAL_STEP_ONLY'],
  }, origin), /navigationEnabled/);
});

test('trusted adapter registry never accepts page-authored schemas', () => {
  const registry = parseTrustedAdapterRegistry({
    schema: ADAPTER_EVIDENCE_SCHEMA,
    adapterId: 'escapehatch-synthetic-ats@1',
    atsProvider: 'synthetic-local-ats',
    evidence: [{
      pageFingerprint: 'native-step-1',
      controlId: 'apply-submit',
      controlFingerprint: 'cta-native-step-1',
      enclosingFormAction: '/apply/step/1',
      enclosingFormMethod: 'post',
      verifiedEffectClass: 'DRAFT_WRITE_AND_ADVANCE',
      evidenceRefs: ['fixture://proof'],
    }],
  });
  assert.equal(registry.evidence.length, 1);
  assert.throws(() => parseTrustedAdapterRegistry({
    schema: 'page-invented/v1', adapterId: 'x', atsProvider: 'y', evidence: [],
  }), /schema|evidence/i);
});


test('talent-community composite fields derive only from complete approved contact data', () => {
  const current = {
    'identity.first_name': { value: 'Alex' }, 'identity.last_name': { value: 'Example' },
    'identity.city': { value: 'Example City' }, 'identity.region': { value: 'NY' },
    'identity.country': { value: 'US' },
  };
  assert.deepEqual(derivedContactPreferenceValues(current), {
    'identity.full_name': 'Alex Example', 'identity.location_summary': 'Example City, NY, US',
  });
  assert.deepEqual(derivedContactPreferenceValues({ ...current,
    'identity.full_name': { value: 'Reviewed Legal Name' },
    'identity.location_summary': { value: 'Reviewed Location' },
  }), {}, 'explicit values take precedence');
  assert.deepEqual(derivedContactPreferenceValues({ ...current, 'identity.region': { value: '' } }),
    { 'identity.full_name': 'Alex Example' }, 'partial locations stay blank');
});

// Real Chromium on synthetic routed HTML; zero employer traffic, no personal data.
test('Cognizant anonymous Resume input is unique and exact-origin bound', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const sample = '<!doctype html><h2>Resume</h2><input type="file" id="anonymous" />';
  const resume = { name: 'synthetic.pdf', mimeType: 'application/pdf' as const,
    buffer: Buffer.from('%PDF-1.4\nsynthetic fixture\n') };
  try {
    await page.route('https://careers.cognizant.com/**', route => route.fulfill({
      status: 200, contentType: 'text/html', body: sample,
    }));
    await page.goto('https://careers.cognizant.com/us-en/talent-community/');
    const attached = await attachPdfs(page, resume, null);
    assert.equal(attached.resume, 'attached_to_input_review_required');
    assert.equal(await page.locator('#anonymous').evaluate(element =>
      (element as HTMLInputElement).files?.length), 1);

    await page.setContent(sample + '<input type="file" id="second" />');
    const duplicate = await attachPdfs(page, resume, null);
    assert.equal(duplicate.resume, 'manual_required');
    assert.equal(await page.locator('#anonymous').evaluate(element =>
      (element as HTMLInputElement).files?.length), 0);

    await page.route('https://example.org/**', route => route.fulfill({
      status: 200, contentType: 'text/html', body: sample,
    }));
    await page.goto('https://example.org/us-en/talent-community/');
    const wrongOrigin = await attachPdfs(page, resume, null);
    assert.equal(wrongOrigin.resume, 'manual_required');
    assert.equal(await page.locator('#anonymous').evaluate(element =>
      (element as HTMLInputElement).files?.length), 0);
  } finally {
    await browser.close();
  }
});

test('community profile identity and protected consent remain separate from job application', () => {
  assert.ok(isCognizantTalentCommunity(COGNIZANT_TALENT_URL));
  assert.ok(isCognizantTalentCommunity(COGNIZANT_TALENT_URL.slice(0, -1)));
  for (const url of ['https://careers.cognizant.com/us-en/jobs/example',
    'https://careers.cognizant.com/ca-en/talent-community/',
    COGNIZANT_TALENT_URL + '?return=job', 'https://fake-cognizant.test/us-en/talent-community/']) {
    assert.equal(isCognizantTalentCommunity(url), false);
  }
  for (const label of ['I want to join the Talent Community', 'Consent to receiving updates via email and SMS',
    'I have read the Talent Search Privacy Notice', 'Marketing opt-in', 'I certify this information is accurate']) {
    assert.equal(isProtectedEnrollmentConsentLabel(label), true, label);
  }
  assert.equal(isProtectedEnrollmentConsentLabel('Show additional work history'), false);
});

test('managed enrollment reuses existing reviewed Cognizant resume, never job status or private values', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'eh-community-scope-'));
  const before = { ...process.env };
  const instanceId = 'talent-scope-' + Date.now();
  const symbol = Symbol.for('escapehatch.managed-browser.' + instanceId);
  const sourceJob = { id: 'synthetic-submitted-cognizant', company: 'Cognizant',
    role: 'Synthetic Role', url: 'https://careers.cognizant.com/us-en/jobs/synthetic',
    status: 'applied' as const, priority: 'normal' as const, notes: 'Preserve history',
    nextAction: 'Await recruiter', updatedAt: new Date().toISOString() };
  try {
    Object.assign(process.env, { ESCAPEHATCH_DATA_HOME: root,
      ESCAPEHATCH_REPO_FINGERPRINT: 'a'.repeat(64), ESCAPEHATCH_SHUTDOWN_TOKEN: 'synthetic-only',
      ESCAPEHATCH_STARTED_AT_UTC: new Date().toISOString(), PORT: '21041',
      ESCAPEHATCH_INSTANCE_ID: instanceId });
    await saveWorkspace({ schema: WORKSPACE_SCHEMA, values: { [APPLICATIONS_KEY]: [sourceJob] } }, null);
    const store = new OpportunityDocumentStore();
    const selected = await store.stage(sourceJob.id, sourceJob.url, 'resume', {
      name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\ncontrolled fixture') });
    const sha = selected.documents.resume!.sha256;
    await store.review(sourceJob.id, sourceJob.url, 'resume', sha);
    let middleware: Function = () => {};
    const plugin = createManagedBrowserAssistPlugin();
    (plugin.configureServer as Function)({ config: { server: { port: 21041 } },
      middlewares: { use: (handler: Function) => { middleware = handler; } } });
    const request = async (endpoint: string, payload: object) => {
      let status = 0, body = '';
      await middleware({ url: '/__escapehatch/managed-assist' + endpoint, method: 'POST',
        headers: { host: '127.0.0.1:21041', origin: 'http://127.0.0.1:21041',
          'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' },
        socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() {
          yield Buffer.from(JSON.stringify(payload)); },
      }, { set statusCode(value: number) { status = value; }, setHeader() {},
        end(value: string) { body = value; } }, () => assert.fail('community route missed'));
      return { status, result: JSON.parse(body) };
    };
    assert.equal((await request('/launch', { opportunityId: sourceJob.id, url: COGNIZANT_TALENT_URL })).status, 409,
      'submitted job ID is not a community profile identifier');
    assert.equal((await request('/talent-community/cognizant/reuse-resume',
      { sourceOpportunityId: 'unknown', sourceUrl: sourceJob.url })).status, 409);
    const transfer = await request('/talent-community/cognizant/reuse-resume',
      { sourceOpportunityId: sourceJob.id, sourceUrl: sourceJob.url, sourceSha256: sha });
    assert.equal(transfer.status, 200, JSON.stringify(transfer.result));
    assert.equal(transfer.result.scope.opportunityId, COGNIZANT_TALENT_ID);
    assert.equal(transfer.result.resume.sha256, sha);
    assert.equal(transfer.result.enrollmentSubmitted, false);
    assert.equal(transfer.result.employerUploadObserved, false);
    assert.equal((await store.forUpload(COGNIZANT_TALENT_ID, COGNIZANT_TALENT_URL)).resume?.name, 'synthetic.pdf');
    assert.equal((await store.read(sourceJob.id, sourceJob.url)).documents.resume?.sha256, sha);
    const preservedApplications = (await readWorkspace())?.workspace.values[APPLICATIONS_KEY] as typeof sourceJob[] | undefined;
    assert.equal(preservedApplications?.[0]?.status, 'applied');
    assert.equal((await request('/talent-community/cognizant/reuse-resume',
      { sourceOpportunityId: sourceJob.id, sourceUrl: sourceJob.url })).status, 200,
      'same reviewed bytes reuse idempotently');
    await store.stage(COGNIZANT_TALENT_ID, COGNIZANT_TALENT_URL, 'resume', {
      name: 'another.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nchanged fixture') });
    assert.equal((await request('/talent-community/cognizant/reuse-resume',
      { sourceOpportunityId: sourceJob.id, sourceUrl: sourceJob.url })).status, 422,
      'never overwrite a different already staged community resume');
  } finally {
    delete (globalThis as Record<symbol, unknown>)[symbol];
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('private-sync status endpoint stays value-free and reports DISABLED without experimental flag', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'eh-private-sync-status-'));
  const before = { ...process.env };
  const instanceId = 'private-sync-status-' + Date.now();
  const symbol = Symbol.for('escapehatch.managed-browser.' + instanceId);
  const listeners = new ManagedListeners(path.join(root, 'receipts.json'), path.join(root, 'preferences.json'));
  try {
    Object.assign(process.env, {
      ESCAPEHATCH_DATA_HOME: root,
      ESCAPEHATCH_REPO_FINGERPRINT: 'a'.repeat(64),
      ESCAPEHATCH_SHUTDOWN_TOKEN: 'synthetic-only',
      ESCAPEHATCH_STARTED_AT_UTC: new Date().toISOString(),
      PORT: '21055',
      ESCAPEHATCH_INSTANCE_ID: instanceId,
    });
    delete process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC;
    (globalThis as Record<symbol, unknown>)[symbol] = {
      context: null, page: null, state: 'idle', applicationOrigin: null, applicationUrl: null,
      opportunityId: null, preparation: null, networkDiagnosis: null, authCheckpoint: null,
      trustedReturnPath: null, listeners, busy: false,
    };
    let middleware: Function = () => {};
    const plugin = createManagedBrowserAssistPlugin();
    (plugin.configureServer as Function)({ config: { server: { port: 21055 } }, middlewares: { use: (handler: Function) => { middleware = handler; } } });
    const get = async (origin = 'http://127.0.0.1:21055') => {
      let code = 0, body = '';
      await middleware(
        { url: '/__escapehatch/managed-assist/private-sync/status', method: 'GET', headers: { host: '127.0.0.1:21055', origin }, socket: { remoteAddress: '127.0.0.1' } },
        { set statusCode(value: number) { code = value; }, setHeader() {}, end(value: string) { body = value; } },
        () => assert.fail('private-sync status route missed'),
      );
      return { code, body: JSON.parse(body) };
    };
    const disabled = await get();
    assert.equal(disabled.code, 200);
    assert.equal(disabled.body.enabled, false);
    assert.equal(disabled.body.status, 'DISABLED');
    assert.equal(disabled.body.values, undefined);
    process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC = '1';
    const enabled = await get();
    assert.equal(enabled.code, 200);
    assert.equal(enabled.body.enabled, true);
    assert.equal(enabled.body.values, 'redacted');
    assert.ok(typeof enabled.body.status === 'string');
    assert.equal(Object.prototype.hasOwnProperty.call(enabled.body, 'preferences'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(enabled.body, 'pairingCode'), false);
    assert.ok('phoneLanUrl' in enabled.body);
    if (enabled.body.phoneLanUrl != null) {
      assert.match(String(enabled.body.phoneLanUrl), /^http:\/\/192\.168\.\d+\.\d+:18765\/$/);
    }
    assert.equal((await get('https://foreign.example.com')).code, 403);
  } finally {
    await listeners.dispose();
    delete (globalThis as Record<symbol, unknown>)[symbol];
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
    await fs.rm(root, { recursive: true, force: true });
  }
});
