/** Deterministic receipt outbox. No LLM, browser action, token creation or guessed tracker target. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { userDataRoot } from './user-data.ts';
import { trackerPaths } from './tracker-control.ts';
import { acquireToken, boundedJson, createTrackerSnapshotFromValues } from './tracker-refresh.ts';
import { parseSubmissionEvidence, type SubmissionEvidence } from './src/lib/submission-reconciliation.ts';
import { parseTrackerSnapshot, trackerOpportunityId, type TrackerSnapshot } from './src/lib/tracker-bridge.ts';
import { reconcileSubmissionReceipts, submissionMatchesApplication } from './src/lib/submission-reconciliation.ts';
import { readWorkspace, saveWorkspace } from './workspace-file.ts';
import { APPLICATIONS_KEY, parseApplicationsStorage } from './src/lib/storage.ts';

type SyncState = 'PENDING' | 'SYNCED' | 'AUTH_REQUIRED' | 'CONFLICT' | 'RETRY_REQUIRED';
type Target = { spreadsheetId: string; sheetName: string };
type Entry = { receipt: SubmissionEvidence; target: Target | null; timeZone: string; expectedDate?: string; state: SyncState; updatedAt: string };
type Outbox = { schema: 'escapehatch/submission-tracker-outbox/v1'; entries: Entry[] };
export type SyncOptions = { root?: string; env?: NodeJS.ProcessEnv; fetch?: typeof fetch; timeZone?: string; opportunityId?: string };
const fileName = 'submission-tracker-outbox.v1.json';
const scopeRoot = (options: SyncOptions) => options.root || userDataRoot();
async function readJson(file: string) {
  const handle = await fs.open(file, 'r');
  try {
    if ((await handle.stat()).size > 2 * 1024 * 1024) throw new Error('INVALID_PRIVATE_STATE');
    const bytes = await handle.readFile();
    if (bytes.length > 2 * 1024 * 1024) throw new Error('INVALID_PRIVATE_STATE');
    return JSON.parse(bytes.toString('utf8'));
  } finally { await handle.close(); }
}
async function readOutbox(root: string): Promise<Outbox> {
  try {
    const value = await readJson(path.join(root, fileName));
    if (value.schema !== 'escapehatch/submission-tracker-outbox/v1' || !Array.isArray(value.entries) || value.entries.length > 1000 ||
        value.entries.some((item: Entry) => !parseSubmissionEvidence(item.receipt) || !validTarget(item.target) || typeof item.timeZone !== 'string' || !validZone(item.timeZone) || item.expectedDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(item.expectedDate) || !['PENDING', 'SYNCED', 'AUTH_REQUIRED', 'CONFLICT', 'RETRY_REQUIRED'].includes(item.state) || !Number.isFinite(Date.parse(item.updatedAt)))) throw new Error('INVALID_OUTBOX');
    if (new Set(value.entries.map((item: Entry) => item.receipt.attemptId)).size !== value.entries.length) throw new Error('INVALID_OUTBOX');
    return value;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schema: 'escapehatch/submission-tracker-outbox/v1', entries: [] }; throw error; }
}
async function writeOutbox(root: string, box: Outbox) {
  const file = path.join(root, fileName), temporary = file + '.' + randomUUID() + '.tmp';
  try { await fs.writeFile(temporary, JSON.stringify(box), { mode: 0o600, flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}
async function locked<T>(root: string, action: () => Promise<T>) {
  await fs.mkdir(root, { recursive: true });
  const lock = new DatabaseSync(path.join(root, fileName + '.lock.sqlite'));
  try { lock.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); }
  catch { lock.close(); throw new Error('SUBMISSION_SYNC_BUSY'); }
  try { return await action(); }
  finally { try { lock.exec('ROLLBACK'); } finally { lock.close(); } }
}
function receiptMatches(receipt: SubmissionEvidence, url: string) {
  return submissionMatchesApplication(receipt, url);
}
function validTarget(target: Target | null) {
  return target === null || target && /^[A-Za-z0-9_-]{10,200}$/.test(target.spreadsheetId) && typeof target.sheetName === 'string' && target.sheetName.trim().length > 0 && target.sheetName.length <= 100;
}
function validZone(timeZone: string) { try { new Intl.DateTimeFormat('en', { timeZone }); return true; } catch { return false; } }
function trackerSnapshotFile(root: string, env: NodeJS.ProcessEnv = process.env) {
  return env.ESCAPEHATCH_TRACKER_SNAPSHOT || (root === userDataRoot(env) ? trackerPaths(env).snapshot : path.join(root, 'tracker-snapshot.v1.json'));
}
async function currentBinding(root: string, env: NodeJS.ProcessEnv = process.env): Promise<Target | null> {
  try { const snapshot = parseTrackerSnapshot(await readJson(trackerSnapshotFile(root, env))); return snapshot ? { spreadsheetId: snapshot.spreadsheetId, sheetName: snapshot.sheetName } : null; }
  catch { return null; }
}
/** Sheets stores dates as serial day numbers, including columns validated as dates.
 * Preserve exact local calendar dates across readback and retries.
 */
const SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);
function sheetDateDay(value: string | number | undefined): string | null {
  if (value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d{4,6}$/.test(value)) {
    const serial = Number(value);
    if (!Number.isInteger(serial) || serial < 1 || serial > 2958465) return null;
    return new Date(SHEETS_EPOCH_UTC + serial * 86400000).toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const iso = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  return !Number.isNaN(Date.parse(iso)) && new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) === iso ? iso : null;
}
function dateSerial(day: string) { return Math.round((Date.parse(day + 'T00:00:00Z') - SHEETS_EPOCH_UTC) / 86400000); }
/** A=0 … AJ=35. Portal profile columns AE:AJ stay readable but are never written here. */
export const TRACKER_WRITE_COLUMN_LIMIT = 36;
export const TRACKER_VALUES_RANGE = 'A1:AJ1500';
export function sheetColumnLetter(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= TRACKER_WRITE_COLUMN_LIMIT) throw new Error('CONFLICT');
  let n = index + 1, out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
export function sheetColumnIndex(letters: string) {
  if (!/^[A-Z]+$/.test(letters) || letters.length > 2) return -1;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
const EMPLOYER_CONFIRMED_PROOF = 'Employer Confirmed';
/** Pure plan: fresh header mapping and unique row identity, never a remembered row number alone. */
export function planSubmissionWrite(snapshot: TrackerSnapshot, receipt: SubmissionEvidence, values: unknown[][], timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const bound = snapshot.applications.filter(row => trackerOpportunityId(row) === receipt.opportunityId && receiptMatches(receipt, row.applyUrl));
  if (bound.length !== 1) throw new Error('CONFLICT');
  const fresh = createTrackerSnapshotFromValues(values, snapshot, 'provider_read', new Date());
  const matches = fresh.applications.filter(row => row.applyUrl === bound[0].applyUrl && row.company === bound[0].company && row.role === bound[0].role);
  if (matches.length !== 1) throw new Error('CONFLICT');
  const row = matches[0], headers = values[0].map(value => String(value).trim().toLowerCase());
  const status = headers.indexOf('status'), applied = headers.indexOf('applied?'), date = headers.indexOf('date applied');
  const proof = headers.indexOf('submission proof');
  if ([status, applied, date, proof].some(index => index < 0) || new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error('CONFLICT');
  if ([status, applied, date, proof].some(index => index >= TRACKER_WRITE_COLUMN_LIMIT)) throw new Error('CONFLICT');
  const statusValue = row.status.trim().toLowerCase();
  // A verified receipt must never rewind an already-submitted application
  // because the applicant owes a questionnaire or the employer owns review.
  // The Applied checkbox alone is not proof; this function is reached only
  // after a bound employer confirmation receipt has been validated.
  const done = row.appliedCheckbox && (
    /^(?:submitted(?:\s*[-–—]\s*.+)?|applied)$/.test(statusValue) ||
    /^pending\s*[-–—]\s*employer$/.test(statusValue) ||
    /^action required\s*[-–—]\s*applicant$/.test(statusValue) ||
    ['in process', 'follow-up', 'interviewing', 'offer', 'closed'].includes(statusValue));
  // Preserve the actual downstream stage when an employer confirmation receipt
  // arrives after a later portal status update.
  if (!done && (row.appliedCheckbox ||
      !['', 'saved', 'preparing', 'ready', 'ready to apply', 'research', 'resume ready',
        'review required', 'verify submission', 'not started', 'draft'].includes(statusValue))) throw new Error('CONFLICT');
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(receipt.observedAt));
  const get = (type: string) => parts.find(item => item.type === type)!.value;
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  const quoted = "'" + snapshot.sheetName.replace(/'/g, "''") + "'!";
  const update = (column: number, value: string | boolean | number) => ({ range: quoted + sheetColumnLetter(column) + row.sheetRow, values: [[value]] });
  const rawApplied = values[row.sheetRow - 1]?.[applied];
  const appliedValue = rawApplied === false ? true : rawApplied === '☐' ? '☑' :
    rawApplied === 'FALSE' ? 'TRUE' : rawApplied === '' ? '☑' : null;
  if (!done && appliedValue === null) throw new Error('CONFLICT');
  const existingDate = sheetDateDay(row.dateApplied);
  if (row.dateApplied && !existingDate) throw new Error('CONFLICT');
  const existingProof = String(values[row.sheetRow - 1]?.[proof] ?? '').trim();
  const needProof = existingProof.toLowerCase() !== EMPLOYER_CONFIRMED_PROOF.toLowerCase();
  const data = [...(done ? [] : [update(status, 'Submitted'), update(applied, appliedValue!)]),
    ...(!existingDate ? [update(date, dateSerial(day))] : []),
    ...(needProof ? [update(proof, EMPLOYER_CONFIRMED_PROOF)] : [])];
  return { data, row, done: done && !needProof, day, proofColumn: proof };
}
async function syncOne(entry: Entry, options: SyncOptions, persistIntent: () => Promise<void>): Promise<SyncState> {
  const { receipt } = entry;
  const root = scopeRoot(options);
  let snapshot: TrackerSnapshot | null;
  try { snapshot = parseTrackerSnapshot(await readJson(trackerSnapshotFile(root, options.env || process.env))); }
  catch { return 'CONFLICT'; }
  if (!snapshot || !entry.target || snapshot.spreadsheetId !== entry.target.spreadsheetId || snapshot.sheetName !== entry.target.sheetName || !/^[A-Za-z0-9_-]{10,200}$/.test(snapshot.spreadsheetId)) return 'CONFLICT';
  const auth = await acquireToken(options.env || process.env);
  if (!auth) return 'AUTH_REQUIRED';
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  const request = options.fetch || fetch;
  const range = "'" + snapshot.sheetName.replace(/'/g, "''") + "'!" + TRACKER_VALUES_RANGE;
  const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(snapshot.spreadsheetId) + '/values/';
  const headers = { authorization: 'Bearer ' + auth.token, 'content-type': 'application/json' };
  async function call(url: string, init: RequestInit = {}) {
    const response = await request(url, { ...init, headers, signal: controller.signal, redirect: 'error' });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new Error(response.status === 401 || response.status === 403 ? 'AUTH_REQUIRED' : 'RETRY_REQUIRED');
    }
    return boundedJson(response, controller.signal);
  }
  async function read() {
    const raw = await call(base + encodeURIComponent(range) + '?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE');
    if (raw.majorDimension !== 'ROWS' || !Array.isArray(raw.values) || typeof raw.range !== 'string' ||
        ![snapshot!.sheetName + '!', "'" + snapshot!.sheetName.replace(/'/g, "''") + "'!"].some(prefix => raw.range.startsWith(prefix))) throw new Error('CONFLICT');
    const extent = /!A1:([A-Z]+)([1-9][0-9]*)$/.exec(raw.range);
    if (!extent || sheetColumnIndex(extent[1]) < 0 || sheetColumnIndex(extent[1]) >= TRACKER_WRITE_COLUMN_LIMIT || Number(extent[2]) > 1500) throw new Error('CONFLICT');
    return raw.values as unknown[][];
  }
  try {
    const values = await read(), plan = planSubmissionWrite(snapshot, receipt, values, entry.timeZone);
    if (entry.expectedDate && plan.row.dateApplied && sheetDateDay(plan.row.dateApplied) !== entry.expectedDate) return 'CONFLICT';
    if (plan.done && !plan.data.length) return 'SYNCED';
    if (!plan.row.dateApplied) { entry.expectedDate = plan.day; await persistIntent(); }
    // Guard source rebinding and ordinary row moves before writing. Sheets has
    // no row-level compare-and-swap; post-write identity/readback is mandatory.
    const latest = parseTrackerSnapshot(await readJson(trackerSnapshotFile(root, options.env || process.env)));
    if (!latest || latest.spreadsheetId !== snapshot.spreadsheetId || latest.sheetName !== snapshot.sheetName) return 'CONFLICT';
    if (JSON.stringify(await read()) !== JSON.stringify(values)) return 'CONFLICT';
    await call(base.slice(0, -1) + ':batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: plan.data }) });
    const after = await read(), verified = planSubmissionWrite(snapshot, receipt, after, entry.timeZone);
    if (!verified.done || verified.row.sheetRow !== plan.row.sheetRow) return 'CONFLICT';
    if (plan.data.some(item => {
      const cell = /!([A-Z]+)(\d+)$/.exec(item.range)!;
      const observed = after[Number(cell[2]) - 1]?.[sheetColumnIndex(cell[1])];
      const expected = item.values[0][0];
      return typeof expected === 'number'
        ? sheetDateDay(typeof observed === 'number' || typeof observed === 'string' ? observed : undefined) !== plan.day
        : observed !== expected;
    })) return 'RETRY_REQUIRED';
    return 'SYNCED';
  } catch (error) { return error instanceof Error && error.message === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : error instanceof Error && error.message === 'CONFLICT' ? 'CONFLICT' : 'RETRY_REQUIRED'; }
  finally { clearTimeout(timer); controller.abort(); }
}
export async function enqueueSubmissionSync(input: unknown, options: SyncOptions = {}) {
  const receipt = parseSubmissionEvidence(input);
  if (!receipt) throw new Error('CONFIRMED_SUBMISSION_REQUIRED');
  const root = scopeRoot(options);
  await locked(root, async () => {
    const box = await readOutbox(root);
    const existing = box.entries.find(item => item.receipt.attemptId === receipt.attemptId);
    if (existing && JSON.stringify(existing.receipt) !== JSON.stringify(receipt)) throw new Error('RECEIPT_CONFLICT');
    if (!existing) {
      if (box.entries.length >= 1000) throw new Error('OUTBOX_FULL');
      const timeZone = options.timeZone || (options.env || process.env).ESCAPEHATCH_TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!validZone(timeZone)) throw new Error('INVALID_TRACKER_TIME_ZONE');
      box.entries.push({ receipt, target: await currentBinding(root, options.env || process.env), timeZone, state: 'PENDING', updatedAt: new Date().toISOString() });
      await writeOutbox(root, box);
    }
  });
  // Receipt persistence must not wait on network availability. Failed attempts
  // stay durable and the runtime's bounded worker retries them.
  if (!options.root) void retrySubmissionSync(options).catch(() => {});
  return readSubmissionSyncStatus(options);
}
export async function retrySubmissionSync(options: SyncOptions = {}) {
  const root = scopeRoot(options);
  await locked(root, async () => {
    const box = await readOutbox(root);
    for (const entry of box.entries.filter(item => item.state !== 'SYNCED').sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt)).slice(0, 10)) {
      try {
        // A changed Google target blocks only its provider write; a confirmed
        // submission still reconciles the original local queue.
        const file = path.join(root, 'workspace.v1.json'), current = await readWorkspace(file);
        if (current) {
          const applications = parseApplicationsStorage(current.workspace.values[APPLICATIONS_KEY] || []);
          if (!applications) throw new Error('INVALID_LOCAL_APPLICATIONS');
          const reconciled = reconcileSubmissionReceipts(applications, [entry.receipt]);
          if (reconciled !== applications) await saveWorkspace({ ...current.workspace, values: { ...current.workspace.values, [APPLICATIONS_KEY]: reconciled } }, current.revision, file);
        }
        entry.state = !entry.target || JSON.stringify(await currentBinding(root, options.env || process.env)) !== JSON.stringify(entry.target)
          ? 'CONFLICT' : await syncOne(entry, options, () => writeOutbox(root, box));
      } catch { entry.state = 'RETRY_REQUIRED'; }
      entry.updatedAt = new Date().toISOString();
      await writeOutbox(root, box);
    }
  });
  return readSubmissionSyncStatus(options);
}
/** A dashboard count is not this job's receipt. Scope UI status to the bound opportunity. */
export async function readSubmissionSyncStatus(options: SyncOptions = {}) {
  try {
    const box = await readOutbox(scopeRoot(options));
    const scoped = options.opportunityId !== undefined;
    const entries = scoped ? box.entries.filter(item => item.receipt.opportunityId === options.opportunityId) : box.entries;
    const counts = { pending: 0, synced: 0, authRequired: 0, conflicts: 0, retryRequired: 0 };
    for (const item of entries) counts[item.state === 'SYNCED' ? 'synced' : item.state === 'AUTH_REQUIRED' ? 'authRequired' : item.state === 'CONFLICT' ? 'conflicts' : item.state === 'RETRY_REQUIRED' ? 'retryRequired' : 'pending']++;
    return { opportunityId: options.opportunityId ?? null,
      state: counts.authRequired ? 'AUTH_REQUIRED' : counts.conflicts ? 'CONFLICT' :
      counts.retryRequired || counts.pending ? 'PENDING' : scoped ? (counts.synced ? 'SYNCED' : 'NO_RECEIPT') : 'IDLE', ...counts };
  } catch { return { opportunityId: options.opportunityId ?? null, state: 'RECOVERY_REQUIRED', pending: 0, synced: 0, authRequired: 0, conflicts: 0, retryRequired: 0 }; }
}

/** One-shot, headless replay: suitable for both the running host and a scheduled task. */
export async function runSubmissionSyncOnce(options: SyncOptions = {}) {
  const root = scopeRoot(options);
  const receipts = await readJson(path.join(root, 'managed-submission-receipts.json')).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error;
  });
  if (!Array.isArray(receipts) || receipts.length > 1000) throw new Error('INVALID_RECEIPTS');
  const existing = await readOutbox(root);
  for (const value of receipts) {
    const receipt = parseSubmissionEvidence(value);
    if (!receipt) throw new Error('INVALID_RECEIPTS');
    if (!existing.entries.some(entry => entry.receipt.attemptId === receipt.attemptId)) {
      await enqueueSubmissionSync(receipt, { ...options, root });
    }
  }
  return retrySubmissionSync({ ...options, root });
}

const startedRoots = new Set<string>();
export function startSubmissionSync() {
  const root = userDataRoot();
  if (startedRoots.has(root)) return; startedRoots.add(root);
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try { await runSubmissionSyncOnce({ root }); }
    catch { /* Durable receipt/outbox remain; status never claims successful sync. */ }
    finally { running = false; }
  };
  void tick();
  setInterval(() => void tick(), 30000).unref();
}
