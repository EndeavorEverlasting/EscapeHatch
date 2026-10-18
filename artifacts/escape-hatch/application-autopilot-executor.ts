/**
 * Deterministic multi-page preparation core.
 *
 * No model runs in this loop. The host supplies audited, deterministic
 * inspect/prepare/activate implementations. In particular, inspect MUST bind
 * adapter evidence from a trusted registry, never from the candidate page.
 *
 * This module does not amend the v1 browser-extension session contract or
 * grant real-site click authority. Wire it only through a versioned managed
 * browser progression contract and a tested page adapter.
 */
import {
  classifyNavigationAction,
  type AdapterEvidence,
  type ControlObservation,
  type NavigationAuthorization,
} from './application-navigation-policy.ts';

export type PageInspection = {
  pageFingerprint: string;
  origin: string;
  control: ControlObservation | null;
  trustedEvidence: AdapterEvidence | null;
  unresolvedRequired: string[];
  validationErrors: string[];
  manualGates: string[];
  uploadsVerified: boolean;
};

export type PreparationReceipt = {
  deterministic: true;
  unresolved: string[];
};

export type PreparationDriver = {
  inspect(): Promise<PageInspection>;
  /** Existing canonical fill plan and PDF writer, not an AI/agent action. */
  prepareCurrentPage(): Promise<PreparationReceipt>;
  /** Must re-resolve the observed unique control, never search by label alone. */
  activateVerifiedIntermediate(control: ControlObservation): Promise<void>;
};

export type PreparationResult = {
  state: 'REVIEW_READY' | 'REVIEW_REQUIRED' | 'BLOCKED';
  code: string;
  pagesPrepared: number;
  intermediateSteps: number;
  finalActionActivated: false;
  evidenceRefs: string[];
  pendingManual: string[];
};

function finish(
  state: PreparationResult['state'],
  code: string,
  pagesPrepared: number,
  intermediateSteps: number,
  evidenceRefs: string[],
  pendingManual: string[] = [],
): PreparationResult {
  return { state, code, pagesPrepared, intermediateSteps, finalActionActivated: false,
    evidenceRefs: [...new Set(evidenceRefs)], pendingManual: [...new Set(pendingManual)] };
}

function sameControl(a: ControlObservation, b: ControlObservation): boolean {
  return a.pageOrigin === b.pageOrigin &&
    a.pageFingerprint === b.pageFingerprint &&
    a.controlId === b.controlId &&
    a.controlFingerprint === b.controlFingerprint &&
    a.enclosingFormAction === b.enclosingFormAction &&
    a.enclosingFormMethod === b.enclosingFormMethod;
}

function pageInvalid(s: PageInspection, auth: NavigationAuthorization): string | null {
  if (!s || !s.pageFingerprint || !s.origin || s.origin !== auth.origin) return 'origin_or_page_unverified';
  if (s.control && (s.control.pageOrigin !== s.origin || s.control.pageFingerprint !== s.pageFingerprint))
    return 'control_page_binding_mismatch';
  return null;
}

/**
 * Stop at the first trusted terminal control. "Submit" is NOT a classifier.
 * A label on an intermediate step confers no click authority on its own.
 */
