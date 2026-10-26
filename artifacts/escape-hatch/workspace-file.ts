import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { userDataRoot } from './user-data.ts';
import { parseSavedWorkspace, WORKSPACE_SCHEMA, type SavedWorkspace } from './src/lib/workspace-bootstrap.ts';

export const MAX_WORKSPACE_BYTES = 2 * 1024 * 1024;
export function workspaceFile() { return path.join(userDataRoot(), 'workspace.v1.json'); }
export function workspaceRevision(workspace: SavedWorkspace) { return createHash('sha256').update(JSON.stringify(workspace)).digest('hex'); }
export async function readWorkspace(file = workspaceFile()): Promise<{ workspace: SavedWorkspace; revision: string } | null> {
  try {
    if ((await fs.stat(file)).size > MAX_WORKSPACE_BYTES) throw new Error('oversized');
    const raw = await fs.readFile(file);
    if (raw.length > MAX_WORKSPACE_BYTES) throw new Error('oversized');
    const workspace = parseSavedWorkspace(JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')));
    if (!workspace) throw new Error('invalid');
    return { workspace, revision: workspaceRevision(workspace) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('Private workspace needs recovery. The existing file was preserved.');
  }
}
export async function saveWorkspace(input: unknown, expectedRevision: string | null, file = workspaceFile(), recoverInvalid = false, archivePrior = false) {
  const workspace = parseSavedWorkspace(input);
  if (!workspace || Buffer.byteLength(JSON.stringify(workspace)) > MAX_WORKSPACE_BYTES) throw new Error('Invalid workspace. Existing data was preserved.');
  await fs.mkdir(path.dirname(file), { recursive: true });
  // SQLite is used only for an OS-backed cross-process lock, never as a second
  // workspace database. Process exit/crash releases it; no stale marker deletion.
  const lock = new DatabaseSync(file + '.lock.sqlite');
  try { lock.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); }
  catch { lock.close(); throw new Error('Workspace is busy. Retry after the other save finishes.'); }
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    let prior;
    try { prior = await readWorkspace(file); }
    catch (error) {
      if (!recoverInvalid || expectedRevision !== null) throw error;
      // Explicit recovery import archives unreadable bytes before replacing the active copy.
      await fs.copyFile(file, file + '.recovery-' + randomUUID());
      prior = null;
    }
    if ((prior?.revision ?? null) !== expectedRevision) throw new Error('WORKSPACE_CONFLICT');
    // A deliberate conflict choice must retain the displaced copy independently
    // of rolling autosave backups, under the same revision check and OS lock.
    if (prior && archivePrior) await fs.copyFile(file, file + '.conflict-' + randomUUID(), constants.COPYFILE_EXCL);
    if (prior) await fs.copyFile(file, file + '.previous');
    await fs.writeFile(temporary, JSON.stringify({ schema: WORKSPACE_SCHEMA, values: workspace.values }), { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
    return { workspace, revision: workspaceRevision(workspace) };
  } finally {
    try { await fs.rm(temporary, { force: true }); }
    finally { try { lock.exec('ROLLBACK'); } finally { lock.close(); } }
  }
}
