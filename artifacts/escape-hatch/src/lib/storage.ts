export type Profile = {
  name_prefix: string;
  first_name: string;
  last_name: string;
  preferred_name: string;
  email: string;
  phone: string;
  phone_authority: string;
  linkedin_url: string;
  street_address: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
};

export type AnswerSnippet = {
  id: string;
  title: string;
  category: string;
  content: string;
  updatedAt: string;
};

export type ApplicationStatus = 'saved' | 'preparing' | 'applied' | 'follow_up' | 'closed';
export type Priority = 'high' | 'normal' | 'low';

export type Application = {
  id: string;
  company: string;
  role: string;
  url: string;
  status: ApplicationStatus;
  priority: Priority;
  notes: string;
  nextAction: string;
  updatedAt: string;
};

export const PROFILE_KEY = 'escape-hatch-profile';
export const ANSWERS_KEY = 'escape-hatch-answers';
export const APPLICATIONS_KEY = 'escape-hatch-applications';
export const DRAFT_RECOVERY_KEY = 'escape-hatch-draft-recovery-seconds';
export const DEFAULT_DRAFT_RECOVERY_SECONDS = 8;
export const DRAFT_RECOVERY_OPTIONS = [8, 30, 60] as const;
export type DraftRecoverySeconds = (typeof DRAFT_RECOVERY_OPTIONS)[number];
export const PROFILE_EXPORT_SCHEMA = 'escape-hatch-profile';
export const PROFILE_EXPORT_VERSION = 1;
export const WORKSPACE_EXPORT_SCHEMA = 'escape-hatch-workspace';
export const WORKSPACE_EXPORT_VERSION = 1;

export const emptyProfile: Profile = {
  name_prefix: '',
  first_name: '',
  last_name: '',
  preferred_name: '',
  email: '',
  phone: '',
  phone_authority: '',
  linkedin_url: '',
  street_address: '',
  city: '',
  region: '',
  postal_code: '',
  country: '',
};

const profileFields = Object.keys(emptyProfile) as (keyof Profile)[];
const answerCategories = ['Career story', 'Motivation', 'Strengths', 'Experience', 'Other'];
const applicationStatuses: ApplicationStatus[] = ['saved', 'preparing', 'applied', 'follow_up', 'closed'];
const priorities: Priority[] = ['high', 'normal', 'low'];

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type StorageParser<T> = (value: unknown) => T | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isDateString(value: unknown): value is string {
  return isText(value) && !Number.isNaN(Date.parse(value));
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function parseProfileRecord(value: unknown): Profile | null {
  if (!isRecord(value) || !hasOnlyKeys(value, profileFields)) return null;
  if (profileFields.some((field) => !isText(value[field]))) return null;
  return value as Profile;
}

export function parseProfileStorage(value: unknown): Profile | null {
  return parseProfileRecord(value);
}

export function parseDraftRecoveryStorage(value: unknown): DraftRecoverySeconds | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return DRAFT_RECOVERY_OPTIONS.includes(value as DraftRecoverySeconds) ? value as DraftRecoverySeconds : null;
}

export function getDraftRecoveryDeadline(
  recoverySeconds: DraftRecoverySeconds,
  dismissedAt = Date.now(),
) {
  return dismissedAt + recoverySeconds * 1000;
}

export function parseAnswersStorage(value: unknown): AnswerSnippet[] | null {
  if (!Array.isArray(value)) return null;
  const answers = value.map((item) => {
    if (!isRecord(item) || !hasOnlyKeys(item, ['id', 'title', 'category', 'content', 'updatedAt'])) return null;
    if (!isText(item.id) || !item.id.trim() || !isText(item.title) || !item.title.trim()) return null;
    if (!isText(item.category) || !answerCategories.includes(item.category)) return null;
    if (!isText(item.content) || !item.content.trim() || !isDateString(item.updatedAt)) return null;
    return item as AnswerSnippet;
  });
  return answers.every((answer): answer is AnswerSnippet => answer !== null) ? answers : null;
}

export function parseApplicationsStorage(value: unknown): Application[] | null {
  if (!Array.isArray(value)) return null;
  const applications = value.map((item) => {
    if (!isRecord(item) || !hasOnlyKeys(item, ['id', 'company', 'role', 'url', 'status', 'priority', 'notes', 'nextAction', 'updatedAt'])) return null;
    if (!isText(item.id) || !item.id.trim() || !isText(item.company) || !item.company.trim()) return null;
    if (!isText(item.role) || !item.role.trim() || !isText(item.url)) return null;
    if (!isText(item.status) || !applicationStatuses.includes(item.status as ApplicationStatus)) return null;
    if (!isText(item.priority) || !priorities.includes(item.priority as Priority)) return null;
    if (!isText(item.notes) || !isText(item.nextAction) || !isDateString(item.updatedAt)) return null;
    return item as Application;
  });
  return applications.every((application): application is Application => application !== null) ? applications : null;
}

export function readStoredValue<T>(
  storage: Pick<Storage, 'getItem'> | undefined,
  key: string,
  fallback: T,
  parse: StorageParser<T>,
): T {
  if (!storage) return fallback;
  try {
    return parseStoredValue(storage.getItem(key), fallback, parse);
  } catch {
    return fallback;
  }
}

