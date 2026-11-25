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


export type WorkMode = 'remote' | 'hybrid' | 'on_site' | 'unknown';
export type OpportunityRubricInput = {
  workMode: WorkMode;
  preference: 'remote_only' | 'any';
  commute: 'acceptable' | 'unacceptable' | 'unknown';
  intent: 'career' | 'interview_practice' | 'unknown';
};
export const OPPORTUNITY_RUBRIC_PREFIX = 'EscapeHatch rubric v1: ';

export function normalizeWorkMode(value?: string): WorkMode {
  const mode = value?.normalize('NFKC').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (mode === 'remote' || mode === 'fully remote' || mode === '100% remote') return 'remote';
  if (mode === 'hybrid') return 'hybrid';
  if (mode === 'on site' || mode === 'onsite' || mode === 'in person' || mode === 'on premises' || mode === 'on prem') return 'on_site';
  return 'unknown';
}

/** Hard eligibility is independent of skills, practice intent and submission. */
export function evaluateOpportunityRubric(input: OpportunityRubricInput) {
  const reasons: string[] = [];
  if (input.preference === 'remote_only' && (input.workMode === 'on_site' || input.workMode === 'hybrid'))
    reasons.push('REMOTE_REQUIREMENT_MISMATCH');
  if (input.workMode !== 'remote' && input.commute === 'unacceptable')
    reasons.push('COMMUTE_UNACCEPTABLE');
  const eligibility = reasons.length ? 'incompatible' :
    input.workMode === 'unknown' || (input.workMode !== 'remote' && input.commute === 'unknown') ? 'unknown' : 'eligible';
  const recommend = eligibility === 'eligible' && input.intent === 'career';
  return { eligibility, intent: input.intent, reasons, recommend,
    priority: recommend ? null : 'low', fitScore: eligibility === 'incompatible' ? 0 : null } as const;
}

/** A private, versioned tracker note is the explicit operator input, not free-text inference.
 * No note retains legacy behavior; duplicate or malformed versioned notes fail closed. */
export function readOpportunityRubric(notes?: string): OpportunityRubricInput | null | 'invalid' {
  const lines = (notes || '').split(/\r?\n/).filter(line => line.startsWith('EscapeHatch rubric '));
  if (!lines.length) return null;
  if (lines.length !== 1 || !lines[0].startsWith(OPPORTUNITY_RUBRIC_PREFIX)) return 'invalid';
  const match = /^(remote|hybrid|on_site|unknown); (remote_only|any); (acceptable|unacceptable|unknown); (career|interview_practice|unknown)$/.exec(lines[0].slice(OPPORTUNITY_RUBRIC_PREFIX.length));
  if (!match) return 'invalid';
  return { workMode: match[1] as WorkMode, preference: match[2] as OpportunityRubricInput['preference'],
    commute: match[3] as OpportunityRubricInput['commute'], intent: match[4] as OpportunityRubricInput['intent'] };
}

export function rubricAllowsRecommendation(notes?: string, trackerWorkMode?: string): boolean {
  const input = readOpportunityRubric(notes);
  if (input === null) return true; // existing records are not silently reclassified
  if (input === 'invalid') return false;
  const observed = normalizeWorkMode(trackerWorkMode);
  if (observed !== 'unknown' && observed !== input.workMode) return false;
  return evaluateOpportunityRubric(input).recommend;
}

/** Preserve the provider-owned rubric across local free-text edits on refresh. */
export function mergeRubricNotes(local: string, provider: string): string {
  const marker = (value: string) => value.split(/\r?\n/).filter(line => line.startsWith('EscapeHatch rubric '));
  const incoming = marker(provider);
  if (!incoming.length) return local;
  return [...local.split(/\r?\n/).filter(line => !line.startsWith('EscapeHatch rubric ')), ...incoming].join('\n');
}
