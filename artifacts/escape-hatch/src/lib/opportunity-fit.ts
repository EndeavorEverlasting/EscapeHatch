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
  if (/\b(?:commute\s+required|required\s+commute)\b/.test(mode) ||
      commute.test(description) || /\b(?:must commute|required to commute|commuting is required|commute is required)\b/.test(description)) {
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

export type WorkMode = 'remote' | 'hybrid' | 'on_site' | 'unknown';
export type OpportunityMatchInput = {
  workMode: WorkMode;
  preference: 'remote_only' | 'any';
  commute: 'acceptable' | 'unacceptable' | 'unknown';
};
export type OpportunityDecision = {
  jobDesire: 'want' | 'do_not_want' | 'unknown';
  applicationDecision: 'apply' | 'do_not_apply' | 'undecided';
  purpose: 'career' | 'interview_practice' | 'unknown';
};
export type OpportunityRubricInput = OpportunityMatchInput & OpportunityDecision;
export const OPPORTUNITY_RUBRIC_PREFIX = 'EscapeHatch rubric v2: ';
const LEGACY_PREFIX = 'EscapeHatch rubric v1: ';

export function normalizeWorkMode(value?: string): WorkMode {
  const mode = value?.normalize('NFKC').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (mode === 'remote' || mode === 'fully remote' || mode === '100% remote') return 'remote';
  if (mode === 'hybrid') return 'hybrid';
  if (mode === 'on site' || mode === 'onsite' || mode === 'in person' || mode === 'on premises' || mode === 'on prem') return 'on_site';
  return 'unknown';
}

/** Arrangement compatibility only: not overall fit, a score, or an application gate. */
export function evaluateOpportunityRubric(input: OpportunityMatchInput) {
  const reasons: string[] = [];
  if (input.preference === 'remote_only' && (input.workMode === 'on_site' || input.workMode === 'hybrid'))
    reasons.push('REMOTE_REQUIREMENT_MISMATCH');
  if ((input.workMode === 'on_site' || input.workMode === 'hybrid') && input.commute === 'unacceptable')
    reasons.push('COMMUTE_UNACCEPTABLE');
  const eligibility = reasons.length ? 'incompatible' :
    input.workMode === 'unknown' || (input.workMode !== 'remote' && input.commute === 'unknown') ? 'unknown' : 'eligible';
  return { eligibility, reasons } as const;
}

/** A measured skill-text coverage ratio, not an overall fit score. No intent input. */
export function skillEvidenceCoverage(fit: OpportunityFit): { matched: number; total: number; fraction: number } | null {
  const matched = fit.matched.length, total = matched + fit.notMentioned.length;
  return fit.state === 'evidence_available' && total > 0 ? { matched, total, fraction: matched / total } : null;
}

/** A private, versioned tracker note is explicit data, not natural-language inference.
 * V1 intent never implied either job desire or application authorization. */
export function readOpportunityRubric(notes?: string): OpportunityRubricInput | null | 'invalid' {
  const lines = (notes || '').split(/\r?\n/).filter(line => line.startsWith('EscapeHatch rubric '));
  if (!lines.length) return null;
  if (lines.length !== 1) return 'invalid';
  const line = lines[0];
  const match = /^(remote|hybrid|on_site|unknown); (remote_only|any); (acceptable|unacceptable|unknown); (want|do_not_want|unknown); (apply|do_not_apply|undecided); (career|interview_practice|unknown)$/.exec(line.slice(OPPORTUNITY_RUBRIC_PREFIX.length));
  const legacy = /^(remote|hybrid|on_site|unknown); (remote_only|any); (acceptable|unacceptable|unknown); (career|interview_practice|unknown)$/.exec(line.slice(LEGACY_PREFIX.length));
  const v2 = line.startsWith(OPPORTUNITY_RUBRIC_PREFIX) && match;
  const v1 = line.startsWith(LEGACY_PREFIX) && legacy;
  const values = v2 || v1;
  if (!values) return 'invalid';
  return { workMode: values[1] as WorkMode, preference: values[2] as OpportunityMatchInput['preference'],
    commute: values[3] as OpportunityMatchInput['commute'],
    jobDesire: v2 ? values[4] as OpportunityDecision['jobDesire'] : 'unknown',
    applicationDecision: v2 ? values[5] as OpportunityDecision['applicationDecision'] : 'undecided',
    purpose: values[v2 ? 6 : 4] as OpportunityDecision['purpose'] };
}


export type OpportunityType = 'learning' | 'career' | 'needs_assessment';
export type RequirementAssessment = {
  sourceRef: string;
  complete: boolean;
  requirements: { id: string; state: 'met' | 'unmet' | 'unknown'; evidenceRef?: string }[];
};
const REQUIREMENTS_PREFIX = 'EscapeHatch requirements v1: ';

/** Reviewed requirement evidence is separate from profile text coverage and intent.
 * Missing evidence is unknown, not proof of an unmet requirement. */
export function readRequirementAssessment(notes?: string): RequirementAssessment | null | 'invalid' {
  const lines = (notes || '').split(/\r?\n/).filter(line => line.startsWith('EscapeHatch requirements '));
  if (!lines.length) return null;
  if (lines.length !== 1 || !lines[0].startsWith(REQUIREMENTS_PREFIX)) return 'invalid';
  try {
    const v = JSON.parse(lines[0].slice(REQUIREMENTS_PREFIX.length));
    if (!v || typeof v.sourceRef !== 'string' || !v.sourceRef.trim() ||
        typeof v.complete !== 'boolean' || !Array.isArray(v.requirements) || !v.requirements.length) return 'invalid';
    const ids = new Set<string>();
    for (const item of v.requirements) {
      if (!item || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id) ||
          !['met', 'unmet', 'unknown'].includes(item.state) ||
          (item.state !== 'unknown' && (typeof item.evidenceRef !== 'string' || !item.evidenceRef.trim()))) return 'invalid';
      ids.add(item.id);
    }
    return v as RequirementAssessment;
  } catch { return 'invalid'; }
}