export function parseStoredValue<T>(raw: string | null, fallback: T, parse: StorageParser<T>): T {
  if (raw === null) return fallback;
  try {
    return parse(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredValue<T>(storage: StorageLike | undefined, key: string, value: T): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage can be unavailable or full; the in-memory state remains usable.
    return false;
  }
}

export function getLocalStorage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export type ProfileImportResult =
  | { ok: true; profile: Profile }
  | { ok: false; error: string };

export type WorkspaceExport = {
  profile: Profile;
  answers: AnswerSnippet[];
  applications: Application[];
};

export type WorkspaceArea = 'profile' | 'answers' | 'applications';

function sameWorkspaceValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function getWorkspaceChangedAreas(current: WorkspaceExport, backup: WorkspaceExport): WorkspaceArea[] {
  const changed: WorkspaceArea[] = [];
  if (!sameWorkspaceValue(current.profile, backup.profile)) changed.push('profile');
  if (!sameWorkspaceValue(current.answers, backup.answers)) changed.push('answers');
  if (!sameWorkspaceValue(current.applications, backup.applications)) changed.push('applications');
  return changed;
}

export type WorkspaceSummary = {
  profile: {
    displayName: string;
    email: string;
    filledFields: number;
    totalFields: number;
  };
  answers: {
    count: number;
    titles: string[];
  };
  applications: {
    count: number;
    labels: string[];
    byStatus: Record<ApplicationStatus, number>;
  };
};

export function summarizeWorkspace(workspace: WorkspaceExport): WorkspaceSummary {
  const displayName = [workspace.profile.preferred_name || workspace.profile.first_name, workspace.profile.last_name]
    .filter(Boolean)
    .join(' ') || 'Profile details';
  const byStatus = Object.fromEntries(
    applicationStatuses.map((status) => [
      status,
      workspace.applications.filter((application) => application.status === status).length,
    ]),
  ) as Record<ApplicationStatus, number>;

  return {
    profile: {
      displayName,
      email: workspace.profile.email,
      filledFields: profileFields.filter((field) => workspace.profile[field].trim()).length,
      totalFields: profileFields.length,
    },
    answers: {
      count: workspace.answers.length,
      titles: workspace.answers.map((answer) => answer.title),
    },
    applications: {
      count: workspace.applications.length,
      labels: workspace.applications.map((application) => `${application.company} · ${application.role}`),
      byStatus,
    },
  };
}

export type WorkspaceImportResult =
  | { ok: true; workspace: WorkspaceExport }
  | { ok: false; error: string };

export function serializeProfileExport(profile: Profile) {
  return JSON.stringify(
    {
      schema: PROFILE_EXPORT_SCHEMA,
      version: PROFILE_EXPORT_VERSION,
      profile,
    },
    null,
    2,
  );
}

export function parseProfileExport(value: unknown): ProfileImportResult {
  if (!isRecord(value) || value.schema !== PROFILE_EXPORT_SCHEMA) {
    return { ok: false, error: 'This file is not an EscapeHatch profile export.' };
  }
  if (value.version !== PROFILE_EXPORT_VERSION) {
    return { ok: false, error: 'This EscapeHatch export version is not supported.' };
  }
  const profile = parseProfileRecord(value.profile);
  if (!profile) {
    return { ok: false, error: 'This profile export has missing or invalid text fields.' };
  }
  return { ok: true, profile };
}

export function parseProfileExportText(text: string): ProfileImportResult {
  try {
    return parseProfileExport(JSON.parse(text));
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
}

export function serializeWorkspaceExport(profile: Profile, answers: AnswerSnippet[], applications: Application[]) {
  return JSON.stringify(
    {
      schema: WORKSPACE_EXPORT_SCHEMA,
      version: WORKSPACE_EXPORT_VERSION,
      profile,
      answers,
      applications,
    },
    null,
    2,
  );
}

export function parseWorkspaceExport(value: unknown): WorkspaceImportResult {
  if (!isRecord(value) || value.schema !== WORKSPACE_EXPORT_SCHEMA) {
    return { ok: false, error: 'This file is not an EscapeHatch workspace backup.' };
  }
  if (value.version !== WORKSPACE_EXPORT_VERSION) {
    return { ok: false, error: 'This EscapeHatch workspace backup version is not supported.' };
  }

  const profile = parseProfileRecord(value.profile);
  if (!profile) {
    return { ok: false, error: 'This workspace backup has missing or invalid profile data.' };
  }
  const answers = parseAnswersStorage(value.answers);
  if (!answers) {
    return { ok: false, error: 'This workspace backup has missing or invalid answer data.' };
  }
  const applications = parseApplicationsStorage(value.applications);
  if (!applications) {
    return { ok: false, error: 'This workspace backup has missing or invalid application data.' };
  }

  return { ok: true, workspace: { profile, answers, applications } };
}

export function parseWorkspaceExportText(text: string): WorkspaceImportResult {
  try {
    return parseWorkspaceExport(JSON.parse(text));
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
}