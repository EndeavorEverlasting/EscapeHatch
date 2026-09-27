import { APPLICATIONS_KEY, parseApplicationsStorage, type Application as LegacyApplication } from './storage';

export const CAREER_STATE_SCHEMA = 'escapehatch-career-state/v1' as const;
export const CAREER_STATE_DB_NAME = 'escape-hatch-career-state';
export const CAREER_STATE_DB_VERSION = 1;
export const CAREER_STATE_RECORD_KEY = 'primary';
export const LEGACY_APPLICATIONS_MIGRATION = 'legacy-applications-v1';

const STATE_STORE = 'career_state';
const SNAPSHOT_STORE = 'recovery_snapshots';
const META_STORE = 'meta';

/** RFC 3339 / JSON Schema date-time: requires a time component (rejects date-only). */
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const ARTIFACT_OWNERS = new Set(['user', 'escapehatch', 'external']);
const ARTIFACT_KINDS = new Set(['inline', 'relative_path', 'uri', 'content_hash']);
const OPPORTUNITY_STATUSES = new Set(['discovered', 'targeted', 'closed', 'rejected', 'withdrawn']);
const APPLICATION_STATUSES = new Set(['draft', 'submitted', 'screen', 'interview', 'offer', 'rejected', 'withdrawn', 'closed']);
const PRIORITIES = new Set(['low', 'medium', 'high']);
const WORK_MODES = new Set(['remote', 'hybrid', 'on_site', 'unknown']);
const VERIFICATION_STATES = new Set(['SNAPSHOT', 'LIVE_VERIFIED', 'STALE', 'CLOSED', 'BLOCKED', 'UNKNOWN']);
const EXECUTION_STATES = new Set(['READY_TO_APPLY', 'FILLED', 'AWAITING_OPERATOR', 'BLOCKED', 'SUBMITTED']);
const EXECUTION_CHANNELS = new Set(['web_form', 'email', 'external_provider']);
const EVIDENCE_KINDS = new Set(['submission_receipt', 'confirmation', 'correspondence', 'interview', 'offer', 'rejection', 'note']);
const GUIDANCE_TRIGGERS = new Set(['requirements-gap', 'application-iteration', 'interview-feedback', 'learning-event', 'cascade', 'manual']);
const GUIDANCE_STATUSES = new Set(['queued', 'active', 'completed', 'superseded']);
const RESOURCE_KINDS = new Set(['book', 'documentation', 'article', 'course', 'video', 'repository', 'problem-set']);
const RESOURCE_RELATIONS = new Set(['primary', 'reference', 'remediation', 'stretch']);
const GUIDANCE_CONTRACT = 'study-syndicate/study-guidance/v1';

const TOP_ALLOWED = new Set([
  'schema_version',
  'state_id',
  'revision',
  'updated_at',
  'profile',
  'opportunities',
  'resumes',
  'applications',
  'study_guidance',
  'evidence',
]);

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

function fail(message: string): never {
  throw new Error(message);
}

function requireKeys(
  value: unknown,
  required: readonly string[],
  allowed: ReadonlySet<string>,
  where: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(`${where} must be an object.`);
  for (const key of required) {
    if (!(key in value)) fail(`${where} missing required field: ${key}.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${where} has forbidden property: ${key}.`);
  }
}

/** Strict JSON Schema date-time: rejects date-only and other Date.parse-tolerant values. */
export function isStrictDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_TIME_PATTERN.test(value)) return false;
  const normalized = value.endsWith('Z') ? `${value.slice(0, -1)}+00:00` : value;
  const parsed = Date.parse(normalized);
  return !Number.isNaN(parsed);
}

function isStrictDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateArtifactRef(value: unknown, where: string): void {
  requireKeys(value, ['owner', 'kind', 'locator'], new Set(['owner', 'kind', 'locator', 'sha256']), where);
  if (!ARTIFACT_OWNERS.has(String(value.owner))) fail(`${where}.owner is invalid.`);
  if (!ARTIFACT_KINDS.has(String(value.kind))) fail(`${where}.kind is invalid.`);
  if (!isNonEmptyText(value.locator)) fail(`${where}.locator must be a non-empty string.`);
  if (value.kind === 'relative_path') {
    const locator = String(value.locator);
    if (locator.startsWith('/') || locator.includes('..')) fail(`${where}.locator must be a portable relative path.`);
  }
  if ('sha256' in value && (typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256))) {
    fail(`${where}.sha256 is invalid.`);
  }
}

function uniqueIds(items: Record<string, unknown>[], label: string): Set<string> {
  const ids = items.map((item) => item.id);
  if (ids.some((id) => !isNonEmptyText(id))) fail(`${label} ids must be non-empty strings.`);
  const set = new Set(ids as string[]);
  if (set.size !== ids.length) fail(`${label} ids must be unique.`);
  return set;
}

function validateProfile(profile: unknown): void {
  requireKeys(profile, ['id', 'headline', 'skills'], new Set(['id', 'headline', 'skills', 'source_artifacts', 'career_objective']), 'profile');
  if (!isNonEmptyText(profile.id)) fail('profile.id is required.');
  if (typeof profile.headline !== 'string') fail('profile.headline must be a string.');
  if (!Array.isArray(profile.skills) || profile.skills.some((skill) => typeof skill !== 'string')) {
    fail('profile.skills must be a string array.');
  }
  if ('source_artifacts' in profile) {
    if (!Array.isArray(profile.source_artifacts)) fail('profile.source_artifacts must be an array.');
    profile.source_artifacts.forEach((artifact, index) => validateArtifactRef(artifact, `profile.source_artifacts[${index}]`));
  }
  if ('career_objective' in profile) {
    const objective = profile.career_objective;
    requireKeys(
      objective,
      ['target_lane', 'target_roles', 'lead_capabilities'],
      new Set(['target_lane', 'target_roles', 'deprioritized_roles', 'lead_capabilities', 'proof_artifacts']),
      'profile.career_objective',
    );
    if (!isNonEmptyText(objective.target_lane)) fail('profile.career_objective.target_lane is invalid.');
    for (const key of ['target_roles', 'lead_capabilities'] as const) {
      const list = objective[key];
      if (!Array.isArray(list) || list.length < 1 || list.some((item) => !isNonEmptyText(item)) || new Set(list).size !== list.length) {
        fail(`profile.career_objective.${key} must be a unique non-empty string array.`);
      }
    }
    if ('deprioritized_roles' in objective) {
      const list = objective.deprioritized_roles;
      if (!Array.isArray(list) || list.some((item) => !isNonEmptyText(item)) || new Set(list).size !== list.length) {
        fail('profile.career_objective.deprioritized_roles must be a unique string array.');
      }
    }
    if ('proof_artifacts' in objective) {
      if (!Array.isArray(objective.proof_artifacts)) fail('profile.career_objective.proof_artifacts must be an array.');
      objective.proof_artifacts.forEach((artifact, index) => validateArtifactRef(artifact, `profile.career_objective.proof_artifacts[${index}]`));
    }
  }
}

