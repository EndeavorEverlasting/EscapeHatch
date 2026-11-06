import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { ManagedListeners } from './managed-listeners.ts';
import { createManagedBrowserAssistPlugin } from './browser-assist-control.ts';
import { OWNER_BINDING_SCHEMA } from './src/lib/workspace-owner-binding.ts';
import { WORKSPACE_SCHEMA } from './src/lib/workspace-bootstrap.ts';
import { PROFILE_KEY, emptyProfile } from './src/lib/storage.ts';
import { saveWorkspace } from './workspace-file.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INSTALL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const pdf = (label: string) => Buffer.from('%PDF-1.4\n' + label + '\n');

test('managed-assist resume-selection routes support free switching without queue lock', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'eh-resume-ctrl-'));
  const instanceId = 'resume-sel-' + Date.now();
  const symbol = Symbol.for('escapehatch.managed-browser.' + instanceId);
  const listeners = new ManagedListeners(path.join(root, 'receipts.json'), path.join(root, 'preferences.json'));
  const before = { ...process.env };
  try {
    await saveWorkspace(
      { schema: WORKSPACE_SCHEMA, values: { [PROFILE_KEY]: { ...emptyProfile, first_name: 'Synthetic' } } },
      null,
      path.join(root, 'workspace.v1.json'),
    );
    await fs.writeFile(path.join(root, 'workspace-owner-binding.v1.json'), JSON.stringify({
      schema: OWNER_BINDING_SCHEMA,
      ownerId: OWNER,
      workspaceId: WORKSPACE,
      installationId: INSTALL,
      boundAt: new Date().toISOString(),
      selection: 'applicant-confirmed',
    }), { mode: 0o600 });

    Object.assign(process.env, {
      ESCAPEHATCH_DATA_HOME: root,
      ESCAPEHATCH_REPO_FINGERPRINT: 'a'.repeat(64),
      ESCAPEHATCH_SHUTDOWN_TOKEN: 'synthetic-only',
      ESCAPEHATCH_STARTED_AT_UTC: new Date().toISOString(),
      PORT: '21077',
      ESCAPEHATCH_INSTANCE_ID: instanceId,
    });
    (globalThis as Record<symbol, unknown>)[symbol] = {
      context: null, page: null, state: 'idle', applicationOrigin: null, applicationUrl: null,
      opportunityId: null, preparation: null, networkDiagnosis: null, authCheckpoint: null,
      trustedReturnPath: null, listeners, busy: false,
    };

    let middleware: Function = () => {};
    const plugin = createManagedBrowserAssistPlugin();
    (plugin.configureServer as Function)({
      config: { server: { port: 21077 } },
      middlewares: { use: (handler: Function) => { middleware = handler; } },
    });

    const call = async (method: string, route: string, payload?: object) => {
      let code = 0;
      let body = '';
      const origin = 'http://127.0.0.1:21077';
      await middleware(
        {
          url: '/__escapehatch/managed-assist' + route,
          method,
          headers: {
            host: '127.0.0.1:21077',
            origin,
            'content-type': 'application/json',
            ...(method === 'POST' ? { 'x-escapehatch-operator-action': 'confirmed' } : {}),
          },
          socket: { remoteAddress: '127.0.0.1' },
          async *[Symbol.asyncIterator]() {
            if (payload) yield Buffer.from(JSON.stringify(payload));
          },
        },
        {
          set statusCode(value: number) { code = value; },
          setHeader() {},
          end(value: string) { body = value; },
        },
        () => assert.fail('resume-selection route missed: ' + route),
      );
      return { code, body: body ? JSON.parse(body) : null };
    };

    const empty = await call('GET', '/resume-selection');
    assert.equal(empty.code, 200);
    assert.equal(empty.body.queueWideLock, false);
    assert.equal(empty.body.choices.length, 0);

    const masterBytes = pdf('master');
    const registered = await call('POST', '/resume-selection/register', {
      resumeId: 'master',
      tier: 'canonical',
      revision: 'r1',
      file: { name: 'master.pdf', mimeType: 'application/pdf', base64: masterBytes.toString('base64') },
    });
    assert.equal(registered.code, 200, JSON.stringify(registered.body));
    assert.equal(registered.body.queueWideLock, false);

    const domainBytes = pdf('it');
    const domain = await call('POST', '/resume-selection/register', {
      resumeId: 'it-domain',
      tier: 'domain',
      revision: 'r1',
      domainTags: ['technology'],
      parentResumeId: 'master',
      file: { name: 'it.pdf', mimeType: 'application/pdf', base64: domainBytes.toString('base64') },
    });
    assert.equal(domain.code, 200, JSON.stringify(domain.body));

    const listed = await call('GET', '/resume-selection');
    assert.equal(listed.body.choices.length, 2);

    const needsConsent = await call('POST', '/resume-selection/select', {
      resumeId: 'it-domain',
      consentAccountWideReplacement: false,
    });
    assert.equal(needsConsent.code, 200);
    assert.equal(needsConsent.body.requiresConsent, true);
    assert.equal(needsConsent.body.queueWideLock, false);

    const selected = await call('POST', '/resume-selection/select', {
      resumeId: 'it-domain',
      consentAccountWideReplacement: true,
    });
    assert.equal(selected.code, 200);
    assert.equal(selected.body.selected, true);
    assert.equal(selected.body.queueWideLock, false);

    const failed = await call('POST', '/resume-selection/provider-readback', {
      verified: false,
      observedDigest: null,
    });
    assert.equal(failed.code, 200);
    assert.equal(failed.body.queueWideLock, false);
    assert.equal(failed.body.matched, false);

    const afterFail = await call('GET', '/resume-selection');
    assert.equal(afterFail.body.observation, 'unverified');
    assert.equal(afterFail.body.choices.find((c: { current: boolean }) => c.current)?.resumeId, 'it-domain');

    const back = await call('POST', '/resume-selection/select', {
      resumeId: 'master',
      consentAccountWideReplacement: true,
    });
    assert.equal(back.body.selected, true);

    const matched = await call('POST', '/resume-selection/provider-readback', {
      verified: true,
      observedDigest: createHash('sha256').update(masterBytes).digest('hex'),
    });
    assert.equal(matched.body.matched, true);
    assert.equal(matched.body.queueWideLock, false);
  } finally {
    await listeners.dispose();
    delete (globalThis as Record<symbol, unknown>)[symbol];
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
    await fs.rm(root, { recursive: true, force: true });
  }
});
