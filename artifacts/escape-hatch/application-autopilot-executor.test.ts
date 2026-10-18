import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareToFinalReview, type PageInspection, type PreparationDriver } from './application-autopilot-executor.ts';
import { ADAPTER_EVIDENCE_SCHEMA, type NavigationAuthorization } from './application-navigation-policy.ts';

const NOW = new Date('2026-10-18T12:00:00Z');
const AUTH: NavigationAuthorization = {
  sessionId: 'synthetic-session', opportunityId: 'synthetic-opportunity',
  origin: 'https://ats.example.test', navigationEnabled: true,
  allowedEffectClasses: ['LOCAL_STEP_ONLY', 'DRAFT_WRITE_AND_ADVANCE'],
  allowedDataCategories: ['synthetic_contact'],
  expiresAtUtc: '2026-10-19T12:00:00Z',
};

function snapshot(id: string, label: string, effect: 'DRAFT_WRITE_AND_ADVANCE' | 'TERMINAL_APPLICATION_COMMIT' | 'LOCAL_STEP_ONLY' = 'DRAFT_WRITE_AND_ADVANCE'): PageInspection {
  const control = {
    accessibleName: label, htmlType: 'submit', tag: 'button',
    pageUrl: 'https://ats.example.test/' + id, pageOrigin: AUTH.origin,
    pageFingerprint: id, controlId: 'identical-submit-control',
    controlFingerprint: 'button-' + id,
    enclosingFormAction: '/apply/' + id, enclosingFormMethod: 'post',
  };
  return {
    pageFingerprint: id, origin: AUTH.origin, control,
    trustedEvidence: {
      schema: ADAPTER_EVIDENCE_SCHEMA, adapterId: 'trusted-synthetic-fixture@1',
      atsProvider: 'synthetic', origin: AUTH.origin, pageFingerprint: id,
      controlId: control.controlId, controlFingerprint: control.controlFingerprint,
      enclosingFormAction: control.enclosingFormAction, enclosingFormMethod: control.enclosingFormMethod,
      verifiedEffectClass: effect, evidenceRefs: ['fixture://' + id],
      verifiedAtUtc: '2026-10-18T11:00:00Z', expiresAtUtc: '2026-10-18T13:00:00Z',
    },
    unresolvedRequired: [], validationErrors: [], manualGates: [],
    uploadsVerified: true,
  };
}

function simulator(pages: PageInspection[]) {
  let index = 0;
  const activations: string[] = [];
  const driver: PreparationDriver = {
    async inspect() { return pages[index]; },
    async prepareCurrentPage() { return { deterministic: true, unresolved: [] }; },
    async activateVerifiedIntermediate(control) {
      activations.push(control.pageFingerprint);
      if (index < pages.length - 1) index++;
    },
  };
  return { driver, activations };
}
const clock = { now: () => NOW };

test('same Submit text can safely advance two trusted intermediate pages but never final Submit', async () => {
  const {driver, activations} = simulator([
    snapshot('contact', 'Submit'), snapshot('work', 'Submit'),
    snapshot('review', 'Submit', 'TERMINAL_APPLICATION_COMMIT'),
  ]);
  const result = await prepareToFinalReview(driver, AUTH, clock);
  assert.equal(result.state, 'REVIEW_READY');
  assert.equal(result.pagesPrepared, 3);
  assert.equal(result.intermediateSteps, 2);
  assert.deepEqual(activations, ['contact', 'work']);
  assert.equal(result.finalActionActivated, false);
});

test('Next label can still be a terminal commitment: zero activation', async () => {
  const {driver, activations} = simulator([snapshot('trap', 'Next', 'TERMINAL_APPLICATION_COMMIT')]);
  const result = await prepareToFinalReview(driver, AUTH, clock);
  assert.equal(result.state, 'REVIEW_READY');
  assert.deepEqual(activations, []);
});

test('unknown or untrusted adapter evidence cannot confer click authority', async () => {
  const page = snapshot('unknown', 'Continue');
  page.trustedEvidence = null;
  const {driver, activations} = simulator([page]);
  const result = await prepareToFinalReview(driver, AUTH, clock);
  assert.equal(result.state, 'REVIEW_REQUIRED');
  assert.equal(result.code, 'intermediate_navigation_not_authorized');
  assert.deepEqual(activations, []);
});