function validateOpportunity(opportunity: unknown, index: number): void {
  const where = `opportunities[${index}]`;
  requireKeys(
    opportunity,
    ['id', 'title', 'organization', 'status', 'source'],
    new Set([
      'id', 'title', 'organization', 'status', 'priority', 'fit_score', 'requirements_gaps', 'next_action', 'source',
      'apply_link', 'posting_snapshot', 'captured_at', 'verification', 'location', 'work_mode', 'employment_type',
      'compensation_text', 'fit_rationale', 'notes', 'found_on', 'follow_up_due_on', 'source_guidance',
    ]),
    where,
  );
  if (!isNonEmptyText(opportunity.id)) fail(`${where}.id is required.`);
  if (typeof opportunity.title !== 'string') fail(`${where}.title must be a string.`);
  if (typeof opportunity.organization !== 'string') fail(`${where}.organization must be a string.`);
  if (!OPPORTUNITY_STATUSES.has(String(opportunity.status))) fail(`${where}.status is invalid.`);
  validateArtifactRef(opportunity.source, `${where}.source`);
  if ('priority' in opportunity && !PRIORITIES.has(String(opportunity.priority))) fail(`${where}.priority is invalid.`);
  if ('fit_score' in opportunity) {
    const score = opportunity.fit_score;
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100) fail(`${where}.fit_score must be an integer 0..100.`);
  }
  if ('requirements_gaps' in opportunity) {
    if (!Array.isArray(opportunity.requirements_gaps) || opportunity.requirements_gaps.some((item) => typeof item !== 'string')) {
      fail(`${where}.requirements_gaps must be a string array.`);
    }
  }
  if ('next_action' in opportunity && typeof opportunity.next_action !== 'string') fail(`${where}.next_action must be a string.`);
  if ('captured_at' in opportunity && !isStrictDateTime(opportunity.captured_at)) fail(`${where}.captured_at must be a date-time.`);
  if ('apply_link' in opportunity) {
    validateArtifactRef(opportunity.apply_link, `${where}.apply_link`);
    if (!isRecord(opportunity.apply_link) || opportunity.apply_link.kind !== 'uri') fail(`${where}.apply_link must be uri.`);
  }
  if ('posting_snapshot' in opportunity) validateArtifactRef(opportunity.posting_snapshot, `${where}.posting_snapshot`);
  if ('verification' in opportunity) {
    const verification = opportunity.verification;
    requireKeys(verification, ['state', 'verified_at'], new Set(['state', 'verified_at', 'detail', 'source']), `${where}.verification`);
    if (!VERIFICATION_STATES.has(String(verification.state))) fail(`${where}.verification.state is invalid.`);
    if (!isStrictDateTime(verification.verified_at)) fail(`${where}.verification.verified_at must be a date-time.`);
  }
  if ('location' in opportunity) {
    const location = opportunity.location;
    requireKeys(location, ['display'], new Set(['display', 'city', 'region', 'country']), `${where}.location`);
    for (const [key, value] of Object.entries(location)) {
      if (!isNonEmptyText(value)) fail(`${where}.location.${key} must be a non-empty string.`);
    }
  }
  if ('work_mode' in opportunity && !WORK_MODES.has(String(opportunity.work_mode))) fail(`${where}.work_mode is invalid.`);
  for (const key of ['employment_type', 'compensation_text', 'fit_rationale', 'notes', 'source_guidance'] as const) {
    if (key in opportunity && !isNonEmptyText(opportunity[key])) fail(`${where}.${key} must be a non-empty string.`);
  }
  for (const key of ['found_on', 'follow_up_due_on'] as const) {
    if (key in opportunity && !isStrictDate(opportunity[key])) fail(`${where}.${key} must be YYYY-MM-DD.`);
  }
}

function validateResume(resume: unknown, index: number, profileId: string, opportunityIds: Set<string>): void {
  const where = `resumes[${index}]`;
  requireKeys(resume, ['id', 'profile_id', 'artifact'], new Set(['id', 'profile_id', 'opportunity_id', 'artifact', 'created_at']), where);
  if (!isNonEmptyText(resume.id)) fail(`${where}.id is required.`);
  if (resume.profile_id !== profileId) fail(`${where}.profile_id dangling.`);
  if ('opportunity_id' in resume && !opportunityIds.has(String(resume.opportunity_id))) fail(`${where}.opportunity_id dangling.`);
  validateArtifactRef(resume.artifact, `${where}.artifact`);
  if ('created_at' in resume && !isStrictDateTime(resume.created_at)) fail(`${where}.created_at must be a date-time.`);
}

