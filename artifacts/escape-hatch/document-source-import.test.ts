import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { importContext } from './import-context.ts';
import { OpportunityDocumentStore, parseDocumentSource } from './opportunity-documents.ts';

test('local and connector PDF exports share scoped byte review, conflict protection and restart recovery', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-source-ingress-'));
  const filePath = path.join(root, 'selected.pdf'), destination = path.join(root, 'data');
  const buffer = Buffer.from('%PDF-1.4\nsynthetic source');
  const input = { opportunityId: 'synthetic', url: 'https://jobs.example.test/one', kind: 'resume', filePath,
    name: 'selected.pdf', expectedSha256: createHash('sha256').update(buffer).digest('hex'), expectedPreviousSha256: null,
    source: { provider: 'google_drive', fileId: 'synthetic_drive_file', modifiedTime: '2026-01-01T00:00:00Z' } };
  const store = new OpportunityDocumentStore(path.join(destination, 'opportunity-documents'));
  try {
    await fs.writeFile(filePath, buffer);
    assert.equal(await importContext('document', input, destination), 'DOCUMENT_STAGED_REVIEW_REQUIRED');
    const saved = await store.read(input.opportunityId, input.url);
    assert.deepEqual(saved.documents.resume?.source, input.source);
    await assert.rejects(store.forUpload(input.opportunityId, input.url), /review required/);
    await store.review(input.opportunityId, input.url, 'resume', input.expectedSha256);
    await importContext('document', input, destination);
    assert.ok((await store.read(input.opportunityId, input.url)).documents.resume?.reviewedAt);
    assert.deepEqual((await store.forUpload(input.opportunityId, input.url)).resume?.buffer, buffer);
    await assert.rejects(store.forUpload('other', input.url), /Save documents/);
    const before = await store.read(input.opportunityId, input.url);
    await assert.rejects(importContext('document', { ...input, expectedSha256: '0'.repeat(64) }, destination), /HASH_MISMATCH/);
    await assert.rejects(importContext('document', { ...input, source: { ...input.source, downloadUrl: 'https://example.test/token' } }, destination), /Invalid document source/);
    assert.deepEqual(await store.read(input.opportunityId, input.url), before);
    const changed = Buffer.from('%PDF-1.4\nchanged source');
    await fs.writeFile(filePath, changed);
    const next = { ...input, expectedSha256: createHash('sha256').update(changed).digest('hex'), source: { provider: 'local' } };
    await assert.rejects(importContext('document', next, destination), /package changed/);
    await importContext('document', { ...next, expectedPreviousSha256: input.expectedSha256 }, destination);
    await assert.rejects(store.forUpload(input.opportunityId, input.url), /review required/);
    await assert.rejects(store.file(input.opportunityId, input.url, 'resume', input.expectedSha256), /Document changed/);
    assert.deepEqual((await store.file(input.opportunityId, input.url, 'resume', next.expectedSha256))?.buffer, changed);
    assert.deepEqual((await store.read(input.opportunityId, input.url)).documents.resume?.source, { provider: 'local' });
    await assert.rejects(importContext('document', { ...input, filePath: root }, destination), /INVALID_DOCUMENT_SIZE/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('document source metadata cannot carry credentials or untrusted links', () => {
  for (const source of [null, [], { provider: 'local', token: 'synthetic' },
    { provider: 'google_drive', fileId: 'https://drive.google.com.evil.test/file', modifiedTime: '2026-01-01' },
    { provider: 'google_drive', fileId: 'synthetic_file', modifiedTime: 'invalid' },
    { provider: 'google_drive', fileId: 'synthetic_file', modifiedTime: '2999-01-01' }]) assert.throws(() => parseDocumentSource(source));
});

test('independent processes cannot lose a document slot or race a review', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-document-lock-'));
  const first = new OpportunityDocumentStore(root), second = new OpportunityDocumentStore(root);
  const id = 'synthetic', url = 'https://jobs.example.test/concurrent';
  const pdf = (name: string) => ({ name, mimeType: 'application/pdf' as const, buffer: Buffer.from('%PDF-1.4\n' + name) });
  try {
    const results = await Promise.allSettled([first.stage(id, url, 'resume', pdf('resume.pdf')), second.stage(id, url, 'cover', pdf('cover.pdf'))]);
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
    assert.match(String((results.find(item => item.status === 'rejected') as PromiseRejectedResult).reason), /busy/);
    for (const kind of ['resume', 'cover'] as const) await first.stage(id, url, kind, pdf(kind + '.pdf'));
    assert.equal(Object.keys((await second.read(id, url)).documents).length, 2);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('upload approval cannot race an external replacement into returning unreviewed bytes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-document-upload-race-'));
  const reader = new OpportunityDocumentStore(root), writer = new OpportunityDocumentStore(root);
  const id = 'synthetic', url = 'https://jobs.example.test/upload-race';
  const pdf = (text: string) => ({ name: 'resume.pdf', mimeType: 'application/pdf' as const, buffer: Buffer.from('%PDF-1.4\n' + text) });
  let release!: () => void, observed!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const checkpoint = new Promise<void>(resolve => { observed = resolve; });
  try {
    const saved = await reader.stage(id, url, 'resume', pdf('approved'));
    await reader.review(id, url, 'resume', saved.documents.resume!.sha256);
    const originalRead = reader.read.bind(reader);
    let pause = true;
    reader.read = async (...args) => {
      const snapshot = await originalRead(...args);
      if (pause) { pause = false; observed(); await gate; }
      return snapshot;
    };
    const upload = reader.forUpload(id, url);
    await checkpoint;
    await assert.rejects(writer.stage(id, url, 'resume', pdf('unreviewed')), /busy/);
    release();
    assert.deepEqual((await upload).resume?.buffer, pdf('approved').buffer);
    await writer.stage(id, url, 'resume', pdf('unreviewed'));
    await assert.rejects(reader.forUpload(id, url), /review required/);
  } finally { release(); await fs.rm(root, { recursive: true, force: true }); }
});
