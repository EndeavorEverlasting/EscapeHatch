/**
 * Typed, private-by-construction résumé-selection graph. No IO and no document
 * bytes: providers/ATS writers must explicitly consume the returned gate.
 * O(V + E) validation/lineage; deterministic domain scoring and tie handling.
 * Parent #69, career artifact propagation v1 and résumé presentation remain owners.
 */
export const RESUME_GRAPH_SCHEMA = 'escapehatch/resume-selection-graph/v1' as const;
export type ResumeTier = 'canonical' | 'domain' | 'job';
export type Review = 'draft' | 'approved';
export type ResumeNode = {
  id: string; type: 'resume'; owner: string; tier: ResumeTier;
  revision: string; digest: string; review: Review;
  domainTags?: string[]; // only domain resumes may advertise reusable domains
};
export type OpportunityNode = {
  id: string; type: 'opportunity'; owner: string; postingDigest: string;
  domainWeights: Record<string, number>; // versioned, reviewed weights; no inference from URL
};
export type PlatformSlotNode = {
  id: string; type: 'platform_slot'; owner: string; platform: string;
  scope: 'persistent_global' | 'isolated_application' | 'unknown';
  observation: 'verified' | 'unverified'; // provider/browser readback, not assumption
  observationReceiptDigest?: string; // non-PII hash of the actual observed scope evidence
};
export type ApplicationNode = {
  id: string; type: 'application'; owner: string; opportunityId: string;
  state: 'draft' | 'in_progress' | 'submitted';
};
export type Node = ResumeNode | OpportunityNode | PlatformSlotNode | ApplicationNode;
export type Edge = {
  kind: 'derives_from' | 'targets_opportunity' | 'slot_points_to' | 'application_uses';
  from: string; to: string;
  parentDigest?: string; // required on derives_from, immutable fingerprint at derivation
};
export type ResumeGraph = { schema: typeof RESUME_GRAPH_SCHEMA; owner: string; nodes: Node[]; edges: Edge[] };
export type Decision = {
  action: 'REVIEW_REQUIRED' | 'KEEP_CURRENT' | 'UPLOAD_REQUIRES_CONSENT';
  reason: string;
  candidateId: string | null;
  platformSlotId: string;
  mayAutoReplacePersistentResume: false;
  mayAutoSubmit: false;
};
export type Selection = { opportunityId: string; platformSlotId: string };

const sha = (v: string) => /^[a-f0-9]{64}$/.test(v);
function die(message: string): never { throw new Error('Resume graph: ' + message); }
function fail(slot: string, reason: string): Decision {
  return { action: 'REVIEW_REQUIRED', reason, candidateId: null,
    platformSlotId: slot, mayAutoReplacePersistentResume: false, mayAutoSubmit: false };
}
function decision(slot: string, action: Decision['action'], reason: string, candidateId: string): Decision {
  return { action, reason, candidateId, platformSlotId: slot,
    mayAutoReplacePersistentResume: false, mayAutoSubmit: false };
}
function uniqueStrings(a: unknown): a is string[] {
  return Array.isArray(a) && a.every(x => typeof x === 'string' && x.trim().length > 0) && new Set(a).size === a.length;
}
function validId(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0 && s.length <= 256 && s.trim() === s;
}