function validateApplication(application: unknown, index: number, opportunityIds: Set<string>, resumeIds: Set<string>): void {
  const where = `applications[${index}]`;
  requireKeys(
    application,
    ['id', 'opportunity_id', 'resume_id', 'status', 'submitted_at'],
    new Set(['id', 'opportunity_id', 'resume_id', 'status', 'submitted_at', 'external_reference', 'execution']),
    where,
  );
  if (!isNonEmptyText(application.id)) fail(`${where}.id is required.`);
  if (!opportunityIds.has(String(application.opportunity_id))) fail(`${where}.opportunity_id dangling.`);
  if (!resumeIds.has(String(application.resume_id))) fail(`${where}.resume_id dangling.`);
  if (!APPLICATION_STATUSES.has(String(application.status))) fail(`${where}.status is invalid.`);
  if (application.submitted_at !== null && !isStrictDateTime(application.submitted_at)) {
    fail(`${where}.submitted_at must be date-time or null.`);
  }
  if ('external_reference' in application && application.external_reference !== null && typeof application.external_reference !== 'string') {
    fail(`${where}.external_reference must be string or null.`);
  }
  if ('execution' in application) {
    const execution = application.execution;
    requireKeys(
      execution,
      ['state', 'channel', 'last_transition_at'],
      new Set(['state', 'channel', 'last_transition_at', 'evidence_id', 'block_reason', 'awaiting_reason', 'detail']),
      `${where}.execution`,
    );
    if (!EXECUTION_STATES.has(String(execution.state))) fail(`${where}.execution.state is invalid.`);
    if (!EXECUTION_CHANNELS.has(String(execution.channel))) fail(`${where}.execution.channel is invalid.`);
    if (!isStrictDateTime(execution.last_transition_at)) fail(`${where}.execution.last_transition_at must be a date-time.`);
  }
}

function validateStudyGuidance(
  guidance: unknown,
  index: number,
  opportunityIds: Set<string>,
  applications: Map<string, Record<string, unknown>>,
): void {
  const where = `study_guidance[${index}]`;
  requireKeys(
    guidance,
    ['id', 'opportunity_id', 'contract', 'trigger_kind', 'reason', 'iteration', 'concepts', 'resources', 'status'],
    new Set(['id', 'opportunity_id', 'application_id', 'contract', 'trigger_kind', 'reason', 'cascade_concept_ids', 'iteration', 'concepts', 'resources', 'status', 'created_at']),
    where,
  );
  if (!isNonEmptyText(guidance.id)) fail(`${where}.id is required.`);
  if (!opportunityIds.has(String(guidance.opportunity_id))) fail(`${where}.opportunity_id dangling.`);
  if ('application_id' in guidance) {
    const application = applications.get(String(guidance.application_id));
    if (!application) fail(`${where}.application_id dangling.`);
    if (application.opportunity_id !== guidance.opportunity_id) fail(`${where}.application opportunity mismatch.`);
  }
  if (guidance.contract !== GUIDANCE_CONTRACT) fail(`${where}.contract mismatch.`);
  if (!GUIDANCE_TRIGGERS.has(String(guidance.trigger_kind))) fail(`${where}.trigger_kind is invalid.`);
  if (!isNonEmptyText(guidance.reason)) fail(`${where}.reason is invalid.`);
  if (typeof guidance.iteration !== 'number' || !Number.isInteger(guidance.iteration) || guidance.iteration < 1) {
    fail(`${where}.iteration is invalid.`);
  }
  if (!GUIDANCE_STATUSES.has(String(guidance.status))) fail(`${where}.status is invalid.`);
  if ('created_at' in guidance && !isStrictDateTime(guidance.created_at)) fail(`${where}.created_at must be a date-time.`);
  if (!Array.isArray(guidance.concepts) || guidance.concepts.length < 1) fail(`${where}.concepts must be a non-empty array.`);
  const conceptIds = new Set<string>();
  guidance.concepts.forEach((concept, conceptIndex) => {
    const conceptWhere = `${where}.concepts[${conceptIndex}]`;
    requireKeys(concept, ['concept_id', 'reason', 'priority'], new Set(['concept_id', 'reason', 'priority']), conceptWhere);
    if (!isNonEmptyText(concept.concept_id) || conceptIds.has(String(concept.concept_id))) fail(`${conceptWhere}.concept_id invalid/duplicate.`);
    conceptIds.add(String(concept.concept_id));
    if (!isNonEmptyText(concept.reason)) fail(`${conceptWhere}.reason is invalid.`);
    if (typeof concept.priority !== 'number' || !Number.isInteger(concept.priority) || concept.priority < 1 || concept.priority > 5) {
      fail(`${conceptWhere}.priority is invalid.`);
    }
  });
  if (!Array.isArray(guidance.resources)) fail(`${where}.resources must be an array.`);
  guidance.resources.forEach((resource, resourceIndex) => {
    const resourceWhere = `${where}.resources[${resourceIndex}]`;
    requireKeys(
      resource,
      ['kind', 'title', 'relation'],
      new Set(['kind', 'title', 'relation', 'author', 'locator', 'concept_ids', 'note']),
      resourceWhere,
    );
    if (!RESOURCE_KINDS.has(String(resource.kind))) fail(`${resourceWhere}.kind is invalid.`);
    if (!RESOURCE_RELATIONS.has(String(resource.relation))) fail(`${resourceWhere}.relation is invalid.`);
    if (!isNonEmptyText(resource.title)) fail(`${resourceWhere}.title is invalid.`);
  });
}

