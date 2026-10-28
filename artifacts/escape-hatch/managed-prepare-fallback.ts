/** Fail-closed preparation when no trusted ATS navigation effect registry exists.
 *
 * Preparing approved fields and staging reviewed PDFs are independently useful
 * and authorized by the operator's Prepare action. This intentionally has no
 * navigation callback: unknown Submit/Continue consequences cannot be guessed.
 */
import type { PreparationResult } from './application-autopilot-executor.ts';
import type { FillOutcome } from './managed-form.ts';

type UploadKind = 'resume' | 'cover' | 'case_study';
export type FallbackPreparation = {
  preparation: PreparationResult;
  filled: string[];
  skipped: string[];
  attachments: Record<string, string>;
};

export async function prepareWithoutTrustedNavigation(options: {
  fill: () => Promise<FillOutcome>;
  attach: () => Promise<Record<string, string>>;
  expectedUploads: readonly UploadKind[];
}): Promise<FallbackPreparation> {
  // Fill before attaching because reactive form updates may recreate file inputs.
  const outcome = await options.fill();
  const attachments = await options.attach();
  const pendingManual = [
    'trusted_navigation_evidence_unavailable',
    ...options.expectedUploads
      .filter(kind => attachments[kind] !== 'attached_to_input_review_required')
      .map(kind => kind + '_upload_control_requires_review'),
    ...options.expectedUploads
      .filter(kind => attachments[kind] === 'attached_to_input_review_required')
      .map(kind => kind + '_employer_upload_acceptance_unverified'),
    ...outcome.skipped.map(reason => 'field_review:' + reason),
  ];
  return {
    filled: outcome.filled,
    skipped: outcome.skipped,
    attachments,
    preparation: {
      state: 'REVIEW_REQUIRED',
      code: 'trusted_navigation_evidence_missing',
      pagesPrepared: 1,
      intermediateSteps: 0,
      finalActionActivated: false,
      evidenceRefs: [],
      pendingManual: [...new Set(pendingManual)],
    },
  };
}
