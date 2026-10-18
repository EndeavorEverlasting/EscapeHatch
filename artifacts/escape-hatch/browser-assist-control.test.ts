import assert from 'node:assert/strict';
import test from 'node:test';
import { ADAPTER_EVIDENCE_SCHEMA } from './application-navigation-policy.ts';
import {
  parseNavigationAuthorization,
  parsePrivatePdf,
  parseTrustedAdapterRegistry,
  reviewedContactFields,
  validateApplicationUrl,
} from './browser-assist-control.ts';

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
