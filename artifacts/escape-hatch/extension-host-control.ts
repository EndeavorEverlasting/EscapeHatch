/** Host-owned compatibility and immutable package staging. Never edits Chrome preferences. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';
import { readManagedRuntime } from './runtime-control.ts';
import { authorizedWorkspaceRequest } from './workspace-control.ts';
import { stageShippedCompanion } from './companion-package.ts';
import { userDataRoot } from './user-data.ts';

const execute = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '../..');
export type CompanionInspection = {
  managed: boolean;
  state: 'CURRENT_SOURCE' | 'OUTDATED' | 'NOT_INSTALLED' | 'PROFILE_UNAVAILABLE' | 'HOST_UNAVAILABLE';
  workspaceReviewAvailable: boolean;
  extensionRequiredForPreparation: false;
  profileScope: 'LAST_USED_CHROME_PROFILE';
};
const result = (state: CompanionInspection['state'], available = false): CompanionInspection =>
  ({ managed: true, state, workspaceReviewAvailable: available, extensionRequiredForPreparation: false, profileScope: 'LAST_USED_CHROME_PROFILE' });

/** Extension metadata only: no browser history, cookies, saved answers or credentials. */
export async function inspectCompanion(chromeRoot: string, sourceRoot = repoRoot): Promise<CompanionInspection> {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(sourceRoot, 'browser/application-assist/manifest.json'), 'utf8'));
    const hex = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
    const id = [...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
    const local = JSON.parse(await fs.readFile(path.join(chromeRoot, 'Local State'), 'utf8'));
    const profile = local.profile?.last_used;
    if (typeof profile !== 'string' || !/^(Default|Profile [0-9]+)$/.test(profile)) return result('PROFILE_UNAVAILABLE');
    let entries: Record<string, { path?: string; location?: number }> = {};
    for (const filename of ['Preferences', 'Secure Preferences']) {
      try {
        const parsed = JSON.parse(await fs.readFile(path.join(chromeRoot, profile, filename), 'utf8'));
        entries = { ...entries, ...parsed.extensions?.settings };
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    const extension = entries[id];
    if (!extension) return result('NOT_INSTALLED');
    if (typeof extension.path !== 'string' || !extension.path) return result('PROFILE_UNAVAILABLE');
    const loaded = path.isAbsolute(extension.path) ? extension.path : path.join(chromeRoot, profile, 'Extensions', extension.path);
    const expected = path.join(sourceRoot, 'browser/application-assist');
    // Same SemVer is insufficient: compare the actual deployed compatibility files.
    const files = ['manifest.json', 'worker.js', 'popup.html', 'native-profile-bridge.js'];
    let available = false;
    for (const file of files) {
      let deployed: Buffer;
      try { deployed = await fs.readFile(path.join(loaded, file)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result('OUTDATED'); throw error; }
      if (file === 'popup.html') available = deployed.toString('utf8').includes('id="connectWorkspace"');
      const current = await fs.readFile(path.join(expected, file));
      if (!deployed.equals(current)) return result('OUTDATED', available);
    }
    return result('CURRENT_SOURCE', available);
  } catch { return result('PROFILE_UNAVAILABLE'); }
}

export async function stageCompanionPackage(sourceRoot = repoRoot, outputRoot = path.join(userDataRoot(), 'extension-packages')) {
  // Installed releases consume the build-time canonical receipt with no developer tools.
  let shipped = false;
  try { await fs.access(path.join(sourceRoot, 'browser/application-assist/release.json')); shipped = true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (shipped) {
    const sourceCommit = await stageShippedCompanion(sourceRoot, outputRoot);
    return { state: 'PACKAGE_STAGED_BROWSER_UPDATE_REQUIRED' as const, sourceCommit,
      extensionIdPreserved: true, browserDataChanged: false, installationVerified: false };
  }
  // The registered generator reads a pinned committed tree and never overwrites an old package.
  const { stdout } = await execute('python', [path.join(sourceRoot, 'scripts/package_application_assist.py'), '--output-root', outputRoot, '--enrollment'],
    { cwd: sourceRoot, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
  const receipt = JSON.parse(stdout);
  if (receipt.packageState !== 'PACKAGE_VERIFIED' || !/^[a-f0-9]{40,64}$/.test(receipt.sourceCommit)) throw new Error('PACKAGE_VERIFICATION_REQUIRED');
  return { state: 'PACKAGE_STAGED_BROWSER_UPDATE_REQUIRED' as const, sourceCommit: receipt.sourceCommit,
    extensionIdPreserved: true, browserDataChanged: false, installationVerified: false };
}

export function createExtensionHostControlPlugin(): Plugin {
  const managed = readManagedRuntime();
  return { name: 'escapehatch-extension-host-control', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const route = (req.url || '').split('?')[0];
      if (!['/__escapehatch/companion/status', '/__escapehatch/companion/stage-update'].includes(route)) return next();
      const send = (code: number, body: object) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(body)); };
      const port = Number(process.env.PORT || server.config.server.port || 5173);
      if (!authorizedWorkspaceRequest(req, port)) return send(403, { error: 'same_origin_loopback_required' });
      if (!managed || process.platform !== 'win32' || !process.env.LOCALAPPDATA) return send(200, { ...result('HOST_UNAVAILABLE'), managed: false });
      if (route.endsWith('/status') && req.method === 'GET') return send(200, await inspectCompanion(path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data')));
      if (route.endsWith('/stage-update') && req.method === 'POST' && req.headers['x-escapehatch-companion'] === '1') {
        try { return send(200, await stageCompanionPackage()); }
        catch { return send(409, { error: 'Companion update could not be verified. Existing browser data and packages were preserved.' }); }
      }
      return send(405, { error: 'method_not_allowed' });
    });
  } };
}
