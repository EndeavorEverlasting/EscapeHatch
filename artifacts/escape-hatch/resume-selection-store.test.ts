import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  ResumeSelectionStore,
  INDEED_ACCOUNT_SLOT_ID,
  indeedSlotIdForUrl,
} from './resume-selection-store.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const pdf = (label: string) => ({
  name: label + '.pdf',
  mimeType: 'application/pdf' as const,
  buffer: Buffer.from('%PDF-1.4\n' + label + '\n'),
});

async function tempStore() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-resume-sel-'));
  return { root, store: new ResumeSelectionStore(root) };
}

test('indeed host maps to the account-wide platform slot', () => {
  assert.equal(indeedSlotIdForUrl('https://www.indeed.com/viewjob?jk=1'), INDEED_ACCOUNT_SLOT_ID);
  assert.equal(indeedSlotIdForUrl('https://employers.indeed.com/candidates'), INDEED_ACCOUNT_SLOT_ID);
  assert.equal(indeedSlotIdForUrl('https://careers.example.test/job/1'), null);
});

test('operator can register master and domain résumés and switch freely without queue lock', async () => {
  const { root, store } = await tempStore();
  try {
    await store.registerApprovedResume({
      ownerId: OWNER, resumeId: 'master', tier: 'canonical', revision: 'r1', file: pdf('master'),
    });
    await store.registerApprovedResume({
      ownerId: OWNER, resumeId: 'it-domain', tier: 'domain', revision: 'r1',
      domainTags: ['technology'], parentResumeId: 'master', file: pdf('it'),
    });
    await store.registerApprovedResume({
      ownerId: OWNER, resumeId: 'ops-domain', tier: 'domain', revision: 'r1',
      domainTags: ['management'], parentResumeId: 'master', file: pdf('ops'),
    });

    const listed = await store.listChoices(OWNER);
    assert.equal(listed.queueWideLock, false);
    assert.deepEqual(listed.choices.map(c => c.resumeId), ['master', 'it-domain', 'ops-domain']);

    const needsConsent = await store.planSelect({
      ownerId: OWNER, resumeId: 'it-domain', consentAccountWideReplacement: false,
    });
    assert.equal(needsConsent.requiresConsent, true);
    assert.equal(needsConsent.selected, false);
    assert.equal(needsConsent.queueWideLock, false);
    assert.match(needsConsent.disclosure || '', /account-wide/);

    const toIt = await store.planSelect({
      ownerId: OWNER, resumeId: 'it-domain', consentAccountWideReplacement: true,
    });
    assert.equal(toIt.selected, true);
    assert.equal(toIt.queueWideLock, false);
    assert.equal((await store.listChoices(OWNER)).choices.find(c => c.current)?.resumeId, 'it-domain');

    const toOps = await store.planSelect({
      ownerId: OWNER, resumeId: 'ops-domain', consentAccountWideReplacement: true,
    });
    assert.equal(toOps.selected, true);
    assert.equal((await store.listChoices(OWNER)).choices.find(c => c.current)?.resumeId, 'ops-domain');

    const back = await store.planSelect({
      ownerId: OWNER, resumeId: 'master', consentAccountWideReplacement: true,
    });
    assert.equal(back.selected, true);
    assert.equal((await store.listChoices(OWNER)).choices.find(c => c.current)?.resumeId, 'master');

    const keep = await store.planSelect({
      ownerId: OWNER, resumeId: 'master', consentAccountWideReplacement: false,
    });
    assert.equal(keep.selected, true);
    assert.equal(keep.requiresConsent, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('failed provider readback marks only the slot and never freezes the queue', async () => {
  const { root, store } = await tempStore();
  try {
    await store.registerApprovedResume({
      ownerId: OWNER, resumeId: 'master', tier: 'canonical', revision: 'r1', file: pdf('master'),
    });
    await store.registerApprovedResume({
      ownerId: OWNER, resumeId: 'it-domain', tier: 'domain', revision: 'r1',
      domainTags: ['technology'], parentResumeId: 'master', file: pdf('it'),
    });
    await store.planSelect({
      ownerId: OWNER, resumeId: 'it-domain', consentAccountWideReplacement: true,
    });
    const failed = await store.markProviderReadback({
      ownerId: OWNER, observedDigest: null, verified: false,
    });
    assert.equal(failed.queueWideLock, false);
    assert.equal(failed.matched, false);
    const listed = await store.listChoices(OWNER);
    assert.equal(listed.observation, 'unverified');
    assert.equal(listed.queueWideLock, false);
    assert.equal(listed.choices.find(c => c.current)?.resumeId, 'it-domain');
    // Unrelated preparation path remains available: choices still list and switch planning still works.
    const again = await store.planSelect({
      ownerId: OWNER, resumeId: 'master', consentAccountWideReplacement: true,
    });
    assert.equal(again.selected, true);
    assert.equal(again.queueWideLock, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('owners cannot read each other résumé graphs', async () => {
  const { root, store } = await tempStore();
  try {
    await store.registerApprovedResume({
      ownerId: OWNER, resumeId: 'master', tier: 'canonical', revision: 'r1', file: pdf('owner-a'),
    });
    const other = await store.listChoices(OTHER);
    assert.equal(other.choices.length, 0);
    const selected = await store.currentSelectedPdf(OTHER);
    assert.equal(selected, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('provider-verified readback matches the selected digest', async () => {
  const { root, store } = await tempStore();
  try {
    const file = pdf('master');
    const digest = createHash('sha256').update(file.buffer).digest('hex');
    await store.registerApprovedResume({
      ownerId: OWNER, resumeId: 'master', tier: 'canonical', revision: 'r1', file,
    });
    await store.planSelect({
      ownerId: OWNER, resumeId: 'master', consentAccountWideReplacement: true,
    });
    const ok = await store.markProviderReadback({
      ownerId: OWNER, observedDigest: digest, verified: true,
    });
    assert.equal(ok.matched, true);
    assert.equal(ok.queueWideLock, false);
    const listed = await store.listChoices(OWNER);
    assert.equal(listed.pending?.providerVerified, true);
    assert.equal(listed.observation, 'verified');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
