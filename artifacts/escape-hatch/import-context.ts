/** Explicit agent/operator ingress for connector exports; never fetches or invents credentials. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createTrackerSnapshotFromValues } from './tracker-refresh.ts';
import { userDataRoot } from './user-data.ts';
import { saveWorkspace, readWorkspace } from './workspace-file.ts';
import { parseSavedWorkspace } from './src/lib/workspace-bootstrap.ts';
import { parseWorkspaceExport } from './src/lib/storage.ts';
import { PROFILE_KEY, ANSWERS_KEY, APPLICATIONS_KEY } from './src/lib/storage.ts';

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
  throw new Error('Use workspace or tracker with an explicit validated local artifact.');
}
async function main() {
  const [kind, inputFile] = process.argv.slice(2);
  if (!inputFile) throw new Error('Usage: npm run import:context -- workspace|tracker <private-export.json>');
  if ((await fs.stat(inputFile)).size > 2 * 1024 * 1024) throw new Error('INPUT_TOO_LARGE');
  const result = await importContext(kind, JSON.parse((await fs.readFile(inputFile, 'utf8')).replace(/^\uFEFF/, '')));
  console.log(result + '; private contents omitted');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { console.error('CONTEXT_IMPORT_FAILED: verify the selected artifact and existing source binding. Original data was preserved.'); process.exitCode = 1; });
}
