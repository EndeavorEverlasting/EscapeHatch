import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { computeTrackerMetrics, parseTrackerSnapshot, type TrackerRow, type TrackerSnapshot } from './src/lib/tracker-bridge.ts';

const MAX_BYTES = 2 * 1024 * 1024;
const ROW_LIMIT = 1500;
const TIMEOUT_MS = 10_000;
export type TrackerTarget = { spreadsheetId: string; sheetName: string };
export type RefreshResult = { ok: true; refreshed: true; snapshot: TrackerSnapshot } | { ok: false; refreshed: false; error: string };
export type RefreshOptions = { env?: NodeJS.ProcessEnv; fetch?: typeof fetch; now?: () => Date };

function validTarget(target: TrackerTarget) {
  return /^[a-zA-Z0-9_-]{10,200}$/.test(target.spreadsheetId) && target.sheetName.trim().length > 0 &&
    target.sheetName.length <= 100 && !/[\x00-\x1f]/.test(target.sheetName);
}
function fail(code: string): never { throw new Error(code); }
const headers: Record<string, keyof TrackerRow> = {
  'company': 'company', 'role': 'role', 'status': 'status', 'priority': 'priority', 'apply link': 'applyUrl', 'applied?': 'appliedCheckbox',
  'work mode': 'workMode', 'location': 'location', 'compensation': 'compensation', 'date found': 'dateFound',
  'date applied': 'dateApplied', 'follow-up due': 'followUp', 'follow up due': 'followUp', 'follow-up': 'followUp',
  'next action': 'nextAction', 'notes': 'notes', 'source link': 'sourceLink', 'resume doc': 'resumeDoc',
  'resume pdf': 'resumePdf', 'audited on': 'auditedOn',
};
const required = ['company', 'role', 'status', 'priority', 'applyUrl', 'appliedCheckbox'] as const;

/** Project only a complete bounded provider response. No partial-row filtering. */
export function createTrackerSnapshotFromValues(values: unknown, target: TrackerTarget, authPath: string, capturedAt: Date): TrackerSnapshot {
  if (!validTarget(target) || Number.isNaN(capturedAt.getTime())) fail('INVALID_TARGET');
  if (!Array.isArray(values) || values.length < 1 || values.length >= ROW_LIMIT) fail('INCOMPLETE_RESPONSE');
  // A–AJ covers legacy A:Z fields plus Submission Proof (AD) and portal-profile AE:AJ.
  if (!values.every(row => Array.isArray(row) && row.length <= 36 && row.every(cell => ['string', 'number', 'boolean'].includes(typeof cell)))) fail('INVALID_ROWS');
  const heading = values[0] as (string | number | boolean)[];
  const seen = new Set<string>();
  const columns = heading.map(cell => {
    if (typeof cell !== 'string') fail('INVALID_HEADERS');
    const normalized = cell.trim().toLowerCase();
    if (normalized && seen.has(normalized)) fail('DUPLICATE_HEADERS');
    if (normalized) seen.add(normalized);
    return headers[normalized];
  });
  const mapped = columns.filter(Boolean);
  if (new Set(mapped).size !== mapped.length) fail('DUPLICATE_HEADERS');
  if (!required.every(key => mapped.includes(key))) fail('MISSING_HEADERS');
  const applications: TrackerRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const cells = values[i] as (string | number | boolean)[];
    if (cells.every(cell => String(cell).trim() === '')) continue; // A genuinely blank sheet row is not a record.
    const row = { sheetRow: i + 1 } as TrackerRow;
    columns.forEach((key, index) => {
      if (!key) return;
      const cell = cells[index] ?? '';
      if (key === 'appliedCheckbox') {
        if (cell === true || ['TRUE', '☑', '☒'].includes(String(cell).trim().toUpperCase())) row.appliedCheckbox = true;
        else if (cell === false || ['', 'FALSE', '☐'].includes(String(cell).trim().toUpperCase())) row.appliedCheckbox = false;
        else fail('INVALID_ROWS');
      } else {
        const text = String(cell).trim();
        if (text.length > 30_000) fail('INVALID_ROWS');
        Object.assign(row, { [key]: text });
      }
    });
    if (!row.company || !row.role || !row.status || !row.priority) fail('INVALID_ROWS');
    if (row.applyUrl) {
      try {
        const protocol = new URL(row.applyUrl).protocol;
        if (protocol === 'mailto:') {
          row.notes = [row.notes, 'Manual correspondence link (not a browser application): ' + row.applyUrl].filter(Boolean).join('\n');
          row.applyUrl = '';
        } else if (!['http:', 'https:'].includes(protocol)) fail('INVALID_ROWS');
      }
      catch { fail('INVALID_ROWS'); }
    }
    applications.push(row);
  }
  return { schema: 'escapehatch/tracker-snapshot/v1', provider: 'google_sheets', spreadsheetId: target.spreadsheetId, sheetName: target.sheetName,
    capturedAtUtc: capturedAt.toISOString(), contentDigest: createHash('sha256').update(JSON.stringify(values)).digest('hex'),
    authPath, localGoogleAuthPresent: true, metrics: computeTrackerMetrics(applications), applications };
}

