import { allowsAutomaticRecommendation, type RecommendationWorkMode } from './opportunity-fit.ts';
import type { Application } from './storage.ts';
import { directIndeedPostingUrl, isLockedIndeedPosting, lockedIndeedPostingKeys } from './indeed-posting-identity.ts';

export type OutcomeBinding = { opportunityId: string; applicationUrl: string };

/** A pending workflow may act only on its original, still-actionable saved job. */
export function isActiveApplicationBinding(binding: OutcomeBinding, selected: OutcomeBinding, applications: readonly Application[]): boolean {
  return binding.opportunityId === selected.opportunityId && binding.applicationUrl === selected.applicationUrl &&
    applications.some(item => item.id === binding.opportunityId && item.url === binding.applicationUrl &&
      (item.status === 'saved' || item.status === 'preparing') && !item.submissionEvidence && !item.reconciliationConflict);
}


/** A lost browser observation cannot undo an applied record; a new binding supersedes the old one. */
export function recordedApplication(binding: OutcomeBinding | null, applications: readonly Application[]): Application | null {
  if (!binding) return null;
  return applications.find(item => item.id === binding.opportunityId &&
    item.url === binding.applicationUrl && item.status === 'applied') ?? null;
}

/** Only saved, actionable, distinct postings; never route through a survey or a redirect. */
export function nextIndeedApplication(applications: readonly Application[], completedId: string, mode: RecommendationWorkMode = 'any'): Application | null {
  const actionable = (item: Application) => (item.status === 'saved' || item.status === 'preparing') &&
    !item.submissionEvidence && !item.reconciliationConflict && item.id !== completedId;
  const locked = lockedIndeedPostingKeys(applications.filter(item => !actionable(item)).map(item => item.url));
  for (const item of applications) {
    if (!actionable(item) || isLockedIndeedPosting(item.url, locked) || !allowsAutomaticRecommendation(item, mode)) continue;
    const url = directIndeedPostingUrl(item.url);
    if (url) return item;
  }
  return null;
}

/** External links are a projection of the same candidate used for managed dispatch. */
export function nextIndeedPosting(applications: readonly Application[], completedId: string, mode: RecommendationWorkMode = 'any') {
  const item = nextIndeedApplication(applications, completedId, mode);
  const url = item && directIndeedPostingUrl(item.url);
  return item && url ? { url, company: item.company, role: item.role } : null;
}
