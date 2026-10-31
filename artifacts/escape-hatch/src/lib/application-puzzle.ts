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
  const verifiedRequired = required.filter(piece => piece.populated).length;
  const unknownCount = pieces.filter(piece => piece.requirement === 'unknown').length;
  const covers = pieces.filter(piece => piece.kind === 'cover');
  const coverLetter = !covers.length ? 'NOT_OBSERVED' as const :
    covers.some(piece => piece.requirement === 'required') ? 'REQUIRED' as const :
    covers.some(piece => piece.requirement === 'unknown') ? 'UNKNOWN' as const : 'OPTIONAL' as const;
  // A missing cover-letter input is not a missing document. An observed optional
  // control contributes no term. An observed required cover file contributes
  // exactly one input to the required denominator, whether or not a PDF exists
  // in private storage. Unknown controls and unseen pages cannot be called done.
  const percent = current && required.length > 0 && unknownCount === 0
    ? Math.round(100 * verifiedRequired / required.length) : null;
  return {
    current, pieces,
    requiredCount: required.length,
    unresolvedCount: required.length - verifiedRequired,
    unknownCount,
    checkpoint: {
      scope: 'current_page_only' as const,
      verifiedRequired, totalRequired: required.length,
      excludedOptional: pieces.filter(piece => piece.requirement === 'optional').length,
      coverLetter, requiredCoverInputs: required.filter(piece => piece.kind === 'cover').length,
      percent,
      wholeApplicationPercent: null as null,
    },
    // Neither DOM validity nor local files prove complete requirements, vacancy availability or submission.
    preparationReady: false as const,
    finalSubmitAuthorized: false as const,
  };
}