export function deriveOpportunityType(notes?: string, trackerWorkMode?: string): {
  type: OpportunityType; reasons: string[];
} {
  const rubric = readOpportunityRubric(notes);
  const requirements = readRequirementAssessment(notes);
  if (rubric === 'invalid' || requirements === 'invalid') return { type: 'needs_assessment', reasons: ['INVALID_MATCH_EVIDENCE'] };
  const observed = normalizeWorkMode(trackerWorkMode);
  if (rubric && observed !== 'unknown' && observed !== rubric.workMode)
    return { type: 'needs_assessment', reasons: ['WORK_MODE_CONFLICT'] };
  const match = rubric ? evaluateOpportunityRubric(rubric) : null;
  const unmet = requirements?.requirements.filter(item => item.state === 'unmet') || [];
  const reasons = [...(match?.reasons || []), ...unmet.map(item => 'UNMET_REQUIREMENT:' + item.id)];
  if (reasons.length) return { type: 'learning', reasons };
  if (match?.eligibility === 'eligible' && requirements?.complete && requirements.requirements.every(item => item.state === 'met'))
    return { type: 'career', reasons: [] };
  return { type: 'needs_assessment', reasons: ['MATCH_EVIDENCE_INCOMPLETE'] };
}

/** Discovery policy, not the mathematical match computation. */
export function rubricAllowsRecommendation(notes?: string, trackerWorkMode?: string): boolean {
  const input = readOpportunityRubric(notes);
  const classification = deriveOpportunityType(notes, trackerWorkMode);
  const requirements = readRequirementAssessment(notes);
  if (classification.type === 'learning' || requirements === 'invalid' ||
      (requirements !== null && classification.type !== 'career')) return false;
  if (input === null) return true; // existing records are not silently reclassified
  if (input === 'invalid') return false;
  const observed = normalizeWorkMode(trackerWorkMode);
  if (observed !== 'unknown' && observed !== input.workMode) return false;
  return evaluateOpportunityRubric(input).eligibility === 'eligible' &&
    input.jobDesire !== 'do_not_want' && input.purpose !== 'interview_practice' && input.applicationDecision !== 'do_not_apply';
}

