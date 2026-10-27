import type { Application } from './storage';

export type SubmissionEvidence = {
  opportunityId: string; sessionId: string; attemptId: string;
  applicationOrigin: string; applicationPath: string; observedAt: string;
  source: 'same_session_page_confirmation';
  evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT';
};

export function parseSubmissionEvidence(value: unknown): SubmissionEvidence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as SubmissionEvidence;
  if (item.source !== 'same_session_page_confirmation' || item.evidenceCode !== 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT' ||
    ![item.opportunityId, item.sessionId, item.attemptId].every(text => typeof text === 'string' && text.length > 0 && text.length < 256) ||
    typeof item.observedAt !== 'string' || Number.isNaN(Date.parse(item.observedAt)) ||
    typeof item.applicationPath !== 'string' || !item.applicationPath.startsWith('/') || /[?#]/.test(item.applicationPath)) return null;
  try {
    const origin = new URL(item.applicationOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== item.applicationOrigin) return null;
  } catch { return null; }
  return { opportunityId: item.opportunityId, sessionId: item.sessionId, attemptId: item.attemptId,
    applicationOrigin: item.applicationOrigin, applicationPath: item.applicationPath, observedAt: item.observedAt,
    source: item.source, evidenceCode: item.evidenceCode };
}

export function reconcileSubmissionReceipts(applications: Application[], values: unknown[]): Application[] {
  const receipts = values.map(parseSubmissionEvidence).filter((value): value is SubmissionEvidence => !!value);
  let changed = false;
  const next = applications.map(application => {
    const receipt = receipts.filter(item => {
      if (item.opportunityId !== application.id) return false;
      try {
        const url = new URL(application.url);
        return item.applicationOrigin === url.origin && (item.applicationPath === url.pathname ||
          url.hostname === 'jobs.ashbyhq.com' && item.applicationPath === url.pathname.replace(/\/$/, '') + '/application' ||
          url.hostname === 'jobs.lever.co' && /^\/[^/]+\/[^/]+\/?$/.test(url.pathname) && item.applicationPath === url.pathname.replace(/\/$/, '') + '/apply');
      } catch { return false; }
    }).sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
    if (!receipt || application.submissionEvidence?.attemptId === receipt.attemptId ||
      application.submissionEvidence && Date.parse(application.submissionEvidence.observedAt) >= Date.parse(receipt.observedAt)) return application;
    changed = true;
    const canAdvance = application.status === 'saved' || application.status === 'preparing';
    return { ...application, status: canAdvance ? 'applied' as const : application.status, submissionEvidence: receipt,
      nextAction: canAdvance ? 'Application received by employer — follow up when appropriate' : application.nextAction,
      updatedAt: canAdvance ? receipt.observedAt : application.updatedAt };
  });
  return changed ? next : applications;
}