function validateEvidence(evidence: unknown, index: number, applicationIds: Set<string>): void {
  const where = `evidence[${index}]`;
  requireKeys(evidence, ['id', 'application_id', 'kind', 'artifact', 'observed_at'], new Set(['id', 'application_id', 'kind', 'artifact', 'observed_at']), where);
  if (!isNonEmptyText(evidence.id)) fail(`${where}.id is required.`);
  if (!applicationIds.has(String(evidence.application_id))) fail(`${where}.application_id dangling.`);
  if (!EVIDENCE_KINDS.has(String(evidence.kind))) fail(`${where}.kind is invalid.`);
  validateArtifactRef(evidence.artifact, `${where}.artifact`);
  if (!isStrictDateTime(evidence.observed_at)) fail(`${where}.observed_at must be a date-time.`);
}

/**
 * Full canonical career-state validation aligned with contracts/career-state.v1.schema.json
 * (nested objects, statuses, additionalProperties, artifact refs, strict date-time).
 */
export function validateCareerStateEnvelope(value: unknown): CareerState {
  requireKeys(
    value,
    ['schema_version', 'state_id', 'revision', 'updated_at', 'profile', 'opportunities', 'resumes', 'applications', 'evidence'],
    TOP_ALLOWED,
    'career state',
  );
  if (value.schema_version !== CAREER_STATE_SCHEMA) fail('Career state schema mismatch.');
  if (!isNonEmptyText(value.state_id)) fail('Career state_id is required.');
  if (!Number.isInteger(value.revision) || Number(value.revision) < 1) fail('Career state revision must be a positive integer.');
  if (!isStrictDateTime(value.updated_at)) fail('Career state updated_at must be an ISO date-time.');

  validateProfile(value.profile);

  for (const key of ['opportunities', 'resumes', 'applications', 'evidence'] as const) {
    if (!Array.isArray(value[key])) fail(`Career state ${key} must be an array.`);
  }
  if ('study_guidance' in value && !Array.isArray(value.study_guidance)) fail('Career state study_guidance must be an array when present.');

  const opportunities = value.opportunities as Record<string, unknown>[];
  const resumes = value.resumes as Record<string, unknown>[];
  const applications = value.applications as Record<string, unknown>[];
  const evidence = value.evidence as Record<string, unknown>[];
  const studyGuidance = (value.study_guidance as Record<string, unknown>[] | undefined) ?? [];

  const opportunityIds = uniqueIds(opportunities, 'opportunity');
  const resumeIds = uniqueIds(resumes, 'resume');
  const applicationIds = uniqueIds(applications, 'application');
  uniqueIds(evidence, 'evidence');
  if (studyGuidance.length) uniqueIds(studyGuidance, 'study_guidance');

  opportunities.forEach((opportunity, index) => validateOpportunity(opportunity, index));
  const profileId = String((value.profile as Record<string, unknown>).id);
  resumes.forEach((resume, index) => validateResume(resume, index, profileId, opportunityIds));
  applications.forEach((application, index) => validateApplication(application, index, opportunityIds, resumeIds));
  const applicationsById = new Map(applications.map((application) => [String(application.id), application]));
  studyGuidance.forEach((guidance, index) => validateStudyGuidance(guidance, index, opportunityIds, applicationsById));
  evidence.forEach((item, index) => validateEvidence(item, index, applicationIds));

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
    captured_at: isStrictDateTime(application.updatedAt) ? application.updatedAt : now,
    ...(application.notes ? { notes: application.notes } : {}),
  };
}

