/** Read-only managed-page companion. Application-companion v1 owns progress authority.
 * A human click is an attempt, never a receipt. Only a fresh, adapter-scoped
 * confirmation after that attempt can produce same-session confirmation evidence.
 * No form values, page text, query strings, or credentials enter snapshots.
 */
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';

export type SubmissionObservationState = 'DISARMED' | 'ARMED' | 'PENDING' | 'IN_PROGRESS' | 'PROCESSING' | 'VALIDATION_FAILED' | 'CONFIRMED' | 'BLOCKED';
export type SubmissionReceipt = {
  opportunityId: string;
  sessionId: string;
  attemptId: string;
  applicationOrigin: string;
  applicationPath: string;
  observedAt: string;
  source: 'same_session_page_confirmation';
  evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT';
};
export type ManagedSubmissionReceipt = SubmissionReceipt;
export type SubmissionSnapshot = {
  state: SubmissionObservationState;
  reason: string;
  receipt: SubmissionReceipt | null;
};
export type SubmissionObserverOptions = {
  opportunityId: string;
  sessionId: string;
  applicationUrl: string;
  /** Host-owned selector for a possible form transition; its label is NOT terminality evidence. */
  submitSelector: string;
  expectedSubmitText?: string;
  /** Exact-host adapter opt-in: form[type=submit] may say Next, Continue, Submit or something else. */
  acceptAnySubmitLabel?: boolean;
  /** Host-owned success-only container; body/main and job-description containers are invalid. */
  successSelector: string;
  /** Exact same-origin pathnames accepted after a human attempt; no wildcard routing. */
  confirmationPaths?: string[];
  /** Exact-job descendants only; never use '/' or a broad careers prefix. */
  continuationPathPrefixes?: string[];
  onChange?: (snapshot: SubmissionSnapshot) => void;
};

type Observation = {
  kind: 'attempt' | 'scan' | 'invalid'; url: string; documentId: string;
  /** Ephemeral structural evidence only, no field values, labels, or page text. */
  stageKey?: string; hasQuestions?: boolean; processing?: boolean;
  success: boolean; invalid: boolean; nonce?: string;
};

/** Pure policy, shared by the browser installer and fixture tests. No button text is proof of completion. */
export function reduceSubmissionObservation(
  previous: SubmissionSnapshot,
  event: Observation,
  binding: { origin: string; applicationPath: string; confirmationPaths: string[];
    continuationPathPrefixes?: string[]; receipt: SubmissionReceipt; attemptStageKey?: string },
): SubmissionSnapshot {
  if (previous.state === 'DISARMED' || previous.state === 'BLOCKED' || previous.state === 'CONFIRMED') return previous;
  const url = new URL(event.url);
  const safePath = url.pathname === binding.applicationPath ||
    binding.confirmationPaths.includes(url.pathname) ||
    (binding.continuationPathPrefixes || []).some(prefix => url.pathname.startsWith(prefix));
  if (url.origin !== binding.origin || !safePath) {
    return { state: 'BLOCKED', reason: 'Application identity or path changed; review before re-arming.', receipt: null };
  }
  if (event.kind === 'attempt') {
    if (url.pathname !== binding.applicationPath &&
        !(binding.continuationPathPrefixes || []).some(prefix => url.pathname.startsWith(prefix))) {
      return { state: 'BLOCKED', reason: 'This control is outside the bound application steps.', receipt: null };
    }
    return { state: 'PENDING', reason: 'A form transition was activated; awaiting the next step or an explicit employer receipt.', receipt: null };
  }
  if (!['PENDING', 'IN_PROGRESS', 'PROCESSING', 'VALIDATION_FAILED'].includes(previous.state)) return previous;
  // Validation, CAPTCHA and employer rejection override any simultaneous success-looking text.
  if (event.invalid || event.kind === 'invalid') {
    return { state: 'VALIDATION_FAILED', reason: 'Form validation or rejection observed; correct it before another attempt.', receipt: null };
  }
  // The scan is read-only. Only a unique explicit employer receipt on a page without
  // another application form may mark Applied. A mere click or route cannot.
  if (event.success && !event.hasQuestions) {
    return { state: 'CONFIRMED', reason: 'Explicit employer receipt observed after a bound form attempt.', receipt: binding.receipt };
  }
  if (event.processing && !event.hasQuestions) {
    return { state: 'PROCESSING', reason: 'Employer reports processing; final submission receipt is not yet verified.', receipt: null };
  }
  if (event.hasQuestions && binding.attemptStageKey &&
      binding.attemptStageKey !== event.documentId + ':' + (event.stageKey || '')) {
    return { state: 'IN_PROGRESS', reason: 'Another page of application questions is visible; continue the application.', receipt: null };
  }
  return previous;
}

