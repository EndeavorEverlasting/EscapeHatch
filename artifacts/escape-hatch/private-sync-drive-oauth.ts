/**
 * EscapeHatch-owned Google Drive OAuth (drive.file) for ciphertext sync.
 * Never reads TokenCorridor / ChatGPT connector credentials.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { assertEscapeHatchOwnedTokenPath, defaultDriveTokenPath } from './private-sync-config.ts';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CLIENT_SCHEMA = 'escapehatch/private-sync-google-oauth-client/v1';
/** Loopback redirect; avoid 8765 (PiShark / other local listeners). */
export const DEFAULT_OAUTH_REDIRECT_PORT = 18767;

export type OAuthClientConfig = {
  schema: typeof CLIENT_SCHEMA;
  clientId: string;
  clientSecret?: string;
  redirectPort?: number;
};

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function defaultOAuthClientPath(): string {
  const base = process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local');
  return path.join(base, 'EscapeHatch', 'private-sync', 'google-oauth-client.json');
}

export async function readOAuthClientConfig(file = defaultOAuthClientPath()): Promise<OAuthClientConfig> {
  assertEscapeHatchOwnedTokenPath(file);
  const raw = await fs.readFile(file, 'utf8');
  if (raw.length > 8192) throw new Error('INVALID_OAUTH_CLIENT');
  const parsed = JSON.parse(raw) as OAuthClientConfig;
  if (parsed?.schema !== CLIENT_SCHEMA || typeof parsed.clientId !== 'string' || parsed.clientId.length < 8) {
    throw new Error('INVALID_OAUTH_CLIENT');
  }
  return parsed;
}

async function openBrowser(url: string) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

/**
 * Interactive loopback PKCE auth. Operator must place google-oauth-client.json first.
 * Writes EscapeHatch-owned token file usable by bind-drive / drive transport.
 */
export async function authorizeDriveFileAccess(options: {
  principalHint?: string;
  clientFile?: string;
  tokenFile?: string;
  timeoutMs?: number;
} = {}): Promise<{ state: 'DRIVE_AUTH_SAVED'; principal: string; tokenFile: string; folderInstruction: string }> {
  const client = await readOAuthClientConfig(options.clientFile || defaultOAuthClientPath());
  const tokenFile = options.tokenFile || defaultDriveTokenPath();
  assertEscapeHatchOwnedTokenPath(tokenFile);
  const port = client.redirectPort || DEFAULT_OAUTH_REDIRECT_PORT;
  const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`;
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', client.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('OAUTH_TIMEOUT'));
    }, options.timeoutMs || 180_000);
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
        if (url.pathname !== '/oauth2/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        if (url.searchParams.get('state') !== state) throw new Error('OAUTH_STATE_MISMATCH');
        const err = url.searchParams.get('error');
        if (err) throw new Error('OAUTH_DENIED');
        const authCode = url.searchParams.get('code');
        if (!authCode) throw new Error('OAUTH_CODE_MISSING');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><p>EscapeHatch Drive access granted. You can close this window.</p></body></html>');
        clearTimeout(timer);
        server.close();
        resolve(authCode);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Authorization failed');
        clearTimeout(timer);
        server.close();
        reject(e);
      }
    });
    server.listen(port, '127.0.0.1', () => {
      void openBrowser(authUrl.toString());
    });
  });

  const body = new URLSearchParams({
    client_id: client.clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  if (client.clientSecret) body.set('client_secret', client.clientSecret);
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenResponse.ok) throw new Error('OAUTH_TOKEN_EXCHANGE_FAILED');
  const tokenJson = await tokenResponse.json() as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    refresh_token?: string;
  };
  if (!tokenJson.access_token) throw new Error('AUTH_REQUIRED');
  if (tokenJson.scope && !tokenJson.scope.includes('drive.file')) throw new Error('DRIVE_SCOPE_MISSING');

  const about = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)', {
    headers: { Authorization: 'Bearer ' + tokenJson.access_token },
  });
  if (!about.ok) throw new Error('PROVIDER_PRINCIPAL_UNAVAILABLE');
  const aboutJson = await about.json() as { user?: { emailAddress?: string } };
  const principal = aboutJson.user?.emailAddress;
  if (!principal) throw new Error('PROVIDER_PRINCIPAL_UNAVAILABLE');
  if (options.principalHint && options.principalHint !== principal) throw new Error('PROVIDER_PRINCIPAL_CHANGED');

  const expiresAt = tokenJson.expires_in
    ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
    : undefined;
  await fs.mkdir(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
  const payload = {
    schema: 'escapehatch/private-sync-drive-token/v1',
    principal,
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt,
    scope: tokenJson.scope || SCOPE,
  };
  const temp = tokenFile + '.' + randomBytes(4).toString('hex') + '.tmp';
  try {
    await fs.writeFile(temp, JSON.stringify(payload, null, 2), { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, tokenFile);
  } finally {
    await fs.rm(temp, { force: true });
  }
  return {
    state: 'DRIVE_AUTH_SAVED',
    principal,
    tokenFile,
    folderInstruction: 'Create or choose an empty Drive folder for EscapeHatch ciphertext capsules, then run bind-drive with that folder id.',
  };
}
