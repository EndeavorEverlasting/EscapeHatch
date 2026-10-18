import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ADAPTER_EVIDENCE_SCHEMA,
  EFFECT_CLASSES,
  classifyNavigationAction,
  type AdapterEvidence,
  type ControlObservation,
  type GrantableEffectClass,
  type NavigationAuthorization,
} from './application-navigation-policy.ts';

const NOW = new Date('2026-10-17T12:00:00.000Z');
const PAST = '2026-10-17T11:00:00.000Z';
const FUTURE = '2026-10-17T13:00:00.000Z';
const FUTURE_LATER = '2026-10-17T14:00:00.000Z';

function observation(overrides: Partial<ControlObservation> = {}): ControlObservation {
  return {
    accessibleName: 'Submit',
    htmlType: 'submit',
    tag: 'button',
    pageUrl: 'https://ats.example.test/apply/step-2',
    pageOrigin: 'https://ats.example.test',
    pageFingerprint: 'page-fp-contact',
    controlId: 'continue-cta',
    controlFingerprint: 'control-fp-a1b2',
    enclosingFormAction: '/apply/step-2',
    enclosingFormMethod: 'post',
    ...overrides,
  };
}

function evidence(overrides: Partial<AdapterEvidence> = {}): AdapterEvidence {
  return {
    schema: ADAPTER_EVIDENCE_SCHEMA,
    adapterId: 'ats-example-apply-flow@1',
    atsProvider: 'example-ats',
    origin: 'https://ats.example.test',
    pageFingerprint: 'page-fp-contact',
    controlId: 'continue-cta',
    controlFingerprint: 'control-fp-a1b2',
    enclosingFormAction: '/apply/step-2',
    enclosingFormMethod: 'post',
    verifiedEffectClass: 'LOCAL_STEP_ONLY',
    evidenceRefs: ['synthetic-fixture-receipt#1'],
    verifiedAtUtc: PAST,
    expiresAtUtc: FUTURE_LATER,
    ...overrides,
  };
}

function authorization(overrides: Partial<NavigationAuthorization> = {}): NavigationAuthorization {
  return {
    sessionId: 'session-001',
    opportunityId: 'opp-001',
    origin: 'https://ats.example.test',
    navigationEnabled: true,
    allowedEffectClasses: ['LOCAL_STEP_ONLY', 'DRAFT_WRITE_AND_ADVANCE'],
    allowedDataCategories: ['contact_and_work_history'],
    expiresAtUtc: FUTURE_LATER,
    ...overrides,
  };
}

test('rubric A: no trusted adapter leaves a friendly label UNKNOWN and unautomatable', () => {
  for (const name of ['Submit', 'Next', 'Continue', 'Save and continue']) {
    const verdict = classifyNavigationAction(observation({ accessibleName: name }), null, authorization(), NOW);
    assert.equal(verdict.effectClass, 'UNKNOWN_OR_COMPOSITE');
    assert.equal(verdict.automationPermitted, false);
    assert.equal(verdict.requiresOperatorAction, true);
    assert.ok(verdict.blockers.includes('no_trusted_adapter_evidence'));
  }
});

test('label, html type, tag and form attributes alone confer no authority', () => {
  const authorityLike = observation({
    accessibleName: 'Next',
    htmlType: 'button',
    tag: 'a',
    enclosingFormAction: null,
    enclosingFormMethod: null,
  });
  const verdict = classifyNavigationAction(authorityLike, null, null, NOW);
  assert.equal(verdict.effectClass, 'UNKNOWN_OR_COMPOSITE');
  assert.equal(verdict.automationPermitted, false);
});

test('rubric B: versioned scoped evidence plus scoped authorization permits a verified intermediate step', () => {
  const verdict = classifyNavigationAction(observation(), evidence(), authorization(), NOW);
  assert.equal(verdict.effectClass, 'LOCAL_STEP_ONLY');
  assert.equal(verdict.confidence, 'verified');
  assert.equal(verdict.automationPermitted, true);
  assert.equal(verdict.requiresOperatorAction, false);
  assert.deepEqual(verdict.blockers, []);
  assert.equal(verdict.evidenceRefs[0], 'ats-example-apply-flow@1');
});

