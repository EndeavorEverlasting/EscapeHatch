/**
 * EH-COMP0→COMP1 call-stack prototype — design seam only.
 * Pure resolution of desired-compensation fill decisions.
 * Successor build owns career-state schema, taxonomy, preference-cache, and
 * browser/application-assist/compensation.js wiring.
 */

export type PayPeriod = 'annual' | 'hourly' | 'monthly' | 'weekly' | 'unknown';

/** Semantic destination family — only `desired` may receive posted-max default. */
export type CompensationFamily =
  | 'desired'
  | 'current'
  | 'history'
  | 'minimum_acceptable'
  | 'unknown';

export type OpportunityCompensationProvenance = {
  minimum?: number;
  maximum?: number;
  currency: string;
  period: PayPeriod;
  source_artifact_id: string;
  /** ISO-8601 instant when the posting compensation was verified. */
  verified_at: string;
  freshness_ttl_hours: number;
};

export type PreferenceScope =
  | 'session_confirmation'
  | 'opportunity_override'
  | 'verified_posted_maximum'
  | 'profile_preference';

export type PreferenceEntry = {
  scope: PreferenceScope;
  value: string;
};

export type PreferenceStoreLike = {
  preferences: Record<string, PreferenceEntry | Partial<Record<PreferenceScope, string | { value: string }>>>;
};

export type FieldContext = {
  question_id: string;
  family: CompensationFamily;
  /** Destination field's expected pay period when the form is unit-explicit. */
  destination_period: PayPeriod;
};

export type Resolution =
  | {
      status: 'fill';
      source: PreferenceScope;
      value: string;
      period: PayPeriod;
      currency: string;
    }
  | { status: 'review'; reason: string }
  | { status: 'leave_blank'; reason: string };

/** Canonical precedence after COMP0 (inserts verified_posted_maximum). */
export const COMPENSATION_PRECEDENCE: readonly PreferenceScope[] = Object.freeze([
  'session_confirmation',
  'opportunity_override',
  'verified_posted_maximum',
  'profile_preference',
]);

const DESIRED_QUESTION_IDS = new Set([
  'compensation.desired_annual_salary',
  'compensation.desired_hourly_rate',
  'compensation.desired_pay',
]);

export function classifyCompensationFamily(questionId: string): CompensationFamily {
  const id = questionId.toLowerCase();
  if (id.includes('current') || id.includes('present')) return 'current';
  if (id.includes('history') || id.includes('previous') || id.includes('prior')) return 'history';
  if (id.includes('minimum') || id.includes('min_acceptable') || id.includes('lowest')) {
    return 'minimum_acceptable';
  }
  if (
    DESIRED_QUESTION_IDS.has(id) ||
    id.includes('desired') ||
    id.includes('expected') ||
    id.includes('target') ||
    id.includes('asking')
  ) {
    return 'desired';
  }
  return 'unknown';
}

function readPref(
  store: PreferenceStoreLike | null | undefined,
  questionId: string,
  scope: PreferenceScope,
): string | null {
  if (!store || !store.preferences) return null;
  const entry = store.preferences[questionId];
  if (!entry || typeof entry !== 'object') return null;
  if ('scope' in entry && 'value' in entry) {
    const e = entry as PreferenceEntry;
    if (e.scope === scope && typeof e.value === 'string' && e.value.trim()) return e.value.trim();
    return null;
  }
  const nested = (entry as Record<string, unknown>)[scope];
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  if (
    nested &&
    typeof nested === 'object' &&
    typeof (nested as { value?: unknown }).value === 'string' &&
    String((nested as { value: string }).value).trim()
  ) {
    return String((nested as { value: string }).value).trim();
  }
  return null;
}

export function isProvenanceFresh(
  provenance: OpportunityCompensationProvenance,
  nowMs: number = Date.now(),
): boolean {
  const verified = Date.parse(provenance.verified_at);
  if (!Number.isFinite(verified)) return false;
  const ttlMs = Math.max(0, provenance.freshness_ttl_hours) * 60 * 60 * 1000;
  return nowMs - verified <= ttlMs;
}

export function periodsCompatible(source: PayPeriod, destination: PayPeriod): boolean {
  if (source === 'unknown' || destination === 'unknown') return false;
  return source === destination;
}

/**
 * Success stack (COMP1 runtime will call this after field classification):
 * FIELD DETECTED
 *   -> classifyCompensationFamily
 *   -> resolveCompensationFill
 *        session_confirmation | opportunity_override
 *        | verified_posted_maximum (desired + fresh + unit-compatible)
 *        | profile_preference
 *        | review / leave_blank
 *   -> Fill Plan / DOM writer (outside this prototype)
 */
export function resolveCompensationFill(input: {
  field: FieldContext;
  provenance: OpportunityCompensationProvenance | null;
  preferenceStore: PreferenceStoreLike | null;
  nowMs?: number;
}): Resolution {
  const { field, provenance } = input;
  const nowMs = input.nowMs ?? Date.now();
  const family =
    field.family === 'unknown' ? classifyCompensationFamily(field.question_id) : field.family;

  const session = readPref(input.preferenceStore, field.question_id, 'session_confirmation');
  if (session) {
    return {
      status: 'fill',
      source: 'session_confirmation',
      value: session,
      period: field.destination_period,
      currency: provenance?.currency || 'USD',
    };
  }

  const override = readPref(input.preferenceStore, field.question_id, 'opportunity_override');
  if (override) {
    return {
      status: 'fill',
      source: 'opportunity_override',
      value: override,
      period: field.destination_period,
      currency: provenance?.currency || 'USD',
    };
  }

  if (family !== 'desired') {
    const profileEarly = readPref(input.preferenceStore, field.question_id, 'profile_preference');
    if (profileEarly) {
      return {
        status: 'fill',
        source: 'profile_preference',
        value: profileEarly,
        period: field.destination_period,
        currency: provenance?.currency || 'USD',
      };
    }
    return {
      status: 'leave_blank',
      reason:
        family === 'unknown'
          ? 'compensation_family_unknown'
          : `posted_max_forbidden_for_${family}`,
    };
  }

  if (!provenance) {
    const profile = readPref(input.preferenceStore, field.question_id, 'profile_preference');
    if (profile) {
      return {
        status: 'fill',
        source: 'profile_preference',
        value: profile,
        period: field.destination_period,
        currency: 'USD',
      };
    }
    return { status: 'leave_blank', reason: 'no_compensation_provenance' };
  }

  if (provenance.period === 'unknown' || field.destination_period === 'unknown') {
    return { status: 'review', reason: 'unit_ambiguous' };
  }

  if (!periodsCompatible(provenance.period, field.destination_period)) {
    return { status: 'review', reason: 'period_mismatch_no_conversion' };
  }

  if (!isProvenanceFresh(provenance, nowMs)) {
    return { status: 'review', reason: 'stale_compensation_source' };
  }

  if (typeof provenance.maximum !== 'number' || !Number.isFinite(provenance.maximum)) {
    return { status: 'review', reason: 'missing_posted_maximum' };
  }

  if (!provenance.currency || !provenance.currency.trim()) {
    return { status: 'review', reason: 'missing_currency' };
  }

  return {
    status: 'fill',
    source: 'verified_posted_maximum',
    value: String(provenance.maximum),
    period: provenance.period,
    currency: provenance.currency.trim().toUpperCase(),
  };
}
