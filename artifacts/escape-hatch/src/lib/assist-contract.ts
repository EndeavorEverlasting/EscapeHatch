import type { AnswerSnippet, Profile } from './storage';

export const ASSIST_SCHEMA = 'escape-hatch-assist';
export const ASSIST_VERSION = 1;
export const ASSIST_KEY = 'escape-hatch-assist-profile';
export const ASSIST_SYNC_SCHEMA = 'escape-hatch-assist-sync';
export const ASSIST_SYNC_VERSION = 1;
export const ASSIST_SESSION_KEY = 'escape-hatch-assist-session';
export const ASSIST_ANSWERS_KEY = 'escape-hatch-assist-answers';

export type Provenance = {
  source: 'resume' | 'user' | 'answer-library' | 'import';
  label: string;
  snippet?: string;
  page?: number;
  capturedAt: string;
};

export type ReviewState = 'proposed' | 'accepted' | 'edited' | 'rejected';
export type Confidence = 'high' | 'medium' | 'low' | 'ambiguous';

export type ReviewedProposal = {
  id: string;
  section: 'contact' | 'links' | 'summary' | 'skills' | 'projects' | 'experience' | 'education' | 'answer';
  field: string;
  value: string;
  confidence: Confidence;
  review: ReviewState;
  provenance: Provenance;
};

export type AssistExperience = {
  id: string;
  company: string;
  title: string;
  dates: string;
  location: string;
  bullets: string[];
  provenance: Provenance;
};

export type AssistProject = {
  id: string;
  name: string;
  url: string;
  description: string;
  provenance: Provenance;
};

export type AssistEducation = {
  id: string;
  institution: string;
  credential: string;
  dates: string;
  details: string;
  provenance: Provenance;
};

export type AssistProfile = {
  schema: typeof ASSIST_SCHEMA;
  version: typeof ASSIST_VERSION;
  updatedAt: string;
  contact: Pick<Profile, 'name_prefix' | 'first_name' | 'last_name' | 'preferred_name' | 'email' | 'phone' | 'phone_authority' | 'linkedin_url' | 'street_address' | 'city' | 'region' | 'postal_code' | 'country'>;
  links: { label: string; url: string; provenance: Provenance }[];
  summary: string;
  skills: string[];
  projects: AssistProject[];
  experience: AssistExperience[];
  education: AssistEducation[];
  proposals: ReviewedProposal[];
  approvedAt?: string;
};

export type AssistAnswer = AnswerSnippet & {
  canonicalId?: CanonicalQuestionId;
  scope: 'reusable' | 'opportunity';
  opportunityId?: string;
  provenance?: Provenance;
};

export type CanonicalQuestionId =
  | 'professional-summary'
  | 'why-this-role'
  | 'why-this-company'
  | 'strengths'
  | 'relevant-experience'
  | 'work-authorization'
  | 'sponsorship'
  | 'compensation'
  | 'demographic'
  | 'legal-attestation'
  | 'unknown';

export type SyncPayload = {
  schema: typeof ASSIST_SYNC_SCHEMA;
  version: typeof ASSIST_SYNC_VERSION;
  exportedAt: string;
  profile: AssistProfile;
  answers: AssistAnswer[];
  baseProfile?: Profile;
  source: 'cockpit' | 'extension' | 'recovery-import';
};

export type SyncResult =
  | { ok: true; payload: SyncPayload }
  | { ok: false; error: string };

