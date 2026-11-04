/**
 * Authorized Google Drive ciphertext carrier (drive.file / exact object).
 * Requires an EscapeHatch-owned access token provider — never ChatGPT connector credentials.
 * Live OAuth is operator-granted; unit tests inject a fake fetch.
 */
import { capsuleBytes, capsuleId, etagForBytes, type CapsuleObject, type SyncTransport, type TransportListItem } from './private-sync-transport.ts';
import { parseEnvelope, type SyncEnvelope } from './private-sync-crypto.ts';

export type DriveToken = { accessToken: string; principal: string; expiresAt?: string };
export type DriveTransportOptions = {
  folderId: string;
  /** Stable account principal bound at transport construction; token must match. */
  expectedPrincipal: string;
  tokenProvider: () => Promise<DriveToken>;
  fetchImpl?: typeof fetch;
  apiRoot?: string;
};

function assertOpaqueName(name: string) {
  if (!/^[a-f0-9]{64}\.ehsync$/.test(name)) throw new Error('BAD_CAPSULE_FILENAME');
}

export function googleDriveTransport(options: DriveTransportOptions): SyncTransport {
  if (!options.folderId || !/^[A-Za-z0-9_-]{10,128}$/.test(options.folderId)) throw new Error('INVALID_DRIVE_FOLDER');
  if (!options.expectedPrincipal || options.expectedPrincipal.length < 3) throw new Error('INVALID_PROVIDER_PRINCIPAL');
  const api = options.apiRoot || 'https://www.googleapis.com';
  const fetchImpl = options.fetchImpl || fetch;

  async function authed(path: string, init: RequestInit & { etag?: string } = {}) {
    const token = await options.tokenProvider();
    if (!token?.accessToken || typeof token.accessToken !== 'string' || token.accessToken.length < 16) {
      throw new Error('AUTH_REQUIRED');
    }
    if (!token.principal || typeof token.principal !== 'string') throw new Error('AUTH_REQUIRED');
    if (token.expiresAt && Date.parse(token.expiresAt) <= Date.now()) throw new Error('AUTH_REQUIRED');
    if (token.principal !== options.expectedPrincipal) throw new Error('PROVIDER_PRINCIPAL_CHANGED');
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', 'Bearer ' + token.accessToken);
    if (init.etag) headers.set('If-Match', init.etag);
    const response = await fetchImpl(api + path, { ...init, headers });
    if (response.status === 401 || response.status === 403) throw new Error(response.status === 401 ? 'AUTH_REQUIRED' : 'PROVIDER_REVOKED');
    if (response.status === 412 || response.status === 409) throw new Error('SYNC_CONFLICT_CAS');
    return response;
  }

  const transport: SyncTransport = {
    kind: 'google-drive-file',
    principal: options.expectedPrincipal,
    async list() {
      const q = encodeURIComponent(`'${options.folderId}' in parents and trashed=false and name contains '.ehsync'`);
      const response = await authed(`/drive/v3/files?spaces=drive&fields=files(id,name,size,md5Checksum,sha256Checksum)&q=${q}&pageSize=100`);
      if (!response.ok) throw new Error('PROVIDER_LIST_FAILED');
      const body = await response.json() as { files?: Array<{ id: string; name: string; size?: string; sha256Checksum?: string }> };
      const files = body.files || [];
      if (files.length > 500) throw new Error('CARRIER_TOO_MANY_FILES');
      const items: TransportListItem[] = [];
      for (const file of files) {
        assertOpaqueName(file.name);
        const id = file.name.replace(/\.ehsync$/, '');
        const etag = file.sha256Checksum ? `"${file.sha256Checksum}"` : `"${file.id}"`;
        items.push({ id, etag, size: Number(file.size || 0) });
      }
      return items;
    },
    async get(id: string) {
      if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('BAD_CAPSULE_ID');
      const listed = await transport.list();
      const meta = listed.find(item => item.id === id);
      if (!meta) throw new Error('CAPSULE_NOT_FOUND');
      // Resolve Drive file id by opaque name.
      const q = encodeURIComponent(`'${options.folderId}' in parents and trashed=false and name='${id}.ehsync'`);
      const metaResponse = await authed(`/drive/v3/files?spaces=drive&fields=files(id,name)&q=${q}&pageSize=2`);
      if (!metaResponse.ok) throw new Error('PROVIDER_GET_FAILED');
      const metaBody = await metaResponse.json() as { files?: Array<{ id: string; name: string }> };
      if (!metaBody.files || metaBody.files.length !== 1) throw new Error('CAPSULE_NOT_FOUND');
      const media = await authed(`/drive/v3/files/${encodeURIComponent(metaBody.files[0].id)}?alt=media`);
      if (!media.ok) throw new Error('PROVIDER_GET_FAILED');
      const bytes = Buffer.from(await media.arrayBuffer());
      if (bytes.length > 110000) throw new Error('CAPSULE_FILE_REJECTED');
      const envelope = parseEnvelope(JSON.parse(bytes.toString('utf8')));
      if (capsuleId(envelope) !== id) throw new Error('CARRIER_TAMPERED');
      return { id, etag: etagForBytes(bytes), envelope, bytes } satisfies CapsuleObject;
    },
    async put(envelope: SyncEnvelope, ifMatch?: string | null) {
      const clean = parseEnvelope(envelope);
      const id = capsuleId(clean);
      const bytes = capsuleBytes(clean);
      const name = id + '.ehsync';
      // Metadata-only create/upload; body is ciphertext JSON only.
      const boundary = 'escapehatch_' + id.slice(0, 16);
      const meta = JSON.stringify({ name, parents: [options.folderId], mimeType: 'application/octet-stream' });
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
        bytes,
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const response = await authed(`/upload/drive/v3/files?uploadType=multipart&fields=id,name,sha256Checksum,size`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
          ...(ifMatch ? { 'If-Match': ifMatch } : {}),
        },
        body,
        etag: ifMatch || undefined,
      });
      if (!response.ok) throw new Error('PROVIDER_PUT_FAILED');
      const created = await response.json() as { name?: string; sha256Checksum?: string; size?: string };
      if (created.name !== name) throw new Error('PROVIDER_PUT_FAILED');
      return {
        id,
        etag: created.sha256Checksum ? `"${created.sha256Checksum}"` : etagForBytes(bytes),
        size: Number(created.size || bytes.length),
      };
    },
  };
  return transport;
}
