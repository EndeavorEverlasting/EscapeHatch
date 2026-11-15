import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { importContext } from './import-context.ts';
import { driveResumeAvailability, driveResumeErrorCode, stageDriveResume, verifyDriveResume } from './drive-resume-source.ts';
import { selectHostWorkspace } from './workspace-owner-file.ts';
import { saveWorkspace } from './workspace-file.ts';
import { APPLICATIONS_KEY } from './src/lib/storage.ts';
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

const driveId = 'synthetic_drive_pdf';
const pdf = Buffer.from('%PDF-1.4\nsynthetic registered resume');
const pdfDigest = createHash('sha256').update(pdf).digest('hex');
const source = { kind: 'google_drive_pdf', label: 'Approved resume', locator: 'https://drive.google.com/file/d/' + driveId + '/view', expectedSha256: pdfDigest };
const driveMetadata = { id: driveId, name: 'approved.pdf', mimeType: 'application/pdf', trashed: false,
  capabilities: { canDownload: true }, modifiedTime: '2026-01-01T00:00:00Z' };
const request = { opportunityId: 'saved-job', url: 'https://jobs.example.test/apply', sourceLabel: source.label, expectedPreviousSha256: null };

async function driveFixture(run: (root: string, file: string, env: NodeJS.ProcessEnv) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-drive-resume-'));
  const file = path.join(root, 'career-sources.v1.json');
  try {
    await fs.writeFile(file, JSON.stringify({ schema: 'escapehatch-career-sources/v1', sources: [source] }));
    await run(root, file, { LOCALAPPDATA: root, TOKEN_CORRIDOR_GOOGLE_TOKEN: 'synthetic-secret' });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

function driveFetcher(overrides: { metadata?: object; bytes?: Buffer; status?: number } = {}): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://www.googleapis.com');
    assert.equal(url.pathname, '/drive/v3/files/' + driveId);
    assert.equal(url.searchParams.get('supportsAllDrives'), 'true');
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer synthetic-secret');
    if (overrides.status) return new Response('provider response with private details', { status: overrides.status });
    return url.searchParams.get('alt') === 'media'
      ? new Response(new Uint8Array(overrides.bytes ?? pdf))
      : Response.json(overrides.metadata ?? driveMetadata);
  };
}

test('registered Drive PDF proves exact bytes without creating application state', async () => driveFixture(async (root, file, env) => {
  const status = await driveResumeAvailability(file, env);
  assert.deepEqual(status, { status: 'DRIVE_SOURCE_STATUS', localAuthorization: 'AVAILABLE_TO_ATTEMPT', verifiedAccess: false, registeredPdfs: 1 });
  assert.equal(await verifyDriveResume(file, source.label, { env, fetch: driveFetcher() }), 'DRIVE_PDF_VERIFIED');
  assert.deepEqual(await fs.readdir(root), ['career-sources.v1.json']);
}));

test('temporary credential rejection recovers a different existing host credential', async () => driveFixture(async (root, file, env) => {
  const folder = path.join(root, 'TokenCorridor', 'connectors');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'google.json'), JSON.stringify({ access_token: 'synthetic-secret' }));
  const injected = { ...env, TOKEN_CORRIDOR_GOOGLE_TOKEN: 'synthetic-expired' };
  const accepted = driveFetcher();
  let attempts = 0;
  const fetcher: typeof fetch = async (input, init) => {
    attempts += 1;
    if (attempts === 1) {
      assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer synthetic-expired');
      return new Response(null, { status: 401 });
    }
    return accepted(input, init);
  };
  assert.equal(await verifyDriveResume(file, source.label, { env: injected, fetch: fetcher }), 'DRIVE_PDF_VERIFIED');
  assert.equal(attempts, 3);
}));

