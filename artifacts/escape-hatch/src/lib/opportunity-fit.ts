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
