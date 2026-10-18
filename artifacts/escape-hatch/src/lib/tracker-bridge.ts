/**
 * Deterministic Google/local tracker projection into EscapeHatch applications.
 * Never invents counts. Never treats Applied? checkbox alone as Submitted proof.
 */
import type { Application, ApplicationStatus, Priority } from './storage';

export const TRACKER_SNAPSHOT_SCHEMA = 'escapehatch/tracker-snapshot/v1';
export const TRACKER_CONNECTION_KEY = 'escape-hatch-tracker-connection-v1';

export type TrackerRow = {
  sheetRow: number;
  appliedCheckbox: boolean;
  priority: string;
  status: string;
  company: string;
  role: string;
  workMode?: string;
  location?: string;
  compensation?: string;
  applyUrl: string;
  dateFound?: string;
  dateApplied?: string;
  followUp?: string;
  nextAction?: string;
  notes?: string;
  sourceLink?: string;
  resumeDoc?: string;
  resumePdf?: string;
  auditedOn?: string;
};

export type TrackerMetrics = {
  trackedRoles: number;
  appliedOrSubmittedCheckbox: number;
  readyToApply: number;
  inProcess: number;
  submittedStatus: number;
  highPriority: number;
};

export type TrackerSnapshot = {
  schema: typeof TRACKER_SNAPSHOT_SCHEMA;
  provider: string;
  spreadsheetId: string;
  sheetName: string;
  capturedAtUtc: string;
  contentDigest: string;
  authPath: string;
  localGoogleAuthPresent: boolean;
  metrics: TrackerMetrics;
  applications: TrackerRow[];
};

export type TrackerConnectionState =
  | { status: 'NOT_CONNECTED'; reason: string }
  | { status: 'STALE'; reason: string; capturedAtUtc: string; contentDigest: string }
  | { status: 'CONNECTED'; snapshot: TrackerSnapshot };

function normalizeStatus(value: string): ApplicationStatus {
  const s = value.trim().toLowerCase();
  if (s.startsWith('submit')) return 'applied';
  if (s.includes('process') || s.includes('interview') || s.includes('follow')) return 'follow_up';
  if (s.includes('closed') || s.includes('reject') || s.includes('withdraw')) return 'closed';
  if (s.includes('ready') || s.includes('verify')) return 'preparing';
  return 'saved';
}

function normalizePriority(value: string): Priority {
  const p = value.trim().toLowerCase();
  if (p.startsWith('high')) return 'high';
  if (p.startsWith('low')) return 'low';
  return 'normal';
}

/** Stable identity: sheet row + normalized employer host/path, never company name alone. */
export function trackerOpportunityId(row: TrackerRow): string {
  let hostPath = '';
  try {
    if (row.applyUrl) {
      const url = new URL(row.applyUrl);
      hostPath = `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/+$/, '');
    }
  } catch { /* ignore invalid URL */ }
  const slug = `${row.company}|${row.role}|${hostPath || 'nourl'}|r${row.sheetRow}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  return `tracker-${slug}`;
}

export function computeTrackerMetrics(rows: TrackerRow[]): TrackerMetrics {
  return {
    trackedRoles: rows.length,
    appliedOrSubmittedCheckbox: rows.filter((row) => row.appliedCheckbox).length,
    readyToApply: rows.filter((row) => row.status.toLowerCase().includes('ready')).length,
    inProcess: rows.filter((row) => row.status.toLowerCase().includes('process')).length,
    submittedStatus: rows.filter((row) => row.status.toLowerCase().startsWith('submit')).length,
    highPriority: rows.filter((row) => row.priority.toLowerCase().startsWith('high')).length,
  };
}

export function parseTrackerSnapshot(value: unknown): TrackerSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.schema !== TRACKER_SNAPSHOT_SCHEMA) return null;
  if (typeof raw.provider !== 'string' || typeof raw.spreadsheetId !== 'string' ||
      typeof raw.sheetName !== 'string' || typeof raw.capturedAtUtc !== 'string' ||
      typeof raw.contentDigest !== 'string' || typeof raw.authPath !== 'string' ||
      typeof raw.localGoogleAuthPresent !== 'boolean' || !Array.isArray(raw.applications) ||
      !raw.metrics || typeof raw.metrics !== 'object') return null;
  const applications = raw.applications.filter((item): item is TrackerRow => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    return typeof row.sheetRow === 'number' && typeof row.company === 'string' &&
      typeof row.role === 'string' && typeof row.status === 'string' &&
      typeof row.priority === 'string' && typeof row.applyUrl === 'string' &&
      typeof row.appliedCheckbox === 'boolean';
  });
  const metrics = computeTrackerMetrics(applications);
  return {
    schema: TRACKER_SNAPSHOT_SCHEMA,
    provider: raw.provider,
    spreadsheetId: raw.spreadsheetId,
    sheetName: raw.sheetName,
    capturedAtUtc: raw.capturedAtUtc,
    contentDigest: raw.contentDigest,
    authPath: raw.authPath,
    localGoogleAuthPresent: raw.localGoogleAuthPresent,
    metrics,
    applications,
  };
}