async function readBoundedFile(file: string, limit: number) {
  const handle = await fs.open(file, 'r');
  try {
    if ((await handle.stat()).size > limit) fail('INVALID_LOCAL_SOURCE');
    const bytes = await handle.readFile();
    if (bytes.length > limit) fail('INVALID_LOCAL_SOURCE');
    return bytes.toString('utf8').replace(/^\uFEFF/, '');
  } finally { await handle.close(); }
}
export async function acquireToken(env: NodeJS.ProcessEnv) {
  if (env.TOKEN_CORRIDOR_GOOGLE_TOKEN?.trim()) {
    const token = env.TOKEN_CORRIDOR_GOOGLE_TOKEN.trim();
    return token.length <= 16384 && !/[\r\n]/.test(token) ? { token, source: 'TokenCorridor process credential' } : null;
  }
  const base = env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local');
  try {
    const raw = JSON.parse(await readBoundedFile(path.join(base, 'TokenCorridor', 'connectors', 'google.json'), 65536));
    const token = raw.token || raw.access_token || raw.accessToken;
    if (typeof token !== 'string' || !token.trim() || token.length > 16384 || /[\r\n]/.test(token)) return null;
    return { token: token.trim(), source: 'TokenCorridor local credential' };
  } catch { return null; }
}
export async function readTrackerRefreshAvailability(snapshotFile: string, env: NodeJS.ProcessEnv = process.env) {
  try {
    const raw = JSON.parse(await readBoundedFile(snapshotFile, MAX_BYTES));
    const snapshot = parseTrackerSnapshot(raw);
    if (!snapshot || !validTarget(snapshot) || snapshot.applications.length !== raw.applications.length) throw new Error('invalid binding');
  } catch {
    return { refreshState: 'NOT_CONFIGURED' as const, message: 'Select an existing career tracker to enable refresh. Your local data is preserved.' };
  }
  if (!await acquireToken(env)) return { refreshState: 'AUTH_REQUIRED' as const,
    message: 'Your local tracker is available. Reconnect Google to refresh it; existing context remains preserved.' };
  return { refreshState: 'AVAILABLE' as const,
    message: 'An existing local Google credential can be used to attempt refresh. Authentication is verified by the provider response.' };
}

export async function boundedJson(response: Response, signal: AbortSignal) {
  const size = response.headers.get('content-length');
  if (size && (!/^\d+$/.test(size) || Number(size) > MAX_BYTES)) fail('RESPONSE_TOO_LARGE');
  if (!response.body) fail('INCOMPLETE_RESPONSE');
  if (signal.aborted) fail('TIMEOUT');
  const reader = response.body.getReader();
  // Cancellation is initiated without waiting on a potentially uncooperative source.
  // The request controller is also aborted in the outer finally to release fetch resources.
  const cancelReader = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancelReader, { once: true });
  let complete = false;
  const chunks: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) { complete = true; break; }
      count += next.value.byteLength;
      if (count > MAX_BYTES) fail('RESPONSE_TOO_LARGE');
      chunks.push(next.value);
    }
  } finally {
    signal.removeEventListener('abort', cancelReader);
    if (!complete) cancelReader();
    reader.releaseLock();
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('INVALID_RESPONSE'); }
}
const safeErrors = new Set(['INVALID_TARGET', 'INCOMPLETE_RESPONSE', 'INVALID_ROWS', 'INVALID_HEADERS', 'DUPLICATE_HEADERS', 'MISSING_HEADERS', 'RESPONSE_TOO_LARGE', 'INVALID_RESPONSE']);