/** Validate all edges and immutable derivation ancestry, not just the selected path. */
export function validateResumeGraph(g: ResumeGraph): Map<string, Node> {
  if (!g || g.schema !== RESUME_GRAPH_SCHEMA || !validId(g.owner) ||
      !Array.isArray(g.nodes) || !Array.isArray(g.edges) || g.nodes.length > 10000 || g.edges.length > 30000) die('invalid graph envelope');
  const nodes = new Map<string, Node>();
  let canonicalCount = 0;
  for (const n of g.nodes) {
    if (!n || !validId(n.id) || n.owner !== g.owner || nodes.has(n.id)) die('duplicate, invalid or cross-owner node');
    if (n.type === 'resume') {
      if (!['canonical', 'domain', 'job'].includes(n.tier) || !['draft', 'approved'].includes(n.review) ||
          !validId(n.revision) || !sha(n.digest)) die('malformed resume version');
      if (n.tier === 'canonical') canonicalCount++;
      if (n.tier === 'domain' && (!uniqueStrings(n.domainTags) || n.domainTags.length === 0)) die('domain tags required');
      if (n.tier !== 'domain' && n.domainTags?.length) die('non-domain resume claims reusable domain');
    } else if (n.type === 'opportunity') {
      if (!sha(n.postingDigest) || typeof n.domainWeights !== 'object' || !n.domainWeights || Array.isArray(n.domainWeights) ||
          Object.entries(n.domainWeights).length === 0 ||
          Object.entries(n.domainWeights).some(([tag, w]) => !validId(tag) || typeof w !== 'number' ||
            !Number.isFinite(w) || w <= 0 || w > 4)) die('invalid reviewed opportunity domain weights');
    } else if (n.type === 'platform_slot') {
      if (!validId(n.platform) || !['persistent_global', 'isolated_application', 'unknown'].includes(n.scope) ||
          !['verified', 'unverified'].includes(n.observation) ||
          (n.observation === 'verified' && !sha(n.observationReceiptDigest ?? ''))) die('invalid platform slot');
    } else if (n.type === 'application') {
      if (!validId(n.opportunityId) || !['draft', 'in_progress', 'submitted'].includes(n.state)) die('invalid application');
    } else die('unknown node type');
    nodes.set(n.id, n);
  }
  if (canonicalCount !== 1) die('one canonical master required per owner graph revision');
  const derivation = new Map<string, string>();
  const slotEdges = new Map<string, string>();
  const jobTargets = new Map<string, string>();
  const applicationAttachments = new Map<string, string>();
  const edges = new Set<string>();
  for (const e of g.edges) {
    const a = nodes.get(e?.from), b = nodes.get(e?.to);
    if (!a || !b || a.id === b.id) die('dangling or self edge');
    const key = e.kind + ':' + e.from + ':' + e.to;
    if (edges.has(key)) die('duplicate edge');
    edges.add(key);
    if (e.kind === 'derives_from') {
      if (a.type !== 'resume' || b.type !== 'resume' || a.tier === 'canonical' ||
          (a.tier === 'domain' && b.tier !== 'canonical') ||
          (a.tier === 'job' && b.tier === 'job') ||
          !sha(e.parentDigest ?? '') || derivation.has(a.id)) die('invalid derivation');
      derivation.set(a.id, b.id);
    } else if (e.kind === 'targets_opportunity') {
      if (a.type !== 'resume' || a.tier !== 'job' || b.type !== 'opportunity' || jobTargets.has(a.id)) die('invalid job target');
      jobTargets.set(a.id,b.id);
    } else if (e.kind === 'slot_points_to') {
      if (a.type !== 'platform_slot' || b.type !== 'resume' || slotEdges.has(a.id)) die('invalid platform slot binding');
      slotEdges.set(a.id, b.id);
    } else if (e.kind === 'application_uses') {
      if (a.type !== 'application' || b.type !== 'resume' || applicationAttachments.has(a.id)) die('invalid application attachment');
      applicationAttachments.set(a.id, b.id);
    } else die('unknown edge kind');
  }
  for (const n of g.nodes) {
    if (n.type === 'resume' && n.tier !== 'canonical' && !derivation.has(n.id)) die('derivative has no source master');
    if (n.type === 'application' && nodes.get(n.opportunityId)?.type !== 'opportunity') die('application lacks opportunity');
    if (n.type === 'resume' && n.tier === 'job' && !jobTargets.has(n.id)) die('job derivative lacks unique opportunity');
    if (n.type === 'application') {
      const usedResume = applicationAttachments.get(n.id);
      if (usedResume && jobTargets.has(usedResume) && jobTargets.get(usedResume) !== n.opportunityId) die('application crossed opportunity');
    }
  }
  // Globally memoized iterative walk: O(V + E), not a separate traversal per node.
  const resolved = new Set<string>();
  for (const id of derivation.keys()) {
    const visiting = new Set<string>(); let p: string | undefined = id;
    while (p && !resolved.has(p)) {
      if (visiting.has(p)) die('derivation cycle');
      visiting.add(p);
      p = derivation.get(p);
    }
    for (const seen of visiting) resolved.add(seen);
  }
  return nodes;
}
function fresh(n: ResumeNode, nodes: Map<string, Node>,
  parentEdges: Map<string, Edge>, cache: Map<string, boolean>): boolean {
  if (cache.has(n.id)) return cache.get(n.id)!;
  let cur = n;
  const path: string[] = [];
  let good = true;
  while (true) {
    if (cache.has(cur.id)) { good = cache.get(cur.id)!; break; }
    path.push(cur.id);
    if (cur.review !== 'approved') { good = false; break; }
    if (cur.tier === 'canonical') break;
    const edge = parentEdges.get(cur.id), parent = edge && nodes.get(edge.to);
    if (!edge || parent?.type !== 'resume' || edge.parentDigest !== parent.digest) { good = false; break; }
    cur = parent;
  }
  for (const id of path) cache.set(id, good);
  return good;
}
function domainScore(n: ResumeNode, weights: Record<string, number>): number {
  return (n.domainTags ?? []).reduce((score, tag) => score + (Object.hasOwn(weights, tag) ? weights[tag] : 0), 0);
}
/**
 * The planner never uploads. An unverified/unknown platform slot fails closed.
 * Persistent/global slots may ONLY take approved domain masters or canonical
 * master. Job-specific derivatives are restricted to proven isolated slots.
 */