test('rubric B: DRAFT_WRITE_AND_ADVANCE requires explicit data-category authorization', () => {
  const mid = classifyNavigationAction(
    observation(),
    evidence({ verifiedEffectClass: 'DRAFT_WRITE_AND_ADVANCE' }),
    authorization(),
    NOW,
  );
  assert.equal(mid.effectClass, 'DRAFT_WRITE_AND_ADVANCE');
  assert.equal(mid.automationPermitted, true);

  const blocked = classifyNavigationAction(
    observation(),
    evidence({ verifiedEffectClass: 'DRAFT_WRITE_AND_ADVANCE' }),
    authorization({ allowedDataCategories: [] }),
    NOW,
  );
  assert.equal(blocked.effectClass, 'DRAFT_WRITE_AND_ADVANCE');
  assert.equal(blocked.automationPermitted, false);
  assert.ok(blocked.blockers.includes('draft_disclosure_data_categories_not_authorized'));
});

test('rubric C: identical Submit label classified terminal is operator-only even with maximal authorization', () => {
  const verdict = classifyNavigationAction(
    observation({ accessibleName: 'Submit' }),
    evidence({ verifiedEffectClass: 'TERMINAL_APPLICATION_COMMIT' }),
    authorization(),
    NOW,
  );
  assert.equal(verdict.effectClass, 'TERMINAL_APPLICATION_COMMIT');
  assert.equal(verdict.automationPermitted, false);
  assert.equal(verdict.requiresOperatorAction, true);
  assert.deepEqual(verdict.blockers, ['terminal_application_commit_is_operator_only']);
});

test('rubric C: authorization that smuggles TERMINAL into its grants is rejected, not honored', () => {
  const hostile = authorization({
    allowedEffectClasses: ['LOCAL_STEP_ONLY', 'TERMINAL_APPLICATION_COMMIT'],
  });
  const verdict = classifyNavigationAction(
    observation(),
    evidence({ verifiedEffectClass: 'TERMINAL_APPLICATION_COMMIT' }),
    hostile,
    NOW,
  );
  assert.equal(verdict.effectClass, 'TERMINAL_APPLICATION_COMMIT');
  assert.equal(verdict.automationPermitted, false);

  const localHostile = classifyNavigationAction(observation(), evidence(), hostile, NOW);
  assert.equal(localHostile.effectClass, 'LOCAL_STEP_ONLY');
  assert.equal(localHostile.automationPermitted, false);
  assert.ok(localHostile.blockers.includes('terminal_effect_class_not_grantable'));
});

test('rubric D: control fingerprint drift without text change fails closed', () => {
  const verdict = classifyNavigationAction(
    observation({ controlFingerprint: 'control-fp-drifted' }),
    evidence(),
    authorization(),
    NOW,
  );
  assert.equal(verdict.effectClass, 'UNKNOWN_OR_COMPOSITE');
  assert.equal(verdict.automationPermitted, false);
  assert.ok(verdict.blockers.includes('adapter_evidence_context_mismatch'));
});

test('rubric D: page fingerprint drift without text change fails closed', () => {
  const verdict = classifyNavigationAction(
    observation({ pageFingerprint: 'page-fp-v2' }),
    evidence(),
    authorization(),
    NOW,
  );
  assert.equal(verdict.effectClass, 'UNKNOWN_OR_COMPOSITE');
  assert.equal(verdict.automationPermitted, false);
});

test('rubric D: endpoint drift (form action changes) with unchanged label fails closed', () => {
  const verdict = classifyNavigationAction(
    observation({ enclosingFormAction: '/apply/final-submit' }),
    evidence(),
    authorization(),
    NOW,
  );
  assert.equal(verdict.effectClass, 'UNKNOWN_OR_COMPOSITE');
  assert.equal(verdict.automationPermitted, false);
});

test('cross-origin evidence never applies to the observed page', () => {
  const verdict = classifyNavigationAction(
    observation(),
    evidence({ origin: 'https://other-employer.test' }),
    authorization(),
    NOW,
  );
  assert.equal(verdict.effectClass, 'UNKNOWN_OR_COMPOSITE');
  assert.ok(verdict.blockers.includes('adapter_evidence_context_mismatch'));
});

test('stale adapter evidence expires to UNKNOWN', () => {
  const verdict = classifyNavigationAction(
    observation(),
    evidence({ verifiedAtUtc: '2026-10-16T11:00:00.000Z', expiresAtUtc: '2026-10-17T11:30:00.000Z' }),
    authorization(),
    NOW,
  );
  assert.equal(verdict.effectClass, 'UNKNOWN_OR_COMPOSITE');
  assert.ok(verdict.blockers.includes('adapter_evidence_expired'));
});

