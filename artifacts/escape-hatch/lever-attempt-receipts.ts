import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { userDataRoot } from './user-data.ts';

export type LeverResumeEvidence = 'UNCHECKED' | 'UNREVIEWED' | 'INPUT_UNVERIFIED' | 'MISSING' |
  'INVALID' | 'PARSING' | 'UPLOAD_REJECTED' | 'DIGEST_MISMATCH' | 'CHANGED' | 'VERIFIED';
export type LeverReceipt = {
  id: string;
  action: 'ATTACH' | 'SUBMIT';
  createdAt: string;
  resumeBefore: LeverResumeEvidence;
  resumeAfter: 'NOT_OBSERVED' | 'EMPTY' | 'PRESENT';
  resumeSha256: string | null;
  dispatch: 'NOT_ATTEMPTED' | 'ATTEMPTING' | 'CLICK_RETURNED' | 'CLICK_UNCERTAIN' | 'CLICK_OBSERVED';
  response: 'NOT_EXPECTED' | 'PENDING' | 'LEVER_VERIFICATION_ERROR' | 'VALIDATION_FAILED' | 'CONFIRMED';
  code: string;
  observerAttemptId: string | null;
};

/** Private local evidence. Only the independent employer-confirmation receipt can authorize writeback. */
export class LeverAttemptReceipts {
  private readonly root: string;
  constructor(root = userDataRoot()) { this.root = root; }

  private access<T>(job: string, operation: (db: DatabaseSync, scope: string) => T): T {
    const scope = createHash('sha256').update(job).digest('hex');
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(path.join(this.root, 'lever-attempt-receipts.sqlite'));
    try {
      db.exec(`PRAGMA busy_timeout=1000;
        CREATE TABLE IF NOT EXISTS receipts (
          id TEXT PRIMARY KEY, scope TEXT NOT NULL, action TEXT NOT NULL, createdAt TEXT NOT NULL,
          resumeBefore TEXT NOT NULL, resumeAfter TEXT NOT NULL DEFAULT 'NOT_OBSERVED',
          resumeSha256 TEXT, dispatch TEXT NOT NULL, response TEXT NOT NULL, code TEXT NOT NULL, observerAttemptId TEXT
        );
        CREATE INDEX IF NOT EXISTS receipts_scope ON receipts(scope);`);
      return operation(db, scope);
    } finally {
      db.close();
    }
  }

  recent(job: string): LeverReceipt[] {
    return this.access(job, (db, scope) => db.prepare(`
      SELECT id, action, createdAt, resumeBefore, resumeAfter, resumeSha256, dispatch, response, code, observerAttemptId
      FROM receipts WHERE scope = ? ORDER BY rowid DESC LIMIT 10
    `).all(scope) as LeverReceipt[]);
  }

  record(job: string, action: LeverReceipt['action'], resumeBefore: LeverResumeEvidence, code: string,
    resumeSha256: string | null = null): LeverReceipt | null {
    return this.access(job, (db, scope) => {
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const reservation = action === 'SUBMIT' && code === 'DISPATCH_RESERVED';
      const dispatch = reservation ? 'ATTEMPTING' : 'NOT_ATTEMPTED';
      const response = reservation ? 'PENDING' : 'NOT_EXPECTED';
      const inserted = db.prepare(`
        INSERT INTO receipts(id, scope, action, createdAt, resumeBefore, resumeSha256, dispatch, response, code)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT (? AND EXISTS (SELECT 1 FROM receipts WHERE scope = ? AND response IN ('PENDING','CONFIRMED')))
      `).run(id, scope, action, createdAt, resumeBefore, resumeSha256, dispatch, response, code, Number(reservation), scope);
      return inserted.changes ? { id, action, createdAt, resumeBefore, resumeSha256, dispatch, response, code, resumeAfter: 'NOT_OBSERVED', observerAttemptId: null } : null;
    });
  }

  recordClick(job: string, id: string, dispatch: 'CLICK_RETURNED' | 'CLICK_UNCERTAIN' | 'CLICK_OBSERVED', observerAttemptId: string | null = null) {
    this.access(job, (db, scope) => db.prepare(`
      UPDATE receipts SET dispatch = ?, observerAttemptId = COALESCE(?, observerAttemptId)
      WHERE scope = ? AND id = ? AND dispatch <> 'NOT_ATTEMPTED'
      AND (dispatch = 'ATTEMPTING' OR (? = 'CLICK_OBSERVED' AND dispatch <> 'CLICK_OBSERVED'))
    `).run(dispatch, observerAttemptId, scope, id, dispatch));
  }

  recordResponse(job: string, id: string, response: 'LEVER_VERIFICATION_ERROR' | 'VALIDATION_FAILED' | 'CONFIRMED',
    resumeAfter: LeverReceipt['resumeAfter']) {
    this.access(job, (db, scope) => db.prepare(`
      UPDATE receipts SET response = ?, resumeAfter = ? WHERE scope = ? AND id = ?
      AND dispatch <> 'NOT_ATTEMPTED' AND response <> 'CONFIRMED'
      AND (response = 'PENDING' OR ? = 'CONFIRMED')
    `).run(response, resumeAfter, scope, id, response));
  }

  pending(job: string): boolean {
    return this.access(job, (db, scope) => Boolean(db.prepare(`
      SELECT 1 FROM receipts WHERE scope = ? AND response IN ('PENDING','CONFIRMED') LIMIT 1
    `).get(scope)));
  }
}
