import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { trackerOpportunityId } from '../src/lib/tracker-bridge';

test('existing-tab tracking and external sync status stay explicit without launching or submitting', async ({ page }) => {
  const job = { id: 'existing-lever', company: 'Synthetic', role: 'Role', url: 'https://jobs.lever.co/synthetic/00000000-0000-0000-0000-000000000000', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() };
  const actions: string[] = [];
  let armed = false;
  let connected = true;
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1)!;
    actions.push(action);
    if (!connected) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'synthetic_listener_disconnect' }) });
      return;
    }
    if (action === 'bind-existing') {
      expect(route.request().postDataJSON()).toMatchObject({ opportunityId: job.id, url: job.url, livePageUrl: job.url + '/apply' });
      armed = true;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, browserOpen: true, state: 'application_form_open_review_required',
      currentPage: { opportunityId: job.id, applicationUrl: job.url, pageUrl: job.url + '/apply' },
      listeners: { recordingAnswers: false, savedAnswers: 0, opportunityId: job.id, error: '', receipts: [], submission: { state: armed ? 'ARMED' : 'DISARMED', reason: armed ? 'Listening for user submit on this application.' : 'Listener is off.' } },
      trackerSync: { state: 'AUTH_REQUIRED', pending: 0, synced: 0, authRequired: 1, conflicts: 0, retryRequired: 0 } }) });
  });
  await mockDocuments(page);
  await page.goto('/');
  await page.evaluate(job => localStorage.setItem('escape-hatch-applications', JSON.stringify([job])), job);
  await page.goto('/assist?opportunityId=' + job.id);
  await page.getByRole('button', { name: 'Track existing application tab' }).click();
  await expect(page.getByTestId('submission-listener-status')).toContainText('Listening for user submit');
  await expect(page.getByTestId('submission-listener-state')).toContainText('ARMED — observing form transitions for this job');
  await expect(page.getByText(/Tracker synchronization: AUTH_REQUIRED/)).toBeVisible();
  await page.getByRole('button', { name: 'Retry tracker synchronization' }).click();
  expect(actions).toContain('retry');
  expect(actions).not.toContain('launch');
  expect(actions).not.toContain('submit');
  // An unreachable server must erase the historic ARMED label, not reassure the operator.
  connected = false;
  await expect(page.getByTestId('submission-listener-state')).toContainText('DISCONNECTED', { timeout: 7000 });
  await expect(page.getByTestId('submission-listener-state')).not.toContainText('ARMED');
});

test('only persisted bound submission evidence advances the queue and survives reload', async ({ page }) => {
  let confirmed = false;
  const receipt = { opportunityId: 'synthetic-receipt', sessionId: 'session', attemptId: 'attempt',
    applicationOrigin: 'https://jobs.ashbyhq.com', applicationPath: '/synthetic/receipt/application',
    observedAt: '2026-10-19T12:00:00Z', source: 'same_session_page_confirmation',
    evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT' };
  await page.route('**/__escapehatch/managed-assist/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    ok: true, state: 'application_form_open_review_required', browserOpen: true,
    listeners: { recordingAnswers: true, savedAnswers: 0, opportunityId: receipt.opportunityId, error: '',
      submission: { state: confirmed ? 'CONFIRMED' : 'PENDING', reason: 'Synthetic observation' }, receipts: confirmed ? [receipt] : [] },
  }) }));
  await mockDocuments(page);
  await page.goto('/assist');
  await page.evaluate(() => localStorage.setItem('escape-hatch-applications', JSON.stringify([{ id: 'synthetic-receipt',
    company: 'Synthetic', role: 'Role', url: 'https://jobs.ashbyhq.com/synthetic/receipt', status: 'saved',
    priority: 'normal', notes: '', nextAction: '', updatedAt: '2026-10-18T12:00:00Z' }])));
  await page.reload();
  await expect(page.getByText('Synthetic observation')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-applications')!)[0].status)).toBe('saved');
  confirmed = true;
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-applications')!)[0].status)).toBe('applied');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-applications')!)[0].events?.length)).toBe(1);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-applications')!)[0].submissionEvidence.attemptId)).toBe('attempt');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-applications')!)[0].events.length)).toBe(1);
});

