import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { stageCompanionPackage, inspectCompanion } from './extension-host-control.ts';

const source = path.resolve(import.meta.dirname, '../..');
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-companion-test-'));
  const chrome = path.join(root, 'Chrome'), loaded = path.join(root, 'loaded');
  await fs.mkdir(path.join(chrome, 'Default'), { recursive: true }); await fs.mkdir(loaded);
  const manifest = JSON.parse(await fs.readFile(path.join(source, 'browser/application-assist/manifest.json'), 'utf8'));
  const hex = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
  const id = [...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
  await fs.writeFile(path.join(chrome, 'Local State'), JSON.stringify({ profile: { last_used: 'Default' } }));
  const prefs = JSON.stringify({ extensions: { settings: { [id]: { path: loaded, location: 4 } } } });
  await fs.writeFile(path.join(chrome, 'Default', 'Preferences'), prefs);
  for (const name of ['manifest.json', 'worker.js', 'popup.html', 'native-profile-bridge.js']) await fs.copyFile(path.join(source, 'browser/application-assist', name), path.join(loaded, name));
  return { root, chrome, loaded, prefs, async cleanup() {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'eh-companion-test-')) throw new Error('unsafe fixture cleanup');
    await fs.rm(root, { recursive: true, force: true });
  } };
}
test('host checks deployed files, not identical version labels or a registered ID alone', async () => {
  const f = await fixture(); try {
    assert.equal((await inspectCompanion(f.chrome)).state, 'CURRENT_SOURCE');
    await fs.writeFile(path.join(f.loaded, 'popup.html'), '<p>Old same-version popup</p>');
    const stale = await inspectCompanion(f.chrome);
    assert.equal(stale.state, 'OUTDATED'); assert.equal(stale.workspaceReviewAvailable, false);
    assert.equal(stale.extensionRequiredForPreparation, false);
    assert.equal(await fs.readFile(path.join(f.chrome, 'Default', 'Preferences'), 'utf8'), f.prefs);
  } finally { await f.cleanup(); }
});
test('a missing native bridge is a deployment gap, not applicant rejection', async () => {
  const f = await fixture(); try {
    await fs.unlink(path.join(f.loaded, 'native-profile-bridge.js'));
    assert.equal((await inspectCompanion(f.chrome)).state, 'OUTDATED');
  } finally { await f.cleanup(); }
});
test('missing extension and unknown profile remain distinct, with no private paths returned', async () => {
  const f = await fixture(); try {
    await fs.writeFile(path.join(f.chrome, 'Default', 'Preferences'), '{}');
    assert.equal((await inspectCompanion(f.chrome)).state, 'NOT_INSTALLED');
    await fs.writeFile(path.join(f.chrome, 'Local State'), JSON.stringify({ profile: { last_used: '../foreign' } }));
    const unknown = await inspectCompanion(f.chrome);
    assert.equal(unknown.state, 'PROFILE_UNAVAILABLE'); assert.equal(JSON.stringify(unknown).includes(f.root), false);
  } finally { await f.cleanup(); }
});


test('host repair uses the canonical immutable generator and never claims Chrome installation', async () => {
  const f = await fixture(); try {
    const staged = await stageCompanionPackage(source, path.join(f.root, 'packages'));
    assert.equal(staged.state, 'PACKAGE_STAGED_BROWSER_UPDATE_REQUIRED');
    assert.equal(staged.browserDataChanged, false); assert.equal(staged.installationVerified, false);
    assert.match(staged.sourceCommit, /^[a-f0-9]{40,64}$/);
    assert.deepEqual(await stageCompanionPackage(source, path.join(f.root, 'packages')), staged);
    assert.equal(await fs.readFile(path.join(f.chrome, 'Default', 'Preferences'), 'utf8'), f.prefs);
  } finally { await f.cleanup(); }
});


test('bundled host stages the canonical shipped receipt with Git and Python unavailable', async () => {
  const f = await fixture(); const priorPath = process.env.PATH;
  try {
    const original = await stageCompanionPackage(source, path.join(f.root, 'build-cache'));
    const packaged = path.join(f.root, 'build-cache', original.sourceCommit);
    const bundle = path.join(f.root, 'bundled-source');
    await fs.mkdir(path.join(bundle, 'browser'), { recursive: true });
    await fs.cp(packaged, path.join(bundle, 'browser/application-assist'), { recursive: true });
    const raw = await fs.readFile(path.join(packaged, 'release.json'));
    const receipt = JSON.parse(raw.toString('utf8'));
    const files = Object.fromEntries(Object.entries(receipt.files).map(([name, digest]) => ['browser/application-assist/' + name, digest]));
    files['browser/application-assist/release.json'] = createHash('sha256').update(raw).digest('hex');
    await fs.writeFile(path.join(bundle, 'windows-release.json'), JSON.stringify({ schema: 'escapehatch/windows-preview-package/v1', sourceCommit: receipt.sourceCommit, files }));
    process.env.PATH = '';
    const staged = await stageCompanionPackage(bundle, path.join(f.root, 'installed-cache'));
    assert.deepEqual(staged, original);
    assert.deepEqual(await stageCompanionPackage(bundle, path.join(f.root, 'installed-cache')), original);
    const worker = path.join(f.root, 'installed-cache', staged.sourceCommit, 'worker.js');
    await fs.writeFile(worker, 'Preserved divergent package');
    await assert.rejects(stageCompanionPackage(bundle, path.join(f.root, 'installed-cache')), /PACKAGE_COLLISION/);
    assert.equal(await fs.readFile(worker, 'utf8'), 'Preserved divergent package');
    await fs.writeFile(path.join(bundle, 'browser/application-assist/worker.js'), 'Tampered shipped bytes');
    await assert.rejects(stageCompanionPackage(bundle, path.join(f.root, 'another-cache')), /HASH_MISMATCH/);
  } finally { if (priorPath === undefined) delete process.env.PATH; else process.env.PATH = priorPath; await f.cleanup(); }
});
