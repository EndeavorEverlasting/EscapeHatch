import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, type Server } from 'node:http';
import { chromium, type Browser, type Page } from '@playwright/test';
import { installManagedSubmissionObserver } from './managed-submission-observer.ts';

let browser: Browser;
let server: Server;
let origin: string;
const success = '<main id="root"><h1>We have received your application.</h1></main>';
const form = (mode: string) => `<main id="root"><h1>Apply</h1><form><input id="answer" ${mode === 'invalid' ? 'required' : ''}><button id="submit" type="submit">Submit Application</button></form></main>
<script>document.querySelector('form').onsubmit = event => { event.preventDefault();
const mode=${JSON.stringify(mode)};
if(mode==='reload') { location.href='/job/confirmation'; return; }
if(mode==='drift') { location.href='/other-job'; return; }
if(mode==='origin') { location.href=location.origin.replace('127.0.0.1','localhost')+'/job/confirmation'; return; }
if(mode==='pending'||mode==='invalid') return;
if(mode==='spam') { document.querySelector('#root').insertAdjacentHTML('beforeend', "<div>We couldn&apos;t submit your application<p>Your application submission was flagged as possible spam.</p></div>"); return; }
if(mode==='ashby-success') { document.querySelector('#root').innerHTML="<h1>Product Operations Lead</h1><div><div>Success</div><div>Your application was successfully submitted. We'll contact you if there are next steps.</div></div>"; return; }
if(mode==='reject') { document.querySelector('#root').insertAdjacentHTML('beforeend','<p role="alert">Unable to submit. Try again.</p>'); return; }
if(mode==='ambiguous') { document.querySelector('#root').innerHTML='<h1>Thanks!</h1>'; return; }
if(mode==='posting') { document.querySelector('#root').innerHTML='<article>We have received your application.</article><h1>Apply</h1>'; return; }
document.querySelector('#root').innerHTML='<h1>We have received your application.</h1>';
};</script>`;

before(async () => {
  server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html');
    const url = new URL(request.url!, 'http://fixture');
    response.end(url.pathname.endsWith('/confirmation') ? success : form(url.searchParams.get('mode') ?? 'spa'));
  });
  await new Promise<void>(resolve => server.listen(0, '0.0.0.0', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : { channel: 'chrome' }) });
});
after(async () => { await browser?.close(); await new Promise<void>(resolve => server?.close(() => resolve())); });

