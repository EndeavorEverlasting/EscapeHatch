/**
 * Owner-bound private persistence for the résumé-selection graph.
 * Pure planner lives in src/lib/resume-selection-graph.ts; this store never
 * uploads to a provider. Account-wide replacement still requires explicit
 * operator consent plus later provider readback.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { userDataRoot } from './user-data.ts';
import {
  RESUME_GRAPH_SCHEMA,
  listApprovedResumeChoices,
  resolveUserSelectedResume,
  validateResumeGraph,
  type Decision,
  type ResumeGraph,
  type ResumeNode,
  type ResumeTier,
  type PlatformSlotNode,
} from './src/lib/resume-selection-graph.ts';

export const RESUME_SELECTION_STORE_SCHEMA = 'escapehatch/resume-selection-store/v1' as const;
export const INDEED_ACCOUNT_SLOT_ID = 'indeed-account';

export type PendingSlotSwitch = {
  resumeId: string;
  digest: string;
  plannedAt: string;
  providerVerified: boolean;
  effect: 'account_wide_replacement';
};

export type ResumeSelectionStoreFile = {
  schema: typeof RESUME_SELECTION_STORE_SCHEMA;
  ownerId: string;
  graph: ResumeGraph;
  pendingSlotReadbacks: Record<string, PendingSlotSwitch>;
};

export type PrivatePdf = { name: string; mimeType: 'application/pdf'; buffer: Buffer };

const defaultRoot = () => path.join(userDataRoot(), 'resume-selection');

function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function validOwner(ownerId: unknown): ownerId is string {
  return typeof ownerId === 'string' && ownerId.length >= 8 && ownerId.length <= 128 && ownerId.trim() === ownerId;
}

export function indeedSlotIdForUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'indeed.com' || host.endsWith('.indeed.com')) return INDEED_ACCOUNT_SLOT_ID;
  } catch { /* not a URL */ }
  return null;
}

function emptyGraph(ownerId: string): ResumeGraph {
  return { schema: RESUME_GRAPH_SCHEMA, owner: ownerId, nodes: [], edges: [] };
}

function indeedSlot(ownerId: string): PlatformSlotNode {
  return {
    id: INDEED_ACCOUNT_SLOT_ID,
    type: 'platform_slot',
    owner: ownerId,
    platform: 'indeed',
    scope: 'persistent_global',
    observation: 'unverified',
  };
}

export class ResumeSelectionStore {
  private root: string;
  constructor(root?: string) {
    this.root = root ?? defaultRoot();
  }

  private file(ownerId: string) {
    return path.join(this.root, createHash('sha256').update(ownerId).digest('hex'), 'graph.json');
  }

  private pdfPath(digest: string) {
    return path.join(this.root, 'pdf', digest + '.pdf');
  }