export async function installManagedSubmissionObserver(page: Page, options: SubmissionObserverOptions) {
  const application = new URL(options.applicationUrl);
  if (!options.opportunityId || !options.sessionId || !options.submitSelector || !options.successSelector || /^(body|main|html|\*)$/i.test(options.successSelector.trim())) throw new Error('Explicit opportunity, session, terminal control, and success-only selector required.');
  const paths = options.confirmationPaths ?? [];
  const continuations = options.continuationPathPrefixes ?? [];
  if (paths.some(path => !path.startsWith('/') || path.includes('?') || path.includes('#')))
    throw new Error('Confirmation paths must be exact pathnames.');
  if (continuations.some(prefix => !prefix.startsWith(application.pathname.replace(/\/$/, '') + '/') ||
      !prefix.endsWith('/') || prefix.includes('?') || prefix.includes('#') || prefix.includes('..')))
    throw new Error('Continuation prefixes must be strict descendants of the exact application path.');
  const name = `__ehSubmission${randomUUID().replaceAll('-', '')}`;
  // Capability stays in the init-script closure, never in DOM/localStorage/globals.
  // Calling the exposed binding directly from page-authored JavaScript is insufficient.
  const nonce = randomUUID();
  let current: SubmissionSnapshot = { state: 'DISARMED', reason: 'Listener is off.', receipt: null };
  let disposed = false;
  let confirmed = false;
  let attemptId = '';
  let attemptStageKey = '';
  const copy = () => structuredClone(current);
  const publish = (next: SubmissionSnapshot) => {
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    current = next;
    if (next.state === 'CONFIRMED') confirmed = true;
    options.onChange?.(copy());
  };
  await page.exposeBinding(name, ({ frame }, event: Observation) => {
    if (disposed || frame !== page.mainFrame() || !event || event.nonce !== nonce || !['attempt', 'scan', 'invalid'].includes(event.kind)) return;
    // Bind the event to the actual top-level page, including on navigation.
    // Fast same-job SPA navigation may race the async binding after a genuine
    // native click. Both old and current URLs must remain inside this job's scope.
    const permitted = (value: string) => {
      try { const url = new URL(value); return url.origin === application.origin &&
        (url.pathname === application.pathname || paths.includes(url.pathname) ||
          continuations.some(prefix => url.pathname.startsWith(prefix))); }
      catch { return false; }
    };
    if (!permitted(event.url) || !permitted(frame.url())) return;
    if (event.kind !== 'attempt' && event.url !== frame.url()) return;
    if (event.kind === 'attempt') {
      attemptId = randomUUID();
      attemptStageKey = event.documentId + ':' + (event.stageKey || '');
      attemptObserved = true;
    }
    publish(reduceSubmissionObservation(current, event, {
      origin: application.origin, applicationPath: application.pathname,
      confirmationPaths: paths, continuationPathPrefixes: continuations, attemptStageKey,
      receipt: { opportunityId: options.opportunityId, sessionId: options.sessionId, attemptId,
        applicationOrigin: application.origin, applicationPath: application.pathname,
        observedAt: new Date().toISOString(), source: 'same_session_page_confirmation',
        evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT' },
    }));
  });
  const config = { name, nonce, submitSelector: options.submitSelector, successSelector: options.successSelector,
    expectedSubmitText: options.expectedSubmitText ?? 'Submit Application', acceptAnySubmitLabel: options.acceptAnySubmitLabel === true };
  // This script observes only. It has no click, submit, field-write or navigation action.
  const observe = ({ name, nonce, submitSelector, successSelector, expectedSubmitText, acceptAnySubmitLabel }: typeof config) => {
    const scope = window as unknown as Record<string, any>;
    if (scope[`${name}Installed`] || window.top !== window) return;
    scope[`${name}Installed`] = true;
    // Capture the original binding once; later page-script reassignment cannot
    // intercept the closure capability when native events are observed.
    const report = scope[name];
    const documentId = `${Date.now()}-${Math.random()}`;
    const visible = (element: Element) => element instanceof HTMLElement && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
    const matchesSubmit = (element: Element) => visible(element) && (
      acceptAnySubmitLabel
        ? ((element instanceof HTMLButtonElement || element instanceof HTMLInputElement) && element.type === 'submit' && !!element.closest('form'))
        : normalize((element as HTMLElement).innerText || element.getAttribute('value') || '') === normalize(expectedSubmitText)
    );
    const terminals = () => Array.from(document.querySelectorAll(submitSelector)).filter(matchesSubmit);
    // Stable in this document for unchanged controls; changes on full navigation or
    // React replacing a step's input elements. No labels, values or prompts leave the page.
    const ids = new WeakMap<Element, number>();
    let nextId = 1;
    const questionControls = () => Array.from(document.querySelectorAll('form input,form textarea,form select')).filter(element =>
      visible(element) && !(element as HTMLInputElement).disabled &&
      !['hidden', 'submit', 'button', 'reset', 'password', 'file'].includes((element as HTMLInputElement).type || ''));
    const stageKey = () => questionControls().slice(0, 50).map(element => {
      if (!ids.has(element)) ids.set(element, nextId++);
      return ids.get(element);
    }).join('-');

    const scan = (kind: Observation['kind'] = 'scan') => {
      const controls = terminals();
      const containers = Array.from(document.querySelectorAll(successSelector)).filter(visible);
      // Explicit receipt language only. Generic Thanks, a URL or a hidden posting quote fails closed.
      const receiptPattern = /^(?:(?:success[.!]? )?(?:we(?:'ve| have) (?:successfully )?received your application|your application (?:has been|was) (?:successfully )?(?:received|submitted)|application (?:successfully )?submitted(?: successfully)?|thank you for (?:submitting your application|applying(?: to [a-z0-9 .&-]+)?)))[.!]?(?: we(?:'ll| will) contact you if there are next steps\.)?$/i;
      const processingPattern = /^(?:your application (?:is being|is currently being) processed|we (?:are|re) processing your application|application (?:is being processed|under review)|your application is under review)[.!]?$/i;
      const matches = containers.filter(element => receiptPattern.test(normalize((element as HTMLElement).innerText).replaceAll('\u2019', "'")));
      const distinct = matches.filter(element => !matches.some(other => other !== element && element.contains(other)));
      const receiptText = distinct.length > 0;
      const processing = containers.some(element => processingPattern.test(normalize((element as HTMLElement).innerText).replaceAll('\u2019', "'")));
      const hasQuestions = questionControls().length > 0;
      const success = controls.length === 0 && !hasQuestions && distinct.length === 1;
      const rejected = Array.from(document.querySelectorAll('#root div')).some(element => visible(element) && /^we couldn.t submit your application\b/i.test(normalize((element as HTMLElement).innerText)));
      const invalid = rejected || Array.from(document.querySelectorAll('[role="alert"], [aria-invalid="true"], .ashby-application-form-error, .application-error, .application-errors')).some(element => visible(element) && (element.getAttribute('aria-invalid') === 'true' || /required|invalid|error|failed|could not|couldn.t|unable|try again|possible spam|flagged|captcha/i.test((element as HTMLElement).innerText)));
      void report({ kind, url: location.href, documentId, stageKey: stageKey(), hasQuestions, success,
        processing: processing && controls.length === 0 && !hasQuestions, invalid, nonce });
      return { success, invalid, receiptText, terminalCount: controls.length, terminalEnabled: controls.length === 1 && !controls[0].matches(':disabled, [aria-disabled="true"]') };

    };
    const click = (event: Event) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const button = event.target.closest(submitSelector);
      if (button && matchesSubmit(button) && terminals().length === 1 && !button.matches(':disabled, [aria-disabled="true"]')) scan('attempt');
    };
    const key = (event: KeyboardEvent) => {
      if (!event.isTrusted || event.key !== 'Enter' || !(event.target instanceof Element) || event.target.closest('textarea')) return;
      const form = event.target.closest('form');
      if (form && terminals().length === 1 && Array.from(form.querySelectorAll(submitSelector)).some(element => matchesSubmit(element) && !element.matches(':disabled, [aria-disabled="true"]'))) scan('attempt');
    };
    const invalid = () => scan('invalid');
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('invalid', invalid, true);
    const mutation = new MutationObserver(() => scan());
    mutation.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    document.addEventListener('DOMContentLoaded', () => scan(), { once: true });
    window.addEventListener('popstate', () => scan());
    scope[`${name}Inspect`] = () => scan();
    scope[`${name}Dispose`] = () => {
      mutation.disconnect();
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('invalid', invalid, true);
    };
    scan();
  };
  await page.addInitScript(observe, config);
  await page.evaluate(observe, config);
  return {
    snapshot: copy,
    async arm(): Promise<SubmissionSnapshot> {
      if (disposed) throw new Error('Listener disposed.');
      if (confirmed) throw new Error('Submission already confirmed; start a new bound session for another application.');
      const actual = new URL(page.url());
      if (actual.origin !== application.origin || actual.pathname !== application.pathname) throw new Error('Cannot arm on a different application.');
      const baseline = await page.evaluate(name => (window as unknown as Record<string, any>)[`${name}Inspect`](), name);
      if (baseline.receiptText) throw new Error('Preexisting confirmation cannot prove this submission.');
      if (baseline.terminalCount !== 1 || !baseline.terminalEnabled) throw new Error('A unique enabled application form transition control is required before arming.');
      attemptStageKey = '';
      publish({ state: 'ARMED', reason: 'Listening for form transitions on this application.', receipt: null });
      return copy();
    },
    async disarm() { publish({ state: 'DISARMED', reason: 'Listener is off.', receipt: null }); },
    async dispose() {
      disposed = true;
      publish({ state: 'DISARMED', reason: 'Listener is off.', receipt: null });
      await page.evaluate(name => (window as unknown as Record<string, any>)[`${name}Dispose`]?.(), name).catch(() => {});
    },
  };
}
