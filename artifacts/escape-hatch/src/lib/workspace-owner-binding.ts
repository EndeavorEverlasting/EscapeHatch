/**
 * Versioned owner-scoped *admission* contract for future agent-runtime wiring.
 * Source and binding records MUST be supplied by a trusted local workspace
 * service, not inferred from a user prompt, email address or developer fixture.
 * This module alone does not authenticate a person or load private files.
 */
export const OWNER_BINDING_SCHEMA = 'escapehatch/workspace-owner-binding/v1';
export const AGENT_CONTEXT_SCHEMA = 'escapehatch/agent-context/v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = /^[a-f0-9]{64}$/;

export type WorkspaceOwnerBinding = {
  schema: typeof OWNER_BINDING_SCHEMA;
  ownerId: string;
  workspaceId: string;
  installationId: string;
  boundAt: string;
  selection: 'applicant-confirmed';
};
export type OwnedSource = {
  sourceId: string;
  ownerId: string;
  workspaceId: string;
  revision: string;
};
export type AgentContextEnvelope = {
  schema: typeof AGENT_CONTEXT_SCHEMA;
  ownerId: string;
  workspaceId: string;
  installationId: string;
  profileRevision: string;
  sources: OwnedSource[];
  voiceRevision?: string;
  opportunityId?: string;
};
export type AgentContextDecision =
  | { ok: true; ownerId: string; workspaceId: string; sourceCount: number }
  | { ok: false; reason: 'OWNER_UNBOUND' | 'OWNER_MISMATCH' | 'WORKSPACE_MISMATCH' | 'SOURCE_SCOPE_MISMATCH' | 'REVISION_REQUIRED' };

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const validId = (v: unknown): v is string => typeof v === 'string' && uuid.test(v);
const validRev = (v: unknown): v is string => typeof v === 'string' && sha.test(v);

export function parseWorkspaceOwnerBinding(value: unknown): WorkspaceOwnerBinding | null {
  if (!record(value) || Object.keys(value).some(k => !['schema','ownerId','workspaceId','installationId','boundAt','selection'].includes(k))) return null;
  if (value.schema !== OWNER_BINDING_SCHEMA || value.selection !== 'applicant-confirmed' ||
    !validId(value.ownerId) || !validId(value.workspaceId) || !validId(value.installationId) ||
    typeof value.boundAt !== 'string' || Number.isNaN(Date.parse(value.boundAt))) return null;
  return value as WorkspaceOwnerBinding;
}

/** Admission is valid for this exact trusted binding and source revision set only. */
export function authorizeAgentContext(
  trustedBinding: unknown,
  envelope: AgentContextEnvelope,
  trustedProfileRevision: string,
  trustedSources: OwnedSource[],
  trustedSelection: { voiceRevision?: string; opportunityId?: string } = {},
): AgentContextDecision {
  const binding = parseWorkspaceOwnerBinding(trustedBinding);
  if (!binding) return { ok: false, reason: 'OWNER_UNBOUND' };
  if (envelope.schema !== AGENT_CONTEXT_SCHEMA || envelope.ownerId !== binding.ownerId) return { ok: false, reason: 'OWNER_MISMATCH' };
  if (envelope.workspaceId !== binding.workspaceId || envelope.installationId !== binding.installationId) return { ok: false, reason: 'WORKSPACE_MISMATCH' };
  if (!validRev(trustedProfileRevision) || envelope.profileRevision !== trustedProfileRevision ||
    !Array.isArray(envelope.sources) || envelope.sources.length > 100 ||
    (envelope.voiceRevision !== undefined && !validRev(envelope.voiceRevision)) ||
    (trustedSelection.voiceRevision !== undefined && !validRev(trustedSelection.voiceRevision)) ||
    envelope.voiceRevision !== trustedSelection.voiceRevision ||
    envelope.opportunityId !== trustedSelection.opportunityId) return { ok: false, reason: 'REVISION_REQUIRED' };
  const bySource = new Map<string, OwnedSource>();
  for (const s of trustedSources) {
    if (!s.sourceId || !validRev(s.revision) || s.ownerId !== binding.ownerId || s.workspaceId !== binding.workspaceId ||
      bySource.has(s.sourceId)) return { ok: false, reason: 'SOURCE_SCOPE_MISMATCH' };
    bySource.set(s.sourceId, s);
  }
  const seen = new Set<string>();
  for (const s of envelope.sources) {
    const source = bySource.get(s.sourceId);
    if (!source || seen.has(s.sourceId) || !validRev(s.revision) ||
      s.ownerId !== binding.ownerId || s.workspaceId !== binding.workspaceId ||
      source.revision !== s.revision) return { ok: false, reason: 'SOURCE_SCOPE_MISMATCH' };
    seen.add(s.sourceId);
  }
  return { ok: true, ownerId: binding.ownerId, workspaceId: binding.workspaceId, sourceCount: seen.size };
}
