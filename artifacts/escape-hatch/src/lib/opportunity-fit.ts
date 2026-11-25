import type { AssistProfile } from './assist-contract.ts';

type FitProfile = Pick<AssistProfile, 'approvedAt' | 'skills'>;
export type OpportunityFit = { state: 'profile_review_required' | 'description_required' | 'skills_required' | 'evidence_available'; matched: string[]; notMentioned: string[] };

/** Deterministic text evidence, not a qualification prediction or an agent-generated score. */
export function evaluateOpportunityFit(profile: FitProfile, description?: string): OpportunityFit {
  const missing = (state: OpportunityFit['state']): OpportunityFit => ({ state, matched: [], notMentioned: [] });
  if (!profile.approvedAt || !Number.isFinite(Date.parse(profile.approvedAt))) return missing('profile_review_required');
  if (!description?.trim()) return missing('description_required');
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const skills = [...new Map(profile.skills.filter(skill => skill.trim()).map(skill => [normalize(skill), skill.trim()])).entries()];
  if (!skills.length) return missing('skills_required');
  const source = normalize(description);
  const matched: string[] = [], notMentioned: string[] = [];
  for (const [key, display] of skills) {
    const escaped = key.replace(/[.*+?^$${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('(?:^|[^\\p{L}\\p{N}+#])' + escaped + '(?=$|[^\\p{L}\\p{N}+#])', 'u');
    (pattern.test(source) ? matched : notMentioned).push(display);
  }
  return { state: 'evidence_available', matched, notMentioned };
}

export type RecommendationWorkMode = 'any' | 'remote_only';
type WorkplaceEvidence = { workMode?: string; jobDescription?: string };
export type WorkplaceEligibility = {
  state: 'remote_confirmed' | 'non_remote_workplace' | 'required_commute' | 'workplace_unverified';
};

/** Workplace eligibility precedes skill ranking; a search-card label cannot override a posting requirement. */
export function evaluateWorkplaceEligibility(evidence: WorkplaceEvidence): WorkplaceEligibility {
  const mode = typeof evidence.workMode === 'string' ? evidence.workMode.normalize('NFKC').trim().toLowerCase() : '';
  const description = typeof evidence.jobDescription === 'string' ? evidence.jobDescription.normalize('NFKC').toLowerCase() : '';
  const commute = /(?:ability to commute|commute requirements?)\s*:\s*(?:\n\s*)*[-•]?\s*[^\n]*\(\s*required\s*\)/i;
  if (commute.test(description) || /\b(?:must commute|required to commute|commuting is required|commute is required)\b/.test(description)) {
    return { state: 'required_commute' };
  }
  const labels = [...description.matchAll(/(?:^|\n)\s*(?:work location|workplace type|work mode|work arrangement)\s*:\s*([^\n]+)/g)].map(match => match[1].trim());
  const nonRemote = /\b(?:in[\s-]+person|on[\s-]?site|hybrid|office[\s-]+based)\b/;
  if ([mode, ...labels].some(value => nonRemote.test(value)) ||
      /\b(?:this (?:is a|role is|position is) (?:fully )?(?:on[\s-]?site|hybrid|in[\s-]+person)|must work (?:on[\s-]?site|in[\s-]+person)|not (?:a )?remote)\b/.test(description)) {
    return { state: 'non_remote_workplace' };
  }
  const remote = /^(?:(?:fully|100%)\s+)?remote(?:\s*\([^)]*\))?$/;
  if ([mode, ...labels].some(value => remote.test(value)) ||
      /\bthis (?:is a|role is|position is) (?:fully|100%) remote\b/.test(description)) {
    return { state: 'remote_confirmed' };
  }
  return { state: 'workplace_unverified' };
}

/** Manual selection remains available; an exception does not change the recommendation policy. */
export function allowsAutomaticRecommendation(evidence: WorkplaceEvidence, mode: RecommendationWorkMode = 'any'): boolean {
  return mode === 'any' || evaluateWorkplaceEligibility(evidence).state === 'remote_confirmed';
}
