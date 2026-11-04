/** Installed-runtime adapter for the canonical build-generated companion receipt. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function noLinks(file: string) {
  let cursor = path.resolve(file);
  while (true) {
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error('PACKAGE_LINK_FORBIDDEN'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = path.dirname(cursor); if (parent === cursor) return; cursor = parent;
  }
}
async function bytes(file: string, maximum = 16 * 1024 * 1024) {
  await noLinks(file);
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > maximum) throw new Error('PACKAGE_FILE_INVALID');
  return fs.readFile(file);
}
function safeName(name: string) {
  return name.length > 0 && !/[\\:\x00-\x1f<>"|?*]/.test(name) && name.split('/').every(part =>
    part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part));
}
export async function stageShippedCompanion(sourceRoot: string, outputRoot: string) {
  const extension = path.join(sourceRoot, 'browser/application-assist');
  const raw = await bytes(path.join(extension, 'release.json'), 65536);
  const receipt = JSON.parse(raw.toString('utf8'));
  const release = JSON.parse((await bytes(path.join(sourceRoot, 'windows-release.json'), 4 * 1024 * 1024)).toString('utf8'));
  if (receipt.schema !== 'escapehatch/application-assist-package/v1' || release.schema !== 'escapehatch/windows-preview-package/v1' ||
      !/^[a-f0-9]{40,64}$/.test(receipt.sourceCommit) || receipt.sourceCommit !== release.sourceCommit ||
      release.files?.['browser/application-assist/release.json'] !== hash(raw) || !receipt.files || typeof receipt.files !== 'object' || Array.isArray(receipt.files)) throw new Error('SHIPPED_PACKAGE_RECEIPT_INVALID');
  const names = Object.keys(receipt.files);
  if (!names.length || names.length > 256 || !names.includes('manifest.json') || names.some(name => !safeName(name) || name.toLowerCase() === 'release.json') || new Set(names.map(name => name.toLowerCase())).size !== names.length) throw new Error('SHIPPED_PACKAGE_FILES_INVALID');
  const declared = Object.keys(release.files).filter(name => name.startsWith('browser/application-assist/') && name !== 'browser/application-assist/release.json').map(name => name.slice('browser/application-assist/'.length)).sort();
  if (JSON.stringify([...names].sort()) !== JSON.stringify(declared)) throw new Error('SHIPPED_PACKAGE_FILES_INVALID');
  const files = new Map<string, Buffer>(); let total = 0;
  for (const name of names) {
    const value = await bytes(path.join(extension, name)); total += value.length;
    if (total > 16 * 1024 * 1024 || hash(value) !== receipt.files[name] || release.files['browser/application-assist/' + name] !== receipt.files[name]) throw new Error('SHIPPED_PACKAGE_HASH_MISMATCH');
    files.set(name, value);
  }
  const manifest = JSON.parse(files.get('manifest.json')!.toString('utf8'));
  if (manifest.manifest_version !== 3 || manifest.version !== receipt.extensionVersion) throw new Error('SHIPPED_PACKAGE_MANIFEST_INVALID');
  files.set('release.json', raw);
  const destination = path.join(outputRoot, receipt.sourceCommit);
  const verify = async () => {
    await noLinks(destination);
    const found: string[] = [];
    const visit = async (folder: string, prefix = '') => {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        const name = prefix + entry.name;
        if (entry.isSymbolicLink()) throw new Error('PACKAGE_LINK_FORBIDDEN');
        if (entry.isDirectory()) {
          if (![...files.keys()].some(value => value.startsWith(name + '/'))) throw new Error('PACKAGE_COLLISION');
          await visit(path.join(folder, entry.name), name + '/');
        } else if (entry.isFile()) found.push(name); else throw new Error('PACKAGE_COLLISION');
      }
    };
    await visit(destination);
    if (JSON.stringify(found.sort()) !== JSON.stringify([...files.keys()].sort())) throw new Error('PACKAGE_COLLISION');
    for (const [name, value] of files) if (!(await bytes(path.join(destination, name))).equals(value)) throw new Error('PACKAGE_COLLISION');
  };
  await noLinks(outputRoot);
  try { await fs.lstat(destination); await verify(); return receipt.sourceCommit as string; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await fs.mkdir(outputRoot, { recursive: true });
  const temporary = path.join(outputRoot, '.companion-stage-' + randomUUID());
  await fs.mkdir(temporary);
  try {
    for (const [name, value] of files) {
      await fs.mkdir(path.dirname(path.join(temporary, name)), { recursive: true });
      await fs.writeFile(path.join(temporary, name), value, { flag: 'wx' });
    }
    // Never replace an existing immutable package, including an incomplete one.
    let exists = false;
    try { await fs.lstat(destination); exists = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (!exists) await fs.rename(temporary, destination);
    await verify();
    return receipt.sourceCommit as string;
  } finally {
    const relative = path.relative(path.resolve(outputRoot), path.resolve(temporary));
    if (!relative.startsWith('.companion-stage-') || relative.includes(path.sep)) throw new Error('PACKAGE_CLEANUP_SCOPE_INVALID');
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