test('cockpit owns Launch, Fill and Attach without a Chrome extension', async ({ page }) => {
  const seen: string[] = [];
  let launched = false;
  await page.route('**/__escapehatch/managed-assist/**', async (route) => {
    const url = new URL(route.request().url());
    const action = url.pathname.split('/').at(-1) || '';
    seen.push(action);
    if (action === 'launch') launched = true;
    const body = action === 'status'
      ? { ok: true, state: 'idle', browserOpen: launched }
      : { ok: true, state: action === 'launch' ? 'application_open_review_required' :
          action === 'fill' ? 'fields_unverified_review_required' : 'attachments_staged_review_required',
          filled: [], skipped: [], attachments: { resume: 'attached_to_input_review_required' } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await mockDocuments(page);
  await page.goto('/assist');
  await page.evaluate(() => localStorage.setItem('escape-hatch-applications', JSON.stringify([{ id: 'document-opportunity', company: 'Synthetic', role: 'Role', url: 'https://jobs.ashbyhq.com/synthetic/entry', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() }])));
  await page.goto('/assist?opportunityId=document-opportunity');
  await expect(page.getByTestId('managed-browser-assist')).toBeVisible();
  await expect(page.getByTestId('managed-job-url')).toHaveValue('https://jobs.ashbyhq.com/synthetic/entry');
  await page.getByTestId('button-managed-launch').click();
  await expect(page.getByText('Application opened — sign in if requested')).toBeVisible();
  await page.getByTestId('button-managed-fill').click();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('No fields filled');
  await expect(page.getByText('No fields verified — review the employer form')).toBeVisible();
  await page.getByTestId('managed-browser-assist').locator('input[type="file"]').first().setInputFiles({
    name: 'synthetic-resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\\nfixture'),
  });
  await expect(page.getByTestId('button-managed-attach')).toBeDisabled();
  await page.getByRole('button', { name: 'I reviewed this résumé', exact: true }).click();
  await page.getByTestId('button-managed-attach').click();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('resume: attached to input review required');
  expect(seen).toContain('attach');
  assertNeverSubmitted(seen);
  await page.getByTestId('select-assist-milestone').selectOption('document-opportunity');
  await page.getByTestId('button-record-assist-milestone').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-applications')!)[0].nextAction))
    .toBe('Application submitted — follow up when appropriate');
});

function assertNeverSubmitted(actions: string[]) {
  expect(actions).toContain('launch');
  // Landing and login pages MUST NOT attempt Fill. The action order is checked
  // separately in tests that actually reach an application form.
  expect(actions).not.toContain('submit');
  expect(actions).not.toContain('next');
}

test('Home hands the ready opportunity into managed Chrome instead of reopening a submitted job', async ({ page }) => {
  const readyUrl = 'https://jobs.ashbyhq.com/synthetic/ready';
  const submittedUrl = 'https://jobs.ashbyhq.com/synthetic/submitted';
  const now = '2026-10-18T12:00:00Z';
  const apps = [
    { id: 'tracker-submitted', company: 'Synthetic Submitted', role: 'Old Role',
      url: submittedUrl, status: 'applied', priority: 'high', notes: 'Tracker row 10 · provider status: Submitted',
      nextAction: 'Do not reapply', updatedAt: now },
    { id: 'tracker-ready', company: 'Synthetic Next', role: 'Ready Role',
      url: readyUrl, status: 'saved', priority: 'high',
      notes: 'Tracker row 11 · provider status: Ready to Apply\\nApplied? unchecked',
      nextAction: 'Prepare application', updatedAt: now },
  ];
  await page.route('**/__escapehatch/managed-assist/**', async (route) => {
    const action = route.request().url().split('/').at(-1);
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, state: action === 'launch' ? 'application_open_review_required' : 'idle', browserOpen: false }) });
  });
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('escape-hatch-applications', JSON.stringify(value)), apps);
  await page.reload();
  await expect(page.getByTestId('home-next-company-role')).toContainText('Synthetic Next');
  await page.getByTestId('link-prepare-next').click();
  await expect(page.getByTestId('managed-job-url')).toHaveValue(readyUrl);
  await expect(page.getByLabel('Saved opportunity')).toHaveValue('tracker-ready');
  const launched = page.waitForRequest('**/__escapehatch/managed-assist/launch');
  await page.getByTestId('button-managed-launch').click();
  const body = (await launched).postDataJSON();
  expect(body).toEqual({ url: readyUrl, opportunityId: 'tracker-ready', employerName: 'Synthetic Next' });
  await expect(page.getByText('Application opened — sign in if requested')).toBeVisible();
  await page.goto('/assist?opportunityId=tracker-submitted');
  await expect(page.getByTestId('managed-job-url')).toHaveValue(readyUrl);
  await expect(page.getByTestId('managed-browser-assist').locator('option[value="tracker-submitted"]')).toHaveCount(0);
});

