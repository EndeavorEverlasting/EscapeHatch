import type { Application } from './storage.ts';
import { parseSubmissionEvidence, submissionMatchesApplication, type SubmissionEvidence } from './submission-reconciliation.ts';

export const APPLICATION_EVENT_SCHEMA = 'escapehatch/application-event/v1';
export const MAX_APPLICATION_EVENTS = 512;
const kinds = ['submission_attempted', 'confirmation_pending', 'validation_failed', 'submission_confirmed',
  'assessment_requested', 'assessment_completed', 'interview_scheduled', 'interview_completed', 'follow_up_due',
  'offer_received', 'offer_accepted', 'hired', 'application_rejected', 'application_withdrawn', 'posting_closed', 'posting_accepting'] as const;
export type ApplicationEventKind = typeof kinds[number];
export type ApplicationEvent = {
  schema: typeof APPLICATION_EVENT_SCHEMA;
  eventId: string;
  opportunityId: string;
  applicationUrl: string;
  sourceEventId: string;
  kind: ApplicationEventKind;
  authority: 'local_observation' | 'user_confirmed' | 'employer_confirmation';
  occurredAt: string;
  observedAt: string;
  nextAction?: string;
  dueAt?: string;
  receipt?: SubmissionEvidence;
};

function text(value: unknown, max = 256): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
}
export function applicationEventUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.')) return null;
    // Only known tracking parameters may disappear. Query/hash job identities
    // on generic ATS pages are part of the private opportunity binding.
    const knownAts = ['jobs.ashbyhq.com', 'jobs.lever.co'].includes(url.hostname) || /^[a-z0-9-]+\.hiringplatform\.com$/i.test(url.hostname);
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || knownAts && ['source', 'ref', 'referrer', 'locale'].includes(key.toLowerCase())) url.searchParams.delete(key);
    }
    return url.href;
  } catch { return null; }
}
/** Collision-free structured source identity; contains no answers or page text. */
export function applicationEventId(event: Pick<ApplicationEvent, 'opportunityId' | 'applicationUrl' | 'authority' | 'kind' | 'sourceEventId'>): string {
  return JSON.stringify([APPLICATION_EVENT_SCHEMA, event.opportunityId, event.applicationUrl, event.authority, event.kind, event.sourceEventId]);
}

export function parseApplicationEvent(value: unknown): ApplicationEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as ApplicationEvent;
  if (Object.keys(event).some(key => !['schema', 'eventId', 'opportunityId', 'applicationUrl', 'sourceEventId', 'kind', 'authority', 'occurredAt', 'observedAt', 'nextAction', 'dueAt', 'receipt'].includes(key)) ||
      event.schema !== APPLICATION_EVENT_SCHEMA || !text(event.opportunityId) || !text(event.sourceEventId, 768) ||
      !text(event.applicationUrl, 2048) || applicationEventUrl(event.applicationUrl) !== event.applicationUrl ||
      !kinds.includes(event.kind) || !['local_observation', 'user_confirmed', 'employer_confirmation'].includes(event.authority) ||
      !date(event.occurredAt) || !date(event.observedAt) || Date.parse(event.occurredAt) > Date.parse(event.observedAt) ||
      event.nextAction !== undefined && !text(event.nextAction, 500) || event.dueAt !== undefined && !date(event.dueAt) ||
      event.eventId !== applicationEventId(event)) return null;
  if (event.authority === 'local_observation' && (!['submission_attempted', 'confirmation_pending', 'validation_failed'].includes(event.kind) || event.nextAction !== undefined || event.dueAt !== undefined)) return null;
  if (event.authority === 'employer_confirmation') {
    const receipt = parseSubmissionEvidence(event.receipt);
    if (event.kind !== 'submission_confirmed' || !receipt || receipt.opportunityId !== event.opportunityId ||
        !submissionMatchesApplication(receipt, event.applicationUrl) || event.sourceEventId !== JSON.stringify([receipt.sessionId, receipt.attemptId]) ||
        event.occurredAt !== receipt.observedAt || event.observedAt !== receipt.observedAt || event.nextAction !== undefined || event.dueAt !== undefined) return null;
  } else if (event.receipt !== undefined) return null;
  return { schema: APPLICATION_EVENT_SCHEMA, eventId: event.eventId, opportunityId: event.opportunityId,
    applicationUrl: event.applicationUrl, sourceEventId: event.sourceEventId, kind: event.kind, authority: event.authority,
    occurredAt: event.occurredAt, observedAt: event.observedAt,
    ...(event.nextAction !== undefined ? { nextAction: event.nextAction } : {}), ...(event.dueAt !== undefined ? { dueAt: event.dueAt } : {}),
    ...(event.receipt ? { receipt: parseSubmissionEvidence(event.receipt)! } : {}) };
}

