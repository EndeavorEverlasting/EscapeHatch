/**
 * Read-only opportunity checkpoint projection. This is not a form writer, store,
 * navigation grant, or submission detector. Persist records only via the existing
 * private owner-bound workspace, never a public repository or shared agent cache.
 */
export type RequiredKind = 'required' | 'optional' | 'unknown';
export type FieldCheckpoint = {
  id: string;
  label: string;
  required: RequiredKind;
  domVerified: boolean;
  operatorOnly?: boolean;
  operatorConfirmed?: boolean;
};
export type SectionCheckpoint = {
  id: string;
  label: string;
  index: number; // zero based, employer/ATS-sourced order, never an inferred click count
  inspectedAt: string;
  completeInventory: boolean;
  fingerprint: string; // stable form/section fingerprint; no answer values
  fields: FieldCheckpoint[];
};
export type ApplicationCheckpoint = {
  schema: 'escapehatch/application-progress-checkpoint/v1';
  opportunityId: string;
  applicationUrl: string;
  activeScene: string;
  activeSectionId: string | null;
  knownSectionCount: number | null; // null for unknown later pages
  sections: SectionCheckpoint[];
  blocker?: string | null;
  terminalReviewObserved?: boolean;
  employerSubmissionReceiptVerified?: boolean;
};
export type ProgressStatus =
  | 'NOT_OBSERVED' | 'IN_PROGRESS' | 'NEEDS_USER' | 'BLOCKED'
  | 'READY_FOR_FINAL_REVIEW' | 'SUBMITTED_CONFIRMED';
export type ProgressProjection = {
  status: ProgressStatus;
  evidence: 'NONE' | 'STALE' | 'CURRENT_PAGE_ONLY' | 'FULL_INVENTORY';
  inspectedRequired: number;
  verifiedRequired: number;
  unknownRequired: number;
  manualDecisionsRemaining: number;
  currentSection: string | null;
  activeScene: string | null;
  observedFieldsPercent: number | null;
  positionEstimatePercent: number | null; // position, NEVER application-completion percent
  applicationCompletionPercent: null;
  nextAction: string;
  finalSubmitAutomated: false;
};
const FRESH_MS = 5 * 60 * 1000;
function sameUrl(a: string, b: string): boolean {
  try { return new URL(a).href === new URL(b).href; } catch { return false; }
}
function isFresh(at: string, now: number): boolean {
  const t = Date.parse(at);
  return Number.isFinite(t) && t <= now && now - t <= FRESH_MS;
}
const empty = (nextAction: string, evidence: ProgressProjection['evidence'] = 'NONE'): ProgressProjection => ({
  status: 'NOT_OBSERVED', evidence, inspectedRequired: 0, verifiedRequired: 0,
  unknownRequired: 0, manualDecisionsRemaining: 0, currentSection: null,
  activeScene: null, observedFieldsPercent: null, positionEstimatePercent: null,
  applicationCompletionPercent: null, nextAction, finalSubmitAutomated: false,
});
/** Recompute after every dynamic reveal, reload, selected job change, or checkpoint return. */
export function projectApplicationCheckpoint(
  checkpoint: ApplicationCheckpoint | null,
  expectedOpportunityId: string,
  expectedApplicationUrl: string,
  now = Date.now(),
): ProgressProjection {
  if (!checkpoint || checkpoint.schema !== 'escapehatch/application-progress-checkpoint/v1')
    return empty('Inspect the selected employer application to establish its first checkpoint.');
  if (!expectedOpportunityId || checkpoint.opportunityId !== expectedOpportunityId ||
      !sameUrl(checkpoint.applicationUrl, expectedApplicationUrl))
    return empty('Select the matching job and inspect its own application. Do not reuse another job checkpoint.');
  const sections = checkpoint.sections;
  const ids = new Set(sections.map(s => s.id));
  const indices = new Set(sections.map(s => s.index));
  const invalid = sections.some(s => !s.id || !s.fingerprint || !Number.isInteger(s.index) || s.index < 0 ||
    !Array.isArray(s.fields) || new Set(s.fields.map(f => f.id)).size !== s.fields.length ||
    s.fields.some(f => !f.id || !f.label || !['required','optional','unknown'].includes(f.required))) ||
    ids.size !== sections.length || indices.size !== sections.length ||
    (checkpoint.knownSectionCount !== null &&
      (!Number.isInteger(checkpoint.knownSectionCount) || checkpoint.knownSectionCount < sections.length ||
       sections.some(s => s.index >= checkpoint.knownSectionCount!)));
  if (invalid) return empty('Checkpoint structure changed. Reinspect the employer form.');
  const active = checkpoint.activeSectionId ? sections.find(s => s.id === checkpoint.activeSectionId) : null;
  const currentSection = active?.label ?? null;
  const stale = !sections.length || sections.some(s => !isFresh(s.inspectedAt, now));
  if (stale) return {
    ...empty('Resume the saved checkpoint in Chrome and reinspect required fields before filling.', 'STALE'),
    currentSection, activeScene: checkpoint.activeScene || null,
  };
  const required = sections.flatMap(s => s.fields).filter(f => f.required === 'required');
  const unknownRequired = sections.flatMap(s => s.fields).filter(f => f.required === 'unknown').length;
  const manualDecisionsRemaining = required.filter(f => f.operatorOnly && !f.operatorConfirmed).length;
  const verifiedRequired = required.filter(f => f.domVerified && (!f.operatorOnly || f.operatorConfirmed)).length;
  const allInventoried = checkpoint.knownSectionCount !== null &&
    sections.length === checkpoint.knownSectionCount && sections.every(s => s.completeInventory);
  const observedFieldsPercent = required.length && unknownRequired === 0
    ? Math.round(verifiedRequired * 100 / required.length) : null;
  const positionEstimatePercent = active && checkpoint.knownSectionCount !== null &&
    checkpoint.knownSectionCount > 0
    ? Math.floor(active.index * 100 / checkpoint.knownSectionCount) : null;
  // A receipt is the only positive submission signal, and may only be set by the
  // existing employer-receipt reconciliation owner after independent validation.
  const status: ProgressStatus = checkpoint.employerSubmissionReceiptVerified ? 'SUBMITTED_CONFIRMED' :
    checkpoint.blocker ? 'BLOCKED' :
    unknownRequired || manualDecisionsRemaining ? 'NEEDS_USER' :
    checkpoint.terminalReviewObserved && allInventoried &&
      required.length === verifiedRequired ? 'READY_FOR_FINAL_REVIEW' :
    'IN_PROGRESS';
  const nextAction = status === 'SUBMITTED_CONFIRMED' ? 'Open the verified employer receipt and reconcile the tracker.' :
    status === 'READY_FOR_FINAL_REVIEW' ? 'Review the actual employer form. Final Submit is yours.' :
    checkpoint.blocker ? 'Resolve checkpoint: ' + checkpoint.blocker :
    manualDecisionsRemaining ? 'Answer the protected or legal question in the employer window.' :
    unknownRequired ? 'Review unmapped required controls on the current employer page.' :
    'Resume ' + (currentSection || 'this application') + ' and verify remaining required fields.';
  return {
    status,
    evidence: allInventoried ? 'FULL_INVENTORY' : 'CURRENT_PAGE_ONLY',
    inspectedRequired: required.length, verifiedRequired, unknownRequired,
    manualDecisionsRemaining, currentSection, activeScene: checkpoint.activeScene || null,
    observedFieldsPercent, positionEstimatePercent, applicationCompletionPercent: null,
    nextAction, finalSubmitAutomated: false,
  };
}