test('future-dated adapter evidence fails closed', () => {
  const verdict = classifyNavigationAction(
    observation(),
    evidence({ verifiedAtUtc: FUTURE, expiresAtUtc: FUTURE_LATER }),
    authorization(),
    NOW,
  );
  assert.equal(verdict.effectClass, 'UNKNOWN_OR_COMPOSITE');
  assert.ok(verdict.blockers.includes('adapter_evidence_from_future'));
});

test('inverted evidence timestamps fail closed', () => {
  const verdict = classifyNavigationAction(
    observation(),
    evidence({ verifiedAtUtc: FUTURE_LATER, expiresAtUtc: PAST }),
    authorization(),
    NOW,
  );
  assert.equal(verdict.effectClass, 'UNKNOWN_OR_COMPOSITE');
  assert.ok(verdict.blockers.includes('adapter_evidence_timestamps_invalid'));
});

test('unsupported or wildcard evidence schema fails closed', () => {
  const verdict = classifyNavigationAction(
    observation(),
    evidence({ schema: 'some-other-schema/v9' }),
    authorization(),
    NOW,
  );
  assert.equal(verdict.effectClass, 'UNKNOWN_OR_COMPOSITE');
  assert.ok(verdict.blockers.includes('unsupported_adapter_evidence_schema'));
});

test('verified classification without authorization never permits automation', () => {
  const verdict = classifyNavigationAction(observation(), evidence(), null, NOW);
  assert.equal(verdict.effectClass, 'LOCAL_STEP_ONLY');
  assert.equal(verdict.confidence, 'verified');
  assert.equal(verdict.automationPermitted, false);
  assert.equal(verdict.requiresOperatorAction, true);
  assert.ok(verdict.blockers.includes('missing_navigation_authorization'));
});

test('disabled navigation, wrong origin, missing binding, and expiry each block independently', () => {
  const cases: Array<[NavigationAuthorization, string]> = [
    [authorization({ navigationEnabled: false }), 'navigation_not_enabled'],
    [authorization({ origin: 'https://elsewhere.test' }), 'authorization_origin_mismatch'],
    [authorization({ sessionId: '' }), 'authorization_missing_session_binding'],
    [authorization({ opportunityId: '' }), 'authorization_missing_session_binding'],
    [authorization({ expiresAtUtc: '2026-10-17T11:30:00.000Z' }), 'authorization_expired'],
    [authorization({ expiresAtUtc: 'not-a-date' }), 'authorization_expiry_invalid'],
    [authorization({ allowedEffectClasses: ['DRAFT_WRITE_AND_ADVANCE'] }), 'effect_class_not_authorized'],
  ];
  for (const [auth, blocker] of cases) {
    const verdict = classifyNavigationAction(observation(), evidence(), auth, NOW);
    assert.equal(verdict.automationPermitted, false, `expected blocker ${blocker}`);
    assert.ok(verdict.blockers.includes(blocker), `missing ${blocker} in ${verdict.blockers.join(',')}`);
  }
});

test('malformed observation fails closed', () => {
  const broken = observation({ pageOrigin: '', pageFingerprint: '' });
  const verdict = classifyNavigationAction(broken, evidence(), authorization(), NOW);
  assert.equal(verdict.effectClass, 'UNKNOWN_OR_COMPOSITE');
  assert.equal(verdict.automationPermitted, false);
  assert.ok(verdict.blockers.includes('malformed_control_observation'));
});

test('contract JSON agrees with the pure classifier vocabulary', () => {
  const contract = JSON.parse(
    readFileSync(new URL('../../contracts/application-navigation-authority.v1.json', import.meta.url), 'utf8'),
  );
  assert.equal(contract.schema, 'escapehatch/application-navigation-authority/v1');
  assert.deepEqual(Object.keys(contract.effect_classes).sort(), [...EFFECT_CLASSES].sort());
  assert.equal(contract.effect_classes.TERMINAL_APPLICATION_COMMIT.grantable_to_agent, false);
  assert.equal(contract.effect_classes.TERMINAL_APPLICATION_COMMIT.automation_default, 'deny');
  assert.equal(contract.effect_classes.UNKNOWN_OR_COMPOSITE.automation_default, 'deny');
  assert.deepEqual(
    contract.authorization.grantable_effect_classes.sort(),
    ['DRAFT_WRITE_AND_ADVANCE', 'LOCAL_STEP_ONLY'] as GrantableEffectClass[],
  );
  assert.ok(contract.invariants.includes('authorization_never_grants_terminal_application_commit'));
  assert.ok(contract.invariants.includes('keyboard_implicit_submit_or_synthetic_events_do_not_bypass_classification'));
  assert.equal(contract.relationship_to_session_contract.session_contract, 'contracts/application-assist-session.v1.json');
});