test('Launch automatically fills permitted fields when a verified application form opens', async ({ page }) => {
  const actions: string[] = [];
  await page.route('**/__escapehatch/managed-assist/**', async (route) => {
    const action = route.request().url().split('/').at(-1) || '';
    actions.push(action);
    const data = action === 'status' ? { ok: true, state: 'idle', browserOpen: false } :
      action === 'launch' ? { ok: true, state: 'application_form_open_review_required' } :
      action === 'fill' ? { ok: true, state: 'fields_partially_filled_review_required', filled: ['first_name'], skipped: ['unknown_question'] } :
      { ok: false, error: 'unexpected_action' };
    await route.fulfill({ status: data.ok ? 200 : 422, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/assist');
  await page.getByTestId('managed-job-url').fill('https://jobs.ashbyhq.com/synthetic/autofill');
  await page.getByTestId('button-managed-launch').click();
  await expect(page.getByText('Some fields verified — other fields need review')).toBeVisible();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Filled: first_name');
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Skipped: unknown_question');
  expect(actions.filter((value) => ['launch', 'fill', 'attach', 'prepare'].includes(value))).toEqual(['launch', 'fill']);
  assertNeverSubmitted(actions);
});

test('Launch does not autofill the login or posting page', async ({ page }) => {
  const actions: string[] = [];
  await page.route('**/__escapehatch/managed-assist/**', async (route) => {
    const action = route.request().url().split('/').at(-1) || '';
    actions.push(action);
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, state: action === 'launch' ? 'application_open_review_required' : 'idle' }) });
  });
  await page.goto('/assist');
  await page.getByTestId('managed-job-url').fill('https://jobs.ashbyhq.com/synthetic/login');
  await page.getByTestId('button-managed-launch').click();
  expect(actions.filter((value) => ['launch', 'fill', 'attach', 'prepare'].includes(value))).toEqual(['launch']);
  assertNeverSubmitted(actions);
});

function syntheticSnapshot(status: 'Ready to Apply' | 'Submitted') {
  const row = {
    sheetRow: 32, company: 'Thyme Care', role: 'Product Operations Lead',
    status, appliedCheckbox: status === 'Submitted', priority: 'High',
    applyUrl: 'https://jobs.ashbyhq.com/thyme-care/synthetic-position',
  };
  return {
    row,
    snapshot: {
      schema: 'escapehatch/tracker-snapshot/v1',
      provider: 'synthetic', spreadsheetId: 'synthetic', sheetName: 'Applications',
      capturedAtUtc: new Date().toISOString(), contentDigest: 'synthetic',
      authPath: 'fixture', localGoogleAuthPresent: false,
      metrics: {}, applications: [row],
    },
  };
}

test('one explicit Home click opens the verified Thyme Care job and fills approved fields exactly once', async ({ page }) => {
  const { row, snapshot } = syntheticSnapshot('Ready to Apply');
  const actions: string[] = [];
  const launches: Array<{ url: string; opportunityId: string }> = [];
  await page.route('**/__escapehatch/tracker/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ connection: 'CONNECTED', snapshot }) }));
  await page.route('**/__escapehatch/managed-assist/**', async (route) => {
    const action = route.request().url().split('/').at(-1) || '';
    actions.push(action);
    if (action === 'launch') launches.push(route.request().postDataJSON());
    const result = action === 'status' ? { ok: true, state: 'idle', browserOpen: false } :
      action === 'launch' ? { ok: true, state: 'application_form_open_review_required' } :
      action === 'fill' ? { ok: true, state: 'fields_partially_filled_review_required', filled: ['first_name'], skipped: ['unknown_question'] } :
      { ok: false, error: 'unexpected_action' };
    await route.fulfill({ status: result.ok ? 200 : 422, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.goto('/');
  await expect(page.getByTestId('home-next-company-role')).toContainText('Thyme Care');
  await expect(page.getByTestId('link-prepare-next')).toContainText('Launch & fill in managed Chrome');
  await page.getByTestId('link-prepare-next').click();
  await expect(page.getByTestId('managed-job-url')).toHaveValue(row.applyUrl);
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Filled: first_name');
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Skipped: unknown_question');
  expect(launches).toEqual([{ url: row.applyUrl, opportunityId: trackerOpportunityId(row), employerName: 'Thyme Care' }]);
  expect(actions.filter((action) => ['launch', 'fill', 'prepare', 'attach'].includes(action))).toEqual(['launch', 'fill']);
  assertNeverSubmitted(actions);
  await page.reload();
  await expect(page.getByTestId('managed-job-url')).toHaveValue(row.applyUrl);
  expect(launches).toHaveLength(1); // Reload and direct URLs do not carry new user consent.
});

test('one-click authorization fails closed when the employer was submitted after Home loaded', async ({ page }) => {
  const ready = syntheticSnapshot('Ready to Apply');
  const submitted = syntheticSnapshot('Submitted');
  let reads = 0;
  const actions: string[] = [];
  await page.route('**/__escapehatch/tracker/status', (route) => {
    reads += 1;
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ connection: 'CONNECTED', snapshot: reads === 1 ? ready.snapshot : submitted.snapshot }) });
  });
  await page.route('**/__escapehatch/managed-assist/**', (route) => {
    actions.push(route.request().url().split('/').at(-1) || '');
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, state: 'idle', browserOpen: false }) });
  });
  await page.goto('/');
  await expect(page.getByTestId('home-next-company-role')).toContainText('Thyme Care');
  await page.getByTestId('link-prepare-next').click();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Automatic launch paused');
  expect(actions).not.toContain('launch');
  expect(actions).not.toContain('fill');
  expect(actions).not.toContain('submit');
  expect(actions).not.toContain('next');
});

