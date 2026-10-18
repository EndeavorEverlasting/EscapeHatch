import { ASSIST_KEY, type AssistProfile, type ReviewedProposal } from './assist-contract';
import { PROFILE_KEY, type Application, type Profile } from './storage';
import { applyAcceptedResumeImport, extractResumeText, getAcceptedResumeContactPatch, parseResumeText, type ResumeImport } from './resume-import';

// References only. Candidate values continue to belong to AssistProfile/Profile.
export const SOURCE_BINDINGS_KEY = 'escape-hatch-source-bindings-v1';
export type SourceBinding = {
  schema: 'escapehatch/approved-source/v1';
  sourceId: string;
  revision: string;
  label: string;
  opportunityId: string;
  profileRevision: string;
  approvedProposalIds: string[];
  approvalDigest: string;
  approvedAt: string;
};
export type SourcePreview = {
  sourceId: string;
  revision: string;
  byteCount: number;
  imported: ResumeImport;
  baseRevision: string;
};

export async function fingerprint(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function candidateRevision(profile: Profile, assist: AssistProfile) {
  return fingerprint(JSON.stringify({ profile, assist }));
}

/** File chooser authorization is local to this browser; this is not hosted identity. */
export async function previewLocalSource(file: File, profile: Profile, assist: AssistProfile): Promise<SourcePreview> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('SOURCE_SIZE_UNSUPPORTED');
  if (!/\.(txt|pdf)$/i.test(file.name)) throw new Error('SOURCE_TYPE_UNSUPPORTED');
  const baseRevision = await candidateRevision(profile, assist);
  const bytes = await file.arrayBuffer();
  const revision = await fingerprint(bytes);
  // Parse a snapshot of the exact bytes fingerprinted, never a later provider revision.
  const snapshot = new File([bytes], file.name, { type: /\.pdf$/i.test(file.name) ? 'application/pdf' : 'text/plain' });
  const text = /\.txt$/i.test(file.name) ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : await extractResumeText(snapshot);
  if (!text.trim()) throw new Error('SOURCE_CONTENT_EMPTY');
  const imported = parseResumeText(text, file.name);
  const sourceId = await fingerprint(JSON.stringify(['local_chooser', file.name, revision]));
  return { sourceId, revision, byteCount: bytes.byteLength, imported, baseRevision };
}

export async function approveSource(
  preview: SourcePreview, proposals: ReviewedProposal[], opportunityId: string,
  applications: Application[], profile: Profile, assist: AssistProfile, bindings: SourceBinding[],
): Promise<{ profile: Profile; assist: AssistProfile; bindings: SourceBinding[] }> {
  if (!applications.some((item) => item.id === opportunityId && item.status !== 'closed')) throw new Error('OPPORTUNITY_REQUIRED');
  const accepted = proposals.filter((item) => item.review === 'accepted' || item.review === 'edited');
  if (!accepted.length) throw new Error('APPROVAL_REQUIRED');
  // Bind reviewed proposals to this preview. Arbitrary caller-supplied claims are rejected.
  if (new Set(accepted.map((item) => item.id)).size !== accepted.length || accepted.some((item) => !preview.imported.proposals.some((original) =>
    original.id === item.id && original.section === item.section && original.field === item.field &&
    (item.review === 'edited' || original.value === item.value),
  ))) throw new Error('PROPOSAL_MISMATCH');
  const currentRevision = await candidateRevision(profile, assist);
  const approvalDigest = await fingerprint(JSON.stringify(accepted.map((item) => [item.id, item.value]).sort((a, b) => a[0].localeCompare(b[0]))));
  const prior = bindings.find((item) => item.sourceId === preview.sourceId && item.revision === preview.revision && item.approvalDigest === approvalDigest);
  if (prior) {
    if (prior.profileRevision !== currentRevision && currentRevision !== preview.baseRevision) throw new Error('SOURCE_APPROVAL_STALE');
    // Repeated approval is a no-op, avoiding duplicate work/education/project rows.
    if (prior.profileRevision === currentRevision) return { profile, assist, bindings: prior.opportunityId === opportunityId ? bindings : [
      ...bindings.filter((item) => !(item.sourceId === prior.sourceId && item.opportunityId === opportunityId)),
      { ...prior, opportunityId },
    ] };
  }
  if (currentRevision !== preview.baseRevision) throw new Error('PROFILE_CHANGED_REVIEW_AGAIN');
  const grounded = accepted.map((item) => ({ ...item, provenance: {
    ...preview.imported.proposals.find((original) => original.id === item.id)!.provenance,
    sourceId: preview.sourceId, revision: preview.revision,
  } }));
  const nextAssist = applyAcceptedResumeImport(preview.imported, grounded, assist);
  // A newly reviewed subset may include already imported claims. Keep the latest
  // explicit review for that source claim rather than appending duplicate rows.
  const unique = <T>(items: T[], key: (item: T) => string) => [...new Map(items.map((item) => [key(item), item])).values()];
  nextAssist.links = unique(nextAssist.links, (item) => JSON.stringify([item.url, item.provenance.sourceId, item.provenance.revision]));
  nextAssist.projects = unique(nextAssist.projects, (item) => JSON.stringify([item.id, item.provenance.sourceId, item.provenance.revision]));
  nextAssist.experience = unique(nextAssist.experience, (item) => JSON.stringify([item.id, item.provenance.sourceId, item.provenance.revision]));
  nextAssist.education = unique(nextAssist.education, (item) => JSON.stringify([item.id, item.provenance.sourceId, item.provenance.revision]));
  const nextProfile = { ...profile, ...getAcceptedResumeContactPatch(grounded) };
  const binding: SourceBinding = {
    schema: 'escapehatch/approved-source/v1', sourceId: preview.sourceId, revision: preview.revision,
    label: preview.imported.fileName, opportunityId, profileRevision: await candidateRevision(nextProfile, nextAssist),
    approvedProposalIds: accepted.map((item) => item.id), approvalDigest, approvedAt: new Date().toISOString(),
  };
  return { profile: nextProfile, assist: nextAssist, bindings: [...bindings.filter((item) => !(item.sourceId === binding.sourceId && item.opportunityId === opportunityId)), binding] };
}