export function parseApplicationEvents(value: unknown, opportunityId: string, url: string): ApplicationEvent[] | null {
  if (!Array.isArray(value) || value.length > MAX_APPLICATION_EVENTS) return null;
  const ids = new Set<string>();
  const events: ApplicationEvent[] = [];
  for (const raw of value) {
    const event = parseApplicationEvent(raw);
    if (!event || event.opportunityId !== opportunityId || event.applicationUrl !== applicationEventUrl(url) || ids.has(event.eventId) || events.some(prior => relationshipConflict(prior, event))) return null;
    ids.add(event.eventId);
    events.push(event);
  }
  return events;
}

function isRelationship(event: ApplicationEvent) {
  return !['submission_attempted', 'confirmation_pending', 'validation_failed', 'submission_confirmed', 'posting_closed', 'posting_accepting'].includes(event.kind);
}
function relationshipConflict(a: ApplicationEvent, b: ApplicationEvent) {
  return isRelationship(a) && isRelationship(b) && Date.parse(a.occurredAt) === Date.parse(b.occurredAt) &&
    (a.kind !== b.kind || a.nextAction !== b.nextAction || a.dueAt !== b.dueAt);
}

export function applicationUrlEditConflicts(application: Application, url: string) {
  return Boolean(application.events?.length || application.submissionEvidence) && applicationEventUrl(application.url) !== applicationEventUrl(url);
}

export type ApplicationDetails = Pick<Application, 'company' | 'role' | 'url' | 'status' | 'priority' | 'notes' | 'nextAction'>;
/** Recheck against the latest record, including receipts that arrived during editing. */
export function applyApplicationDetails(application: Application, details: ApplicationDetails, updatedAt: string): Application {
  const conflict = applicationUrlEditConflicts(application, details.url);
  return { ...application, company: details.company, role: details.role, url: conflict ? application.url : details.url,
    status: details.status, priority: details.priority, notes: details.notes, nextAction: details.nextAction, updatedAt,
    ...(conflict ? { reconciliationConflict: 'opportunity_url_changed' as const } : {}) };
}

export function eventFromSubmissionReceipt(receipt: SubmissionEvidence, applicationUrl: string): ApplicationEvent | null {
  const url = applicationEventUrl(applicationUrl);
  if (!url) return null;
  const event = { schema: APPLICATION_EVENT_SCHEMA, opportunityId: receipt.opportunityId, applicationUrl: url,
    sourceEventId: JSON.stringify([receipt.sessionId, receipt.attemptId]), kind: 'submission_confirmed' as const,
    authority: 'employer_confirmation' as const, occurredAt: receipt.observedAt, observedAt: receipt.observedAt, receipt };
  return parseApplicationEvent({ ...event, eventId: applicationEventId(event) });
}