test('unresolved required answers and files stop before navigation, including when next label is Submit', async () => {
  const page = snapshot('missing', 'Submit');
  page.unresolvedRequired.push('unknown_question');
  page.uploadsVerified = false;
  const {driver, activations} = simulator([page]);
  const result = await prepareToFinalReview(driver, AUTH, clock);
  assert.equal(result.code, 'required_preparation_unverified');
  assert.ok(result.pendingManual.includes('unknown_question'));
  assert.ok(result.pendingManual.includes('required_document_verification'));
  assert.deepEqual(activations, []);
});

test('CAPTCHA/attestation on an intermediate page becomes a manual gate; final legal check stays operator-only', async () => {
  const early = snapshot('captcha', 'Submit');
  early.manualGates = ['captcha'];
  const {driver, activations} = simulator([early]);
  const result = await prepareToFinalReview(driver, AUTH, clock);
  assert.equal(result.code, 'manual_gate_before_intermediate_navigation');
  assert.deepEqual(activations, []);
  const final = snapshot('final', 'Submit', 'TERMINAL_APPLICATION_COMMIT');
  final.manualGates = ['legal_attestation'];
  const accepted = await prepareToFinalReview(simulator([final]).driver, AUTH, clock);
  assert.equal(accepted.state, 'REVIEW_READY');
  assert.deepEqual(accepted.pendingManual, ['legal_attestation']);
});

test('pre-activation DOM drift cannot activate stale controls', async () => {
  let calls = 0;
  const stable = snapshot('first', 'Submit');
  const changed = snapshot('drift', 'Submit');
  const activations: string[] = [];
  const driver: PreparationDriver = {
    async inspect() { calls++; return calls < 4 ? stable : changed; },
    async prepareCurrentPage() { return { deterministic: true, unresolved: [] }; },
    async activateVerifiedIntermediate(control) { activations.push(control.pageFingerprint); },
  };
  const result = await prepareToFinalReview(driver, AUTH, clock);
  assert.equal(result.code, 'pre_activation_state_drift');
  assert.deepEqual(activations, []);
});

test('failed transition does not retry click; finite page budget stops infinite progression', async () => {
  const single = simulator([snapshot('same', 'Submit')]);
  const noMovement = await prepareToFinalReview(single.driver, AUTH, clock);
  assert.equal(noMovement.code, 'intermediate_transition_not_observed');
  assert.deepEqual(single.activations, ['same']);
  const many = simulator([snapshot('one','Submit'), snapshot('two','Submit'), snapshot('three','Submit')]);
  const limit = await prepareToFinalReview(many.driver, AUTH, { ...clock, maxSteps: 1 });
  assert.equal(limit.code, 'advance_budget_exhausted');
  assert.deepEqual(many.activations, ['one']);
});

test('expired evidence, disabled authority, and origin drift prevent activation', async () => {
  const stale = snapshot('stale', 'Submit');
  stale.trustedEvidence!.expiresAtUtc = '2026-10-17T12:00:00Z';
  const run = simulator([stale]);
  const res = await prepareToFinalReview(run.driver, AUTH, clock);
  assert.equal(res.state, 'REVIEW_REQUIRED');
  assert.deepEqual(run.activations, []);
  const unauth = simulator([snapshot('disabled', 'Submit')]);
  const denied = await prepareToFinalReview(unauth.driver, { ...AUTH, navigationEnabled: false }, clock);
  assert.equal(denied.code, 'no_scoped_navigation_authority');
  assert.deepEqual(unauth.activations, []);
  const redirected = snapshot('redirect', 'Submit');
  redirected.origin = 'https://other.example.test';
  const mismatch = simulator([redirected]);
  const redirectedResult = await prepareToFinalReview(mismatch.driver, AUTH, clock);
  assert.equal(redirectedResult.code, 'origin_or_page_unverified');
  assert.deepEqual(mismatch.activations, []);
});

test('non-deterministic writer cannot be used as a hidden agent fill channel', async () => {
  const driver: PreparationDriver = {
    async inspect() { return snapshot('one', 'Submit'); },
    async prepareCurrentPage() { return { deterministic: false as true, unresolved: [] }; },
    async activateVerifiedIntermediate() { throw new Error('should never activate'); },
  };
  const result = await prepareToFinalReview(driver, AUTH, clock);
  assert.equal(result.code, 'non_deterministic_preparation');
});