test('reusable role list and binary dropdowns persist through the preferences API', async ({ page }) => {
  let saved: Record<string, unknown> = { schema_version: 'escapehatch-application-question-preferences/v1', exported_at: new Date().toISOString(), preferences: {} };
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    if (action === 'preferences' && route.request().method() === 'POST') saved = route.request().postDataJSON().preferences;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(action === 'preferences' ? { ok: true, preferences: saved } : { ok: true, state: 'idle', browserOpen: true, recorded: [] }) });
  });
  await page.goto('/assist');
  await page.evaluate(() => localStorage.setItem('escape-hatch-applications', JSON.stringify([{ id: 'synthetic-title', company: 'Synthetic', role: 'Synthetic Role', url: 'https://example.com/apply', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() }])));
  await page.reload();
  await page.getByLabel('Saved opportunity').selectOption('synthetic-title');
  await page.getByRole('button', { name: 'Add selected role to my job titles: Synthetic Role', exact: true }).click();
  await expect(page.getByLabel('Target opportunity title', { exact: true })).toHaveValue('Synthetic Role');
  await expect(page.getByLabel('Salutation (Mr., Ms., Dr.)')).toHaveValue('');
  await page.getByLabel('have you ever served in the us armed forces', { exact: true }).selectOption('No');
  await page.getByLabel('Are you currently a US Citizen?', { exact: true }).selectOption('Yes');
  await page.getByLabel('gender', { exact: true }).selectOption('Male');
  await page.getByLabel('race / ethnicity', { exact: true }).selectOption('Hispanic or Latino');
  await page.getByRole('button', { name: 'Save Preferences', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Shared EscapeHatch profile saved' })).toBeVisible();
  expect(saved.job_titles).toEqual(['Synthetic Role']);
  expect((saved.preferences as Record<string, { value: string }>)['eeo.gender'].value).toBe('Male');
  expect((saved.preferences as Record<string, { value: string }>)['eeo.race_ethnicity'].value).toBe('Hispanic or Latino');
  await page.reload();
  await expect(page.getByLabel('Target opportunity title', { exact: true })).toHaveValue('Synthetic Role');
  await expect(page.getByLabel('have you ever served in the us armed forces', { exact: true })).toHaveValue('No');
  await page.getByLabel('Record my veteran/service answers from this managed application').check();
  await expect(page.getByRole('status').filter({ hasText: 'Listening for a recognized' })).toBeVisible();
  await page.getByLabel('Record my veteran/service answers from this managed application').uncheck();
});

