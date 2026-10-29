import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import manifest from '../../../../browser/application-assist/manifest.json' with { type: 'json' };
import { applicationAssistExtensionId, refreshExtensionWorkspace } from './extension-workspace.ts';

test('bootstrap addresses the exact packaged extension and sends no private workspace data', async () => {
  const expected = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, value => String.fromCharCode(97 + parseInt(value, 16)));
  assert.equal(await applicationAssistExtensionId(), expected);
  let requests = 0;
  const message = await refreshExtensionWorkspace({ sendMessage(id, input, done) {
    requests++;
    assert.equal(id, expected);
    assert.deepEqual(input, { type: 'workspace-refresh' });
    done({ ok: true, status: 'ALREADY_CURRENT', profileFieldCount: 4, answerCount: 2 });
  } });
  assert.equal(requests, 1);
  assert.equal(message, 'Extension workspace is current: 4 profile fields and 2 approved answers.');
});

test('missing extension, rejected connection and review states never report hydration', async () => {
  assert.match(await refreshExtensionWorkspace(), /Open the EscapeHatch extension/);
  for (const result of [undefined, { ok: false }, { ok: true, status: 'NOT_PAIRED' }, { ok: true, status: 'PAUSED' }]) {
    const message = await refreshExtensionWorkspace({ sendMessage(_id, _input, done) { done(result); } });
    assert.doesNotMatch(message, /is current/);
  }
  const message = await refreshExtensionWorkspace({ sendMessage() { throw new Error('untrusted transport detail'); } });
  assert.doesNotMatch(message, /untrusted transport detail/);
});