/** Existing private binding is authoritative; callers cannot supply an arbitrary provider URL. */
const refreshes = new Map<string, Promise<RefreshResult>>();
export function refreshTrackerSnapshot(snapshotFile: string, options: RefreshOptions = {}): Promise<RefreshResult> {
  const key = path.resolve(snapshotFile);
  const result = (refreshes.get(key) || Promise.resolve()).catch(() => {}).then(() => refreshTrackerSnapshotNow(snapshotFile, options));
  refreshes.set(key, result);
  void result.finally(() => { if (refreshes.get(key) === result) refreshes.delete(key); }).catch(() => {});
  return result;
}
async function refreshTrackerSnapshotNow(snapshotFile: string, options: RefreshOptions): Promise<RefreshResult> {
  const env = options.env || process.env;
  let previous: string;
  let current: TrackerSnapshot;
  try {
    previous = await readBoundedFile(snapshotFile, MAX_BYTES);
    const raw = JSON.parse(previous);
    const parsed = parseTrackerSnapshot(raw);
    if (!parsed || parsed.applications.length !== raw.applications.length || !validTarget(parsed)) return { ok: false, refreshed: false, error: 'TRACKER_BINDING_REQUIRED' };
    current = parsed;
  } catch { return { ok: false, refreshed: false, error: 'TRACKER_BINDING_REQUIRED' }; }
  const auth = await acquireToken(env);
  if (!auth) return { ok: false, refreshed: false, error: 'AUTH_REQUIRED' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let temporary: string | undefined;
  let response: Response | undefined;
  try {
    if (auth.token.length > 16384 || /[\r\n]/.test(auth.token)) fail('AUTH_REQUIRED');
    const range = `'${current.sheetName.replace(/'/g, "''")}'!A1:AJ${ROW_LIMIT}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(current.spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
    response = await (options.fetch || fetch)(url, { headers: { authorization: `Bearer ${auth.token}` }, signal: controller.signal, redirect: 'error' });
    if (response.status === 401 || response.status === 403) return { ok: false, refreshed: false, error: 'AUTH_REQUIRED' };
    if (!response.ok) return { ok: false, refreshed: false, error: 'PROVIDER_UNAVAILABLE' };
    const raw = await boundedJson(response, controller.signal);
    if (!raw || typeof raw !== 'object' || raw.majorDimension !== 'ROWS' || !Array.isArray(raw.values) || typeof raw.range !== 'string') fail('INCOMPLETE_RESPONSE');
    const sheet = current.sheetName;
    const prefixes = [`'${sheet.replace(/'/g, "''")}'!`, `${sheet}!`];
    const prefix = prefixes.find(value => raw.range.startsWith(value));
    const extent = prefix && /^A1:([A-Z]+)([1-9][0-9]*)$/.exec(raw.range.slice(prefix.length));
    const columnIndex = (letters: string) => {
      if (!letters || letters.length > 2) return -1;
      let n = 0;
      for (const ch of letters) {
        if (ch < 'A' || ch > 'Z') return -1;
        n = n * 26 + (ch.charCodeAt(0) - 64);
      }
      return n - 1;
    };
    if (!extent || columnIndex(extent[1]) < 0 || columnIndex(extent[1]) > 35 || Number(extent[2]) > ROW_LIMIT) fail('INCOMPLETE_RESPONSE');
    const snapshot = createTrackerSnapshotFromValues(raw.values, current, auth.source, (options.now || (() => new Date()))());
    if (controller.signal.aborted) fail('TIMEOUT');
    if (await readBoundedFile(snapshotFile, MAX_BYTES) !== previous) return { ok: false, refreshed: false, error: 'SOURCE_CHANGED_RETRY' };
    temporary = snapshotFile + '.' + randomUUID() + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, snapshotFile);
    return { ok: true, refreshed: true, snapshot };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return { ok: false, refreshed: false, error: controller.signal.aborted ? 'TIMEOUT' : message === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : safeErrors.has(message) ? message : 'REFRESH_FAILED' };
  } finally {
    clearTimeout(timer);
    controller.abort();
    // Covers non-2xx responses and header rejection before a reader was acquired.
    // Never consume, stringify, or publish provider error bodies.
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
    if (temporary) await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

export type RememberedSource = { label: string; kind: 'drive_folder' | 'google_doc' | 'local_file'; locator: string };
/** Metadata only: selected local artifacts are listed, never opened through this endpoint. */
export async function readRememberedSources(file: string): Promise<{ ok: boolean; sources: RememberedSource[]; error?: string }> {
  try {
    const raw = JSON.parse(await readBoundedFile(file, 65536));
    if (raw.schema !== 'escapehatch-career-sources/v1' || !Array.isArray(raw.sources) || raw.sources.length > 50) fail('INVALID_SOURCES');
    const sources = raw.sources.map((value: unknown) => {
      if (!value || typeof value !== 'object') fail('INVALID_SOURCES');
      const item = value as RememberedSource;
      if (typeof item.label !== 'string' || !item.label.trim() || /[\x00-\x1f]/.test(item.label) || item.label.length > 200 || typeof item.locator !== 'string' || item.locator.length > 2048 || /[\x00-\x1f]/.test(item.locator)) fail('INVALID_SOURCES');
      if (item.kind === 'local_file') {
        if ((!path.win32.isAbsolute(item.locator) && !path.posix.isAbsolute(item.locator)) || (item.locator.startsWith('\\\\') || item.locator.startsWith('//'))) fail('INVALID_SOURCES');
      } else {
        const url = new URL(item.locator);
        if (url.protocol !== 'https:' || url.username || url.password ||
          (item.kind === 'drive_folder' ? url.hostname !== 'drive.google.com' || !/^\/drive\/folders\/[\w-]+\/?$/.test(url.pathname) :
          item.kind === 'google_doc' ? url.hostname !== 'docs.google.com' || !/^\/document\/d\/[\w-]+(?:\/edit)?\/?$/.test(url.pathname) : true)) fail('INVALID_SOURCES');
      }
      return { label: item.label, kind: item.kind, locator: item.locator };
    });
    return { ok: true, sources };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { ok: true, sources: [] } : { ok: false, sources: [], error: 'INVALID_SOURCES' };
  }
}
