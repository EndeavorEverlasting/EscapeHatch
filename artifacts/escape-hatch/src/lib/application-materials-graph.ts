/**
 * P04 application-materials projection over the existing applicant-owned career graph.
 * This module creates NO documents, file-picker actions, application steps or consent.
 * It selects a review packet from observed form capacity and approved material lineage.
 * Parent Issue #69; platform-global resume protection belongs to resume-selection-graph.ts.
 */
export type MaterialKind = 'canonical_resume' | 'domain_resume' | 'job_resume' | 'cover_letter' | 'case_study';
export type MaterialNode = {
  id: string; ownerId: string; opportunityId: string | null;
  kind: MaterialKind; sha256: string; revision: string;
  review: 'approved' | 'draft'; parentIds: string[]; sourceEvidenceIds: string[];
};
export type AnswerNode = {
  id: string; ownerId: string; opportunityId: string; questionKey: string;
  textDigest: string; review: 'approved' | 'draft'; sourceEvidenceIds: string[];
};
export type FormSlot = {
  id: string; kind: 'supporting_documents' | 'cover_letter' | 'resume' | 'case_study' | 'unknown';
  observed: boolean; evidenceDigest: string | null;
  maxFiles: number | null; // null is unknown, NOT unlimited
  acceptedKinds: MaterialKind[]; // explicit, observed label/type contract; [] = unknown
  persistence: 'isolated_application' | 'persistent_global' | 'unknown';
};
export type MaterialsGraph = {
  ownerId: string; opportunityId: string;
  nodes: MaterialNode[]; answers: AnswerNode[];
  evidenceIds: string[]; // reviewed career-fact/evidence identifiers; no content in public fixtures
};
export type MaterialsDecision = {
  state: 'REVIEW_REQUIRED' | 'PACKET_PROPOSED';
  attachmentIds: string[]; answerIds: string[];
  blockers: string[]; slotId: string;
  mayAutoUpload: false; mayAutoSubmit: false;
};
const hex = (x: string | null) => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const valid = (x: string) => typeof x === 'string' && x.length > 0 && x.length <= 256;
const stop = (slotId: string, reason: string): MaterialsDecision => ({
  state: 'REVIEW_REQUIRED', attachmentIds: [], answerIds: [], blockers: [reason], slotId,
  mayAutoUpload: false, mayAutoSubmit: false,
});
/** P01 validation fails closed on mixed users, invalid ancestry and ungrounded prose. */
export function validateMaterialsGraph(graph: MaterialsGraph): void {
  if (!graph || !valid(graph.ownerId) || !valid(graph.opportunityId) ||
      !Array.isArray(graph.nodes) || !Array.isArray(graph.answers) || !Array.isArray(graph.evidenceIds) ||
      graph.nodes.length > 10000 || graph.answers.length > 10000) throw Error('MATERIALS_GRAPH_ENVELOPE');
  const ids = new Set<string>(), evidences = new Set(graph.evidenceIds);
  if (evidences.size !== graph.evidenceIds.length || graph.evidenceIds.some(x => !valid(x))) throw Error('MATERIALS_EVIDENCE_INVALID');
  const nodes = new Map<string, MaterialNode>();
  for (const node of graph.nodes) {
    if (!node || !valid(node.id) || ids.has(node.id) || node.ownerId !== graph.ownerId ||
      !['canonical_resume','domain_resume','job_resume','cover_letter','case_study'].includes(node.kind) ||
      !hex(node.sha256) || !valid(node.revision) ||
      !['approved','draft'].includes(node.review) ||
      !Array.isArray(node.parentIds) || !Array.isArray(node.sourceEvidenceIds) ||
      node.parentIds.some(x => !valid(x)) || node.sourceEvidenceIds.some(x => !evidences.has(x)) ||
      node.parentIds.length !== new Set(node.parentIds).size ||
      (['job_resume','cover_letter','case_study'].includes(node.kind) && node.sourceEvidenceIds.length === 0) ||
      (node.opportunityId !== null && node.opportunityId !== graph.opportunityId) ||
      (['job_resume','cover_letter','case_study'].includes(node.kind) && node.opportunityId !== graph.opportunityId)) throw Error('MATERIALS_NODE_INVALID');
    ids.add(node.id); nodes.set(node.id,node);
  }
  for (const answer of graph.answers) {
    if (!answer || !valid(answer.id) || ids.has(answer.id) || answer.ownerId !== graph.ownerId ||
      answer.opportunityId !== graph.opportunityId || !valid(answer.questionKey) ||
      !hex(answer.textDigest) || !['approved','draft'].includes(answer.review) ||
      !Array.isArray(answer.sourceEvidenceIds) ||
      !answer.sourceEvidenceIds.length || answer.sourceEvidenceIds.some(x => !evidences.has(x))) throw Error('MATERIALS_ANSWER_INVALID');
    ids.add(answer.id);
  }
  // Validate DAG in O(V+E) with iterative tri-state ancestry: never trust imported edges.
  const resolved = new Set<string>();
  for (const node of graph.nodes) {
    if (resolved.has(node.id)) continue;
    const active = new Set<string>(), chain: {node:MaterialNode; next:number}[] = [{node,next:0}];
    while (chain.length) {
      const current = chain[chain.length-1];
      if (!active.has(current.node.id)) active.add(current.node.id);
      if (current.next < current.node.parentIds.length) {
        const id = current.node.parentIds[current.next++];
        const parent = nodes.get(id);
        if (!parent) throw Error('MATERIALS_UNKNOWN_PARENT');
        if (active.has(id)) throw Error('MATERIALS_CYCLE');
        if (!resolved.has(id)) chain.push({node:parent,next:0});
      } else {
        active.delete(current.node.id); resolved.add(current.node.id); chain.pop();
      }
    }
  }
}
export function proposeApplicationMaterials(graph: MaterialsGraph, slot: FormSlot): MaterialsDecision {
  try { validateMaterialsGraph(graph); } catch { return stop(slot?.id ?? 'unknown', 'INVALID_MATERIALS_GRAPH'); }
  if (!slot || !valid(slot.id) || !['supporting_documents','cover_letter','resume','case_study','unknown'].includes(slot.kind) ||
      !slot.observed || !hex(slot.evidenceDigest) || !Array.isArray(slot.acceptedKinds) ||
      slot.acceptedKinds.some(k => !['canonical_resume','domain_resume','job_resume','cover_letter','case_study'].includes(k))) {
    return stop(slot?.id ?? 'unknown', 'UPLOAD_SLOT_NOT_VERIFIED');
  }
  if (!Number.isInteger(slot.maxFiles) || slot.maxFiles === null || slot.maxFiles < 1 || slot.maxFiles > 100) {
    return stop(slot.id, 'FILE_CAPACITY_UNKNOWN');
  }
  if (slot.kind === 'unknown' || slot.acceptedKinds.length === 0 || slot.persistence === 'unknown') {
    return stop(slot.id, 'FILE_PURPOSE_OR_PERSISTENCE_UNKNOWN');
  }
  const answerIds = graph.answers.filter(a => a.review === 'approved').map(a => a.id).sort();
  const approved = graph.nodes.filter(n => n.review === 'approved');
  const byKind = (kind:MaterialKind) => approved.filter(n => n.kind === kind && slot.acceptedKinds.includes(kind));
  const unique = (kind:MaterialKind): MaterialNode | null => {
    const candidates = byKind(kind);
    return candidates.length === 1 ? candidates[0] : null;
  };
  if (slot.kind === 'resume') return stop(slot.id, 'RESUME_SLOT_USE_RESUME_SELECTION_GRAPH');
  if (slot.kind === 'case_study' && !slot.acceptedKinds.includes('case_study')) return stop(slot.id,'CASE_STUDY_NOT_PERMITTED');
  const candidates: MaterialNode[] = [];
  // Explicit supporting-doc policy: one slot prioritizes cover, two can add job resume
  // only in verified isolated application scope; three or more can add case study.
  const desired: MaterialKind[] = slot.kind === 'cover_letter' ? ['cover_letter'] :
    slot.kind === 'case_study' ? ['case_study'] :
    ['cover_letter', ...(slot.maxFiles >= 2 ? ['job_resume' as const] : []),
     ...(slot.maxFiles >= 3 ? ['case_study' as const] : [])];
  const blockers: string[] = [];
  for (const kind of desired) {
    if (kind === 'job_resume' && slot.persistence !== 'isolated_application') {
      blockers.push('JOB_RESUME_MAY_REPLACE_PLATFORM_MASTER'); continue;
    }
    if (!slot.acceptedKinds.includes(kind)) { blockers.push(kind.toUpperCase() + '_NOT_ACCEPTED_BY_SLOT'); continue; }
    const picked = unique(kind);
    if (!picked) { blockers.push(kind.toUpperCase() + '_MISSING_OR_AMBIGUOUS'); continue; }
    candidates.push(picked);
  }
  if (slot.persistence === 'persistent_global' && candidates.some(n => n.kind === 'job_resume')) {
    return stop(slot.id, 'PERSISTENT_RESUME_REPLACEMENT_FORBIDDEN');
  }
  if (!candidates.length) return {...stop(slot.id, 'NO_APPROVED_COMPATIBLE_DOCUMENT'), answerIds};
  return {
    state: blockers.length ? 'REVIEW_REQUIRED' : 'PACKET_PROPOSED',
    attachmentIds: candidates.slice(0, slot.maxFiles).map(n => n.id),
    answerIds, blockers, slotId: slot.id, mayAutoUpload: false, mayAutoSubmit: false,
  };
}