export async function prepareToFinalReview(
  driver: PreparationDriver,
  authorization: NavigationAuthorization,
  options: { maxSteps?: number; now?: () => Date } = {},
): Promise<PreparationResult> {
  const maxSteps = options.maxSteps ?? 10;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 30)
    throw new Error('maxSteps must be an integer from 1 through 30');
  const now = options.now ?? (() => new Date());
  let pagesPrepared = 0;
  let intermediateSteps = 0;
  const evidenceRefs: string[] = [];
  const seen = new Set<string>();

  if (!authorization?.navigationEnabled || !authorization.origin || !authorization.opportunityId ||
      !authorization.sessionId) {
    return finish('BLOCKED', 'no_scoped_navigation_authority', 0, 0, []);
  }

  for (let step = 0; step <= maxSteps; step++) {
    const before = await driver.inspect();
    const preError = pageInvalid(before, authorization);
    if (preError) return finish('BLOCKED', preError, pagesPrepared, intermediateSteps, evidenceRefs);
    const pageKey = before.pageFingerprint;
    if (seen.has(pageKey)) return finish('BLOCKED', 'page_loop_detected', pagesPrepared, intermediateSteps, evidenceRefs);
    seen.add(pageKey);

    const preparation = await driver.prepareCurrentPage();
    pagesPrepared++;
    if (preparation?.deterministic !== true) {
      return finish('BLOCKED', 'non_deterministic_preparation', pagesPrepared, intermediateSteps, evidenceRefs);
    }
    const ready = await driver.inspect();
    const readyError = pageInvalid(ready, authorization);
    if (readyError) return finish('BLOCKED', readyError, pagesPrepared, intermediateSteps, evidenceRefs);
    if (ready.pageFingerprint !== pageKey) {
      return finish('REVIEW_REQUIRED', 'page_changed_during_preparation', pagesPrepared, intermediateSteps, evidenceRefs);
    }

    const pending = [...(preparation.unresolved || []), ...(ready.unresolvedRequired || []),
      ...(ready.validationErrors || [])];
    if (!ready.uploadsVerified) pending.push('required_document_verification');
    if (pending.length) return finish('REVIEW_REQUIRED', 'required_preparation_unverified',
      pagesPrepared, intermediateSteps, evidenceRefs, pending);

    if (!ready.control) return finish('REVIEW_REQUIRED', 'no_classified_navigation_control',
      pagesPrepared, intermediateSteps, evidenceRefs, ready.manualGates);
    const verdict = classifyNavigationAction(ready.control, ready.trustedEvidence, authorization, now());
    evidenceRefs.push(...verdict.evidenceRefs);

    // Terminal always wins, even when the accessible name says Next or Continue.
    if (verdict.effectClass === 'TERMINAL_APPLICATION_COMMIT') {
      return finish('REVIEW_READY', 'terminal_action_reserved_for_operator',
        pagesPrepared, intermediateSteps, evidenceRefs, ready.manualGates);
    }
    if ((ready.manualGates || []).length) {
      return finish('REVIEW_REQUIRED', 'manual_gate_before_intermediate_navigation',
        pagesPrepared, intermediateSteps, evidenceRefs, ready.manualGates);
    }
    if (!verdict.automationPermitted) {
      return finish('REVIEW_REQUIRED', 'intermediate_navigation_not_authorized',
        pagesPrepared, intermediateSteps, evidenceRefs, verdict.blockers);
    }
    if (step === maxSteps) {
      return finish('BLOCKED', 'advance_budget_exhausted', pagesPrepared, intermediateSteps, evidenceRefs);
    }

    // Close the read/write TOCTOU gap as far as practical: obtain a fresh DOM
    // observation directly before activation, and re-classify it.
    const fresh = await driver.inspect();
    const freshError = pageInvalid(fresh, authorization);
    if (freshError || !fresh.control || !sameControl(ready.control, fresh.control) ||
        fresh.pageFingerprint !== pageKey || fresh.unresolvedRequired.length ||
        fresh.validationErrors.length || fresh.manualGates.length || !fresh.uploadsVerified) {
      return finish('REVIEW_REQUIRED', 'pre_activation_state_drift',
        pagesPrepared, intermediateSteps, evidenceRefs);
    }
    const finalVerdict = classifyNavigationAction(fresh.control, fresh.trustedEvidence, authorization, now());
    evidenceRefs.push(...finalVerdict.evidenceRefs);
    if (!finalVerdict.automationPermitted ||
        finalVerdict.effectClass === 'TERMINAL_APPLICATION_COMMIT' ||
        finalVerdict.effectClass !== verdict.effectClass) {
      return finish('REVIEW_REQUIRED', 'pre_activation_authority_drift',
        pagesPrepared, intermediateSteps, evidenceRefs, finalVerdict.blockers);
    }

    await driver.activateVerifiedIntermediate(fresh.control);
    intermediateSteps++;
    const after = await driver.inspect();
    const afterError = pageInvalid(after, authorization);
    if (afterError) return finish('BLOCKED', afterError, pagesPrepared, intermediateSteps, evidenceRefs);
    if (after.pageFingerprint === pageKey)
      return finish('REVIEW_REQUIRED', 'intermediate_transition_not_observed',
        pagesPrepared, intermediateSteps, evidenceRefs);
  }
  return finish('BLOCKED', 'advance_budget_exhausted', pagesPrepared, intermediateSteps, evidenceRefs);
}