export const emptyAssistProfile = (contact: Profile): AssistProfile => ({
  schema: ASSIST_SCHEMA,
  version: ASSIST_VERSION,
  updatedAt: new Date(0).toISOString(),
  contact: { ...contact },
  links: [],
  summary: '',
  skills: [],
  projects: [],
  experience: [],
  education: [],
  proposals: [],
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown) => typeof value === 'string' ? value : null;
const date = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

function validProvenance(value: unknown): value is Provenance {
  if (!isRecord(value) || !['resume', 'user', 'answer-library', 'import'].includes(String(value.source))) return false;
  return Boolean(text(value.label)?.trim() && date(value.capturedAt));
}

function validProposal(value: unknown): value is ReviewedProposal {
  if (!isRecord(value)) return false;
  return Boolean(text(value.id)?.trim() && ['contact', 'links', 'summary', 'skills', 'projects', 'experience', 'education', 'answer'].includes(String(value.section))
    && text(value.field)?.trim() && text(value.value) !== null
    && ['high', 'medium', 'low', 'ambiguous'].includes(String(value.confidence))
    && ['proposed', 'accepted', 'edited', 'rejected'].includes(String(value.review))
    && validProvenance(value.provenance));
}

function validAssistAnswer(value: unknown): value is AssistAnswer {
  if (!isRecord(value)) return false;
  return Boolean(text(value.id)?.trim() && text(value.title)?.trim() && text(value.category)?.trim()
    && text(value.content)?.trim() && date(value.updatedAt)
    && ['reusable', 'opportunity'].includes(String(value.scope))
    && (!value.canonicalId || typeof value.canonicalId === 'string'));
}

function validProfile(value: unknown): value is AssistProfile {
  if (!isRecord(value) || value.schema !== ASSIST_SCHEMA || value.version !== ASSIST_VERSION) return false;
  const contact = value.contact;
  if (!isRecord(contact) || Object.keys(contact).some((key) => typeof contact[key] !== 'string')) return false;
  if (!Array.isArray(value.links) || !value.links.every((link) => isRecord(link) && text(link.label)?.trim() && text(link.url)?.trim() && validProvenance(link.provenance))) return false;
  if (text(value.summary) === null || !Array.isArray(value.skills) || !value.skills.every((item) => typeof item === 'string')) return false;
  if (!Array.isArray(value.projects) || !Array.isArray(value.experience) || !Array.isArray(value.education) || !Array.isArray(value.proposals)) return false;
  return value.proposals.every(validProposal) && date(value.updatedAt);
}

export function parseAssistProfile(value: unknown): AssistProfile | null {
  return validProfile(value) ? value : null;
}

export function serializeAssistProfile(profile: AssistProfile) {
  return JSON.stringify({ schema: ASSIST_SCHEMA, version: ASSIST_VERSION, profile }, null, 2);
}

export function parseSyncPayload(value: unknown): SyncResult {
  if (!isRecord(value) || value.schema !== ASSIST_SYNC_SCHEMA) return { ok: false, error: 'This file is not an EscapeHatch assist sync.' };
  if (value.version !== ASSIST_SYNC_VERSION) return { ok: false, error: 'This EscapeHatch assist sync version is not supported.' };
  if (!validProfile(value.profile) || !Array.isArray(value.answers) || !value.answers.every(validAssistAnswer)) return { ok: false, error: 'This assist sync has missing or invalid profile data.' };
  return { ok: true, payload: value as SyncPayload };
}

export function serializeSyncPayload(profile: AssistProfile, answers: AssistAnswer[], baseProfile: Profile | undefined, source: SyncPayload['source']) {
  return JSON.stringify({
    schema: ASSIST_SYNC_SCHEMA,
    version: ASSIST_SYNC_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    answers,
    baseProfile,
    source,
  } satisfies SyncPayload, null, 2);
}

export function mergeSyncPayload(current: SyncPayload, incoming: SyncPayload, choice: 'keep-current' | 'use-incoming' | 'merge') {
  if (choice === 'keep-current') return current;
  if (choice === 'use-incoming') return incoming;
  const mergedProfile: AssistProfile = {
    ...current.profile,
    ...incoming.profile,
    contact: { ...current.profile.contact, ...incoming.profile.contact },
    links: [...current.profile.links, ...incoming.profile.links.filter((item) => !current.profile.links.some((existing) => existing.url === item.url))],
    skills: [...new Set([...current.profile.skills, ...incoming.profile.skills])],
    projects: [...current.profile.projects, ...incoming.profile.projects.filter((item) => !current.profile.projects.some((existing) => existing.name === item.name))],
    experience: [...current.profile.experience, ...incoming.profile.experience.filter((item) => !current.profile.experience.some((existing) => existing.company === item.company && existing.title === item.title))],
    education: [...current.profile.education, ...incoming.profile.education.filter((item) => !current.profile.education.some((existing) => existing.institution === item.institution && existing.credential === item.credential))],
    proposals: [...current.profile.proposals, ...incoming.profile.proposals.filter((item) => !current.profile.proposals.some((existing) => existing.id === item.id))],
    updatedAt: new Date().toISOString(),
  };
  return { ...current, profile: mergedProfile, answers: [...current.answers, ...incoming.answers.filter((item) => !current.answers.some((existing) => existing.id === item.id))] };
}

export type SyncConflict = { areas: ('profile' | 'answers')[]; current: SyncPayload; incoming: SyncPayload };

export function detectSyncConflict(current: SyncPayload, incoming: SyncPayload): SyncConflict | null {
  const areas: SyncConflict['areas'] = [];
  if (JSON.stringify(current.profile) !== JSON.stringify(incoming.profile)) areas.push('profile');
  if (JSON.stringify(current.answers) !== JSON.stringify(incoming.answers)) areas.push('answers');
  return areas.length ? { areas, current, incoming } : null;
}