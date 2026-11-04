/** One host-owned identity record for the installed workspace and optional companion. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { parsePairing } from './src/lib/extension-pairing.ts';
import { userDataRoot } from './user-data.ts';
import { readWorkspace } from './workspace-file.ts';
import { hasContext } from './src/lib/workspace-bootstrap.ts';
import { OWNER_BINDING_SCHEMA, parseWorkspaceOwnerBinding, type WorkspaceOwnerBinding } from './src/lib/workspace-owner-binding.ts';

async function noLinks(file: string) {
  let current = path.resolve(file);
  while (true) {
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('OWNER_PATH_LINK_FORBIDDEN'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = path.dirname(current); if (parent === current) return; current = parent;
  }
}
async function readJson(file: string): Promise<unknown | null> {
  await noLinks(file);
  try {
    if ((await fs.stat(file)).size > 65536) throw new Error('OWNER_RECORD_INVALID');
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('OWNER_RECORD_INVALID'); }
}
/** Metadata only. An extension's absence is not an absence of host ownership. */
export async function readHostWorkspaceOwner(root = userDataRoot()): Promise<WorkspaceOwnerBinding | null> {
  const value = await readJson(path.join(root, 'workspace-owner-binding.v1.json'));
  const envelope = await readJson(path.join(root, 'extension-native-pairing.v1.json'));
  const paired = envelope === null ? null : parsePairing(envelope);
  if (envelope !== null && !paired) throw new Error('OWNER_RECORD_INVALID');
  if (value === null) return null;
  const binding = parseWorkspaceOwnerBinding(value);
  if (!binding) throw new Error('OWNER_RECORD_INVALID');
  if (paired && !same(binding, paired.binding)) throw new Error('OWNER_CONTEXT_CONFLICT');
  return binding;
}
function same(left: WorkspaceOwnerBinding, right: WorkspaceOwnerBinding) {
  return left.ownerId === right.ownerId && left.workspaceId === right.workspaceId && left.installationId === right.installationId;
}

/** Explicit selection of the current installed workspace; never approval of its facts/documents. */
export async function selectHostWorkspace(expectedRevision: string, root = userDataRoot(), companionBinding?: WorkspaceOwnerBinding) {
  if (!/^[a-f0-9]{64}$/.test(expectedRevision)) throw new Error('WORKSPACE_REVISION_REQUIRED');
  await noLinks(root);
  const workspaceFile = path.join(root, 'workspace.v1.json');
  await noLinks(workspaceFile);
  for (const suffix of ['', '-journal', '-wal', '-shm']) await noLinks(workspaceFile + '.lock.sqlite' + suffix);
  const lock = new DatabaseSync(workspaceFile + '.lock.sqlite');
  let acquired = false;
  let temporary: string | undefined;
  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      try { lock.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); acquired = true; break; }
      catch { if (attempt === 9) throw new Error('WORKSPACE_BUSY'); await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1))); }
    }
    const source = await readWorkspace(workspaceFile);
    if (!source || source.revision !== expectedRevision) throw new Error('WORKSPACE_REVISION_CHANGED');
    if (!hasContext(source.workspace.values)) throw new Error('WORKSPACE_CONTEXT_REQUIRED');
    const prior = await readHostWorkspaceOwner(root);
    // Recover the existing native owner's IDs; never invent a second identity for it.
    const pairing = await readJson(path.join(root, 'extension-native-pairing.v1.json'));
    const parsedPairing = pairing === null ? null : parsePairing(pairing);
    if (pairing !== null && !parsedPairing) throw new Error('OWNER_RECORD_INVALID');
    const paired = parsedPairing?.binding;
    if (companionBinding && !parseWorkspaceOwnerBinding(companionBinding)) throw new Error('OWNER_RECORD_INVALID');
    const candidates = [prior, paired, companionBinding].filter((value): value is WorkspaceOwnerBinding => Boolean(value));
    if (candidates.some(value => !same(value, candidates[0]))) throw new Error('OWNER_CONTEXT_CONFLICT');
    const binding = candidates[0] ?? { schema: OWNER_BINDING_SCHEMA, ownerId: randomUUID(), workspaceId: randomUUID(),
      installationId: randomUUID(), boundAt: new Date().toISOString(), selection: 'applicant-confirmed' as const };
    if (!prior) {
      const destination = path.join(root, 'workspace-owner-binding.v1.json');
      temporary = destination + '.' + randomUUID() + '.tmp';
      await fs.writeFile(temporary, JSON.stringify(binding), { flag: 'wx', mode: 0o600 });
      await fs.link(temporary, destination); await fs.unlink(temporary); temporary = undefined;
    }
    const readback = await readHostWorkspaceOwner(root);
    if (!readback || !same(binding, readback)) throw new Error('OWNER_READBACK_REQUIRED');
    return { binding: readback, workspaceRevision: source.revision, factsApproved: false as const, documentsApproved: false as const };
  } finally {
    if (temporary) await fs.rm(temporary, { force: true });
    try { if (acquired) lock.exec('ROLLBACK'); } finally { lock.close(); }
  }
}


/** Called only after an authenticated, explicit preparation action. */
export async function selectInstalledHostWorkspace(root = userDataRoot()) {
  const source = await readWorkspace(path.join(root, 'workspace.v1.json'));
  if (!source) throw new Error('Saved workspace recovery is required before private preparation.');
  return selectHostWorkspace(source.revision, root);
}