/** Append to the existing private record. Never trim evidence to make room. */
export function appendApplicationEvent(application: Application, value: unknown): Application {
  const event = parseApplicationEvent(value);
  if (!event || event.opportunityId !== application.id || event.applicationUrl !== applicationEventUrl(application.url)) return application;
  const prior = application.events?.find(item => item.eventId === event.eventId);
  if (prior) {
    if (JSON.stringify(parseApplicationEvent(prior)) !== JSON.stringify(event)) throw new Error('APPLICATION_EVENT_CONFLICT');
    return application;
  }
  if (application.events?.some(item => relationshipConflict(item, event))) throw new Error('APPLICATION_EVENT_TIME_CONFLICT');
  if ((application.events?.length || 0) >= MAX_APPLICATION_EVENTS) throw new Error('APPLICATION_EVENT_CAPACITY');
  const next = { ...application, events: [...application.events || [], event] };
  // Observation is not submission authority. Posting health is independent.
  if (['submission_attempted', 'confirmation_pending', 'validation_failed'].includes(event.kind) || event.authority === 'local_observation' || event.kind.startsWith('posting_')) return next;
  if (event.kind === 'submission_confirmed') {
    const newer = Date.parse(event.occurredAt) >= Date.parse(application.updatedAt);
    if (application.status === 'saved' || application.status === 'preparing') return { ...next, status: 'applied', updatedAt: newer ? event.occurredAt : application.updatedAt,
      nextAction: newer ? event.nextAction || 'Application received — review the next step' : application.nextAction };
  } else if (event.authority === 'user_confirmed' && application.status !== 'closed' && Date.parse(event.occurredAt) >= Date.parse(application.updatedAt)) {
    return { ...next, status: ['hired', 'application_rejected', 'application_withdrawn'].includes(event.kind) ? 'closed' : 'follow_up',
      updatedAt: event.occurredAt, nextAction: event.nextAction || application.nextAction };
  }
  return next;
}

export function projectApplicationEvents(application: Application) {
  const events = [...application.events || []].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
  const employerReceipt = events.find(event => event.kind === 'submission_confirmed' && event.authority === 'employer_confirmation');
  const userReceipt = events.find(event => event.kind === 'submission_confirmed' && event.authority === 'user_confirmed');
  const submission = events.filter(event => ['submission_attempted', 'confirmation_pending', 'validation_failed'].includes(event.kind)).at(-1);
  const relationship = events.filter(event => !['submission_attempted', 'confirmation_pending', 'validation_failed', 'submission_confirmed', 'posting_closed', 'posting_accepting'].includes(event.kind)).at(-1);
  const posting = events.filter(event => event.kind.startsWith('posting_')).at(-1);
  const legacyReceipt = parseSubmissionEvidence(application.submissionEvidence);
  const legacyConfirmed = legacyReceipt && legacyReceipt.opportunityId === application.id && submissionMatchesApplication(legacyReceipt, application.url);
  const currentAction = !relationship || Date.parse(relationship.occurredAt) >= Date.parse(application.updatedAt);
  return { submission: employerReceipt || legacyConfirmed ? 'employer_confirmed' : userReceipt ? 'user_confirmed' :
    submission?.kind || (['applied', 'follow_up', 'closed'].includes(application.status) ? 'legacy_recorded' : 'not_recorded'),
    submittedAt: employerReceipt?.occurredAt || (legacyConfirmed ? legacyReceipt.observedAt : null) || userReceipt?.occurredAt || null,
    relationship: relationship?.kind || 'unknown', postingHealth: posting?.kind || 'unknown',
    nextAction: currentAction ? relationship?.nextAction || application.nextAction : application.nextAction,
    dueAt: currentAction ? relationship?.dueAt || null : null,
    reviewRequired: application.reconciliationConflict || null, events };
}

/** Explicit denominator and identity lists; never uses a job-board aggregate. */
export function measureApplicationOutcomes(applications: Application[]) {
  const ids = new Set<string>();
  const groups: Record<'employerConfirmed' | 'userConfirmedOnly' | 'legacyRecorded' | 'unconfirmedAttempts', string[]> = {
    employerConfirmed: [], userConfirmedOnly: [], legacyRecorded: [], unconfirmedAttempts: [] };
  for (const application of applications) {
    if (ids.has(application.id)) throw new Error('APPLICATION_METRIC_IDENTITY_CONFLICT');
    ids.add(application.id);
    const result = projectApplicationEvents(application);
    if (result.submission === 'employer_confirmed') groups.employerConfirmed.push(application.id);
    else if (result.submission === 'user_confirmed') groups.userConfirmedOnly.push(application.id);
    else if (result.submission === 'legacy_recorded') groups.legacyRecorded.push(application.id);
    else if (result.submission !== 'not_recorded') groups.unconfirmedAttempts.push(application.id);
  }
  for (const group of Object.values(groups)) group.sort();
  return { scope: 'current_private_workspace' as const, denominator: [...ids].sort(), groups,
    counts: Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.length])) };
}
