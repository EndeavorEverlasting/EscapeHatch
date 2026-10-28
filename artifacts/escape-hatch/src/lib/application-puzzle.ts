export type FormRequirement = {
  id: string;
  label: string;
  requirement: 'required' | 'optional' | 'unknown';
  kind: 'resume' | 'cover' | 'case_study' | 'file' | 'question';
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
export type CurrentApplicationPage = { opportunityId: string; applicationUrl: string; pageUrl: string };

export function sameApplicationUrl(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  try { return new URL(left).href === new URL(right).href; } catch { return false; }
}

/** A live page inventory is deliberately not a whole-application readiness score. */
export function projectApplicationPuzzle(inspection: FormInspection | null, opportunityId: string, url: string, now = Date.now(), currentPage: CurrentApplicationPage | null = null) {
  const timestamp = inspection ? Date.parse(inspection.capturedAt) : NaN;
  const current = Boolean(inspection && opportunityId && inspection.opportunityId === opportunityId &&
    sameApplicationUrl(inspection.applicationUrl, url) && inspection.scope === 'current_page_only' &&
    currentPage?.opportunityId === opportunityId && sameApplicationUrl(currentPage.applicationUrl, url) &&
    sameApplicationUrl(currentPage.pageUrl, inspection.pageUrl) &&
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
