export type FormRequirement = {
  id: string;
  label: string;
  requirement: 'required' | 'optional' | 'unknown';
  kind: 'resume' | 'cover' | 'file' | 'question';
  populated: boolean;
};
export type FormInspection = {
  opportunityId: string;
  applicationUrl: string;
  pageUrl: string;
  capturedAt: string;
  scope: 'current_page_only';
  requirements: FormRequirement[];
};
export const INSPECTION_MAX_AGE_MS = 5 * 60 * 1000;

/** A live page inventory is deliberately not a whole-application readiness score. */
export function projectApplicationPuzzle(inspection: FormInspection | null, opportunityId: string, url: string, now = Date.now()) {
  const timestamp = inspection ? Date.parse(inspection.capturedAt) : NaN;
  const current = Boolean(inspection && opportunityId && inspection.opportunityId === opportunityId &&
    inspection.applicationUrl === url && inspection.scope === 'current_page_only' &&
    Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= INSPECTION_MAX_AGE_MS);
  const pieces = current ? inspection!.requirements : [];
  const required = pieces.filter(piece => piece.requirement === 'required');
  return {
    current, pieces,
    requiredCount: required.length,
    unresolvedCount: required.filter(piece => !piece.populated).length,
    unknownCount: pieces.filter(piece => piece.requirement === 'unknown').length,
    // Neither DOM validity nor local files prove complete requirements, vacancy availability or submission.
    preparationReady: false as const,
    finalSubmitAuthorized: false as const,
  };
}