/** Preserve legacy lifecycle milestones as canonical applications (+ resumes) instead of collapsing to targeted-only. */
function legacyMilestoneRecords(
  application: LegacyApplication,
  profileId: string,
  now: string,
): { resume?: Record<string, unknown>; application?: Record<string, unknown> } {
  if (application.status === 'closed') return {};

  const opportunityId = `legacy-opportunity-${application.id}`;
  const resumeId = `legacy-resume-${application.id}`;
  const applicationId = `legacy-application-${application.id}`;
  const capturedAt = isStrictDateTime(application.updatedAt) ? application.updatedAt : now;
  const submitted = application.status === 'applied' || application.status === 'follow_up';

  return {
    resume: {
      id: resumeId,
      profile_id: profileId,
      opportunity_id: opportunityId,
      artifact: { owner: 'user', kind: 'inline', locator: `legacy-localstorage:${application.id}` },
      created_at: capturedAt,
    },
    application: {
      id: applicationId,
      opportunity_id: opportunityId,
      resume_id: resumeId,
      status: submitted ? 'submitted' : 'draft',
      submitted_at: submitted ? capturedAt : null,
      external_reference: `legacy-status:${application.status}`,
    },
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

    const raw = storage.getItem(APPLICATIONS_KEY);
    if (raw === null) return { migrated: false, count: 0, state: await this.load() };
    let legacy: LegacyApplication[] | null = null;
    try { legacy = parseApplicationsStorage(JSON.parse(raw)); } catch { legacy = null; }
    if (!legacy) throw new Error('Legacy applications are malformed; migration made no changes.');

    const observedAt = this.now();
    const opportunities = legacy.map((application) => legacyOpportunity(application, observedAt));
    const base = createInitialState(opportunities, observedAt);
    const profileId = base.profile.id;
    const resumes: Record<string, unknown>[] = [];
    const applications: Record<string, unknown>[] = [];
    for (const application of legacy) {
      const milestone = legacyMilestoneRecords(application, profileId, observedAt);
      if (milestone.resume) resumes.push(milestone.resume);
      if (milestone.application) applications.push(milestone.application);
    }
    const candidate = clone(this.validate({
      ...base,
      opportunities,
      resumes: [...base.resumes, ...resumes],
      applications: [...base.applications, ...applications],
    }));

    const db = await this.db();
    try {
      const write = db.transaction([STATE_STORE, SNAPSHOT_STORE, META_STORE], 'readwrite');
      const [marker, current] = await Promise.all([
        requestResult(write.objectStore(META_STORE).get(LEGACY_APPLICATIONS_MIGRATION)),
        requestResult(write.objectStore(STATE_STORE).get(CAREER_STATE_RECORD_KEY)),
      ]);
      if (marker !== undefined || current !== undefined) {
        try { write.abort(); } catch { /* already settling */ }
        return {
          migrated: false,
          count: 0,
          state: current === undefined ? null : clone(this.validate(current)),
        };
      }

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

      // Durable IDB commit already succeeded; cleanup failure must not reject or remigrate.
      try {
        storage.removeItem(APPLICATIONS_KEY);
      } catch {
        /* leave legacy key; marker prevents remigration */
      }
      return { migrated: true, count: legacy.length, state: candidate };
    } finally {
      db.close();
    }
  }
}