export function trackerRowToApplication(row: TrackerRow): Application {
  const status = normalizeStatus(row.status);
  // Checkbox alone never upgrades to submitted; status text must say Submitted.
  const safeStatus = row.appliedCheckbox && status === 'saved' ? 'preparing' : status;
  const packageBits = [
    row.resumePdf ? 'Resume PDF linked' : 'Resume PDF missing',
    row.resumeDoc ? 'Resume Doc linked' : null,
    row.compensation || null,
    row.workMode || null,
    row.location || null,
  ].filter(Boolean);
  return {
    id: trackerOpportunityId(row),
    company: row.company,
    role: row.role,
    url: row.applyUrl,
    status: safeStatus,
    priority: normalizePriority(row.priority),
    notes: [
      `Tracker row ${row.sheetRow} · provider status: ${row.status}`,
      row.appliedCheckbox ? 'Applied? checkbox marked (not independent submit proof)' : 'Applied? unchecked',
      packageBits.join(' · '),
      row.followUp ? `Follow-up: ${row.followUp}` : null,
      row.notes || null,
    ].filter(Boolean).join('\n'),
    nextAction: row.nextAction?.trim() ||
      (safeStatus === 'applied' ? 'Do not reapply — follow submitted evidence' :
        safeStatus === 'preparing' ? 'Review package and prepare managed application' : 'Review tracker row'),
    updatedAt: row.auditedOn && !Number.isNaN(Date.parse(row.auditedOn))
      ? new Date(row.auditedOn).toISOString()
      : new Date().toISOString(),
  };
}

export function mergeTrackerIntoApplications(
  existing: Application[],
  snapshot: TrackerSnapshot,
): Application[] {
  const imported = snapshot.applications.map(trackerRowToApplication);
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of imported) {
    const prior = byId.get(item.id);
    if (!prior) {
      byId.set(item.id, item);
      continue;
    }
    // Preserve operator local edits when notes differ and prior was manually richer.
    byId.set(item.id, {
      ...item,
      ...(prior.jobDescription !== undefined ? { jobDescription: prior.jobDescription } : {}),
      notes: prior.notes.includes('local edit') ? prior.notes : item.notes,
      nextAction: prior.nextAction && prior.updatedAt > item.updatedAt ? prior.nextAction : item.nextAction,
    });
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function selectNextActionableOpportunity(snapshot: TrackerSnapshot): TrackerRow | null {
  const ready = snapshot.applications.filter((row) =>
    row.status.toLowerCase().includes('ready') && !row.appliedCheckbox && !row.status.toLowerCase().startsWith('submit'));
  // Prefer Thyme Care when Ready; otherwise first Ready row.
  return ready.find((row) => /thyme\s*care/i.test(row.company)) || ready[0] || null;
}

export function isSubmittedLocked(row: TrackerRow): boolean {
  return row.status.toLowerCase().startsWith('submit') ||
    (/google|mandiant/i.test(row.company) && row.appliedCheckbox && row.status.toLowerCase().includes('submit'));
}

export function connectionFromSnapshot(
  snapshot: TrackerSnapshot | null,
  options: { maxAgeMs?: number; now?: number } = {},
): TrackerConnectionState {
  if (!snapshot) {
    return { status: 'NOT_CONNECTED', reason: 'No tracker snapshot. Local Google auth missing or refresh required.' };
  }
  const maxAgeMs = options.maxAgeMs ?? 36 * 60 * 60 * 1000;
  const now = options.now ?? Date.now();
  const captured = Date.parse(snapshot.capturedAtUtc);
  if (Number.isNaN(captured) || now - captured > maxAgeMs) {
    return {
      status: 'STALE',
      reason: 'Tracker snapshot older than freshness window — refresh before treating counts as current.',
      capturedAtUtc: snapshot.capturedAtUtc,
      contentDigest: snapshot.contentDigest,
    };
  }
  return { status: 'CONNECTED', snapshot };
}
