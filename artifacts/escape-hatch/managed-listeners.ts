import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Page } from '@playwright/test';
import { updatePreferences } from './preference-file.ts';
import { installAnswerMemory, mergeCapturedAnswer, mergeQuestionCatalog, scanQuestionCatalog } from './managed-answer-memory.ts';
import { installManagedSubmissionObserver, type ManagedSubmissionReceipt } from './managed-submission-observer.ts';
import { parseSubmissionEvidence } from './src/lib/submission-reconciliation.ts';
import { userDataRoot, legacyPrivateRoots } from './user-data.ts';

export type ListenerScope = { opportunityId: string; applicationUrl: string; opportunityUrl?: string; employerName: string };
export const submissionReceiptFile = () => path.join(userDataRoot(), 'managed-submission-receipts.json');

export async function readSubmissionReceipts(file = submissionReceiptFile()): Promise<ManagedSubmissionReceipt[]> {
  try {
    if ((await fs.stat(file)).size > 2 * 1024 * 1024) throw new Error('Receipt store oversized.');
    const bytes = await fs.readFile(file);
    if (bytes.length > 2 * 1024 * 1024) throw new Error('Receipt store oversized.');
    const data = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(data) || data.length > 1000 || data.some(value => !parseSubmissionEvidence(value))) {
      throw new Error('Invalid receipt store');
    }
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error('Submission receipts unavailable; existing evidence preserved.');
  }
}