export function resolveResumeForPlatform(g: ResumeGraph, selection: Selection): Decision {
  const slotId = selection.platformSlotId;
  let nodes: Map<string, Node>;
  try { nodes = validateResumeGraph(g); } catch { return fail(slotId, 'INVALID_GRAPH'); }
  const opportunity = nodes.get(selection.opportunityId), slot = nodes.get(slotId);
  if (opportunity?.type !== 'opportunity' || slot?.type !== 'platform_slot') return fail(slotId, 'MISSING_BOUND_OPPORTUNITY_OR_SLOT');
  if (slot.scope === 'unknown' || slot.observation !== 'verified') return fail(slotId, 'PLATFORM_SLOT_SEMANTICS_UNVERIFIED');
  const all = g.nodes.filter((x): x is ResumeNode => x.type === 'resume');
  const parentEdges = new Map(g.edges.filter(e => e.kind === 'derives_from').map(e => [e.from, e]));
  const cache = new Map<string, boolean>();
  const match = all.filter(x => x.review === 'approved' && fresh(x, nodes, parentEdges, cache));
  const previous = g.edges.find(e => e.kind === 'slot_points_to' && e.from === slot.id);
  const current = previous && nodes.get(previous.to);
  const parentsCurrent = current?.type === 'resume' && match.some(x => x.id === current.id);
  const opportunityWeights = opportunity.domainWeights;
  // Matching a domain is independent of job board; never derive a domain from title alone.
  const domains = match.filter(x => x.tier === 'domain').map(node => ({ node, score: domainScore(node, opportunityWeights) }))
    .filter(x => x.score > 0) .sort((a, b) => b.score - a.score || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
  if (domains.length > 1 && domains[0].score === domains[1].score) return fail(slot.id, 'AMBIGUOUS_DOMAIN_MASTERS');
  const master = match.find(x => x.tier === 'canonical');
  if (!master) return fail(slot.id, 'CANONICAL_MASTER_NOT_APPROVED_OR_STALE');
  const domain = domains[0]?.node ?? master;
  if (slot.scope === 'persistent_global') {
    if (parentsCurrent && current?.id === domain.id) return decision(slot.id, 'KEEP_CURRENT', 'PERSISTENT_DOMAIN_ALREADY_SELECTED', domain.id);
    // Current job-specific resume remains a visible drift risk, not permission to overwrite it.
    return decision(slot.id, 'UPLOAD_REQUIRES_CONSENT', current?.type === 'resume' && current.tier === 'job' ?
      'PERSISTENT_SLOT_HAS_JOB_DERIVATIVE' : 'PERSISTENT_RESUME_REPLACEMENT_NEEDS_CONSENT', domain.id);
  }
  const targeted = new Set(g.edges.filter(e => e.kind === 'targets_opportunity' && e.to === opportunity.id).map(e => e.from));
  const jobs = match.filter(x => x.tier === 'job' && targeted.has(x.id))
    .sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (jobs.length > 1) return fail(slot.id, 'AMBIGUOUS_JOB_DERIVATIVES');
  const selected = jobs[0] ?? domain;
  if (parentsCurrent && current?.id === selected.id) return decision(slot.id, 'KEEP_CURRENT', 'ISOLATED_ATTACHMENT_CURRENT', selected.id);
  return decision(slot.id, 'UPLOAD_REQUIRES_CONSENT', 'ISOLATED_APPLICATION_ATTACHMENT_REVIEW', selected.id);
}
/**
 * Queue-wide effective master selection for a single account-wide platform slot.
 * This aggregates reviewed domain weights across a bounded set of queued jobs,
 * rather than thrashing the site's shared default for every individual posting.
 * No applicant data, provider IO or upload happens here.
 */
export function resolveEffectiveMasterForQueue(
  g: ResumeGraph, input: { opportunityIds: string[]; platformSlotId: string }
): Decision {
  let nodes: Map<string, Node>;
  try { nodes = validateResumeGraph(g); } catch { return fail(input.platformSlotId, 'INVALID_GRAPH'); }
  const slot = nodes.get(input.platformSlotId);
  if (slot?.type !== 'platform_slot' || slot.scope !== 'persistent_global' ||
      slot.observation !== 'verified') return fail(input.platformSlotId, 'PERSISTENT_PLATFORM_SCOPE_UNVERIFIED');
  if (!uniqueStrings(input.opportunityIds) || input.opportunityIds.length === 0) return fail(slot.id, 'MISSING_QUEUE_OPPORTUNITIES');
  const weights: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const id of input.opportunityIds) {
    const job = nodes.get(id);
    if (job?.type !== 'opportunity') return fail(slot.id, 'QUEUE_HAS_UNKNOWN_OPPORTUNITY');
    for (const [tag, weight] of Object.entries(job.domainWeights)) weights[tag] = (weights[tag] ?? 0) + weight;
  }
  const ancestors = new Map(g.edges.filter(e => e.kind === 'derives_from').map(e => [e.from, e]));
  const memo = new Map<string, boolean>();
  const available = g.nodes.filter((x): x is ResumeNode =>
    x.type === 'resume' && x.review === 'approved' && fresh(x, nodes, ancestors, memo));
  const canonical = available.find(x => x.tier === 'canonical');
  if (!canonical) return fail(slot.id, 'CANONICAL_MASTER_NOT_APPROVED_OR_STALE');
  const ranked = available.filter(x => x.tier === 'domain')
    .map(x => ({node:x, score:domainScore(x,weights)}))
    .filter(x => x.score > 0)
    .sort((a,b) => b.score-a.score || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return fail(slot.id,'QUEUE_DOMAIN_CONFLICT_REVIEW_REQUIRED');
  const chosen = ranked[0]?.node ?? canonical;
  const slotEdge = g.edges.find(e => e.kind === 'slot_points_to' && e.from === slot.id);
  const current = slotEdge && nodes.get(slotEdge.to);
  if (current?.type === 'resume' && current.id === chosen.id &&
      available.some(x => x.id === chosen.id)) return decision(slot.id,'KEEP_CURRENT','QUEUE_EFFECTIVE_MASTER_ALREADY_SELECTED',chosen.id);
  return decision(slot.id,'UPLOAD_REQUIRES_CONSENT','QUEUE_EFFECTIVE_MASTER_REPLACEMENT_NEEDS_CONSENT',chosen.id);
}

/** Return affected downstream derivative IDs; never mutate approved artifacts. */
export function impactedResumeDescendants(g: ResumeGraph, changedId: string): string[] {
  const nodes = validateResumeGraph(g);
  if (!nodes.has(changedId)) return [];
  const children = new Map<string, string[]>();
  for (const e of g.edges.filter(e => e.kind === 'derives_from')) {
    children.set(e.to, [...(children.get(e.to) ?? []), e.from]);
  }
  const visited = new Set<string>(), pending = [changedId];
  while (pending.length) {
    const root = pending.pop()!;
    for (const id of children.get(root) ?? []) if (!visited.has(id)) { visited.add(id); pending.push(id); }
  }
  return [...visited].sort();
}