/** Execution routing is distinct from discovery; selection does not authorize submission. */
export function applicationPreparationRank(notes?: string, trackerWorkMode?: string): 0 | 1 | null {
  const input = readOpportunityRubric(notes);
  if (input === 'invalid') return null;
  if (input?.applicationDecision === 'do_not_apply') return null;
  if (input?.applicationDecision === 'apply') return 0;
  return rubricAllowsRecommendation(notes, trackerWorkMode) ? 1 : null;
}

/** Preserve provider-owned rubric across local free-text edits on refresh. */
export function mergeRubricNotes(local: string, provider: string): string {
  let lines = local.split(/\r?\n/);
  const providerLines = provider.split(/\r?\n/);
  for (const prefix of ['EscapeHatch rubric ', 'EscapeHatch requirements ']) {
    const incoming = providerLines.filter(line => line.startsWith(prefix));
    if (incoming.length) lines = [...lines.filter(line => !line.startsWith(prefix)), ...incoming];
  }
  return lines.join('\n');
}

export const EMPTY_OPPORTUNITY_DECISION: OpportunityDecision = {
  jobDesire: 'unknown', applicationDecision: 'undecided', purpose: 'unknown',
};

export function parseOpportunityDecision(value: unknown): OpportunityDecision | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 3 || !['want', 'do_not_want', 'unknown'].includes(String(v.jobDesire)) ||
      !['apply', 'do_not_apply', 'undecided'].includes(String(v.applicationDecision)) ||
      !['career', 'interview_practice', 'unknown'].includes(String(v.purpose)) ||
      [v.jobDesire, v.applicationDecision, v.purpose].some(x => typeof x !== 'string')) return null;
  return { jobDesire: v.jobDesire as OpportunityDecision['jobDesire'], applicationDecision: v.applicationDecision as OpportunityDecision['applicationDecision'], purpose: v.purpose as OpportunityDecision['purpose'] };
}

export function effectiveOpportunityDecision(notes?: string, local?: OpportunityDecision): OpportunityDecision {
  if (local) return local;
  const v = readOpportunityRubric(notes);
  return v && v !== 'invalid' ? { jobDesire: v.jobDesire, applicationDecision: v.applicationDecision, purpose: v.purpose } : { ...EMPTY_OPPORTUNITY_DECISION };
}

/** Local user choice is persisted separately from the provider match evidence. */
export function localApplicationPreparationRank(notes?: string, local?: OpportunityDecision, trackerWorkMode?: string): 0 | 1 | null {
  if (!local) return applicationPreparationRank(notes, trackerWorkMode);
  if (local.applicationDecision === 'apply') return 0;
  if (local.applicationDecision === 'do_not_apply' || local.jobDesire === 'do_not_want' || local.purpose === 'interview_practice') return null;
  const rubric = readOpportunityRubric(notes);
  const classification = deriveOpportunityType(notes, trackerWorkMode);
  if (rubric === 'invalid' || classification.type === 'learning' || classification.reasons.includes('INVALID_MATCH_EVIDENCE') || classification.reasons.includes('WORK_MODE_CONFLICT') ||
      (readRequirementAssessment(notes) !== null && classification.type !== 'career')) return null;
  return !rubric || evaluateOpportunityRubric(rubric).eligibility === 'eligible' ? 1 : null;
}

/** Explicit selection authorizes preparation, not submission; workplace filtering applies only to discovery. */
export function allowsRankedPreparation(rank: 0 | 1 | null, evidence: WorkplaceEvidence, mode: RecommendationWorkMode): boolean {
  return rank === 0 || (rank === 1 && allowsAutomaticRecommendation(evidence, mode));
}
