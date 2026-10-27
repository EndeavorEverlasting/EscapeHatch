/** Explicit agent/operator ingress for connector exports; never fetches or invents credentials. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createTrackerSnapshotFromValues } from './tracker-refresh.ts';
import { userDataRoot } from './user-data.ts';
import { saveWorkspace, readWorkspace } from './workspace-file.ts';
import { parseSavedWorkspace } from './src/lib/workspace-bootstrap.ts';
import { parseWorkspaceExport } from './src/lib/storage.ts';
import { PROFILE_KEY, ANSWERS_KEY, APPLICATIONS_KEY } from './src/lib/storage.ts';
import { OpportunityDocumentStore, documentScope, parseDocumentSource } from './opportunity-documents.ts';

async function atomicPrivateCopy(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    try { await fs.copyFile(file, file + '.previous'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await fs.writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}
export async function importContext(kind: string, input: unknown, destination = userDataRoot()) {
  if (kind === 'document') {
    const item = input as Record<string, unknown>;
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).sort().join(',') !== 'expectedPreviousSha256,expectedSha256,filePath,kind,name,opportunityId,source,url' ||
        !['resume', 'cover'].includes(String(item.kind)) || typeof item.filePath !== 'string' || !path.isAbsolute(item.filePath) ||
        typeof item.name !== 'string' || typeof item.expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.expectedSha256) ||
        (item.expectedPreviousSha256 !== null && (typeof item.expectedPreviousSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.expectedPreviousSha256)))) throw new Error('INVALID_DOCUMENT_EXPORT');
    const source = parseDocumentSource(item.source);
    const scope = documentScope(item.opportunityId, item.url);
    if ((await fs.lstat(item.filePath)).isSymbolicLink()) throw new Error('SELECT_REGULAR_DOCUMENT_FILE');
    // Reject oversized/non-file inputs before reading. Hash the same bounded bytes staged.
    const handle = await fs.open(item.filePath, 'r');
    let buffer: Buffer;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || !stat.size || stat.size > 5 * 1024 * 1024) throw new Error('INVALID_DOCUMENT_SIZE');
      buffer = Buffer.alloc(stat.size + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const result = await handle.read(buffer, offset, buffer.length - offset, null);
        if (!result.bytesRead) break;
        offset += result.bytesRead;
      }
      if (offset !== stat.size) throw new Error('DOCUMENT_CHANGED_DURING_READ');
      buffer = buffer.subarray(0, offset);
    } finally { await handle.close(); }
    if (createHash('sha256').update(buffer).digest('hex') !== item.expectedSha256) throw new Error('DOCUMENT_HASH_MISMATCH');
    await new OpportunityDocumentStore(path.join(destination, 'opportunity-documents')).stage(scope.opportunityId, scope.url,
      item.kind as 'resume' | 'cover', { name: item.name, mimeType: 'application/pdf', buffer }, source, item.expectedPreviousSha256 as string | null);
    return 'DOCUMENT_STAGED_REVIEW_REQUIRED';
  }
  if (kind === 'workspace') {
    let workspace = parseSavedWorkspace(input);
    if (!workspace) {
      const parsed = parseWorkspaceExport(input);
      if (!parsed.ok) throw new Error('INVALID_WORKSPACE');
      workspace = { schema: 'escapehatch-local-workspace/v1', values: { [PROFILE_KEY]: parsed.workspace.profile, [ANSWERS_KEY]: parsed.workspace.answers, [APPLICATIONS_KEY]: parsed.workspace.applications } };
    }
    const file = path.join(destination, 'workspace.v1.json');
    const prior = await readWorkspace(file);
    if (prior && JSON.stringify(prior.workspace) !== JSON.stringify(workspace)) throw new Error('WORKSPACE_EXISTS_REVIEW_IN_APP');
    await saveWorkspace(workspace, prior?.revision ?? null, file);
    return 'WORKSPACE_IMPORTED';
  }
  if (kind === 'tracker') {
    const item = input as { values?: unknown; target?: { spreadsheetId: string; sheetName: string }; capturedAt?: string; provenance?: string };
    if (!item || !item.target || item.provenance !== 'connected_provider_read' || !item.capturedAt || Date.parse(item.capturedAt) > Date.now() + 60000) throw new Error('INVALID_PROVIDER_EXPORT');
    const snapshot = createTrackerSnapshotFromValues(item.values, item.target, 'connected_provider_read_then_private_cache', new Date(item.capturedAt));
    snapshot.localGoogleAuthPresent = false;
    const file = path.join(destination, 'tracker-snapshot.v1.json');
    try {
      const prior = JSON.parse(await fs.readFile(file, 'utf8'));
      if (prior.spreadsheetId !== snapshot.spreadsheetId || prior.sheetName !== snapshot.sheetName) throw new Error('TRACKER_BINDING_CONFLICT');
      if (Date.parse(prior.capturedAtUtc) > Date.parse(snapshot.capturedAtUtc)) throw new Error('OLDER_PROVIDER_EXPORT');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await atomicPrivateCopy(file, snapshot);
    return 'TRACKER_IMPORTED';
  }
  throw new Error('Use workspace, tracker or document with an explicit validated local artifact.');
}
async function main() {
  const [kind, inputFile] = process.argv.slice(2);
  if (!inputFile) throw new Error('Usage: npm run import:context -- workspace|tracker|document <private-export.json>');
  if ((await fs.stat(inputFile)).size > 2 * 1024 * 1024) throw new Error('INPUT_TOO_LARGE');
  const result = await importContext(kind, JSON.parse((await fs.readFile(inputFile, 'utf8')).replace(/^\uFEFF/, '')));
  console.log(result + '; private contents omitted');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { console.error('CONTEXT_IMPORT_FAILED: verify the selected artifact and existing source binding. Original data was preserved.'); process.exitCode = 1; });
}
