import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ADAPTER_EVIDENCE_SCHEMA } from './application-navigation-policy.ts';
import {
  loadTrustedEvidence,
  type TrustedAdapterRegistry,
} from './managed-preparation-driver.ts';

const contract = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../fixtures/application-navigation-ats/adapter-contract.v1.json', import.meta.url)), 'utf8'),
) as TrustedAdapterRegistry;

test('trusted evidence requires exact fingerprint match and never invents terminal authority from labels', () => {
  const authorization = {
    sessionId: 's', opportunityId: 'o', origin: 'https://jobs.example.test',
    navigationEnabled: true, allowedEffectClasses: ['DRAFT_WRITE_AND_ADVANCE'] as const,
    allowedDataCategories: ['synthetic_cover_note'], expiresAtUtc: new Date(Date.now() + 60_000).toISOString(),
  };
  const observation = {
    accessibleName: 'Submit', htmlType: 'submit', tag: 'button',
    pageUrl: authorization.origin + '/apply/step/1', pageOrigin: authorization.origin,
    pageFingerprint: 'native-step-1', controlId: 'apply-submit', controlFingerprint: 'cta-native-step-1',
    enclosingFormAction: '/apply/step/1', enclosingFormMethod: 'post',
  };
  const evidence = loadTrustedEvidence(contract, observation, authorization);
  assert.equal(evidence?.schema, ADAPTER_EVIDENCE_SCHEMA);
  assert.equal(evidence?.verifiedEffectClass, 'DRAFT_WRITE_AND_ADVANCE');
  assert.equal(loadTrustedEvidence(contract, { ...observation, controlFingerprint: 'forged' }, authorization), null);
  assert.equal(loadTrustedEvidence({ ...contract, schema: 'forged/v1' }, observation, authorization), null);
});

test('managed browser progression contract exists and preserves MV3 auto-nav prohibition', () => {
  const contractPath = fileURLToPath(new URL('../../contracts/managed-browser-progression.v1.json', import.meta.url));
  const progression = JSON.parse(readFileSync(contractPath, 'utf8')) as {
    schema: string;
    relationship_to_session_contract: { invariant: string };
    preparation_states: Record<string, string>;
  };
  assert.equal(progression.schema, 'escapehatch/managed-browser-progression/v1');
  assert.match(progression.relationship_to_session_contract.invariant, /does not amend or weaken/);
  assert.ok(progression.preparation_states.REVIEW_READY);
  assert.ok(progression.preparation_states.REVIEW_REQUIRED);
  assert.ok(progression.preparation_states.BLOCKED);
});
