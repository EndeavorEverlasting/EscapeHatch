import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_CHECKPOINT, advanceAuthCheckpoint, resumeAllowed } from './managed-auth-checkpoint.ts';

const base = {
  expectedOrigin: 'https://jobs.example.test',
  pageOrigin: 'https://jobs.example.test',
  pageUrl: 'https://jobs.example.test/apply/role1',
  credentialGate: false, emailFirstGate: false,
  applicationFormRecognized: false,
  formSignature: '0:0:0:1',
};
test('email-first checkpoint never claims form readiness', () => {
  const state = advanceAuthCheckpoint(INITIAL_CHECKPOINT, { ...base, emailFirstGate: true });
  assert.equal(state.phase, 'AUTH_HANDOFF'); assert.equal(state.canResume, false);
});
test('password/login challenge never grants resume', () => {
  const state = advanceAuthCheckpoint(INITIAL_CHECKPOINT, { ...base, credentialGate: true, applicationFormRecognized: true });
  assert.equal(state.phase, 'AUTH_HANDOFF');
});
test('SSO origin is observed but cannot receive field writes', () => {
  const state = advanceAuthCheckpoint(INITIAL_CHECKPOINT, {
    ...base, pageOrigin: 'https://login.example.test', pageUrl: 'https://login.example.test/sso',
  });
  assert.equal(state.phase, 'SESSION_ORIGIN_CHANGED'); assert.equal(state.canResume, false);
});
test('form requires two stable readbacks, not a URL redirect alone', () => {
  const present = { ...base, applicationFormRecognized: true, formSignature: '2:1:1:6' };
  const first = advanceAuthCheckpoint(INITIAL_CHECKPOINT, present);
  assert.equal(first.phase, 'AUTH_RECHECK'); assert.equal(first.canResume, false);
  const second = advanceAuthCheckpoint(first, present);
  assert.equal(second.phase, 'APPLICATION_FORM_READY'); assert.equal(second.canResume, true);
  assert.equal(resumeAllowed(second, present.pageOrigin, present.expectedOrigin), true);
});
test('different form signature or URL resets the stability counter', () => {
  const first = advanceAuthCheckpoint(INITIAL_CHECKPOINT, { ...base, applicationFormRecognized: true });
  const next = advanceAuthCheckpoint(first, {
    ...base, applicationFormRecognized: true, pageUrl: 'https://jobs.example.test/other',
  });
  assert.equal(next.stableReads, 1); assert.equal(next.canResume, false);
});
test('login reappearing revokes previous readiness', () => {
  const ready = advanceAuthCheckpoint(
    advanceAuthCheckpoint(INITIAL_CHECKPOINT, { ...base, applicationFormRecognized: true }),
    { ...base, applicationFormRecognized: true },
  );
  const blocked = advanceAuthCheckpoint(ready, { ...base, credentialGate: true });
  assert.equal(blocked.canResume, false);
});
test('absence of login is not evidence of application form', () => {
  const state = advanceAuthCheckpoint(INITIAL_CHECKPOINT, base);
  assert.equal(state.phase, 'ENTRY_REVIEW_REQUIRED');
});
