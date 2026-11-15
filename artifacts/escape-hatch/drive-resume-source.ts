import { createHash } from 'node:crypto';
import path from 'node:path';
import { acquireToken, boundedBytes, readRememberedSources, type RememberedDrivePdf } from './tracker-refresh.ts';
import { OpportunityDocumentStore, documentScope, parseDocumentSource } from './opportunity-documents.ts';
import { readHostWorkspaceOwner } from './workspace-owner-file.ts';
import { readWorkspace } from './workspace-file.ts';
import { APPLICATIONS_KEY, parseApplicationsStorage } from './src/lib/storage.ts';

const retryWithStoredCredential = new Set([401, 403, 404]);
const TIMEOUT_MS = 10_000;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const knownErrors = new Set([
  'DRIVE_SOURCE_CONFIG_INVALID', 'DRIVE_SOURCE_SELECTION_REQUIRED', 'GOOGLE_AUTH_REQUIRED',
  'DRIVE_ACCESS_DENIED', 'DRIVE_FILE_UNAVAILABLE', 'DRIVE_PROVIDER_UNAVAILABLE',
  'DRIVE_PDF_METADATA_INVALID', 'DRIVE_PDF_CONTENT_INVALID', 'DRIVE_PDF_HASH_MISMATCH',
  'DRIVE_SOURCE_CHANGED', 'WORKSPACE_OWNER_REQUIRED', 'SAVED_OPPORTUNITY_REQUIRED',
  'INVALID_DRIVE_RESUME_REQUEST', 'DOCUMENT_STAGE_CONFLICT', 'RESPONSE_TOO_LARGE', 'TIMEOUT',
]);
type Options = { env?: NodeJS.ProcessEnv; fetch?: typeof fetch };

function fail(code: string): never { throw new Error(code); }

export async function driveResumeAvailability(file: string, env = process.env) {
  const [sources, credential] = await Promise.all([readRememberedSources(file), acquireToken(env)]);
  return {
    status: sources.ok ? 'DRIVE_SOURCE_STATUS' : 'DRIVE_SOURCE_CONFIG_INVALID',
    localAuthorization: credential ? 'AVAILABLE_TO_ATTEMPT' : 'NOT_CONFIGURED',
    verifiedAccess: false,
    registeredPdfs: sources.sources.filter(source => source.kind === 'google_drive_pdf').length,
  };
}

async function selectedPdf(file: string, sourceLabel: string) {
  const result = await readRememberedSources(file);
  if (!result.ok) fail('DRIVE_SOURCE_CONFIG_INVALID');
  const choices = result.sources.filter((source): source is RememberedDrivePdf =>
    source.kind === 'google_drive_pdf' && source.label === sourceLabel);
  if (choices.length !== 1) fail('DRIVE_SOURCE_SELECTION_REQUIRED');
  return choices[0];
}

