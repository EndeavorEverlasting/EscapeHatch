import { APPLICATIONS_KEY, parseApplicationsStorage, type Application as LegacyApplication } from './storage';

export const CAREER_STATE_SCHEMA = 'escapehatch-career-state/v1' as const;
export const CAREER_STATE_DB_NAME = 'escape-hatch-career-state';
export const CAREER_STATE_DB_VERSION = 1;
export const CAREER_STATE_RECORD_KEY = 'primary';
export const LEGACY_APPLICATIONS_MIGRATION = 'legacy-applications-v1';

const STATE_STORE = 'career_state';
const SNAPSHOT_STORE = 'recovery_snapshots';
const META_STORE = 'meta';

export type CareerState = {
  schema_version: typeof CAREER_STATE_SCHEMA;
  state_id: string;
  revision: number;
  updated_at: string;
  profile: {
    id: string;
    headline: string;
    skills: string[];
    [key: string]: unknown;
  };
  opportunities: Record<string, unknown>[];
  resumes: Record<string, unknown>[];
  applications: Record<string, unknown>[];
  study_guidance?: Record<string, unknown>[];
  evidence: Record<string, unknown>[];
};

export type CareerStateValidator = (value: unknown) => CareerState;

export type CareerStateSnapshot = {
  id?: number;
  state_id: string;
  revision: number;
  captured_at: string;
  reason: 'pre_commit' | 'legacy_migration';
  state: CareerState;
};

export type CareerStateStoreOptions = {
  indexedDB?: IDBFactory;
  now?: () => string;
  validate?: CareerStateValidator;
};

export type CareerStateCommitResult =
  | { ok: true; state: CareerState }
  | { ok: false; code: 'NOT_INITIALIZED' | 'REVISION_CONFLICT' | 'INVALID_STATE' | 'TRANSACTION_FAILED'; error: string };

export type LegacyStorageLike = Pick<Storage, 'getItem' | 'removeItem'>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateCareerStateEnvelope(value: unknown): CareerState {
  if (!isRecord(value)) throw new Error('Career state must be an object.');
  if (value.schema_version !== CAREER_STATE_SCHEMA) throw new Error('Career state schema mismatch.');
  if (!isNonEmptyText(value.state_id)) throw new Error('Career state_id is required.');
  if (!Number.isInteger(value.revision) || Number(value.revision) < 1) throw new Error('Career state revision must be a positive integer.');
  if (!isNonEmptyText(value.updated_at) || Number.isNaN(Date.parse(String(value.updated_at)))) throw new Error('Career state updated_at must be an ISO date-time.');
  if (!isRecord(value.profile) || !isNonEmptyText(value.profile.id) || typeof value.profile.headline !== 'string' || !Array.isArray(value.profile.skills)) {
    throw new Error('Career state profile envelope is invalid.');
  }
  for (const key of ['opportunities', 'resumes', 'applications', 'evidence'] as const) {
    if (!Array.isArray(value[key])) throw new Error(`Career state ${key} must be an array.`);
  }
  if (value.study_guidance !== undefined && !Array.isArray(value.study_guidance)) throw new Error('Career state study_guidance must be an array when present.');
  return value as CareerState;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function openDatabase(indexedDB: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CAREER_STATE_DB_NAME, CAREER_STATE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the career-state database.'));
  });
}

function normalizePriority(priority: LegacyApplication['priority']): 'low' | 'medium' | 'high' {
  return priority === 'normal' ? 'medium' : priority;
}

function legacyOpportunity(application: LegacyApplication, now: string) {
  return {
    id: `legacy-opportunity-${application.id}`,
    title: application.role,
    organization: application.company,
    status: application.status === 'closed' ? 'closed' : 'targeted',
    priority: normalizePriority(application.priority),
    next_action: application.nextAction,
    source: application.url
      ? { owner: 'external', kind: 'uri', locator: application.url }
      : { owner: 'user', kind: 'inline', locator: `legacy-localstorage:${application.id}` },
    captured_at: application.updatedAt || now,
    ...(application.notes ? { notes: application.notes } : {}),
  };
}

export class CareerStateStore {
  private readonly indexedDB: IDBFactory;
  private readonly now: () => string;
  private readonly validate: CareerStateValidator;

