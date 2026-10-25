import path from 'node:path';
import { homedir } from 'node:os';

/** Stable user identity; checkout fingerprints identify processes, never career data. */
export function userDataRoot(env: NodeJS.ProcessEnv = process.env) {
  return env.ESCAPEHATCH_DATA_HOME || path.join(env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'EscapeHatch');
}
