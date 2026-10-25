import type { Page } from '@playwright/test';

/** A recognized form is not proof of employer submission or account creation. */
export type AuthPhase = 'AUTH_HANDOFF' | 'AUTH_RECHECK' | 'APPLICATION_FORM_READY' | 'ENTRY_REVIEW_REQUIRED' | 'SESSION_ORIGIN_CHANGED';
export type AuthObservation = {
  pageUrl: string;
  pageOrigin: string;
  expectedOrigin: string;
  credentialGate: boolean;
  emailFirstGate: boolean;
  applicationFormRecognized: boolean;
  formSignature: string;
};
export type AuthCheckpoint = {
  phase: AuthPhase;
  stableReads: number;
  signature: string | null;
  canResume: boolean;
  reason: string;
};
export const INITIAL_CHECKPOINT: AuthCheckpoint = {
  phase: 'ENTRY_REVIEW_REQUIRED', stableReads: 0, signature: null,
  canResume: false, reason: 'No observed application form yet.',
};
export function advanceAuthCheckpoint(previous: AuthCheckpoint, observation: AuthObservation): AuthCheckpoint {
  if (observation.pageOrigin !== observation.expectedOrigin) return {
    phase: 'SESSION_ORIGIN_CHANGED', stableReads: 0, signature: null, canResume: false,
    reason: 'Employer authentication is on another origin; wait for return or choose Check again.',
  };
  if (observation.credentialGate || observation.emailFirstGate) return {
    phase: 'AUTH_HANDOFF', stableReads: 0, signature: null, canResume: false,
    reason: 'Complete sign-in directly in managed Chrome. Passwords and verification codes remain private.',
  };
  if (!observation.applicationFormRecognized) return {
    phase: 'ENTRY_REVIEW_REQUIRED', stableReads: 0, signature: null, canResume: false,
    reason: 'The employer form is not recognized yet. Continue manually in Chrome, then Check again.',
  };
  const signature = observation.pageUrl + '|' + observation.formSignature;
  const stableReads = previous.signature === signature ? Math.min(previous.stableReads + 1, 2) : 1;
  return {
    phase: stableReads >= 2 ? 'APPLICATION_FORM_READY' : 'AUTH_RECHECK',
    stableReads, signature,
    canResume: stableReads >= 2,
    reason: stableReads >= 2
      ? 'The application form is visible and stable. Resume preparation in the existing Chrome session.'
      : 'Application form detected; confirming it remains stable before continuing.',
  };
}
export function resumeAllowed(checkpoint: AuthCheckpoint, observedOrigin: string, expectedOrigin: string): boolean {
  return checkpoint.canResume && checkpoint.phase === 'APPLICATION_FORM_READY' && observedOrigin === expectedOrigin;
}
/** Never reads inputs' values; never inspects an external identity-provider DOM. */
export async function inspectAuthObservation(page: Page, expectedOrigin: string): Promise<AuthObservation> {
  const pageUrl = page.url();
  const pageOrigin = new URL(pageUrl).origin;
  if (pageOrigin !== expectedOrigin) return {
    pageUrl, pageOrigin, expectedOrigin,
    credentialGate: false, emailFirstGate: false, applicationFormRecognized: false, formSignature: 'external-auth-origin',
  };
  const observed = await page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      return element.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const inputs = Array.from(document.querySelectorAll('input,textarea,select,[role="textbox"],[role="combobox"]'))
      .filter(visible).filter(el => !el.closest('[hidden],[aria-hidden="true"]'));
    const labels = inputs.map(el => {
      const input = el as HTMLInputElement;
      const fromLabel = Array.from(input.labels || []).map(x => x.textContent || '').join(' ');
      const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/)
        .map(id => document.getElementById(id)?.textContent || '').join(' ');
      return [input.name, input.id, el.getAttribute('aria-label'), fromLabel, labelledBy, el.getAttribute('placeholder')].join(' ').toLowerCase().slice(0, 180);
    });
    const credentialGate = inputs.some(el => el instanceof HTMLInputElement && el.type === 'password');
    const emailCount = inputs.filter(el => el instanceof HTMLInputElement && el.type === 'email').length;
    const identity = labels.filter(label => /(?:first.?name|last.?name|given.?name|phone|telephone|address|linkedin|portfolio)/i.test(label)).length;
    const uploads = inputs.filter(el => el instanceof HTMLInputElement && el.type === 'file').length;
    const employment = labels.filter(label => /(?:employment|experience|education|resume|r[ée]sum[ée]|cv|cover.?letter|work.?history)/i.test(label)).length;
    const applicationFormRecognized = !credentialGate &&
      (uploads > 0 || employment > 0 || identity >= 2);
    const emailFirstGate = !credentialGate && !applicationFormRecognized && emailCount > 0 &&
      inputs.filter(el => el instanceof HTMLInputElement && !['hidden','checkbox','radio'].includes(el.type)).length <= 2;
    return {
      credentialGate, emailFirstGate, applicationFormRecognized,
      formSignature: [identity, employment, uploads, inputs.length].join(':'),
    };
  });
  if (page.url() !== pageUrl) return {
    pageUrl: page.url(), pageOrigin: new URL(page.url()).origin, expectedOrigin,
    credentialGate: false, emailFirstGate: false, applicationFormRecognized: false, formSignature: 'navigation-race',
  };
  return { pageUrl, pageOrigin, expectedOrigin, ...observed };
}