/** Recover receipts without moving legacy evidence or replacing a newer stable store. */
export async function migrateSubmissionReceipts(destination = submissionReceiptFile(), roots = legacyPrivateRoots()) {
  try { await fs.access(destination); return; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const records = new Map<string, ManagedSubmissionReceipt>();
  for (const root of [...new Set(roots)]) {
    const file = path.join(root, 'managed-submission-receipts.json');
    if (path.resolve(file) === path.resolve(destination)) continue;
    for (const receipt of await readSubmissionReceipts(file)) {
      const previous = records.get(receipt.attemptId);
      if (previous && JSON.stringify(previous) !== JSON.stringify(receipt)) throw new Error('Conflicting legacy submission receipts need review. Existing evidence preserved.');
      records.set(receipt.attemptId, receipt);
    }
  }
  if (!records.size) return;
  if (records.size > 1000) throw new Error('Submission receipt archive needs review. Existing evidence preserved.');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try { await fs.writeFile(destination, JSON.stringify([...records.values()]), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
}

/** Exact hosted Lever scope; no arbitrary same-origin job or suffix matching. */
export function submissionAdapter(applicationUrl: string) {
  const url = new URL(applicationUrl);
  // HiringPlatform forms use a job/stage/locale path and native form submits.
  // Posting UUID routes cannot grant this adapter; bind the observed form first.
  if (url.protocol === 'https:' && /^[a-z0-9-]+\.hiringplatform\.com$/i.test(url.hostname) &&
      (/^\/\d+-[a-z0-9-]+\/\d+\/[a-z]{2}(?:-[a-z]{2})?\/?$/i.test(url.pathname) ||
       /^\/questionnaires\/\d+\/people\/[a-z0-9_-]+\/?$/i.test(url.pathname))) {
    return {
      submitSelector: '#question-page-form button[type="submit"], #question-page-form input[type="submit"]',
      acceptAnySubmitLabel: true,
      successSelector: '#tw-app [role="status"], #tw-app [role="alert"], #tw-app h1, #tw-app h2, #tw-app #question-page-form :is(h3,h4,h5,h6), #tw-app .alert-success',
      confirmationPaths: [],
      continuationPathPrefixes: [url.pathname.replace(/\/$/, '') + '/'],
    };
  }
  if (url.protocol === 'https:' && url.hostname === 'jobs.lever.co' && /^\/[^/]+\/[a-f0-9-]{36}\/apply\/?$/i.test(url.pathname)) {
    const base = url.pathname.replace(/\/apply\/?$/, '');
    return { submitSelector: '#btn-submit', successSelector: '.application-confirmation h1, .application-confirmation h2, .application-confirmation p, .application-confirmation, .content h1, .content h2', confirmationPaths: [base + '/thanks'] };
  }
  // Broadcastwell's inline career application may have multiple steps, each
  // using "Submit", "Next", or another label. Labels are NOT finality evidence.
  // Only this exact job path and its descendants may continue the same listener.
  if (url.protocol === 'https:' && ['broadcastwell.com', 'www.broadcastwell.com'].includes(url.hostname) &&
      url.pathname === '/careers/ai-automation-engineer') {
    return {
      submitSelector: 'form button[type="submit"], form button:not([type]), form input[type="submit"]',
      acceptAnySubmitLabel: true,
      successSelector: '[role="status"], [role="alert"], .application-success, .form-success, [data-submission-success], main h1, main h2',
      confirmationPaths: [],
      continuationPathPrefixes: ['/careers/ai-automation-engineer/'],
    };
  }
  return { submitSelector: '#root button', successSelector: '#root h1, #root h2, #root [role="status"], #root [role="alert"], #root div', confirmationPaths: [] };
}

export class ManagedListeners {
  readonly implementationVersion = 4;
  private stopMemory: (() => Promise<void>) | null = null;
  private observer: Awaited<ReturnType<typeof installManagedSubmissionObserver>> | null = null;
  private serial: Promise<void> = Promise.resolve();
  private generation = 0;
  private savedAnswers = 0;
  private error = '';
  private recording = true;
  private scope: ListenerScope | null = null;
  private receiptsPath: string;
  private preferencesPath?: string;
  private recoverLegacy: boolean;
  private onReceipt?: (receipt: ManagedSubmissionReceipt) => Promise<unknown>;
  constructor(receiptsPath = submissionReceiptFile(), preferencesPath?: string, onReceipt?: (receipt: ManagedSubmissionReceipt) => Promise<unknown>) {
    this.receiptsPath = receiptsPath;
    this.preferencesPath = preferencesPath;
    this.recoverLegacy = receiptsPath === submissionReceiptFile() && !process.env.ESCAPEHATCH_DATA_HOME;
    this.onReceipt = onReceipt;
  }

  async attach(page: Page, scope: ListenerScope, recording = true) {
    await this.dispose();
    this.scope = scope;
    this.recording = recording;
    const generation = this.generation;
    this.stopMemory = await installAnswerMemory(page, event => {
      if (!this.recording || generation !== this.generation) return;
      this.serial = this.serial.then(async () => {
        await updatePreferences(current => mergeCapturedAnswer(current, event), this.preferencesPath);
        this.savedAnswers++;
      }).catch(() => { this.error = 'Could not save an answer. Existing saved answers were preserved.'; });
    }, scope.employerName);
    this.observer = await installManagedSubmissionObserver(page, {
      opportunityId: scope.opportunityId,
      sessionId: 'managed-' + randomUUID(),
      applicationUrl: scope.applicationUrl,
      opportunityUrl: scope.opportunityUrl,
      ...submissionAdapter(scope.applicationUrl),
      onChange: snapshot => {
        if (!snapshot.receipt || generation !== this.generation) return;
        const receipt = snapshot.receipt;
        this.serial = this.serial.then(async () => {
          if (this.recoverLegacy) await migrateSubmissionReceipts(this.receiptsPath);
          const directory = path.dirname(this.receiptsPath);
          await fs.mkdir(directory, { recursive: true });
          const lock = new DatabaseSync(this.receiptsPath + '.lock.sqlite');
          // Never drop an observed employer receipt on a transient concurrent
          // writer. SQLite holds the cross-process lock, async backoff permits
          // the owner to complete filesystem I/O before we retry.
          let acquired = false;
          for (let attempt = 0; attempt < 20; attempt++) {
            try { lock.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); acquired = true; break; }
            catch (error) {
              if (attempt === 19 || !/busy|locked/i.test(String(error))) { lock.close(); throw new Error('Submission receipt store busy; recovery review required.'); }
              await new Promise(resolve => setTimeout(resolve, 30 * (attempt + 1)));
            }
          }
          if (!acquired) { lock.close(); throw new Error('Submission receipt store busy; recovery review required.'); }
          const temporary = this.receiptsPath + '.' + randomUUID() + '.tmp';
          try {
            const current = await readSubmissionReceipts(this.receiptsPath);
            if (!current.some(item => item.attemptId === receipt.attemptId)) {
              if (current.length >= 1000) throw new Error('Submission receipt archive full.');
              await fs.writeFile(temporary, JSON.stringify([...current, receipt]), { flag: 'wx', mode: 0o600 });
              await fs.rename(temporary, this.receiptsPath);
            }
          } finally { try { await fs.rm(temporary, { force: true }); } finally { try { lock.exec('ROLLBACK'); } finally { lock.close(); } } }
          // Durable evidence precedes provider reconciliation; replay can recover
          // a process interruption between these two independently proven steps.
          try { await this.onReceipt?.(receipt); }
          catch { this.error = 'Employer confirmation saved; tracker synchronization is pending retry.'; }
        }).catch(() => { this.error = 'Submission was observed but its receipt could not be saved. Queue status remains unverified.'; });
      },
    });
    return this.status();
  }

  async arm() {
    try { if (!this.observer) throw new Error('No bound submission observer.'); if ((await this.observer.arm()).state === 'ARMED') this.error = ''; }
    catch { this.error = 'Submission tracking could not arm on this page. Review the current application before trying again.'; }
    return this.status();
  }
  async disarm() { await this.observer?.disarm(); return this.status(); }
  async refresh() {
    if (!this.observer || typeof this.observer.refresh !== 'function') {
      throw new Error('This legacy observer cannot replay its confirmation scan. Preserve evidence; do not resubmit.');
    }
    await this.observer.refresh();
    return this.status();
  }
  async setRecording(enabled: boolean) { this.recording = enabled; return this.status(); }
  async catalog(page: Page) {
    const catalog = await scanQuestionCatalog(page);
    this.serial = this.serial.then(async () => {
      await updatePreferences(current => mergeQuestionCatalog(current, catalog), this.preferencesPath);
    }).catch(() => { this.error = 'New question discovery could not be saved.'; });
    await this.serial;
    return catalog;
  }
  async status() {
    await this.serial;
    if (this.recoverLegacy) await migrateSubmissionReceipts(this.receiptsPath);
    return { recordingAnswers: this.recording && !!this.stopMemory, savedAnswers: this.savedAnswers,
      submission: this.observer?.snapshot() || null, opportunityId: this.scope?.opportunityId || '', error: this.error,
      receipts: await readSubmissionReceipts(this.receiptsPath) };
  }
  async dispose() {
    await this.stopMemory?.();
    await this.observer?.dispose();
    await this.serial;
    this.generation++;
    this.stopMemory = null;
    this.observer = null;
    this.scope = null;
  }
}
