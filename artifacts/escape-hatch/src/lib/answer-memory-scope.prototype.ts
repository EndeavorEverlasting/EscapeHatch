/**
 * EH-QMEM0 call-stack prototype — design seam only.
 * Classifies whether a sanitized structural question observation may enter
 * Answer Memory, and under which scope. Never stores values.
 * Successor build owns contracts/application-answer-memory.v1.json + validators.
 */

export type AnswerMemoryScope =
  | 'standard_reusable'
  | 'sensitive_session'
  | 'opportunity'
  | 'capability_tenure'
  | 'legal_current'
  | 'manual_each'
  | 'forbidden_infer';

export type TaxonomyAutomationPolicy =
  | 'fill_if_explicit_preference'
  | 'fill_if_confirmed_current'
  | 'manual_only'
  | 'never_autofill';

export type SanitizedFieldObservation = {
  /** Normalized label / prompt text only — never the filled value. */
  label: string;
  control_type: 'text' | 'tel' | 'email' | 'select' | 'radio' | 'checkbox' | 'textarea' | 'unknown';
  option_labels?: string[];
  name_or_id?: string;
  /** Optional pre-mapped taxonomy id when already known. */
  question_id?: string;
  category_hint?:
    | 'identity'
    | 'compensation'
    | 'eeo'
    | 'eligibility'
    | 'capability'
    | 'attestation'
    | 'other';
};

export type ScopeDecision =
  | {
      status: 'eligible';
      scope: Exclude<AnswerMemoryScope, 'forbidden_infer'>;
      question_id_candidate: string;
      may_autofill_later: boolean;
    }
  | { status: 'reject'; reason: string; scope: AnswerMemoryScope };

/** Strip anything that looks like a filled answer before repo/learning use. */
export function sanitizeObservation(raw: {
  label?: unknown;
  value?: unknown;
  selected?: unknown;
  control_type?: unknown;
  options?: unknown;
  name?: unknown;
  id?: unknown;
  question_id?: unknown;
  category_hint?: unknown;
}): SanitizedFieldObservation {
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  const control =
    raw.control_type === 'text' ||
    raw.control_type === 'tel' ||
    raw.control_type === 'email' ||
    raw.control_type === 'select' ||
    raw.control_type === 'radio' ||
    raw.control_type === 'checkbox' ||
    raw.control_type === 'textarea'
      ? raw.control_type
      : 'unknown';
  const option_labels = Array.isArray(raw.options)
    ? raw.options.filter((o): o is string => typeof o === 'string').map((o) => o.trim()).filter(Boolean)
    : undefined;
  // Intentionally drop value / selected.
  return {
    label,
    control_type: control,
    option_labels,
    name_or_id:
      typeof raw.name === 'string'
        ? raw.name
        : typeof raw.id === 'string'
          ? raw.id
          : undefined,
    question_id: typeof raw.question_id === 'string' ? raw.question_id : undefined,
    category_hint:
      raw.category_hint === 'identity' ||
      raw.category_hint === 'compensation' ||
      raw.category_hint === 'eeo' ||
      raw.category_hint === 'eligibility' ||
      raw.category_hint === 'capability' ||
      raw.category_hint === 'attestation' ||
      raw.category_hint === 'other'
        ? raw.category_hint
        : undefined,
  };
}

function slugCandidate(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64) || 'unknown_question';
}

/**
 * Success stack:
 * SANITIZED OBSERVATION
 *   -> classifyAnswerMemoryScope
 *   -> (QMEM1 later) capture_explicit_answer / resolve_question_answer
 *
 * Failure stack:
 * EEO / attestation / unknown sensitive -> reject or manual_each / forbidden_infer
 */
export function classifyAnswerMemoryScope(
  observation: SanitizedFieldObservation,
  automation: TaxonomyAutomationPolicy = 'fill_if_explicit_preference',
): ScopeDecision {
  const label = observation.label.toLowerCase();
  const qid = observation.question_id || `pending.${slugCandidate(observation.label)}`;
  const category = observation.category_hint;

  if (!observation.label.trim()) {
    return { status: 'reject', reason: 'empty_label', scope: 'forbidden_infer' };
  }

  if (category === 'eeo' || /\b(race|ethnicity|gender|disability|veteran)\b/.test(label)) {
    return { status: 'reject', reason: 'protected_class_never_inferred', scope: 'forbidden_infer' };
  }

  if (category === 'attestation' || /\b(signature|certify|i agree|truthfulness)\b/.test(label)) {
    return { status: 'reject', reason: 'attestation_manual_boundary', scope: 'manual_each' };
  }

  if (automation === 'never_autofill' || automation === 'manual_only') {
    if (category === 'eligibility' || /\b(age|18|authorized to work|essential functions)\b/.test(label)) {
      return {
        status: 'eligible',
        scope: 'legal_current',
        question_id_candidate: qid,
        may_autofill_later: false,
      };
    }
    return {
      status: 'eligible',
      scope: 'manual_each',
      question_id_candidate: qid,
      may_autofill_later: false,
    };
  }

  if (category === 'compensation' || /\b(salary|compensation|hourly|pay rate)\b/.test(label)) {
    return {
      status: 'eligible',
      scope: 'opportunity',
      question_id_candidate: qid.startsWith('compensation.') ? qid : `compensation.${slugCandidate(observation.label)}`,
      may_autofill_later: true,
    };
  }

  if (category === 'capability' || /\b(years?|experience|copilot|sql|scripting)\b/.test(label)) {
    return {
      status: 'eligible',
      scope: 'capability_tenure',
      question_id_candidate: qid,
      may_autofill_later: automation === 'fill_if_explicit_preference',
    };
  }

  if (automation === 'fill_if_confirmed_current') {
    return {
      status: 'eligible',
      scope: 'sensitive_session',
      question_id_candidate: qid,
      may_autofill_later: true,
    };
  }

  return {
    status: 'eligible',
    scope: 'standard_reusable',
    question_id_candidate: qid,
    may_autofill_later: true,
  };
}
