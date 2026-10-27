import { expect, test, type Locator } from '@playwright/test';
import { inspectApplicationRequirements } from '../application-requirements';
import { SOURCE_BINDINGS_KEY } from '../src/lib/source-bridge';

async function drop(target: Locator, name: string, content: string, count = 1) {
  await target.evaluate((element, { name, content, count }) => {
    const dataTransfer = new DataTransfer();
    for (let i = 0; i < count; i++) dataTransfer.items.add(new File([content], name, { type: name.endsWith('.pdf') ? 'application/pdf' : 'text/plain' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, { name, content, count });
}

test('independent document reads preserve both slots and serialize private staging', async ({ page }) => {
  const job = { id: 'independent-documents', company: 'Synthetic Documents', role: 'Engineer', url: 'https://example.invalid/job/documents', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() };
  const pkg: { opportunityId: string; url: string; documents: Record<string, { name: string; sha256: string; size: number }> } = { opportunityId: job.id, url: job.url, documents: {} };
  const staged: string[] = [];
  let activeStages = 0, maxActiveStages = 0;
  let releaseCover!: () => void;
  const coverGate = new Promise<void>(resolve => { releaseCover = resolve; });
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const endpoint = new URL(route.request().url());
    if (!endpoint.pathname.includes('/documents/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, state: 'idle', browserOpen: false }) });
    if (endpoint.pathname.endsWith('/stage')) {
      const body = route.request().postDataJSON();
      staged.push(body.kind); activeStages += 1; maxActiveStages = Math.max(maxActiveStages, activeStages);
      if (body.kind === 'cover') await coverGate;
      pkg.documents[body.kind] = { name: body.file.name, sha256: body.file.base64, size: 20 };
      activeStages -= 1;
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, package: pkg, requireReview: true }) });
  });
  try {
    await page.goto('/');
    await page.evaluate(job => localStorage.setItem('escape-hatch-applications', JSON.stringify([job])), job);
    await page.goto('/assist?opportunityId=' + job.id);
    const documents = page.getByRole('region', { name: 'Opportunity document review', exact: true });
    await expect(documents.getByLabel('Choose résumé PDF', { exact: true })).toBeEnabled();
    await page.evaluate(() => {
      const original = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        if (this.name !== 'slow-resume.pdf') return original.call(this);
        return new Promise(resolve => {
          (window as unknown as { releaseResume: () => Promise<void> }).releaseResume = async () => {
            File.prototype.arrayBuffer = original;
            resolve(await original.call(this));
          };
        });
      };
    });
    await drop(documents.locator('.artifact-dropzone').first(), 'slow-resume.pdf', '%PDF-1.4\nsynthetic resume');
    await drop(documents.locator('.artifact-dropzone').last(), 'cover.pdf', '%PDF-1.4\nsynthetic cover');
    await expect.poll(() => staged).toEqual(['cover']);
    await page.evaluate(() => (window as unknown as { releaseResume: () => Promise<void> }).releaseResume());
    // The resume read is complete while cover staging is held. It must queue,
    // rather than disappear or race the server's single-action gate.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(staged).toEqual(['cover']);
    releaseCover();
    await expect(documents).toContainText('cover.pdf');
    await expect(documents).toContainText('slow-resume.pdf');
    expect(staged).toEqual(['cover', 'resume']);
    expect(maxActiveStages).toBe(1);
    await expect(documents.getByText('Not confirmed reviewed', { exact: false })).toHaveCount(2);
  } finally { releaseCover(); }
});

