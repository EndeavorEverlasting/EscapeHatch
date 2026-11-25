import { allowsAutomaticRecommendation, type RecommendationWorkMode } from './opportunity-fit.ts';
import type { Application } from './storage.ts';
import { directIndeedPostingUrl, isLockedIndeedPosting, lockedIndeedPostingKeys } from './indeed-posting-identity.ts';

export type OutcomeBinding = { opportunityId: string; applicationUrl: string };
export type LiveWorkplaceContradictionState = 'non_remote_workplace' | 'required_commute';

/** A pending workflow may act only on its original, still-actionable saved job (or unchanged unlocked manual URL). */
export function isActiveApplicationBinding(binding: OutcomeBinding, selected: OutcomeBinding, applications: readonly Application[]): boolean {
  if (binding.opportunityId !== selected.opportunityId || binding.applicationUrl !== selected.applicationUrl || !binding.applicationUrl.trim()) {
    return false;
  }
  if (!binding.opportunityId) {
    const locked = lockedIndeedPostingKeys(
      applications
        .filter(item => item.status === 'applied' || item.status === 'closed' || item.status === 'follow_up' || Boolean(item.submissionEvidence) || Boolean(item.reconciliationConflict))
        .map(item => item.url),
    );
    return !isLockedIndeedPosting(binding.applicationUrl, locked);
  }
  return applications.some(item => item.id === binding.opportunityId && item.url === binding.applicationUrl &&
    (item.status === 'saved' || item.status === 'preparing') && !item.submissionEvidence && !item.reconciliationConflict);
}

/** Record a live-posting workplace contradiction on the bound job and select the next remote-confirmed candidate. */
export function reconcileLiveWorkplaceContradiction(
  applications: readonly Application[],
  binding: OutcomeBinding,
  workplaceState: LiveWorkplaceContradictionState,
  updatedAt: string,
  excludedIds: ReadonlySet<string> = new Set(),
): { applications: Application[]; updated: boolean; next: Application | null } {
  const liveWorkMode = workplaceState === 'required_commute'
    ? 'Commute required (live posting)'
    : 'On-site / Hybrid (live posting)';
  const noteLine = `Live posting workplace check: ${liveWorkMode}`;
  let updated = false;
  const nextApplications = applications.map((item) => {
    if (item.id !== binding.opportunityId || item.url !== binding.applicationUrl) return item;
    if (item.status === 'applied' || item.status === 'closed' || item.submissionEvidence) return item;
    updated = true;
    const notes = item.notes.includes(noteLine)
      ? item.notes
      : [item.notes.trim(), noteLine].filter(Boolean).join('\n');
    return {
      ...item,
      workMode: liveWorkMode,
      notes,
      updatedAt,
    };
  });
  const skipped = new Set<string>(excludedIds);
  if (binding.opportunityId) skipped.add(binding.opportunityId);
  const remaining = nextApplications.filter((item) => !skipped.has(item.id));
  const next = nextIndeedApplication(remaining, binding.opportunityId, 'remote_only');
  return { applications: nextApplications, updated, next };
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