test('career records and independent professional titles persist with opportunity-only posting', async ({ page }) => {
  let saved = { schema_version: 'escapehatch-application-question-preferences/v1', exported_at: new Date().toISOString(), preferences: {} };
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    if (action === 'preferences' && route.request().method() === 'POST') saved = route.request().postDataJSON().preferences;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(action === 'preferences' ? { ok: true, preferences: saved } : { ok: true, state: 'idle', browserOpen: false }) });
  });
  await page.goto('/assist');
  await page.evaluate(() => localStorage.setItem('escape-hatch-applications', JSON.stringify([{ id: 'career-role', company: 'Synthetic', role: 'Target Role', url: 'https://example.com/apply', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() }])));
  await page.reload();
  await page.getByLabel('Saved opportunity').selectOption('career-role');
  await expect(page.getByLabel('Selected professional title', { exact: true }).locator('option')).toHaveText(['Not answered']);
  await page.getByLabel('New professional title', { exact: true }).fill('Systems Operator');
  await page.getByRole('button', { name: 'Add professional title', exact: true }).click();
  await page.getByLabel('New professional title', { exact: true }).fill('Delivery Lead');
  await page.getByRole('button', { name: 'Add professional title', exact: true }).click();
  await page.getByLabel('Selected professional title', { exact: true }).selectOption('Systems Operator');
  await page.getByRole('button', { name: 'Save Preferences', exact: true }).click();
  await page.getByLabel('Work company', { exact: true }).fill('Synthetic Company');
  await page.getByLabel('Work title', { exact: true }).fill('Past Role');
  await page.getByLabel('Work responsibilities', { exact: true }).fill('Reviewed responsibilities');
  await page.getByRole('button', { name: 'Save reviewed work record' }).click();
  await page.getByLabel('Education institution', { exact: true }).fill('Synthetic University');
  await page.getByLabel('Education credential', { exact: true }).fill('Bachelor of Science');
  await page.getByRole('button', { name: 'Save reviewed education record' }).click();
  await page.getByLabel('Employer job description', { exact: true }).fill('Employer requirements, not my history');
  await page.getByRole('button', { name: 'Save employer posting' }).click();
  await page.getByLabel('Employer job description', { exact: true }).fill('Systems engineering for the target role');
  await page.getByRole('button', { name: 'Save employer posting' }).click();
  const choice = page.getByRole('button', { name: 'Choose professional title: Systems Operator', exact: true });
  await page.getByLabel('Selected professional title', { exact: true }).selectOption('Delivery Lead');
  await expect(choice).toHaveAttribute('aria-pressed', 'false');
  await choice.click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Selected professional title', { exact: true })).toHaveValue('Systems Operator');
  await page.getByRole('button', { name: 'Save Preferences', exact: true }).click();
  await page.getByText('How suggestions work', { exact: true }).click();
  await expect(page.getByText('Matching evidence is read-only.', { exact: false })).toBeVisible();
  await page.getByLabel('Employer job description', { exact: true }).fill('Employer requirements, not my history');
  await page.getByRole('button', { name: 'Save employer posting' }).click();
  await page.reload();
  await page.getByLabel('Saved opportunity').selectOption('career-role');
  await expect(page.getByLabel('Selected professional title', { exact: true })).toHaveValue('Systems Operator');
  await expect(page.getByLabel('Selected professional title', { exact: true }).locator('option')).toHaveText(['Not answered', 'Systems Operator', 'Delivery Lead']);
  await expect(page.getByLabel('Work responsibilities', { exact: true })).toHaveValue('Reviewed responsibilities');
  await expect(page.getByLabel('Education institution', { exact: true })).toHaveValue('Synthetic University');
  await expect(page.getByLabel('Employer job description', { exact: true })).toHaveValue('Employer requirements, not my history');
});

async function mockDocuments(page: import('@playwright/test').Page) {
  const packages = new Map<string, { opportunityId: string; url: string; documents: Record<string, { name: string; sha256: string; size: number; reviewedAt?: string }> }>();
  let requireReview = true;
  await page.route('**/__escapehatch/managed-assist/documents/**', async route => {
    const url = new URL(route.request().url()), action = url.pathname.split('/').at(-1);
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : Object.fromEntries(url.searchParams);
    const key = JSON.stringify([body.opportunityId, body.url]);
    const value = packages.get(key) || { opportunityId: body.opportunityId, url: body.url, documents: {} };
    if (action === 'stage') { const bytes = Buffer.from(body.file.base64, 'base64'); value.documents[body.kind] = { name: body.file.name, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length }; }
    if (action === 'review') value.documents[body.kind].reviewedAt = new Date().toISOString();
    if (action === 'policy') requireReview = body.requireReview;
    packages.set(key, value);
    if (action === 'file') return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\nsynthetic' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, package: value, requireReview }) });
  });
}