test('review-off preparation waits for every selected document read to finish', async ({ page }) => {
  const job = { id: 'review-off-order', company: 'Synthetic Review', role: 'Engineer', url: 'https://example.invalid/job/review', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() };
  const documents: Record<string, { name: string; sha256: string; size: number }> = { resume: { name: 'previous.pdf', sha256: 'previous', size: 20 } };
  const actions: string[] = [];
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const path = new URL(route.request().url()).pathname, action = path.split('/').at(-1)!;
    let result: object = { ok: true, state: 'idle', browserOpen: true };
    if (path.includes('/documents/')) {
      if (action === 'stage') { const body = route.request().postDataJSON(); actions.push('stage-' + body.kind); documents[body.kind] = { name: body.file.name, sha256: body.file.base64, size: 20 }; }
      result = { ok: true, package: { opportunityId: job.id, url: job.url, documents }, requireReview: false };
    }
    if (action === 'prepare') { actions.push('prepare'); result = { ok: true, state: 'REVIEW_REQUIRED' }; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.goto('/');
  await page.evaluate(job => localStorage.setItem('escape-hatch-applications', JSON.stringify([job])), job);
  await page.goto('/assist?opportunityId=' + job.id);
  await expect(page.getByTestId('button-managed-prepare')).toBeEnabled();
  const panel = page.getByRole('region', { name: 'Opportunity document review', exact: true });
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      if (this.name !== 'replacement-slow.pdf') return original.call(this);
      return new Promise(resolve => { (window as unknown as { finishReplacement: () => Promise<void> }).finishReplacement = async () => { File.prototype.arrayBuffer = original; resolve(await original.call(this)); }; });
    };
  });
  await drop(panel.locator('.artifact-dropzone').first(), 'replacement-slow.pdf', '%PDF-1.4\nreplacement');
  await drop(panel.locator('.artifact-dropzone').last(), 'independent-cover.pdf', '%PDF-1.4\ncover');
  await expect(panel).toContainText('independent-cover.pdf');
  await expect(page.getByTestId('button-managed-prepare')).toBeDisabled();
  await expect(page.getByTestId('button-managed-launch')).toBeDisabled();
  await expect(page.getByTestId('button-managed-fill')).toBeDisabled();
  await expect(panel.getByLabel('Require my review before document upload')).toBeDisabled();
  expect(actions).toEqual(['stage-cover']);
  await page.evaluate(() => (window as unknown as { finishReplacement: () => Promise<void> }).finishReplacement());
  await expect(panel).toContainText('replacement-slow.pdf');
  await expect.poll(() => actions).toEqual(['stage-cover', 'stage-resume', 'prepare']);
  await expect(page.getByTestId('button-managed-prepare')).toBeEnabled();
  await drop(panel.locator('.artifact-dropzone').first(), 'invalid.txt', 'invalid replacement');
  await expect(panel.getByRole('status').filter({ hasText: 'Choose a PDF' })).toBeVisible();
  await drop(panel.locator('.artifact-dropzone').last(), 'new-cover.pdf', '%PDF-1.4\nnew cover');
  await expect(panel).toContainText('new-cover.pdf');
  await expect(page.getByTestId('button-managed-prepare')).toBeDisabled();
  expect(actions).toEqual(['stage-cover', 'stage-resume', 'prepare', 'stage-cover']);
});

