import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { INITIAL_CHECKPOINT, advanceAuthCheckpoint, inspectAuthObservation } from '../managed-auth-checkpoint';
import { createManagedBrowserAssistPlugin } from '../browser-assist-control';

test('real managed middleware returns scoped requirements and rejects cross-origin or wrong-job reads', async ({ page }) => {
  await page.goto('/');
  await page.setContent('<form><label>Role résumé<input type="file" required></label><label>Email<input type="email" required></label><button>Submit</button></form>');
  const instance = 'synthetic-inspection-' + randomUUID();
  const names = ['PORT', 'ESCAPEHATCH_INSTANCE_ID', 'ESCAPEHATCH_REPO_FINGERPRINT', 'ESCAPEHATCH_SHUTDOWN_TOKEN', 'ESCAPEHATCH_STARTED_AT_UTC', 'ESCAPEHATCH_RUNTIME_PROTOCOL'];
  const before = new Map(names.map(name => [name, process.env[name]]));
  const cacheKey = Symbol.for('escapehatch.managed-browser.' + instance);
  const cache = globalThis as unknown as Record<symbol, unknown>;
  let middleware: (request: IncomingMessage, response: ServerResponse, next: () => void) => void;
  const server = createServer((request, response) => middleware(request, response, () => { response.statusCode = 404; response.end(); }));
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Synthetic listener unavailable');
    const origin = `http://127.0.0.1:${address.port}`;
    delete process.env.PORT;
    process.env.ESCAPEHATCH_INSTANCE_ID = instance;
    process.env.ESCAPEHATCH_REPO_FINGERPRINT = 'a'.repeat(64);
    process.env.ESCAPEHATCH_SHUTDOWN_TOKEN = randomUUID();
    process.env.ESCAPEHATCH_STARTED_AT_UTC = new Date().toISOString();
    process.env.ESCAPEHATCH_RUNTIME_PROTOCOL = '1';
    cache[cacheKey] = { context: null, page, state: 'application_form_open_review_required', applicationOrigin: new URL(page.url()).origin,
      applicationUrl: page.url(), opportunityId: 'synthetic-one', preparation: null, listeners: { status: async () => ({ receipts: [] }) }, busy: false };
    const plugin = createManagedBrowserAssistPlugin();
    const configure = plugin.configureServer as (server: unknown) => void;
    configure({ config: { server: { port: address.port } }, middlewares: { use: (handler: typeof middleware) => { middleware = handler; } } });
    async function inspect(id: string, requestOrigin = origin) {
      return fetch(origin + '/__escapehatch/managed-assist/requirements', { method: 'POST',
        headers: { origin: requestOrigin, 'content-type': 'application/json', 'x-escapehatch-operator-action': 'confirmed' },
        body: JSON.stringify({ opportunityId: id, url: page.url().replace(/\/$/, '') }) });
    }
    expect((await inspect('synthetic-one', 'https://untrusted.invalid')).status).toBe(403);
    expect((await inspect('synthetic-two')).status).toBe(422);
    const html = await page.content();
    const response = await inspect('synthetic-one');
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.inspection.opportunityId).toBe('synthetic-one');
    expect(result.inspection.requirements.map((item: { requirement: string }) => item.requirement)).toEqual(['required', 'required']);
    expect(await page.content()).toBe(html);
    expect(result.inspection.scope).toBe('current_page_only');
    const beforeNavigation = await (await fetch(origin + '/__escapehatch/managed-assist/status')).json();
    expect(beforeNavigation.currentPage.pageUrl).toBe(page.url());
    await page.goto('/profile');
    const afterNavigation = await (await fetch(origin + '/__escapehatch/managed-assist/status')).json();
    expect(afterNavigation.currentPage.pageUrl).toBe(page.url());
    expect(afterNavigation.currentPage.pageUrl).not.toBe(result.inspection.pageUrl);
    await page.close();
    const closed = await (await fetch(origin + '/__escapehatch/managed-assist/status')).json();
    expect(closed.currentPage).toBeNull();
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    delete cache[cacheKey];
    for (const [name, value] of before) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});


test('auth readback fingerprints form identity without reading control values', async ({ page }) => {
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  await page.evaluate(() => Object.defineProperty(HTMLInputElement.prototype, 'value', {
    get() { throw new Error('Synthetic credential/control value must not be read'); },
    configurable: true,
  }));
  await page.setContent('<form><label>Email<input type="email"></label><label>Password<input type="password"></label></form>');
  const login = await inspectAuthObservation(page, origin);
  expect(login.credentialGate).toBe(true);
  expect(advanceAuthCheckpoint(INITIAL_CHECKPOINT, login).canResume).toBe(false);
  await page.setContent('<form><label>First name<input name="first_name"></label><label>Last name<input name="last_name"></label></form>');
  const first = await inspectAuthObservation(page, origin);
  const checkpoint = advanceAuthCheckpoint(INITIAL_CHECKPOINT, first);
  expect(checkpoint.canResume).toBe(false);
  await page.setContent('<form><label>Given name<input name="given_name"></label><label>Last name<input name="family_name"></label></form>');
  const changed = await inspectAuthObservation(page, origin);
  expect(changed.applicationFormRecognized).toBe(true);
  expect(changed.formSignature).not.toBe(first.formSignature);
  expect(changed.formSignature).toMatch(/^[a-f0-9]{64}$/);
  const reset = advanceAuthCheckpoint(checkpoint, changed);
  expect(reset.canResume).toBe(false);
  expect(advanceAuthCheckpoint(reset, await inspectAuthObservation(page, origin)).canResume).toBe(true);
});
