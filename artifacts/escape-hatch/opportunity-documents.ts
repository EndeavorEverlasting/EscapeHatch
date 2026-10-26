import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { userDataRoot, legacyPrivateRoots } from './user-data.ts';

export type DocumentKind = 'resume' | 'cover';
export type PrivatePdf = { name: string; mimeType: 'application/pdf'; buffer: Buffer };
export type DocumentRecord = { name: string; sha256: string; size: number; reviewedAt?: string };
export type DocumentPackage = { schema: 'escapehatch/opportunity-documents/v1'; opportunityId: string; url: string; documents: Partial<Record<DocumentKind, DocumentRecord>> };
const defaultRoot = () => path.join(userDataRoot(), 'opportunity-documents');
export function documentScope(opportunityId: unknown, url: unknown) {
  if (typeof opportunityId !== 'string' || !opportunityId.trim() || opportunityId.length > 256 || typeof url !== 'string' || url.length > 2048) throw new Error('Select a saved opportunity for its documents.');
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid document opportunity URL.');
  return { opportunityId, url: parsed.href };
}
export class OpportunityDocumentStore {
  private root: string;
  private migrateLegacy: boolean;
  constructor(root?: string) { this.root = root ?? defaultRoot(); this.migrateLegacy = root === undefined; }
  private directory(id: string, url: string) { return path.join(this.root, createHash('sha256').update(JSON.stringify(documentScope(id, url))).digest('hex')); }
  async read(id: string, url: string): Promise<DocumentPackage> {
    const scope = documentScope(id, url);
    if (this.migrateLegacy) await migrateLegacyDocumentPackage(this.root, legacyPrivateRoots().map(root => path.join(root, 'opportunity-documents')), id, url);
    try {
      const raw = JSON.parse(await fs.readFile(path.join(this.directory(id, url), 'manifest.json'), 'utf8')) as DocumentPackage;
      if (raw.schema !== 'escapehatch/opportunity-documents/v1' || raw.opportunityId !== scope.opportunityId || raw.url !== scope.url || !raw.documents) throw new Error();
      for (const kind of ['resume', 'cover'] as const) {
        const item = raw.documents[kind];
        if (item && (!/^[a-f0-9]{64}$/.test(item.sha256) || typeof item.name !== 'string' || !Number.isInteger(item.size) || item.size <= 0 || item.size > 5 * 1024 * 1024 || (item.reviewedAt !== undefined && Number.isNaN(Date.parse(item.reviewedAt))))) throw new Error();
      }
      return raw;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schema: 'escapehatch/opportunity-documents/v1', ...scope, documents: {} };
      throw new Error('Private document package could not be read. Existing files preserved.');
    }
  }
  private async write(value: DocumentPackage) {
    const directory = this.directory(value.opportunityId, value.url);
    await fs.mkdir(directory, { recursive: true });
    const temp = path.join(directory, randomUUID() + '.tmp');
    try { await fs.writeFile(temp, JSON.stringify(value), { flag: 'wx', mode: 0o600 }); await fs.rename(temp, path.join(directory, 'manifest.json')); }
    finally { await fs.rm(temp, { force: true }); }
  }
  async stage(id: string, url: string, kind: DocumentKind, file: PrivatePdf) {
    if (!['resume', 'cover'].includes(kind) || file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-' || file.buffer.length > 5 * 1024 * 1024 || !/^[A-Za-z0-9_. -]{1,120}\.pdf$/i.test(file.name)) throw new Error('Invalid document.');
    const value = await this.read(id, url), sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const directory = this.directory(id, url); await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, sha256 + '.pdf'), file.buffer, { mode: 0o600 });
    const prior = value.documents[kind];
    value.documents[kind] = { name: file.name, sha256, size: file.buffer.length, ...(prior?.sha256 === sha256 && prior.reviewedAt ? { reviewedAt: prior.reviewedAt } : {}) };
    await this.write(value); return value;
  }
  async file(id: string, url: string, kind: DocumentKind): Promise<PrivatePdf | null> {
    const value = await this.read(id, url), record = value.documents[kind];
    if (!record) return null;
    const buffer = await fs.readFile(path.join(this.directory(id, url), record.sha256 + '.pdf'));
    if (createHash('sha256').update(buffer).digest('hex') !== record.sha256 || buffer.length !== record.size) throw new Error('Document content changed; choose and review the current file.');
    return { name: record.name, mimeType: 'application/pdf', buffer };
  }
  async review(id: string, url: string, kind: DocumentKind, sha256: unknown) {
    const value = await this.read(id, url), record = value.documents[kind];
    if (!record || record.sha256 !== sha256) throw new Error('The document changed. Review the current version.');
    await this.file(id, url, kind);
    record.reviewedAt = new Date().toISOString(); await this.write(value); return value;
  }
  async forUpload(id: string, url: string, requireReview = true) {
    const value = await this.read(id, url);
    if (!value.documents.resume && !value.documents.cover) throw new Error('Save documents for this opportunity first.');
    if (requireReview && Object.values(value.documents).some(item => !item.reviewedAt)) throw new Error('Document review required before upload.');
    return { resume: await this.file(id, url, 'resume'), cover: await this.file(id, url, 'cover'), reviewPolicy: requireReview ? 'operator_confirmed_review' : 'review_disabled_by_operator' };
  }
}

/** Migrate only the requested, fully hash-verified package; preserve divergent legacy copies. */
export async function migrateLegacyDocumentPackage(destination: string, legacyRoots: string[], id: string, url: string) {
  const scope = documentScope(id, url);
  const key = createHash('sha256').update(JSON.stringify(scope)).digest('hex');
  const target = path.join(destination, key);
  try { await fs.access(path.join(target, 'manifest.json')); return; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const candidates: { manifest: DocumentPackage; files: PrivatePdf[] }[] = [];
  for (const root of [...new Set(legacyRoots.map(value => path.resolve(value)))]) {
    if (path.resolve(root) === path.resolve(destination)) continue;
    const old = new OpportunityDocumentStore(root);
    const manifest = await old.read(id, url);
    if (!Object.keys(manifest.documents).length) continue;
    const files: PrivatePdf[] = [];
    for (const kind of ['resume', 'cover'] as const) {
      const file = await old.file(id, url, kind);
      if (file) files.push(file);
    }
    candidates.push({ manifest, files });
  }
  if (!candidates.length) return;
  if (candidates.some(value => JSON.stringify(value.manifest) !== JSON.stringify(candidates[0].manifest))) throw new Error('Different legacy document packages need review. All original files were preserved.');
  await fs.mkdir(destination, { recursive: true });
  const temporary = path.resolve(destination, '.migration-' + randomUUID());
  await fs.mkdir(temporary);
  try {
    const written = new Set<string>();
    for (const file of candidates[0].files) {
      const digest = createHash('sha256').update(file.buffer).digest('hex');
      if (written.has(digest)) continue;
      await fs.writeFile(path.join(temporary, digest + '.pdf'), file.buffer, { flag: 'wx', mode: 0o600 });
      written.add(digest);
    }
    await fs.writeFile(path.join(temporary, 'manifest.json'), JSON.stringify(candidates[0].manifest), { flag: 'wx', mode: 0o600 });
    try { await fs.rename(temporary, target); }
    catch (error) { try { await fs.access(path.join(target, 'manifest.json')); } catch { throw error; } }
  } finally {
    if (path.dirname(temporary) !== path.resolve(destination)) throw new Error('Invalid migration cleanup path.');
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
