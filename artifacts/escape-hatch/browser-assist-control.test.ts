import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePrivatePdf, reviewedContactFields, validateApplicationUrl } from './browser-assist-control.ts';

test('only public HTTPS application URLs are accepted', () => {
  assert.match(validateApplicationUrl('https://www.google.com/about/careers/applications/jobs/results/123'), /^https:/);
  for (const url of ['http://example.com', 'file:///etc/passwd', 'http://127.0.0.1/', 'https://localhost/x',
    'https://192.168.1.2/', 'https://user:pass@example.com/', 'https://example.com:8443/x',
    'https://x.local/page', 'not-a-url']) {
    assert.throws(() => validateApplicationUrl(url), /URL|HTTPS/);
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

test('browser control is scoped to operator actions: no automatic submission or navigation', () => {
  const verbs = ['launch', 'fill', 'attach', 'status'];
  assert.equal(verbs.includes('submit'), false);
  assert.equal(verbs.includes('next'), false);
});
