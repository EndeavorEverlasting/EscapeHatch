(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EscapeHatchSubmission = api;
})(globalThis, function () {
  'use strict';
  const KEY = 'escapeHatch.applicationSubmissionObservation.v1';
  function binding(url) {
    try {
      const value = new URL(url);
      if (value.protocol !== 'https:' || value.hostname !== 'jobs.ashbyhq.com' || !/^\/[^/]+\/[^/]+\/application\/?$/.test(value.pathname)) return null;
      return { origin: value.origin, path: value.pathname };
    } catch (_) { return null; }
  }
  function reduce(current, event, now, attemptId) {
    if (!current || !['ARMED', 'PENDING', 'VALIDATION_FAILED'].includes(current.state)) return current;
    if (!event || event.origin !== current.origin || event.path !== current.path || !Number.isFinite(now) || now < current.armedAt || now - current.armedAt > 30 * 60 * 1000) {
      return { ...current, state: 'BLOCKED', reason: 'Application changed or listening expired.' };
    }
    if (event.kind === 'attempt' && event.trusted === true && typeof attemptId === 'string' && attemptId) {
      return { ...current, state: 'PENDING', attemptId, attemptedAt: now, reason: 'Waiting for application-received confirmation.' };
    }
    if (current.state !== 'PENDING') return current;
    if (event.invalid === true || event.kind === 'invalid') return { ...current, state: 'VALIDATION_FAILED', reason: 'Correct application validation before trying again.' };
    if (event.kind === 'scan' && event.success === true && now >= current.attemptedAt) {
      return { ...current, state: 'CONFIRMED', reason: 'Application-received confirmation observed.', receipt: {
        source: 'same_session_page_confirmation', evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT',
        sessionId: current.sessionId, attemptId: current.attemptId, applicationOrigin: current.origin,
        applicationPath: current.path, observedAt: new Date(now).toISOString()
      } };
    }
    return current;
  }
  // Executed in Chrome's isolated extension world; page scripts cannot call the
  // runtime bridge. This observer never clicks, navigates, or writes form values.
  function install(expected) {
    if (location.origin !== expected.origin || location.pathname !== expected.path) return { error: 'Application changed.' };
    globalThis.__ehSubmissionObserverDispose?.();
    const visible = node => node instanceof HTMLElement && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
    const norm = text => text.replace(/\s+/g, ' ').trim().replaceAll('’', "'");
    const controls = () => Array.from(document.querySelectorAll('#root button')).filter(node => visible(node) && /^submit application$/i.test(norm(node.innerText)));
    const inspect = () => {
      const headings = Array.from(document.querySelectorAll('#root h1, #root h2, #root [role="status"], #root [role="alert"], #root div')).filter(visible);
      const receipt = /^(?:Success )?(?:we(?:'ve| have) received your application|your application (?:has been|was) (?:successfully )?submitted|application submitted successfully)[.!]?(?: We'll contact you if there are next steps\.)?$/i;
      const buttons = controls();
      const matches = headings.filter(node => receipt.test(norm(node.innerText)));
      const distinct = matches.filter(node => !matches.some(other => other !== node && node.contains(other)));
      const receiptText = distinct.length > 0;
      return { success: buttons.length === 0 && distinct.length === 1, receiptText,
        terminalCount: buttons.length, enabled: buttons.length === 1 && !buttons[0].matches(':disabled, [aria-disabled="true"]'),
        invalid: Array.from(document.querySelectorAll('#root div')).some(node => visible(node) && /^we couldn.t submit your application\b/i.test(norm(node.innerText))) || Array.from(document.querySelectorAll('[aria-invalid="true"], [role="alert"]')).some(node => visible(node) && (node.getAttribute('aria-invalid') === 'true' || /required|invalid|error|failed|could not|unable|try again/i.test(node.innerText))) };
    };
    let stopped = false;
    const report = (kind, trusted = false) => {
      if (stopped) return;
      const observation = inspect();
      void chrome.runtime.sendMessage({ type: 'submission-observation', sessionId: expected.sessionId,
        origin: location.origin, path: location.pathname, kind, trusted,
        success: observation.success, invalid: observation.invalid }).catch(() => {});
    };
    const click = event => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const button = event.target.closest('#root button');
      const snapshot = inspect();
      if (button && controls().includes(button) && snapshot.enabled && !snapshot.receiptText) report('attempt', true);
    };
    const invalid = () => report('invalid');
    document.addEventListener('click', click, true);
    document.addEventListener('invalid', invalid, true);
    const observer = new MutationObserver(() => report('scan'));
    observer.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    globalThis.__ehSubmissionObserverDispose = () => {
      stopped = true; observer.disconnect();
      document.removeEventListener('click', click, true);
      document.removeEventListener('invalid', invalid, true);
    };
    report('scan');
    return inspect();
  }
  return { KEY, binding, reduce, install };
});