/** Publish the reference last; failures cannot activate an unpersisted candidate. */
export function persistSourceApproval(storage: Storage | undefined, value: { profile: Profile; assist: AssistProfile; bindings: SourceBinding[] }) {
  if (!storage) throw new Error('STORAGE_UNAVAILABLE');
  const entries = [[PROFILE_KEY, value.profile], [ASSIST_KEY, value.assist], [SOURCE_BINDINGS_KEY, value.bindings]] as const;
  const before = entries.map(([key]) => [key, storage.getItem(key)] as const);
  try {
    for (const [key, item] of entries) storage.setItem(key, JSON.stringify(item));
  } catch {
    let restored = true;
    for (const [key, item] of before) {
      try { if (item === null) storage.removeItem(key); else storage.setItem(key, item); } catch { restored = false; }
    }
    // Even a failed rollback leaves revision checks fail-closed; never report success.
    throw new Error(restored ? 'STORAGE_SAVE_FAILED' : 'STORAGE_RECOVERY_REQUIRED');
  }
}

export function parseSourceBindings(value: unknown): SourceBinding[] | null {
  if (!Array.isArray(value)) return null;
  const keys = ['schema', 'sourceId', 'revision', 'label', 'opportunityId', 'profileRevision', 'approvedProposalIds', 'approvalDigest', 'approvedAt'];
  const hash = (item: unknown) => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item);
  if (value.some((item) => !item || typeof item !== 'object' || Object.keys(item).some((key) => !keys.includes(key)) ||
    item.schema !== 'escapehatch/approved-source/v1' || !hash(item.sourceId) || !hash(item.revision) || !hash(item.profileRevision) || !hash(item.approvalDigest) ||
    typeof item.label !== 'string' || typeof item.opportunityId !== 'string' || !item.opportunityId.trim() ||
    !Array.isArray(item.approvedProposalIds) || !item.approvedProposalIds.length || item.approvedProposalIds.some((id: unknown) => typeof id !== 'string' || !id) ||
    typeof item.approvedAt !== 'string' || Number.isNaN(Date.parse(item.approvedAt)))) return null;
  if (new Set(value.map((item) => JSON.stringify([item.sourceId, item.opportunityId]))).size !== value.length) return null;
  return value as SourceBinding[];
}

export async function sourcePackageStatus(binding: SourceBinding, applications: Application[], profile: Profile, assist: AssistProfile) {
  if (!applications.some((item) => item.id === binding.opportunityId && item.status !== 'closed')) return 'Opportunity unavailable';
  if (await candidateRevision(profile, assist) !== binding.profileRevision) return 'Profile changed: source review required';
  // Approval is not posting freshness, verified attachment, or browser-review proof.
  return 'Source approved; live posting and managed browser preparation remain unverified';
}