test('Drive authorization, exact identity, and digest failures remain distinct and redacted', async () => driveFixture(async (root, file, env) => {
  await assert.rejects(verifyDriveResume(file, source.label, { env: { LOCALAPPDATA: root },
    fetch: async () => assert.fail('no request without local authorization') }), /^Error: GOOGLE_AUTH_REQUIRED$/);
  for (const [fetcher, code] of [
    [driveFetcher({ status: 401 }), 'GOOGLE_AUTH_REQUIRED'],
    [driveFetcher({ status: 403 }), 'DRIVE_ACCESS_DENIED'],
    [driveFetcher({ status: 404 }), 'DRIVE_FILE_UNAVAILABLE'],
    [driveFetcher({ status: 429 }), 'DRIVE_PROVIDER_UNAVAILABLE'],
    [driveFetcher({ metadata: { ...driveMetadata, id: 'same_name_wrong_identity' } }), 'DRIVE_PDF_METADATA_INVALID'],
    [driveFetcher({ metadata: { ...driveMetadata, trashed: true } }), 'DRIVE_PDF_METADATA_INVALID'],
    [driveFetcher({ metadata: { ...driveMetadata, capabilities: { canDownload: false } } }), 'DRIVE_ACCESS_DENIED'],
    [driveFetcher({ bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }), 'RESPONSE_TOO_LARGE'],
    [driveFetcher({ bytes: Buffer.from('<html>not a PDF</html>') }), 'DRIVE_PDF_CONTENT_INVALID'],
    [driveFetcher({ bytes: Buffer.from('%PDF-1.4\ndifferent bytes') }), 'DRIVE_PDF_HASH_MISMATCH'],
    [async () => { throw new Error('private token or URL'); }, 'DRIVE_PROVIDER_UNAVAILABLE'],
  ] as const) {
    await assert.rejects(verifyDriveResume(file, source.label, { env, fetch: fetcher }), error => {
      assert.equal(driveResumeErrorCode(error), code);
      assert.equal(String(error), 'Error: ' + code);
      return true;
    });
  }
}));

test('PDF staging rechecks ownership and source after the fetch and preserves reviewed documents', async () => driveFixture(async (root, file, env) => {
  const store = new OpportunityDocumentStore(path.join(root, 'opportunity-documents'));
  const workspaceFile = path.join(root, 'workspace.v1.json');
  const application = { id: request.opportunityId, url: request.url, status: 'saved',
    company: 'Synthetic Company', role: 'Synthetic Role', priority: 'normal', notes: '', nextAction: '', updatedAt: '2026-01-01' };
  const workspace = { schema: 'escapehatch-local-workspace/v1', values: { [APPLICATIONS_KEY]: [application] } };
  const saved = await saveWorkspace(workspace, null, workspaceFile);
  await assert.rejects(stageDriveResume(root, request, { env, fetch: async () => assert.fail('before owner binding') }), /WORKSPACE_OWNER_REQUIRED/);
  await selectHostWorkspace(saved.revision, root);
  await assert.rejects(stageDriveResume(root, { ...request, url: 'https://jobs.example.test/different' },
    { env, fetch: async () => assert.fail('before exact opportunity match') }), /SAVED_OPPORTUNITY_REQUIRED/);
  const fetcher = driveFetcher();
  const changedDuringRead: typeof fetch = async (input, init) => {
    if (new URL(String(input)).searchParams.get('alt') === 'media') {
      await fs.writeFile(file, JSON.stringify({ schema: 'escapehatch-career-sources/v1', sources: [{ ...source, expectedSha256: '1'.repeat(64) }] }));
    }
    return fetcher(input, init);
  };
  await assert.rejects(stageDriveResume(root, request, { env, fetch: changedDuringRead }), /DRIVE_SOURCE_CHANGED/);
  assert.deepEqual((await store.read(request.opportunityId, request.url)).documents, {});
  await fs.writeFile(file, JSON.stringify({ schema: 'escapehatch-career-sources/v1', sources: [source] }));
  assert.equal(await stageDriveResume(root, request, { env, fetch: fetcher }), 'DOCUMENT_STAGED_REVIEW_REQUIRED');
  await assert.rejects(store.forUpload(request.opportunityId, request.url), /review required/);
  await store.review(request.opportunityId, request.url, 'resume', pdfDigest);
  assert.equal(await stageDriveResume(root, request, { env, fetch: fetcher }), 'DOCUMENT_ALREADY_REVIEWED');
  const previous = await store.read(request.opportunityId, request.url);
  await assert.rejects(stageDriveResume(root, request, { env, fetch: driveFetcher({ bytes: Buffer.from('%PDF-1.4\nother') }) }), /HASH_MISMATCH/);
  assert.deepEqual(await store.read(request.opportunityId, request.url), previous);
}));

test('source lookup never chooses between duplicate labels or accepts embedded credentials', async () => driveFixture(async (_root, file, env) => {
  const fetcher: typeof fetch = async () => assert.fail('invalid lookup must not send a request');
  await fs.writeFile(file, JSON.stringify({ schema: 'escapehatch-career-sources/v1', sources: [source, source] }));
  await assert.rejects(verifyDriveResume(file, source.label, { env, fetch: fetcher }), /DRIVE_SOURCE_SELECTION_REQUIRED/);
  for (const altered of [{ ...source, locator: source.locator + '?token=synthetic-secret' }, { ...source, token: 'synthetic-secret' }]) {
    await fs.writeFile(file, JSON.stringify({ schema: 'escapehatch-career-sources/v1', sources: [altered] }));
    await assert.rejects(verifyDriveResume(file, source.label, { env, fetch: fetcher }), /DRIVE_SOURCE_CONFIG_INVALID/);
  }
}));
