import { expect, test } from '@playwright/test';

test('recorded Indeed outcome survives listener outage and offers a distinct direct posting', async ({ page }) => {
  const job = { id: 'synthetic-completed', company: 'Example Company', role: 'Engineer',
    url: 'https://www.indeed.com/viewjob?jk=0123456789abcdef&from=search', status: 'applied',
    priority: 'normal', notes: '', nextAction: '', updatedAt: '2026-10-28T08:00:00Z' };
  const alias = { ...job, id: 'duplicate', status: 'saved', url: 'https://indeed.com/viewjob?jk=0123456789abcdef' };
  const next = { ...job, id: 'next', company: 'Next Company', status: 'saved',
    url: 'https://www.indeed.com/viewjob?jk=1111111111111111&from=search' };
  let interrupted = false;
  let failedPolls = 0;
  const mutations: string[] = [];
  await page.route('**/__escapehatch/tracker/**', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ ok: true, connection: 'NOT_CONNECTED', localGoogleAuthPresent: false, snapshot: null }) }));
  await page.route('**/__escapehatch/managed-assist/**', route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1)!;
    if (route.request().method() !== 'GET' && action !== 'requirements') mutations.push(action);
    if (action === 'status' && interrupted) { failedPolls++; return route.abort('connectionclosed'); }
    const body = action === 'status' ? { ok: true, state: 'submission_tracking_armed_existing_tab', browserOpen: true,
      currentPage: { opportunityId: job.id, applicationUrl: job.url, pageUrl: job.url },
      listeners: { recordingAnswers: false, savedAnswers: 0, opportunityId: job.id, error: '', submission: { state: 'PENDING', reason: 'Synthetic observation', receipt: null }, receipts: [] } }
      : action === 'preferences' ? { ok: true, preferences: { schema_version: 'escapehatch-application-question-preferences/v1', exported_at: new Date().toISOString(), preferences: {} } }
        : { ok: true, requireReview: true, package: { opportunityId: job.id, url: job.url, documents: {} } };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/');
  await page.evaluate(saved => localStorage.setItem('escape-hatch-applications', JSON.stringify(saved)), [job, alias, next]);
  await page.goto('/assist');
  const outcome = page.getByTestId('application-outcome');
  await expect(outcome).toBeVisible();
  interrupted = true;
  await expect.poll(() => failedPolls).toBeGreaterThan(0);
  await expect(outcome).toBeVisible();
  await expect(outcome).toContainText('Applied');
  await expect(page.getByTestId('next-indeed-posting')).toHaveAttribute('href', 'https://www.indeed.com/viewjob?jk=1111111111111111');
  await expect(page.getByTestId('next-indeed-posting')).toContainText('Next Company');
  expect(mutations).toEqual([]);
});

test('remote-only outcome dispatches the exact eligible job through managed launch rather than a new unmanaged tab', async ({ page }) => {
  const done = { id: 'done', company: 'Synthetic completed', role: 'Engineer', url: 'https://www.indeed.com/viewjob?jk=0123456789abcdef',
    status: 'applied', priority: 'normal', notes: '', nextAction: '', updatedAt: '2026-01-01T00:00:00Z' };
  const onsite = { ...done, id: 'onsite', company: 'Synthetic onsite', status: 'saved',
    url: 'https://www.indeed.com/viewjob?jk=2222222222222222', workMode: 'Remote', jobDescription: 'Work Location: In person' };
  const remote = { ...done, id: 'remote', company: 'Synthetic remote', status: 'saved',
    url: 'https://www.indeed.com/viewjob?jk=1111111111111111&from=search', workMode: 'Remote' };
  const launches: unknown[] = [];
  let active = done;
  await page.route('**/__escapehatch/tracker/**', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ ok: true, connection: 'NOT_CONNECTED', localGoogleAuthPresent: false, snapshot: null }) }));
  await page.route('**/__escapehatch/managed-assist/**', route => {
    const request = route.request();
    const url = new URL(request.url());
    const action = url.pathname.split('/').at(-1);
    if (action === 'launch') {
      launches.push(request.postDataJSON());
      active = remote;
      return route.fulfill({ json: { ok: true, state: 'application_open_review_required' } });
    }
    const body = action === 'preferences' ? { ok: true, preferences: { schema_version: 'escapehatch-application-question-preferences/v1',
      exported_at: '2026-01-01T00:00:00Z', preferences: {}, recommendation_work_mode: 'remote_only' } }
      : url.pathname.endsWith('/documents/status') ? { ok: true, requireReview: true,
        package: { opportunityId: url.searchParams.get('opportunityId'), url: url.searchParams.get('url'), documents: {} } }
      : action === 'status' ? { ok: true, browserOpen: true, state: 'application_open_review_required',
        currentPage: { opportunityId: active.id, applicationUrl: active.url, pageUrl: active.url } }
      : { ok: true };
    return route.fulfill({ json: body });
  });
  await page.goto('/');
  await page.evaluate(saved => localStorage.setItem('escape-hatch-applications', JSON.stringify(saved)), [done, onsite, remote]);
  await page.goto('/assist');
  const next = page.getByTestId('prepare-next-indeed-posting');
  await expect(next).toContainText('Synthetic remote');
  await next.click();
  await expect.poll(() => launches).toEqual([{ opportunityId: remote.id, url: remote.url, employerName: remote.company, automaticRecommendation: true }]);
});