test('Prepare stays available without a résumé or when a cover draft has not been reviewed', async ({ page }) => {
  const job = { id: 'no-attachment-role', company: 'Synthetic', role: 'No-upload role',
    url: 'https://jobs.example.com/roles/no-attachment', status: 'saved',
    priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() };
  const actions: string[] = [];
  let launched = false;
  await page.addInitScript((application) => {
    localStorage.setItem('escape-hatch-applications', JSON.stringify([application]));
  }, job);
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1) || '';
    if (route.request().method() === 'POST') actions.push(action);
    if (action === 'launch') launched = true;
    const response = action === 'status' ? { ok: true, state: 'idle', browserOpen: launched } :
      action === 'launch' ? { ok: true, state: 'application_open_review_required' } :
      action === 'prepare' ? { ok: true, state: 'REVIEW_REQUIRED',
        preparation: { state: 'REVIEW_REQUIRED', code: 'trusted_navigation_evidence_missing',
          pagesPrepared: 1, intermediateSteps: 0, finalActionActivated: false,
          evidenceRefs: [], pendingManual: ['trusted_navigation_evidence_unavailable'] } } :
      { ok: true, state: 'idle' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await mockDocuments(page);
  await page.goto('/assist?opportunityId=' + job.id);
  await page.getByTestId('button-managed-launch').click();
  await expect(page.getByTestId('button-managed-prepare')).toBeEnabled();
  await expect(page.getByTestId('button-managed-attach')).toBeDisabled();

  await page.getByLabel('Choose cover PDF', { exact: true }).setInputFiles({
    name: 'unreviewed-cover.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nprivate draft'),
  });
  await expect(page.getByText('unreviewed-cover.pdf', { exact: true })).toBeVisible();
  await expect(page.getByTestId('button-managed-prepare')).toBeEnabled();
  await page.getByTestId('button-managed-prepare').click();
  await expect(page.getByTestId('managed-preparation-state')).toHaveAttribute('data-preparation-state', 'REVIEW_REQUIRED');
  expect(actions).toContain('prepare');
  expect(actions).not.toContain('submit');
});

test('document review binds both files, persists, invalidates replacements, and review-off automatically requests safe preparation', async ({ page }) => {
  const actions: string[] = [];
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1) || '';
    if (route.request().method() === 'POST') actions.push(action);
    const response = action === 'status' ? { ok: true, browserOpen: true, state: 'application_open_review_required' } :
      action === 'prepare' ? { ok: true, state: 'BLOCKED', preparation: { state: 'BLOCKED', code: 'trusted_adapter_registry_required', pagesPrepared: 0, intermediateSteps: 0, finalActionActivated: false, evidenceRefs: [], pendingManual: [] } } : { ok: true, state: 'idle' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await mockDocuments(page);
  await page.goto('/assist');
  await page.evaluate(() => localStorage.setItem('escape-hatch-applications', JSON.stringify([{ id: 'review-opportunity', company: 'Synthetic', role: 'Role', url: 'https://jobs.example.test/apply', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() }])));
  await page.goto('/assist?opportunityId=review-opportunity');
  await expect(page.getByRole('checkbox', { name: 'Require my review before document upload' })).toBeChecked();
  await page.getByLabel('Choose résumé PDF', { exact: true }).setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nresume') });
  await page.getByLabel('Choose cover PDF', { exact: true }).setInputFiles({ name: 'cover.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\ncover') });
  await expect(page.getByTestId('button-managed-attach')).toBeDisabled();
  await page.getByRole('button', { name: 'Preview résumé', exact: true }).click();
  await expect(page.getByTitle('Selected document preview')).toBeVisible();
  await page.getByRole('button', { name: 'I reviewed this résumé', exact: true }).click();
  await expect(page.getByTestId('button-managed-attach')).toBeDisabled();
  await page.getByRole('button', { name: 'I reviewed this cover letter', exact: true }).click();
  await expect(page.getByTestId('button-managed-attach')).toBeEnabled();
  await page.reload();
  await expect(page.getByTestId('button-managed-attach')).toBeEnabled();
  await page.getByLabel('Choose résumé PDF', { exact: true }).setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nchanged') });
  await expect(page.getByTestId('button-managed-attach')).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Require my review before document upload' }).uncheck();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('trusted_adapter_registry_required');
  expect(actions).toContain('prepare');
  expect(actions).not.toContain('submit');
  await expect(page.getByText('Not confirmed reviewed', { exact: false })).toBeVisible();
});


