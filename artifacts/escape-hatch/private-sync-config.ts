/**
 * Carrier binding for encrypted preference sync.
 * Never accepts TokenCorridor / ChatGPT connector credentials.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

export const CARRIER_CONFIG_SCHEMA = 'escapehatch/private-sync-carrier-config/v1';
export type CarrierConfig =
  | {
      schema: typeof CARRIER_CONFIG_SCHEMA;
      kind: 'folder';
      principal: string;
      /** Absolute ciphertext folder (e.g. OneDrive EscapeHatchPrivateSync). Required for host pair/push. */
      folderPath?: string;
    }
  | {
      schema: typeof CARRIER_CONFIG_SCHEMA;
      kind: 'google-drive-file';
      principal: string;
      folderId: string;
      /** Absolute path to EscapeHatch-owned token file (not TokenCorridor). */
      tokenFile: string;
    };

const FORBIDDEN_TOKEN_FRAGMENTS = [
  `${path.sep}TokenCorridor${path.sep}`,
  `${path.sep}ChatGPT${path.sep}`,
  `${path.sep}openai${path.sep}`,
];

export function defaultCarrierConfigPath(dataHome: string): string {
  return path.join(path.resolve(dataHome), 'private-sync-carrier.json');
}

export function defaultDriveTokenPath(): string {
  const base = process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local');
  return path.join(base, 'EscapeHatch', 'private-sync', 'google-drive.token.json');
}

export function assertEscapeHatchOwnedTokenPath(tokenFile: string) {
  if (!path.isAbsolute(tokenFile)) throw new Error('ABSOLUTE_TOKEN_PATH_REQUIRED');
  const normalized = path.resolve(tokenFile);
  for (const fragment of FORBIDDEN_TOKEN_FRAGMENTS) {
    if (normalized.toLowerCase().includes(fragment.toLowerCase())) {
      throw new Error('FORBIDDEN_CONNECTOR_CREDENTIAL');
    }
  }
  const escapeRoot = path.resolve(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'EscapeHatch');
  if (!normalized.toLowerCase().startsWith(escapeRoot.toLowerCase() + path.sep)) {
    throw new Error('TOKEN_OUTSIDE_ESCAPEHATCH_ROOT');
  }
}

export async function readCarrierConfig(file: string): Promise<CarrierConfig | null> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    if (raw.length > 8192) throw new Error('INVALID_CARRIER_CONFIG');
    const parsed = JSON.parse(raw) as CarrierConfig;
    if (parsed?.schema !== CARRIER_CONFIG_SCHEMA) throw new Error('INVALID_CARRIER_CONFIG');
    if (parsed.kind === 'folder') {
      if (!parsed.principal || typeof parsed.principal !== 'string') throw new Error('INVALID_CARRIER_CONFIG');
      if (parsed.folderPath !== undefined) {
        if (typeof parsed.folderPath !== 'string' || !path.isAbsolute(parsed.folderPath)) {
          throw new Error('INVALID_CARRIER_CONFIG');
        }
      }
      return parsed;
    }
    if (parsed.kind === 'google-drive-file') {
      if (!parsed.principal || !parsed.folderId || !parsed.tokenFile) throw new Error('INVALID_CARRIER_CONFIG');
      assertEscapeHatchOwnedTokenPath(parsed.tokenFile);
      return parsed;
    }
    throw new Error('INVALID_CARRIER_CONFIG');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/** Resolve absolute folder carrier for host pair/push. Never invents a path silently. */
export async function resolveFolderCarrierPath(dataHome: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const fromEnv = env.ESCAPEHATCH_PRIVATE_SYNC_CARRIER;
  if (fromEnv && path.isAbsolute(fromEnv)) return path.resolve(fromEnv);
  const config = await readCarrierConfig(defaultCarrierConfigPath(dataHome));
  if (config?.kind === 'folder' && config.folderPath && path.isAbsolute(config.folderPath)) {
    return path.resolve(config.folderPath);
  }
  return null;
}

export async function writeCarrierConfig(file: string, config: CarrierConfig) {
  if (config.schema !== CARRIER_CONFIG_SCHEMA) throw new Error('INVALID_CARRIER_CONFIG');
  if (config.kind === 'folder' && config.folderPath !== undefined && !path.isAbsolute(config.folderPath)) {
    throw new Error('ABSOLUTE_FOLDER_CARRIER_REQUIRED');
  }
  if (config.kind === 'google-drive-file') assertEscapeHatchOwnedTokenPath(config.tokenFile);
  const temp = file + '.' + Date.now() + '.tmp';
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(temp, JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

export type DriveTokenFile = {
  schema: 'escapehatch/private-sync-drive-token/v1';
  principal: string;
  accessToken: string;
  expiresAt?: string;
  scope?: string;
};

export async function readDriveTokenFile(tokenFile: string): Promise<DriveTokenFile> {
  assertEscapeHatchOwnedTokenPath(tokenFile);
  const raw = await fs.readFile(tokenFile, 'utf8');
  if (raw.length > 65536) throw new Error('INVALID_DRIVE_TOKEN');
  const parsed = JSON.parse(raw) as DriveTokenFile;
  if (parsed?.schema !== 'escapehatch/private-sync-drive-token/v1') throw new Error('INVALID_DRIVE_TOKEN');
  if (!parsed.principal || !parsed.accessToken || parsed.accessToken.length < 16) throw new Error('AUTH_REQUIRED');
  if (parsed.scope && !/\bhttps:\/\/www\.googleapis\.com\/auth\/drive\.file\b/.test(parsed.scope) && !/\bdrive\.file\b/.test(parsed.scope)) {
    throw new Error('DRIVE_SCOPE_MISSING');
  }
  return parsed;
}
