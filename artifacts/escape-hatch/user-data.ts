import path from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

/** Stable user identity; checkout fingerprints identify processes, never career data. */
export function userDataRoot(env: NodeJS.ProcessEnv = process.env) {
  return env.ESCAPEHATCH_DATA_HOME || path.join(env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'EscapeHatch');
}

export function legacyPrivateRoots() {
  const roots = [path.resolve(import.meta.dirname, '../../private')];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: import.meta.dirname, encoding: 'utf8', timeout: 5000, windowsHide: true }).trim();
    roots.push(path.join(path.dirname(common), 'private'));
  } catch { /* A portable installed copy may not include Git metadata. */ }
  return [...new Set(roots)];
}