test('one Launch reuses previously reviewed exact PDFs and stops at review when navigation is untrusted', async ({ page }) => {
  const actions: string[] = [];
  const jobUrl = 'https://jobs.example.test/apply/reviewed';
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1) || '';
    if (route.request().method() === 'POST') actions.push(action);
    const body = action === 'status'
      ? { ok: true, state: 'idle', browserOpen: false }
      : action === 'launch'
      ? { ok: true, state: 'application_form_open_review_required' }
      : action === 'fill'
      ? { ok: true, state: 'fields_filled_review_required', filled: ['name'], skipped: [] }
      : action === 'prepare'
      ? { ok: true, state: 'REVIEW_REQUIRED', preparation: {
          state: 'REVIEW_REQUIRED', code: 'trusted_navigation_evidence_missing',
          pagesPrepared: 1, intermediateSteps: 0, finalActionActivated: false,
          evidenceRefs: [], pendingManual: ['trusted_navigation_evidence_unavailable'],
        }, filled: ['name'], attachments: { resume: 'attached_to_input_review_required' } }
      : { ok: true, state: 'idle' };
    if (action === 'prepare') {
      const posted = route.request().postDataJSON();
      expect(posted.adapterRegistry).toBeNull();
      expect(posted.opportunityId).toBe('synthetic-reviewed');
      expect(posted.employerName).toBe('Synthetic Employer');
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await mockDocuments(page);
  await page.goto('/assist');
  await page.evaluate(url => localStorage.setItem('escape-hatch-applications', JSON.stringify([{
    id: 'synthetic-reviewed', company: 'Synthetic Employer', role: 'Role', url,
    status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString(),
  }])), jobUrl);
  await page.goto('/assist?opportunityId=synthetic-reviewed');
  await page.getByLabel('Choose résumé PDF', { exact: true }).setInputFiles({
    name: 'synthetic-reviewed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\\nfixture'),
  });
  await page.getByRole('button', { name: 'I reviewed this résumé', exact: true }).click();
  await expect(page.getByText(/You confirmed review on/)).toBeVisible();
  await page.getByTestId('button-managed-launch').click();
  await expect.poll(() => actions.filter(name => ['launch', 'fill', 'prepare'].includes(name))).toEqual(['launch', 'fill', 'prepare']);
  await expect(page.getByTestId('managed-preparation-state')).toHaveAttribute('data-preparation-state', 'REVIEW_REQUIRED');
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Final submission remains operator-only');
  expect(actions).not.toContain('submit');
  expect(actions).not.toContain('next');
});


test('email-first login resumes only the previously authorized fill in the same managed session', async ({ page }) => {
  const actions: string[] = [];
  let launched = false;
  let polls = 0;
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1) || '';
    actions.push(action);
    if (action === 'launch') launched = true;
    if (action === 'status' && launched) polls += 1;
    const phase = !launched || polls < 2 ? 'AUTH_HANDOFF' : 'APPLICATION_FORM_READY';
    const data = action === 'launch'
      ? { ok: true, state: 'application_open_review_required', browserOpen: true,
          authCheckpoint: { phase: 'AUTH_HANDOFF', canResume: false, stableReads: 0, reason: 'Sign in using Chrome.' } }
      : action === 'status'
        ? { ok: true, state: launched ? 'application_open_review_required' : 'idle', browserOpen: launched,
            needsOpportunityConfirmation: false,
            authCheckpoint: { phase, canResume: phase === 'APPLICATION_FORM_READY', stableReads: polls,
              reason: 'Employer form observed.' } }
        : action === 'resume'
          ? { ok: true, state: 'fields_filled_review_required', filled: ['identity.email'], skipped: [] }
          : { ok: true, state: 'idle', filled: [], skipped: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await mockDocuments(page);
  await page.goto('/assist');
  await page.getByTestId('managed-job-url').fill('https://jobs.example.com/apply/synthetic');
  await page.getByTestId('button-managed-launch').click();
  await expect.poll(() => actions.filter(a => a === 'resume').length, { timeout: 15000 }).toBe(1);
  expect(actions).not.toContain('submit');
  expect(actions).not.toContain('next');
  expect(actions.filter(a => a === 'launch')).toHaveLength(1);
});

