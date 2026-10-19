import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OpportunityDocumentStore } from './opportunity-documents.ts';
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
    const [directory] = await fs.readdir(root);
    await fs.writeFile(path.join(root, directory, value.documents.resume!.sha256 + '.pdf'), '%PDF-mutated');
    await assert.rejects(store.forUpload(id, url, false), /content changed/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