  private async mutate<T>(ownerId: string, action: () => Promise<T>): Promise<T> {
    if (!validOwner(ownerId)) throw new Error('Verified applicant owner is required for résumé selection.');
    await fs.mkdir(this.root, { recursive: true });
    const lockPath = this.file(ownerId) + '.lock.sqlite';
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    const lock = new DatabaseSync(lockPath);
    try { lock.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); }
    catch { lock.close(); throw new Error('Résumé selection store is busy. Retry after the other action finishes.'); }
    try { return await action(); }
    finally { try { lock.exec('ROLLBACK'); } finally { lock.close(); } }
  }

  async read(ownerId: string): Promise<ResumeSelectionStoreFile> {
    if (!validOwner(ownerId)) throw new Error('Verified applicant owner is required for résumé selection.');
    try {
      const raw = JSON.parse(await fs.readFile(this.file(ownerId), 'utf8')) as ResumeSelectionStoreFile;
      if (raw.schema !== RESUME_SELECTION_STORE_SCHEMA || raw.ownerId !== ownerId ||
          !raw.graph || raw.graph.owner !== ownerId || raw.graph.schema !== RESUME_GRAPH_SCHEMA ||
          typeof raw.pendingSlotReadbacks !== 'object' || !raw.pendingSlotReadbacks) {
        throw new Error('invalid');
      }
      // Incomplete bootstraps may hold only the Indeed slot until a canonical master exists.
      if (raw.graph.nodes.some(n => n.type === 'resume')) validateResumeGraph(raw.graph);
      return raw;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          schema: RESUME_SELECTION_STORE_SCHEMA,
          ownerId,
          graph: emptyGraph(ownerId),
          pendingSlotReadbacks: {},
        };
      }
      throw new Error('Private résumé selection could not be read. Existing data preserved.');
    }
  }

  private async write(value: ResumeSelectionStoreFile) {
    if (value.graph.nodes.some(n => n.type === 'resume')) validateResumeGraph(value.graph);
    const destination = this.file(value.ownerId);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const temporary = destination + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, destination);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  async ensureIndeedSlot(ownerId: string): Promise<ResumeSelectionStoreFile> {
    return this.mutate(ownerId, async () => {
      const current = await this.read(ownerId);
      if (current.graph.nodes.some(n => n.id === INDEED_ACCOUNT_SLOT_ID && n.type === 'platform_slot')) {
        return current;
      }
      current.graph.nodes.push(indeedSlot(ownerId));
      await this.write(current);
      return current;
    });
  }

  async registerApprovedResume(input: {
    ownerId: string;
    resumeId: string;
    tier: ResumeTier;
    revision: string;
    domainTags?: string[];
    parentResumeId?: string;
    file: PrivatePdf;
  }): Promise<ResumeSelectionStoreFile> {
    return this.mutate(input.ownerId, async () => {
      const current = await this.ensureIndeedSlotUnlocked(input.ownerId);
      if (!/^[A-Za-z0-9_.-]{1,120}$/.test(input.resumeId)) throw new Error('Invalid résumé id.');
      if (!['canonical', 'domain', 'job'].includes(input.tier)) throw new Error('Invalid résumé tier.');
      if (input.tier === 'job') throw new Error('Job derivatives are not account-wide switcher choices.');
      if (input.file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-' ||
          input.file.buffer.length > 5 * 1024 * 1024 ||
          !/^[A-Za-z0-9_. -]{1,120}\.pdf$/i.test(input.file.name)) {
        throw new Error('Invalid résumé PDF.');
      }
      const digest = sha256(input.file.buffer);
      if (current.graph.nodes.some(n => n.id === input.resumeId)) {
        throw new Error('A résumé with that id is already registered for this owner.');
      }
      if (input.tier === 'canonical' && current.graph.nodes.some(n => n.type === 'resume' && n.tier === 'canonical')) {
        throw new Error('This owner already has a canonical master.');
      }
      const node: ResumeNode = {
        id: input.resumeId,
        type: 'resume',
        owner: input.ownerId,
        tier: input.tier,
        revision: input.revision,
        digest,
        review: 'approved',
        ...(input.tier === 'domain' ? { domainTags: input.domainTags } : {}),
      };
      if (input.tier === 'domain') {
        if (!input.parentResumeId || !input.domainTags?.length) {
          throw new Error('Domain résumés require parent master and domain tags.');
        }
        const parent = current.graph.nodes.find(n => n.id === input.parentResumeId);
        if (parent?.type !== 'resume' || parent.tier !== 'canonical' || parent.review !== 'approved') {
          throw new Error('Domain résumé must derive from the approved canonical master.');
        }
        current.graph.edges.push({
          kind: 'derives_from',
          from: input.resumeId,
          to: parent.id,
          parentDigest: parent.digest,
        });
      }
      current.graph.nodes.push(node);
      await fs.mkdir(path.join(this.root, 'pdf'), { recursive: true });
      await fs.writeFile(this.pdfPath(digest), input.file.buffer, { mode: 0o600 });
      await this.write(current);
      return current;
    });
  }

  private async ensureIndeedSlotUnlocked(ownerId: string): Promise<ResumeSelectionStoreFile> {
    const current = await this.read(ownerId);
    if (!current.graph.nodes.some(n => n.id === INDEED_ACCOUNT_SLOT_ID && n.type === 'platform_slot')) {
      current.graph.nodes.push(indeedSlot(ownerId));
      await this.write(current);
    }
    return this.read(ownerId);
  }

  async listChoices(ownerId: string, platformSlotId = INDEED_ACCOUNT_SLOT_ID) {
    const current = await this.ensureIndeedSlot(ownerId);
    const slot = current.graph.nodes.find(n => n.id === platformSlotId && n.type === 'platform_slot') as PlatformSlotNode | undefined;
    const pending = current.pendingSlotReadbacks[platformSlotId] ?? null;
    const choices = current.graph.nodes.some(n => n.type === 'resume')
      ? listApprovedResumeChoices(current.graph, platformSlotId)
      : [];
    return {
      ownerId,
      platformSlotId,
      platform: slot?.platform ?? null,
      scope: slot?.scope ?? null,
      observation: slot?.observation ?? null,
      choices,
      pending,
      queueWideLock: false as const,
    };
  }

  async planSelect(input: {
    ownerId: string;
    platformSlotId?: string;
    resumeId: string;
    consentAccountWideReplacement: boolean;
  }): Promise<{
    decision: Decision;
    store: ResumeSelectionStoreFile;
    requiresConsent: boolean;
    selected: boolean;
    queueWideLock: false;
    disclosure: string | null;
  }> {
    const platformSlotId = input.platformSlotId || INDEED_ACCOUNT_SLOT_ID;
    return this.mutate(input.ownerId, async () => {
      const refreshed = await this.ensureIndeedSlotUnlocked(input.ownerId);
      const eligible = listApprovedResumeChoices(refreshed.graph, platformSlotId)
        .some(choice => choice.resumeId === input.resumeId);
      if (!eligible) {
        return {
          decision: {
            action: 'REVIEW_REQUIRED',
            reason: 'UNKNOWN_OR_UNAPPROVED_RESUME_CHOICE',
            candidateId: null,
            platformSlotId,
            mayAutoReplacePersistentResume: false,
            mayAutoSubmit: false,
          },
          store: refreshed,
          requiresConsent: false,
          selected: false,
          queueWideLock: false,
          disclosure: null,
        };
      }
      const candidate = refreshed.graph.nodes.find(n => n.id === input.resumeId) as ResumeNode | undefined;
      if (!candidate) {
        return {
          decision: {
            action: 'REVIEW_REQUIRED',
            reason: 'UNKNOWN_RESUME_CHOICE',
            candidateId: null,
            platformSlotId,
            mayAutoReplacePersistentResume: false,
            mayAutoSubmit: false,
          },
          store: refreshed,
          requiresConsent: false,
          selected: false,
          queueWideLock: false,
          disclosure: null,
        };
      }
      const disclosure =
        `Replacing the account-wide ${platformSlotId} résumé with approved ${candidate.tier} résumé ${candidate.id} (digest ${candidate.digest.slice(0, 12)}…). This shared platform copy affects other applications on that account until you switch again.`;
      const currentEdge = refreshed.graph.edges.find(e => e.kind === 'slot_points_to' && e.from === platformSlotId);
      if (currentEdge?.to === input.resumeId) {
        const keep = resolveUserSelectedResume(refreshed.graph, { platformSlotId, resumeId: input.resumeId });
        return {
          decision: keep.action === 'REVIEW_REQUIRED'
            ? {
                action: 'KEEP_CURRENT',
                reason: 'USER_SELECTED_RESUME_ALREADY_CURRENT_LOCAL',
                candidateId: input.resumeId,
                platformSlotId,
                mayAutoReplacePersistentResume: false,
                mayAutoSubmit: false,
              }
            : keep,
          store: refreshed,
          requiresConsent: false,
          selected: true,
          queueWideLock: false,
          disclosure: null,
        };
      }
      if (!input.consentAccountWideReplacement) {
        const planned = resolveUserSelectedResume(refreshed.graph, { platformSlotId, resumeId: input.resumeId });
        return {
          decision: planned.action === 'REVIEW_REQUIRED'
            ? {
                action: 'UPLOAD_REQUIRES_CONSENT',
                reason: planned.reason === 'PLATFORM_SLOT_SEMANTICS_UNVERIFIED'
                  ? 'USER_SELECTED_RESUME_SWITCH_PENDING_PROVIDER_SCOPE'
                  : 'USER_SELECTED_RESUME_SWITCH',
                candidateId: input.resumeId,
                platformSlotId,
                mayAutoReplacePersistentResume: false,
                mayAutoSubmit: false,
              }
            : planned,
          store: refreshed,
          requiresConsent: true,
          selected: false,
          queueWideLock: false,
          disclosure,
        };
      }
      const next = await this.read(input.ownerId);
      next.graph.edges = next.graph.edges.filter(e => !(e.kind === 'slot_points_to' && e.from === platformSlotId));
      next.graph.edges.push({ kind: 'slot_points_to', from: platformSlotId, to: input.resumeId });
      next.pendingSlotReadbacks[platformSlotId] = {
        resumeId: input.resumeId,
        digest: candidate.digest,
        plannedAt: new Date().toISOString(),
        providerVerified: false,
        effect: 'account_wide_replacement',
      };
      await this.write(next);
      const after = resolveUserSelectedResume(next.graph, { platformSlotId, resumeId: input.resumeId });
      return {
        decision: after.action === 'REVIEW_REQUIRED'
          ? {
              action: 'UPLOAD_REQUIRES_CONSENT',
              reason: 'USER_SELECTED_RESUME_SWITCH_LOCAL_INTENT',
              candidateId: input.resumeId,
              platformSlotId,
              mayAutoReplacePersistentResume: false,
              mayAutoSubmit: false,
            }
          : after,
        store: next,
        requiresConsent: false,
        selected: true,
        queueWideLock: false,
        disclosure,
      };
    });
  }

  async markProviderReadback(input: {
    ownerId: string;
    platformSlotId?: string;
    observedDigest: string | null;
    verified: boolean;
  }): Promise<{ store: ResumeSelectionStoreFile; queueWideLock: false; matched: boolean }> {
    const platformSlotId = input.platformSlotId || INDEED_ACCOUNT_SLOT_ID;
    return this.mutate(input.ownerId, async () => {
      const current = await this.read(input.ownerId);
      const pending = current.pendingSlotReadbacks[platformSlotId];
      const slot = current.graph.nodes.find(n => n.id === platformSlotId) as PlatformSlotNode | undefined;
      if (!slot || slot.type !== 'platform_slot') {
        return { store: current, queueWideLock: false as const, matched: false };
      }
      const matched = Boolean(
        input.verified &&
        pending &&
        typeof input.observedDigest === 'string' &&
        input.observedDigest === pending.digest,
      );
      if (matched && pending) {
        pending.providerVerified = true;
        slot.observation = 'verified';
        slot.observationReceiptDigest = createHash('sha256')
          .update(['provider-readback', input.ownerId, platformSlotId, pending.digest].join(':'))
          .digest('hex');
      } else {
        // Failed or mismatched readback: keep the operator's intended selection,
        // mark only this slot unknown for further unsafe writes, never lock the queue.
        slot.observation = 'unverified';
        delete slot.observationReceiptDigest;
        if (pending) pending.providerVerified = false;
      }
      await this.write(current);
      return { store: current, queueWideLock: false as const, matched };
    });
  }

  async pdfForResume(ownerId: string, resumeId: string): Promise<PrivatePdf | null> {
    const current = await this.read(ownerId);
    const node = current.graph.nodes.find(n => n.id === resumeId);
    if (node?.type !== 'resume') return null;
    try {
      const buffer = await fs.readFile(this.pdfPath(node.digest));
      if (sha256(buffer) !== node.digest) throw new Error('digest mismatch');
      return { name: resumeId + '.pdf', mimeType: 'application/pdf', buffer };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error('Selected résumé PDF could not be read. Existing files preserved.');
    }
  }

  async currentSelectedPdf(ownerId: string, platformSlotId = INDEED_ACCOUNT_SLOT_ID): Promise<{
    resumeId: string;
    digest: string;
    file: PrivatePdf;
    providerVerified: boolean;
  } | null> {
    const current = await this.read(ownerId);
    const edge = current.graph.edges.find(e => e.kind === 'slot_points_to' && e.from === platformSlotId);
    if (!edge) return null;
    const file = await this.pdfForResume(ownerId, edge.to);
    const node = current.graph.nodes.find(n => n.id === edge.to);
    if (!file || node?.type !== 'resume') return null;
    const pending = current.pendingSlotReadbacks[platformSlotId];
    return {
      resumeId: edge.to,
      digest: node.digest,
      file,
      providerVerified: pending?.providerVerified === true,
    };
  }
}