  constructor(options: CareerStateStoreOptions = {}) {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) throw new Error('IndexedDB is unavailable.');
    this.indexedDB = factory;
    this.now = options.now ?? (() => new Date().toISOString());
    this.validate = options.validate ?? validateCareerStateEnvelope;
  }

  private async db() {
    return openDatabase(this.indexedDB);
  }

  async load(): Promise<CareerState | null> {
    const db = await this.db();
    try {
      const transaction = db.transaction(STATE_STORE, 'readonly');
      const raw = await requestResult(transaction.objectStore(STATE_STORE).get(CAREER_STATE_RECORD_KEY));
      await transactionDone(transaction);
      return raw === undefined ? null : clone(this.validate(raw));
    } finally {
      db.close();
    }
  }

  async initialize(initial: CareerState): Promise<CareerStateCommitResult> {
    let validated: CareerState;
    try {
      validated = clone(this.validate(initial));
    } catch (error) {
      return { ok: false, code: 'INVALID_STATE', error: error instanceof Error ? error.message : 'Career state is invalid.' };
    }
    const db = await this.db();
    try {
      const transaction = db.transaction(STATE_STORE, 'readwrite');
      const store = transaction.objectStore(STATE_STORE);
      const existing = await requestResult(store.get(CAREER_STATE_RECORD_KEY));
      if (existing !== undefined) {
        transaction.abort();
        return { ok: false, code: 'REVISION_CONFLICT', error: 'Career state is already initialized.' };
      }
      store.put(validated, CAREER_STATE_RECORD_KEY);
      await transactionDone(transaction);
      return { ok: true, state: clone(validated) };
    } catch (error) {
      return { ok: false, code: 'TRANSACTION_FAILED', error: error instanceof Error ? error.message : 'Career state initialization failed.' };
    } finally {
      db.close();
    }
  }

  async commit(next: CareerState, expectedRevision: number): Promise<CareerStateCommitResult> {
    let validated: CareerState;
    try {
      validated = clone(this.validate(next));
      if (validated.revision !== expectedRevision + 1) {
        return { ok: false, code: 'INVALID_STATE', error: 'Next revision must equal expected revision + 1.' };
      }
    } catch (error) {
      return { ok: false, code: 'INVALID_STATE', error: error instanceof Error ? error.message : 'Career state is invalid.' };
    }

    const db = await this.db();
    const transaction = db.transaction([STATE_STORE, SNAPSHOT_STORE], 'readwrite');
    try {
      const stateStore = transaction.objectStore(STATE_STORE);
      const currentRaw = await requestResult(stateStore.get(CAREER_STATE_RECORD_KEY));
      if (currentRaw === undefined) {
        transaction.abort();
        return { ok: false, code: 'NOT_INITIALIZED', error: 'Career state is not initialized.' };
      }
      const current = this.validate(currentRaw);
      if (current.revision !== expectedRevision) {
        transaction.abort();
        return {
          ok: false,
          code: 'REVISION_CONFLICT',
          error: `Expected revision ${expectedRevision}, found ${current.revision}.`,
        };
      }
      if (validated.state_id !== current.state_id) {
        transaction.abort();
        return { ok: false, code: 'INVALID_STATE', error: 'Career state_id cannot change during commit.' };
      }

      const snapshot: CareerStateSnapshot = {
        state_id: current.state_id,
        revision: current.revision,
        captured_at: this.now(),
        reason: 'pre_commit',
        state: clone(current),
      };
      transaction.objectStore(SNAPSHOT_STORE).add(snapshot);
      stateStore.put(validated, CAREER_STATE_RECORD_KEY);
      await transactionDone(transaction);
      return { ok: true, state: clone(validated) };
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed/aborted */ }
      return { ok: false, code: 'TRANSACTION_FAILED', error: error instanceof Error ? error.message : 'Career state commit failed.' };
    } finally {
      db.close();
    }
  }

  async recoverySnapshots(): Promise<CareerStateSnapshot[]> {
    const db = await this.db();
    try {
      const transaction = db.transaction(SNAPSHOT_STORE, 'readonly');
      const values = await requestResult(transaction.objectStore(SNAPSHOT_STORE).getAll());
      await transactionDone(transaction);
      return (values as CareerStateSnapshot[]).map(clone);
    } finally {
      db.close();
    }
  }

  async migrateLegacyApplications(
    storage: LegacyStorageLike | undefined,
    createInitialState: (opportunities: Record<string, unknown>[], observedAt: string) => CareerState,
  ): Promise<{ migrated: boolean; count: number; state: CareerState | null }> {
    if (!storage) return { migrated: false, count: 0, state: await this.load() };

    const db = await this.db();
    try {
      const read = db.transaction([META_STORE, STATE_STORE], 'readonly');
      const [marker, current] = await Promise.all([
        requestResult(read.objectStore(META_STORE).get(LEGACY_APPLICATIONS_MIGRATION)),
        requestResult(read.objectStore(STATE_STORE).get(CAREER_STATE_RECORD_KEY)),
      ]);
      await transactionDone(read);
      if (marker !== undefined || current !== undefined) {
        return { migrated: false, count: 0, state: current === undefined ? null : clone(this.validate(current)) };
      }

      const raw = storage.getItem(APPLICATIONS_KEY);
      if (raw === null) return { migrated: false, count: 0, state: null };
      let legacy: LegacyApplication[] | null = null;
      try { legacy = parseApplicationsStorage(JSON.parse(raw)); } catch { legacy = null; }
      if (!legacy) throw new Error('Legacy applications are malformed; migration made no changes.');

      const observedAt = this.now();
      const opportunities = legacy.map((application) => legacyOpportunity(application, observedAt));
      const candidate = clone(this.validate(createInitialState(opportunities, observedAt)));

      const write = db.transaction([STATE_STORE, SNAPSHOT_STORE, META_STORE], 'readwrite');
      write.objectStore(STATE_STORE).put(candidate, CAREER_STATE_RECORD_KEY);
      write.objectStore(SNAPSHOT_STORE).add({
        state_id: candidate.state_id,
        revision: candidate.revision,
        captured_at: observedAt,
        reason: 'legacy_migration',
        state: clone(candidate),
      } satisfies CareerStateSnapshot);
      write.objectStore(META_STORE).put({ migrated_at: observedAt, count: legacy.length }, LEGACY_APPLICATIONS_MIGRATION);
      await transactionDone(write);

      // Legacy state is removed only after the atomic IndexedDB migration commits.
      storage.removeItem(APPLICATIONS_KEY);
      return { migrated: true, count: legacy.length, state: candidate };
    } finally {
      db.close();
    }
  }
}