async function drivePdf(source: RememberedDrivePdf, options: Options) {
  const env = options.env ?? process.env;
  const auth = await acquireToken(env);
  if (!auth) fail('GOOGLE_AUTH_REQUIRED');
  const fileId = new URL(source.locator).pathname.split('/')[3];
  const endpoint = new URL('https://www.googleapis.com/drive/v3/files/' + fileId);
  endpoint.searchParams.set('supportsAllDrives', 'true');
  const metadataUrl = new URL(endpoint);
  metadataUrl.searchParams.set('fields', 'id,name,mimeType,modifiedTime,trashed,capabilities(canDownload)');
  endpoint.searchParams.set('alt', 'media');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const request = async (url: URL, token: string, limit: number) => {
    const response = await (options.fetch ?? fetch)(url, {
      method: 'GET', headers: { authorization: 'Bearer ' + token }, redirect: 'error', signal: controller.signal,
    });
    try {
      return { status: response.status, bytes: response.ok ? await boundedBytes(response, controller.signal, limit) : null };
    } finally {
      if (response.body && !response.body.locked && !response.bodyUsed) void response.body.cancel().catch(() => {});
    }
  };
  const requireBytes = ({ status, bytes }: Awaited<ReturnType<typeof request>>) => {
    if (bytes) return bytes;
    if (status === 401) fail('GOOGLE_AUTH_REQUIRED');
    if (status === 403) fail('DRIVE_ACCESS_DENIED');
    if (status === 404) fail('DRIVE_FILE_UNAVAILABLE');
    fail('DRIVE_PROVIDER_UNAVAILABLE');
  };

  try {
    let token = auth.token;
    let result = await request(metadataUrl, token, 32 * 1024);
    if (retryWithStoredCredential.has(result.status) && auth.source === 'TokenCorridor process credential') {
      const stored = await acquireToken(env, false);
      if (stored && stored.token !== token) {
        token = stored.token;
        result = await request(metadataUrl, token, 32 * 1024);
      }
    }
    const metadata = requireBytes(result);
    let item;
    try { item = JSON.parse(metadata.toString('utf8')); }
    catch { fail('DRIVE_PDF_METADATA_INVALID'); }
    if (item?.id !== fileId || item.mimeType !== 'application/pdf' || item.trashed !== false ||
        typeof item.name !== 'string' || !item.name.trim()) fail('DRIVE_PDF_METADATA_INVALID');
    if (item.capabilities?.canDownload !== true) fail('DRIVE_ACCESS_DENIED');
    let provenance;
    try { provenance = parseDocumentSource({ provider: 'google_drive', fileId, modifiedTime: item.modifiedTime }); }
    catch { fail('DRIVE_PDF_METADATA_INVALID'); }

    const buffer = requireBytes(await request(endpoint, token, MAX_PDF_BYTES));
    if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') fail('DRIVE_PDF_CONTENT_INVALID');
    if (createHash('sha256').update(buffer).digest('hex') !== source.expectedSha256) fail('DRIVE_PDF_HASH_MISMATCH');
    const name = /^[A-Za-z0-9_. -]{1,120}\.pdf$/i.test(item.name) ? item.name : 'resume.pdf';
    return { pdf: { name, mimeType: 'application/pdf' as const, buffer }, provenance };
  } catch (error) {
    if (controller.signal.aborted) fail('TIMEOUT');
    if (error instanceof Error && knownErrors.has(error.message)) throw error;
    fail('DRIVE_PROVIDER_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export async function verifyDriveResume(file: string, sourceLabel: string, options: Options = {}) {
  await drivePdf(await selectedPdf(file, sourceLabel), options);
  return 'DRIVE_PDF_VERIFIED';
}

export async function stageDriveResume(root: string, input: unknown, options: Options = {}) {
  const item = input as Record<string, unknown> | null;
  if (!item || Array.isArray(item) ||
      Object.keys(item).sort().join(',') !== 'expectedPreviousSha256,opportunityId,sourceLabel,url' ||
      (item.expectedPreviousSha256 !== null &&
        (typeof item.expectedPreviousSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.expectedPreviousSha256))) ||
      typeof item.sourceLabel !== 'string') fail('INVALID_DRIVE_RESUME_REQUEST');
  const { opportunityId, url } = documentScope(item.opportunityId, item.url);
  const confirmTarget = async () => {
    const owner = await readHostWorkspaceOwner(root);
    if (!owner) fail('WORKSPACE_OWNER_REQUIRED');
    const workspace = await readWorkspace(path.join(root, 'workspace.v1.json'));
    const matches = parseApplicationsStorage(workspace?.workspace.values[APPLICATIONS_KEY] ?? [])
      ?.filter(app => app.id === opportunityId) ?? [];
    const saved = matches[0];
    if (matches.length !== 1 || URL.parse(saved.url)?.href !== url ||
        !['saved', 'preparing'].includes(saved.status) || saved.submissionEvidence ||
        saved.reconciliationConflict) fail('SAVED_OPPORTUNITY_REQUIRED');
    return owner;
  };

  const owner = await confirmTarget();
  const sourceFile = path.join(root, 'career-sources.v1.json');
  const source = await selectedPdf(sourceFile, item.sourceLabel);
  const { pdf, provenance } = await drivePdf(source, options);
  const currentOwner = await confirmTarget();
  if (owner.ownerId !== currentOwner.ownerId || owner.workspaceId !== currentOwner.workspaceId ||
      owner.installationId !== currentOwner.installationId) fail('WORKSPACE_OWNER_REQUIRED');
  const current = await selectedPdf(sourceFile, item.sourceLabel);
  if (source.locator !== current.locator || source.expectedSha256 !== current.expectedSha256) fail('DRIVE_SOURCE_CHANGED');

  const store = new OpportunityDocumentStore(path.join(root, 'opportunity-documents'));
  try {
    const staged = await store.stage(opportunityId, url, 'resume', pdf, provenance, item.expectedPreviousSha256);
    return staged.documents.resume?.reviewedAt ? 'DOCUMENT_ALREADY_REVIEWED' : 'DOCUMENT_STAGED_REVIEW_REQUIRED';
  } catch (error) {
    if (error instanceof Error && knownErrors.has(error.message)) throw error;
    fail('DOCUMENT_STAGE_CONFLICT');
  }
}

export function driveResumeErrorCode(error: unknown) {
  return error instanceof Error && knownErrors.has(error.message) ? error.message : 'DRIVE_RESUME_ACTION_FAILED';
}