async function fixture(mode = 'spa') {
  const page = await browser.newPage();
  await page.goto(`${origin}/job?mode=${mode}`);
  const changes: string[] = [];
  const observer = await installManagedSubmissionObserver(page, {
    opportunityId: 'synthetic-opportunity', sessionId: 'synthetic-session',
    applicationUrl: `${origin}/job`, submitSelector: '#submit',
    successSelector: '#root h1, #root h2, #root [role="status"], #root div',
    confirmationPaths: ['/job/confirmation'], onChange: state => changes.push(state.state),
  });
  return { page, observer, changes };
}
async function until(predicate: () => boolean) {
  const end = Date.now() + 5000;
  while (!predicate() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(predicate(), 'Expected observer state within 5 seconds');
}
async function click(page: Page) { await page.locator('#submit').click(); }

test('unarmed user click does not record submission', async () => {
  const { page, observer } = await fixture();
  try { await click(page); assert.equal(observer.snapshot().state, 'DISARMED'); assert.equal(observer.snapshot().receipt, null); }
  finally { await page.close(); }
});

for (const mode of ['spa', 'reload', 'ashby-success']) test(`${mode} receipt follows human click and emits one minimal idempotent receipt`, async () => {
  const { page, observer, changes } = await fixture(mode);
  try {
    await observer.arm(); await click(page);
    await until(() => observer.snapshot().state === 'CONFIRMED');
    const receipt = observer.snapshot().receipt!;
    assert.equal(receipt.source, 'same_session_page_confirmation');
    assert.equal(receipt.opportunityId, 'synthetic-opportunity');
    assert.equal(receipt.applicationPath, '/job');
    assert.ok(receipt.attemptId);
    assert.ok(!JSON.stringify(receipt).includes('mode='));
    await page.locator('h1').evaluate(element => element.setAttribute('data-rerender', '1'));
    assert.deepEqual(observer.snapshot().receipt, receipt);
    assert.equal(changes.filter(state => state === 'CONFIRMED').length, 1);
    await assert.rejects(observer.arm(), /already confirmed/);
  } finally { await page.close(); }
});

for (const mode of ['pending', 'ambiguous', 'posting']) test(`${mode} is not confirmation`, async () => {
  const { page, observer } = await fixture(mode);
  try { await observer.arm(); await click(page); await until(() => observer.snapshot().state === 'PENDING'); assert.equal(observer.snapshot().receipt, null); }
  finally { await page.close(); }
});

for (const mode of ['invalid', 'reject', 'spam']) test(`${mode} remains validation failed`, async () => {
  const { page, observer } = await fixture(mode);
  try { await observer.arm(); await click(page); await until(() => observer.snapshot().state === 'VALIDATION_FAILED'); assert.equal(observer.snapshot().receipt, null); }
  finally { await page.close(); }
});

for (const mode of ['drift', 'origin']) test(`${mode} change blocks receipt`, async () => {
  const { page, observer } = await fixture(mode);
  try { await observer.arm(); await click(page); await until(() => observer.snapshot().state === 'BLOCKED'); assert.equal(observer.snapshot().receipt, null); }
  finally { await page.close(); }
});

test('disarm is idempotent and synthetic clicks cannot become an attempt', async () => {
  const { page, observer } = await fixture('pending');
  try {
    await observer.arm();
    await page.locator('#submit').evaluate(element => (element as HTMLElement).click());
    assert.equal(observer.snapshot().state, 'ARMED');
    await observer.disarm(); await observer.disarm(); await click(page);
    assert.equal(observer.snapshot().state, 'DISARMED');
  } finally { await page.close(); }
});

test('preexisting confirmation and route-only changes cannot prove submission', async () => {
  const { page, observer } = await fixture('pending');
  try {
    await page.locator('h1').evaluate(element => element.textContent = 'We have received your application.');
    await assert.rejects(observer.arm(), /Preexisting/);
    assert.equal(observer.snapshot().receipt, null);
    await page.locator('h1').evaluate(element => element.textContent = 'Apply');
    await observer.arm(); await click(page);
    await page.evaluate(() => history.pushState({}, '', '/job/confirmation'));
    assert.equal(observer.snapshot().state, 'PENDING');
    assert.equal(observer.snapshot().receipt, null);
  } finally { await page.close(); }
});

test('a confirmation without a human attempt is ignored', async () => {
  const { page, observer } = await fixture();
  try {
    await observer.arm();
    await page.locator('#root').evaluate(element => element.innerHTML = '<h1>We have received your application.</h1>');
    assert.equal(observer.snapshot().state, 'ARMED');
    assert.equal(observer.snapshot().receipt, null);
  } finally { await page.close(); }
});

test('page-authored binding calls cannot forge a user attempt or receipt', async () => {
  const { page, observer } = await fixture('pending');
  try {
    await observer.arm();
    await page.evaluate(async () => {
      const name = Object.keys(window).find(key => /^__ehSubmission[a-f0-9]+$/.test(key))!;
      const report = (window as unknown as Record<string, any>)[name];
      await report({ kind: 'attempt', url: location.href, documentId: 'forged', success: false, invalid: false });
      await report({ kind: 'scan', url: location.href, documentId: 'forged', success: true, invalid: false });
    });
    assert.equal(observer.snapshot().state, 'ARMED');
    assert.equal(observer.snapshot().receipt, null);
    await observer.dispose();
    assert.equal(observer.snapshot().state, 'DISARMED');
    await assert.rejects(observer.arm(), /disposed/);
  } finally { await page.close(); }
});

test('broad button selector binds only the unique exact enabled terminal label', async () => {
  const { page, observer } = await fixture('pending');
  await observer.dispose();
  const handle = await installManagedSubmissionObserver(page, {
    opportunityId: 'synthetic', sessionId: 'synthetic', applicationUrl: `${origin}/job`,
    submitSelector: '#root button', successSelector: '#root h1',
  });
  try {
    await page.locator('form').evaluate(element => element.insertAdjacentHTML('beforeend', '<button type="button" id="other">Yes</button>'));
    await handle.arm(); await page.locator('#other').click();
    assert.equal(handle.snapshot().state, 'ARMED');
    await click(page); await until(() => handle.snapshot().state === 'PENDING');
    await handle.disarm();
    await page.locator('form').evaluate(element => element.insertAdjacentHTML('beforeend', '<button type="button">Submit Application</button>'));
    await assert.rejects(handle.arm(), /unique enabled/);
  } finally { await page.close(); }
});

test('preexisting receipt among multiple headings cannot become fresh confirmation', async () => {
  const { page, observer } = await fixture('pending');
  try {
    await page.locator('#root').evaluate(element => element.insertAdjacentHTML('beforeend', '<h2>We have received your application.</h2>'));
    await assert.rejects(observer.arm(), /Preexisting/);
    assert.equal(observer.snapshot().state, 'DISARMED');
  } finally { await page.close(); }
});

test('receipt text with a visible submit control or quoted extra instructions is insufficient', async () => {
  const { page, observer } = await fixture('pending');
  try {
    await observer.arm(); await click(page);
    await page.locator('h1').evaluate(element => element.textContent = 'We have received your application.');
    assert.equal(observer.snapshot().state, 'PENDING');
    await page.locator('#root').evaluate(element => element.innerHTML = '<h1>We have received your application is an example of confirmation text.</h1>');
    assert.equal(observer.snapshot().state, 'PENDING');
    assert.equal(observer.snapshot().receipt, null);
  } finally { await page.close(); }
});
