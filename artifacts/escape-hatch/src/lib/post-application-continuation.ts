import type { Application } from './storage.ts';
import { directIndeedPostingUrl, isLockedIndeedPosting, lockedIndeedPostingKeys } from './indeed-posting-identity.ts';

export type OutcomeBinding = { opportunityId: string; applicationUrl: string };

/** A lost browser observation cannot undo an applied record; a new binding supersedes the old one. */
export function recordedApplication(binding: OutcomeBinding | null, applications: readonly Application[]): Application | null {
  if (!binding) return null;
  return applications.find(item => item.id === binding.opportunityId &&
    item.url === binding.applicationUrl && item.status === 'applied') ?? null;
}

/** Only saved, actionable, distinct postings; never route through a survey or a redirect. */
export function nextIndeedPosting(applications: readonly Application[], completedId: string) {
  const actionable = (item: Application) => (item.status === 'saved' || item.status === 'preparing') &&
    !item.submissionEvidence && !item.reconciliationConflict && item.id !== completedId;
  const locked = lockedIndeedPostingKeys(applications.filter(item => !actionable(item)).map(item => item.url));
  for (const item of applications) {
    if (!actionable(item) || isLockedIndeedPosting(item.url, locked)) continue;
    const url = directIndeedPostingUrl(item.url);
    if (url) return { url, company: item.company, role: item.role };
  }
  return null;
}
