import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
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
export async function saveWorkspace(input: unknown, expectedRevision: string | null, file = workspaceFile(), recoverInvalid = false) {
  const workspace = parseSavedWorkspace(input);
  if (!workspace || Buffer.byteLength(JSON.stringify(workspace)) > MAX_WORKSPACE_BYTES) throw new Error('Invalid workspace. Existing data was preserved.');
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Exclusive cross-process lock: separate worktrees must not race the same user store.
  const lock = file + '.lock';
  let handle;
  try { handle = await fs.open(lock, 'wx', 0o600); }
  catch { throw new Error('Workspace is busy. Retry after the other save finishes.'); }
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
    if (prior) await fs.copyFile(file, file + '.previous');
    await fs.writeFile(temporary, JSON.stringify({ schema: WORKSPACE_SCHEMA, values: workspace.values }), { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
    return { workspace, revision: workspaceRevision(workspace) };
  } finally {
    await fs.rm(temporary, { force: true });
    await handle.close();
    await fs.rm(lock, { force: true });
  }
}