test('changed post-login path requires a visible same-opportunity confirmation', async ({ page }) => {
  const actions: string[] = [];
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1) || '';
    actions.push(action);
    const payload = action === 'status'
      ? { ok: true, browserOpen: true, state: 'application_open_review_required',
          needsOpportunityConfirmation: true,
          currentPage: { opportunityId: 'synthetic-confirm', applicationUrl: 'https://jobs.example.com/job/123',
            pageUrl: 'https://jobs.example.com/application/123' },
          authCheckpoint: { phase: 'APPLICATION_FORM_READY', canResume: true, stableReads: 2, reason: 'Form ready' } }
      : { ok: true, state: action === 'resume' ? 'fields_filled_review_required' : 'application_open_review_required',
          filled: ['identity.email'], skipped: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await mockDocuments(page);
  await page.goto('/assist');
  await page.evaluate(() => localStorage.setItem('escape-hatch-applications', JSON.stringify([{
    id: 'synthetic-confirm', company: 'Synthetic', role: 'Synthetic role',
    url: 'https://jobs.example.com/job/123', status: 'saved', priority: 'normal',
    notes: '', nextAction: '', updatedAt: new Date().toISOString(),
  }])));
  await page.reload();
  const emailInput = page.getByTestId('coach-approved-email');
  if (await emailInput.isVisible()) {
    await emailInput.fill('candidate@example.test');
    await page.getByRole('button', { name: 'Save email to profile' }).click();
  }
  await page.getByLabel('Saved opportunity').selectOption('synthetic-confirm');
  await page.getByTestId('button-auth-resume').click();
  await expect.poll(() => actions.filter(a => a === 'bind').length).toBe(1);
  await expect.poll(() => actions.filter(a => a === 'resume').length).toBe(1);
  expect(actions).not.toContain('submit');
  expect(actions).not.toContain('next');
});


test('reloading EscapeHatch restores the existing bound opportunity without relaunch or automatic fill', async ({ page }) => {
  const actions: string[] = [];
  const original = { id: 'existing-session', company: 'Synthetic', role: 'Original role', url: 'https://jobs.example.com/job/original', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() };
  await page.addInitScript(({ original }) => {
    localStorage.setItem('escape-hatch-applications', JSON.stringify([original, { ...original, id: 'other-job', url: 'https://jobs.example.com/job/other' }]));
  }, { original });
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1) || '';
    actions.push(action);
    const result = action === 'status' ? { ok: true, browserOpen: true, state: 'application_open_review_required',
      currentPage: { opportunityId: original.id, applicationUrl: original.url, pageUrl: original.url },
      authCheckpoint: { phase: 'APPLICATION_FORM_READY', canResume: true, stableReads: 2, reason: 'Form read back' } }
      : { ok: true, state: 'fields_filled_review_required', filled: ['identity.email'], skipped: [] };
    await route.fulfill({ json: result });
  });
  await mockDocuments(page);
  await page.goto('/assist');
  await expect(page.getByLabel('Saved opportunity')).toHaveValue(original.id);
  await expect(page.getByTestId('managed-job-url')).toHaveValue(original.url);
  await page.reload();
  await expect(page.getByLabel('Saved opportunity')).toHaveValue(original.id);
  await expect(page.getByTestId('managed-job-url')).toHaveValue(original.url);
  expect(actions.filter(action => ['launch', 'fill', 'resume'].includes(action))).toEqual([]);
  const emailInput = page.getByTestId('coach-approved-email');
  if (await emailInput.isVisible()) {
    await emailInput.fill('candidate@example.test');
    await page.getByRole('button', { name: 'Save email to profile' }).click();
  }
  await page.getByLabel('Saved opportunity').selectOption('other-job');
  await page.getByTestId('button-auth-resume').click();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Select the original opportunity bound');
  await page.getByTestId('button-managed-fill').click();
  await expect(page.getByTestId('managed-browser-feedback')).toContainText('Select the original opportunity bound');
  expect(actions.filter(action => ['launch', 'fill', 'resume'].includes(action))).toEqual([]);
});


test('stale pending binding is preserved for review instead of selecting another ready job', async ({ page }) => {
  await page.addInitScript(() => {
    const base = { company: 'Synthetic', role: 'Role', priority: 'normal', nextAction: '', updatedAt: '2026-10-26T12:00:00Z' };
    localStorage.setItem('escape-hatch-journey-resume', JSON.stringify({ opportunityId: 'old-job', applicationUrl: 'https://jobs.example.com/job/old' }));
    localStorage.setItem('escape-hatch-applications', JSON.stringify([
      { ...base, id: 'old-job', url: 'https://jobs.example.com/job/old', status: 'closed', notes: '' },
      { ...base, id: 'tracker-other', url: 'https://jobs.example.com/job/other', status: 'saved', notes: 'provider status: Ready to Apply; Applied? unchecked' },
    ]));
  });
  await page.goto('/assist');
  await expect(page.getByTestId('managed-job-url')).toHaveValue('');
  await expect(page.getByLabel('Saved opportunity')).toHaveValue('');
  await expect(page.getByRole('alert').filter({ hasText: 'saved pending application changed' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-journey-resume')!).opportunityId)).toBe('old-job');
});