test('automatic form inspection waits for launch preparation to finish', async ({ page }) => {
  const job = { id: 'prepare-before-inspect', company: 'Synthetic Preparation', role: 'Engineer', url: 'https://example.invalid/job/prepare', status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() };
  const events: string[] = [];
  let launched = false, releasePrepare!: () => void;
  const prepareGate = new Promise<void>(resolve => { releasePrepare = resolve; });
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const path = new URL(route.request().url()).pathname, action = path.split('/').at(-1)!;
    let result: object = { ok: true, state: 'idle', browserOpen: launched };
    if (path.includes('/documents/')) result = { ok: true, package: { opportunityId: job.id, url: job.url, documents: { resume: { name: 'reviewed.pdf', sha256: 'reviewed', size: 20, reviewedAt: new Date().toISOString() } } }, requireReview: true };
    if (action === 'launch') { launched = true; result = { ok: true, state: 'application_form_open_review_required' }; }
    if (action === 'prepare') { events.push('prepare-start'); await prepareGate; events.push('prepare-end'); }
    if (action === 'requirements') { events.push('inspect'); result = { ok: true, inspection: { opportunityId: job.id, applicationUrl: job.url, pageUrl: job.url, capturedAt: new Date().toISOString(), scope: 'current_page_only', requirements: [] } }; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  try {
    await page.goto('/');
    await page.evaluate(job => localStorage.setItem('escape-hatch-applications', JSON.stringify([job])), job);
    await page.goto('/assist?opportunityId=' + job.id);
    await expect(page.getByText(/You confirmed review on/)).toBeVisible();
    await page.getByTestId('button-managed-launch').click();
    await expect.poll(() => events).toContain('prepare-start');
    expect(events).not.toContain('inspect');
    releasePrepare();
    await expect.poll(() => events).toEqual(['prepare-start', 'prepare-end', 'inspect']);
  } finally { releasePrepare(); }
});

test('first launch guides source-first drag, explicit review, and persistence without a job', async ({ page }, testInfo) => {
  await page.goto('/');
  const guide = page.getByRole('region', { name: 'Start here' });
  await expect(guide.getByRole('heading', { name: 'Start with what you already have.' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('guided-start-desktop.png') });
  await guide.getByRole('link', { name: 'Start this step' }).click();
  const target = page.locator('.artifact-dropzone').first();
  await drop(target, 'synthetic.txt', 'Synthetic Candidate\nsynthetic@example.invalid\nSummary\nBuilds deterministic tools.', 2);
  await expect(target).toContainText('one file at a time');
  await drop(target, 'synthetic.txt', 'Synthetic Candidate\nsynthetic@example.invalid\nSummary\nBuilds deterministic tools.');
  await expect(page.getByRole('heading', { name: 'Review synthetic.txt' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-profile') || '{}').email || '')).toBe('');
  await page.locator('label').filter({ hasText: 'contact / email' }).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Approve selected claims' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Choose an opportunity next' })).toBeVisible();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-profile')!).email)).toBe('synthetic@example.invalid');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), SOURCE_BINDINGS_KEY)).toEqual([]);
  await page.getByRole('button', { name: 'Choose file', exact: true }).focus();
  await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeFocused();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file', exact: true }).press('Enter');
  await (await chooser).setFiles({ name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.from(' ') });
  await expect(page.getByRole('status').filter({ hasText: 'could not be read' })).toBeVisible();
});

test('real DOM inspection distinguishes form inputs and performs no writes or navigation', async ({ page, baseURL }) => {
  await page.goto('/');
  await page.setContent(`<form><label>Résumé<input type="file" required></label><label>Cover letter<input type="file"></label><label>Email<input type="email" required value="synthetic@example.invalid"></label><label>Agree to terms<input type="checkbox" required></label><div role="combobox" aria-label="Unfamiliar eligibility"></div><input type="hidden" name="secret" value="private"><input type="password" value="private"><input disabled required><button>Submit</button></form>`);
  const before = await page.content();
  const result = await inspectApplicationRequirements(page, 'synthetic', page.url());
  expect(result.scope).toBe('current_page_only');
  expect(result.requirements.map(item => [item.kind, item.requirement, item.populated])).toEqual([
    ['resume', 'required', false], ['cover', 'optional', false], ['question', 'required', true], ['question', 'required', false], ['question', 'unknown', false],
  ]);
  expect(JSON.stringify(result)).not.toContain('synthetic@example.invalid');
  expect(await page.content()).toBe(before);
  expect(page.url()).toBe(baseURL + '/');
  await page.setContent('<form><label>Yes<input name="eligibility" type="radio" required checked></label><label>No<input name="eligibility" type="radio" required></label></form>');
  const radio = await inspectApplicationRequirements(page, 'synthetic', page.url());
  expect(radio.requirements.every(item => item.populated)).toBe(true);
  await page.setContent('<form><div style="display:none"><label>Future résumé<input type="file" required></label></div><label>Current résumé<input style="display:none" type="file" required></label></form>');
  const uploads = await inspectApplicationRequirements(page, 'synthetic', page.url());
  expect(uploads.requirements.map(item => item.label)).toEqual(['Current résumé']);
});

test('puzzle scopes artifacts without launching and refreshes after explicit form actions', async ({ page }, testInfo) => {
  const actions: string[] = [];
  let launched = true, currentJob = 'one', livePath = '/apply';
  const jobs = ['one', 'two'].map(id => ({ id, company: `Synthetic ${id}`, role: 'Engineer', url: `https://example.invalid/jobs/${id}`, status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: new Date().toISOString() }));
  const packages = new Map<string, { opportunityId: string; url: string; documents: Record<string, { name: string; sha256: string; size: number; reviewedAt?: string }> }>();
  await page.route('**/__escapehatch/managed-assist/**', async route => {
    const request = route.request(), endpoint = new URL(request.url()), action = endpoint.pathname.split('/').at(-1)!;
    actions.push(action);
    const body = request.method() === 'POST' ? request.postDataJSON() : Object.fromEntries(endpoint.searchParams);
    if (action === 'launch') { launched = true; currentJob = body.opportunityId; }
    const currentUrl = jobs.find(job => job.id === currentJob)!.url;
    let result: object = { ok: true, state: 'idle', browserOpen: launched, currentPage: { opportunityId: currentJob, applicationUrl: currentUrl, pageUrl: currentUrl + livePath } };
    if (endpoint.pathname.includes('/documents/')) {
      const key = body.opportunityId + body.url;
      const pkg = packages.get(key) || { opportunityId: body.opportunityId, url: body.url, documents: {} };
      if (action === 'stage') pkg.documents[body.kind] = { name: body.file.name, sha256: body.file.base64, size: 20 };
      if (action === 'review') pkg.documents[body.kind].reviewedAt = new Date().toISOString();
      packages.set(key, pkg); result = { ok: true, package: pkg, requireReview: true };
    }
    if (action === 'requirements') result = { ok: true, inspection: { opportunityId: body.opportunityId, applicationUrl: body.url, pageUrl: body.url + livePath, capturedAt: new Date().toISOString(), scope: 'current_page_only', requirements: livePath === '/later' ? [{ id: 'later', label: 'Later-page question', kind: 'question', requirement: 'required', populated: false }] : [
      { id: 'resume', label: 'Role résumé', kind: 'resume', requirement: 'required', populated: false },
      { id: 'fit', label: 'Why this employer?', kind: 'question', requirement: 'required', populated: actions.includes('fill') },
    ] } };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.goto('/');
  await page.evaluate(jobs => localStorage.setItem('escape-hatch-applications', JSON.stringify(jobs)), jobs);
  await page.goto('/assist?opportunityId=one');
  const puzzle = page.getByRole('region', { name: 'Application puzzle', exact: true });
  await expect(puzzle).toContainText('Assemble Synthetic one');
  await puzzle.getByRole('button', { name: 'Inspect current form' }).click();
  await expect(puzzle).toContainText('Why this employer?');
  await expect(puzzle).toContainText('2 required inputs');
  livePath = '/later';
  await expect(puzzle).not.toContainText('Why this employer?');
  await puzzle.getByRole('button', { name: 'Inspect current form' }).click();
  await expect(puzzle).toContainText('Later-page question');
  livePath = '/apply';
  await expect(puzzle).not.toContainText('Later-page question');
  await puzzle.getByRole('button', { name: 'Inspect current form' }).click();
  await expect(puzzle).toContainText('Why this employer?');
  const target = puzzle.locator('.artifact-dropzone').first();
  await drop(target, 'wrong.txt', 'not a PDF');
  await expect(puzzle.getByRole('status').filter({ hasText: 'Choose a PDF' })).toBeVisible();
  await drop(target, 'role.pdf', '%PDF-1.4\nsynthetic');
  await expect(puzzle).toContainText('Not confirmed reviewed');
  await puzzle.getByRole('button', { name: 'I reviewed this résumé', exact: true }).click();
  await expect(puzzle).toContainText('You confirmed review');
  await drop(target, 'replacement.pdf', '%PDF-1.4\nchanged');
  await expect(puzzle).toContainText('Not confirmed reviewed');
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      if (this.name !== 'slow.pdf') return original.call(this);
      return new Promise(resolve => { (window as unknown as { releaseSlow: () => void }).releaseSlow = () => { File.prototype.arrayBuffer = original; void original.call(this).then(resolve); }; });
    };
  });
  await drop(target, 'slow.pdf', '%PDF-1.4\nolder');
  await drop(target, 'newest.pdf', '%PDF-1.4\nnewest');
  await expect(puzzle).toContainText('newest.pdf');
  await page.evaluate(() => (window as unknown as { releaseSlow: () => void }).releaseSlow());
  await expect.poll(() => packages.get('one' + jobs[0].url)?.documents.resume.name).toBe('newest.pdf');
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await expect(puzzle).toBeVisible();
  await puzzle.screenshot({ path: testInfo.outputPath('application-puzzle-mobile-dark.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('Saved opportunity').selectOption('two');
  await expect(puzzle).toContainText('Assemble Synthetic two');
  await expect(puzzle).not.toContainText('Why this employer?');
  await expect(puzzle).not.toContainText('newest.pdf');
  expect(actions.filter(action => ['launch', 'fill', 'prepare', 'attach', 'submit'].includes(action))).toEqual([]);
  await page.getByTestId('button-managed-launch').click();
  await expect(puzzle).toContainText('Why this employer?');
  await page.getByTestId('button-managed-fill').click();
  await expect(puzzle).toContainText('1 still empty or invalid');
  expect(actions).not.toContain('submit');
});
