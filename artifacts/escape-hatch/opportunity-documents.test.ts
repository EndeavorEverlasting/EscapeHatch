import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OpportunityDocumentStore, migrateLegacyDocumentPackage } from './opportunity-documents.ts';
import { parsePreferences, emptyPreferences } from './src/lib/application-preferences.ts';

const pdf = (name: string, text: string) => ({ name, mimeType: 'application/pdf' as const, buffer: Buffer.from('%PDF-1.4\n' + text) });
test('private documents persist per opportunity; exact bytes require independent review; bypass never marks reviewed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-document-review-'));
  const store = new OpportunityDocumentStore(root), id = 'synthetic', url = 'https://jobs.example.test/one';
  try {
    await store.stage(id, url, 'resume', pdf('resume.pdf', 'version one'));
    await store.stage(id, url, 'cover', pdf('cover.pdf', 'cover one'));
    await assert.rejects(store.forUpload(id, url, true), /review required/);
    let current = await store.read(id, url);
    await store.review(id, url, 'resume', current.documents.resume!.sha256);
    await assert.rejects(store.forUpload(id, url, true), /review required/);
    await store.review(id, url, 'cover', current.documents.cover!.sha256);
    const approved = await new OpportunityDocumentStore(root).forUpload(id, url, true);
    assert.equal(approved.resume?.name, 'resume.pdf');
    assert.equal(approved.reviewPolicy, 'operator_confirmed_review');
    await store.stage(id, url, 'resume', pdf('resume.pdf', 'version two'));
    await assert.rejects(store.review(id, url, 'resume', current.documents.resume!.sha256), /changed/);
    await assert.rejects(store.forUpload(id, url, true), /review required/);
    const bypass = await store.forUpload(id, url, false);
    assert.equal(bypass.reviewPolicy, 'review_disabled_by_operator');
    assert.equal((await store.read(id, url)).documents.resume?.reviewedAt, undefined);
    await assert.rejects(store.forUpload('another', url, false), /Save documents/);
    await assert.rejects(store.forUpload(id, 'https://jobs.example.test/two', false), /Save documents/);
    current = await store.read(id, url);
    await store.review(id, url, 'resume', current.documents.resume!.sha256);
    await store.stage(id, url, 'resume', pdf('renamed.pdf', 'version two'));
    assert.ok((await store.read(id, url)).documents.resume?.reviewedAt);
    const prefs = { ...emptyPreferences(), require_document_review: false };
    assert.equal(parsePreferences(prefs)?.require_document_review, false);
    assert.equal(parsePreferences({ ...prefs, require_document_review: 'false' }), null);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('tampered private document bytes cannot reuse a review confirmation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-document-integrity-'));
  const store = new OpportunityDocumentStore(root), id = 'synthetic', url = 'https://jobs.example.test/one';
  try {
    const value = await store.stage(id, url, 'resume', pdf('resume.pdf', 'source'));
    await store.review(id, url, 'resume', value.documents.resume!.sha256);
    const [directory] = (await fs.readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
    await fs.writeFile(path.join(root, directory, value.documents.resume!.sha256 + '.pdf'), '%PDF-mutated');
    await assert.rejects(store.forUpload(id, url, false), /content changed/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('legacy document recovery preserves exact bytes, opportunity scope and review without overwriting newer files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-document-migration-'));
  const legacy = path.join(root, 'legacy'), destination = path.join(root, 'stable');
  const id = 'synthetic', url = 'https://jobs.example.test/one';
  try {
    const old = new OpportunityDocumentStore(legacy);
    const value = await old.stage(id, url, 'resume', pdf('resume.pdf', 'reviewed source'));
    await old.review(id, url, 'resume', value.documents.resume!.sha256);
    await migrateLegacyDocumentPackage(destination, [legacy], id, url);
    const stable = new OpportunityDocumentStore(destination);
    assert.deepEqual((await stable.forUpload(id, url)).resume?.buffer, (await old.file(id, url, 'resume'))?.buffer);
    await stable.stage(id, url, 'resume', pdf('newer.pdf', 'newer stable edit'));
    await migrateLegacyDocumentPackage(destination, [legacy], id, url);
    assert.equal((await stable.read(id, url)).documents.resume?.name, 'newer.pdf');
    assert.equal((await old.read(id, url)).documents.resume?.name, 'resume.pdf');
    const other = path.join(root, 'conflicting'); const alternative = new OpportunityDocumentStore(other);
    await alternative.stage(id, url, 'resume', pdf('different.pdf', 'different source'));
    await assert.rejects(migrateLegacyDocumentPackage(path.join(root, 'third'), [legacy, other], id, url), /need review/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});


test('current employer form can require no uploads; optional cover drafts never block', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-optional-cover-'));
  const store = new OpportunityDocumentStore(root);
  const id = 'synthetic-no-cover', url = 'https://jobs.example.test/no-cover';
  try {
    // Even an entirely empty local package is valid when the employer offers no file controls.
    const none = await store.forCurrentEmployerForm(id, url, [], true);
    assert.equal(none.resume, null);
    assert.equal(none.cover, null);

    const staged = await store.stage(id, url, 'cover', pdf('optional-cover.pdf', 'draft not approved'));
    const absent = await store.forCurrentEmployerForm(id, url, [], true);
    assert.equal(absent.cover, null);

    // The employer offers an optional cover field; unreviewed drafts remain private.
    const optional = await store.forCurrentEmployerForm(id, url, ['cover'], true);
    assert.equal(optional.cover, null);
    await store.review(id, url, 'cover', staged.documents.cover!.sha256);
    const accepted = await store.forCurrentEmployerForm(id, url, ['cover'], true);
    assert.equal(accepted.cover?.name, 'optional-cover.pdf');

    // A reviewed cover cannot leak into a form that only requests a résumé.
    const resumeOnly = await store.forCurrentEmployerForm(id, url, ['resume'], true);
    assert.equal(resumeOnly.cover, null);
    assert.equal(resumeOnly.resume, null);

    await store.stage(id, url, 'resume', pdf('resume.pdf', 'new unreviewed'));
    const requiredResume = await store.forCurrentEmployerForm(id, url, ['resume'], true);
    assert.equal(requiredResume.resume, null);
    const current = await store.read(id, url);
    await store.review(id, url, 'resume', current.documents.resume!.sha256);
    const ready = await store.forCurrentEmployerForm(id, url, ['resume'], true);
    assert.equal(ready.resume?.name, 'resume.pdf');
    assert.equal(ready.cover, null);
    await assert.rejects(store.forCurrentEmployerForm(id, url, ['unknown' as 'resume'], true), /Unrecognized/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('independent case study is privately stored and hash-reviewed without changing resume or cover', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-case-study-'));
  const store = new OpportunityDocumentStore(root), url = 'https://jobs.example.test/role-1';
  try {
    await store.stage('applicant-A-job', url, 'resume', pdf('role.pdf','r'));
    await store.stage('applicant-A-job', url, 'cover', pdf('letter.pdf','c'));
    const staged = await store.stage('applicant-A-job', url, 'case_study', pdf('study.pdf','s'));
    assert.equal(staged.documents.case_study?.reviewedAt, undefined);
    let selected = await store.forCurrentEmployerForm('applicant-A-job', url, ['case_study'], true);
    assert.equal(selected.case_study, null);
    await store.review('applicant-A-job', url, 'case_study', staged.documents.case_study!.sha256);
    selected = await store.forCurrentEmployerForm('applicant-A-job', url, ['case_study'], true);
    assert.equal(selected.case_study?.name, 'study.pdf');
    assert.equal(selected.resume, null);
    assert.equal(selected.cover, null);
    assert.equal((await store.read('applicant-A-job', url)).documents.resume?.name, 'role.pdf');
    assert.equal((await store.read('applicant-A-job', url)).documents.cover?.name, 'letter.pdf');
    const unbound = await store.forCurrentEmployerForm('another-opportunity', url, ['case_study'], true);
    assert.equal(unbound.case_study, null);
    await assert.rejects(store.review('another-opportunity', url, 'case_study', staged.documents.case_study!.sha256), /changed/);
  } finally { await fs.rm(root, {recursive:true,force:true}); }
});
