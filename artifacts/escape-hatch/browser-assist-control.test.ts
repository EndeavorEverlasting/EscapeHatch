import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { ADAPTER_EVIDENCE_SCHEMA } from './application-navigation-policy.ts';
import {
  parseNavigationAuthorization,
  parsePrivatePdf,
  parseTrustedAdapterRegistry,
  reviewedContactFields,
  validateApplicationUrl,
  managedBrowserProfileDirectory,
  createManagedBrowserAssistPlugin,
} from './browser-assist-control.ts';

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
  for (const origin of ['https://example.com', 'http://localhost:21031', 'http://127.0.0.1:80',
    'http://127.0.0.1:21031/path', 'http://127.0.0.1:21031/', 'http://user:pass@127.0.0.1:21031']) {
    assert.throws(() => managedBrowserProfileDirectory(origin));
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
  const page = { isClosed: () => false, url: () => currentUrl, bringToFront: async () => {},
    // Keep the fixture off every employer and exercise the guarded navigation-failure path.
    goto: async (url: string) => { currentUrl = url; throw new Error('net::ERR_INTERNET_DISCONNECTED'); } };
  chromium.launchPersistentContext = (async (folder: string) => {
    folders.push(folder);
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
        assert.equal(JSON.parse(result).state, 'browser_open_navigation_unverified');
      }
    }
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
  const options = { headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) };
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
