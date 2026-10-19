import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { updatePreferences } from './preference-file.ts';
import { installAnswerMemory, mergeCapturedAnswer, mergeQuestionCatalog, scanQuestionCatalog } from './managed-answer-memory.ts';
import { installManagedSubmissionObserver, type ManagedSubmissionReceipt } from './managed-submission-observer.ts';
import { parseSubmissionEvidence } from './src/lib/submission-reconciliation.ts';

export type ListenerScope = { opportunityId: string; applicationUrl: string; employerName: string };
const receiptFile = () => path.resolve(import.meta.dirname, '../../private/managed-submission-receipts.json');

export async function readSubmissionReceipts(file = receiptFile()): Promise<ManagedSubmissionReceipt[]> {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(data) || data.length > 1000 || data.some(value => !parseSubmissionEvidence(value))) {
      throw new Error('Invalid receipt store');
    }
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error('Submission receipts unavailable; existing evidence preserved.');
  }
}

export class ManagedListeners {
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
  constructor(receiptsPath = receiptFile(), preferencesPath?: string) {
    this.receiptsPath = receiptsPath;
    this.preferencesPath = preferencesPath;
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
      submitSelector: '#root button',
      successSelector: '#root h1, #root h2, #root [role="status"], #root [role="alert"], #root div',
      onChange: snapshot => {
        if (!snapshot.receipt || generation !== this.generation) return;
        const receipt = snapshot.receipt;
        this.serial = this.serial.then(async () => {
          const current = await readSubmissionReceipts(this.receiptsPath);
          if (current.some(item => item.attemptId === receipt.attemptId)) return;
          const directory = path.dirname(this.receiptsPath);
          await fs.mkdir(directory, { recursive: true });
          const temporary = this.receiptsPath + '.' + randomUUID() + '.tmp';
          try {
            await fs.writeFile(temporary, JSON.stringify([...current, receipt].slice(-1000)), { flag: 'wx', mode: 0o600 });
            await fs.rename(temporary, this.receiptsPath);
          } finally { await fs.rm(temporary, { force: true }); }
        }).catch(() => { this.error = 'Submission was observed but its receipt could not be saved. Queue status remains unverified.'; });
      },
    });
    return this.status();
  }

  async arm() {
    try { await this.observer?.arm(); }
    catch { this.error = 'Submission tracking could not arm on this page. Review the current application before trying again.'; }
    return this.status();
  }
  async disarm() { await this.observer?.disarm(); return this.status(); }
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