test('live posting workplace contradiction rejects the misleading job and automatically advances to the next remote-confirmed job', async ({ page }) => {
  const done = { id: 'done', company: 'Synthetic completed', role: 'Engineer', url: 'https://www.indeed.com/viewjob?jk=0123456789abcdef',
    status: 'applied', priority: 'normal', notes: '', nextAction: '', updatedAt: '2026-01-01T00:00:00Z' };
  const misleading = { ...done, id: 'misleading', company: 'Synthetic misleading', status: 'saved',
    url: 'https://www.indeed.com/viewjob?jk=3333333333333333', workMode: 'Remote' };
  const backup = { ...done, id: 'backup', company: 'Synthetic backup remote', status: 'saved',
    url: 'https://www.indeed.com/viewjob?jk=4444444444444444', workMode: 'Remote' };
  const launches: Array<{ opportunityId: string; url: string; employerName: string; automaticRecommendation?: boolean }> = [];
  let active = done;
  await page.route('**/__escapehatch/tracker/**', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ ok: true, connection: 'NOT_CONNECTED', localGoogleAuthPresent: false, snapshot: null }) }));
  await page.route('**/__escapehatch/managed-assist/**', route => {
    const request = route.request();
    const url = new URL(request.url());
    const action = url.pathname.split('/').at(-1);
    if (action === 'launch') {
      const payload = request.postDataJSON() as { opportunityId: string; url: string; employerName: string; automaticRecommendation?: boolean };
      launches.push(payload);
      if (payload.opportunityId === misleading.id) {
        return route.fulfill({
          status: 409,
          json: {
            ok: false,
            code: 'workplace_eligibility_rejected',
            workplaceState: 'required_commute',
            contradicted: true,
            opportunityId: misleading.id,
            applicationUrl: misleading.url,
            error: 'Remote-only recommendation withheld: required_commute. No application entry was opened.',
          },
        });
      }
      active = backup;
      return route.fulfill({ json: { ok: true, state: 'application_open_review_required' } });
    }
    const body = action === 'preferences' ? { ok: true, preferences: { schema_version: 'escapehatch-application-question-preferences/v1',
      exported_at: '2026-01-01T00:00:00Z', preferences: {}, recommendation_work_mode: 'remote_only' } }
      : url.pathname.endsWith('/documents/status') ? { ok: true, requireReview: true,
        package: { opportunityId: url.searchParams.get('opportunityId'), url: url.searchParams.get('url'), documents: {} } }
      : action === 'status' ? { ok: true, browserOpen: true, state: 'application_open_review_required',
        currentPage: { opportunityId: active.id, applicationUrl: active.url, pageUrl: active.url } }
      : { ok: true };
    return route.fulfill({ json: body });
  });
  await page.goto('/');
  await page.evaluate(saved => localStorage.setItem('escape-hatch-applications', JSON.stringify(saved)), [done, misleading, backup]);
  await page.goto('/assist');
  await expect(page.getByTestId('prepare-next-indeed-posting')).toContainText('Synthetic misleading');
  await page.getByTestId('prepare-next-indeed-posting').click();
  await expect.poll(() => launches.map(entry => entry.opportunityId)).toEqual([misleading.id, backup.id]);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('escape-hatch-applications') || '[]'));
  const updatedMisleading = stored.find((item: { id: string }) => item.id === misleading.id);
  expect(updatedMisleading.status).toBe('saved');
  expect(updatedMisleading.workMode).toBe('Commute required (live posting)');
});
