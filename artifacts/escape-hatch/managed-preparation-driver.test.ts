import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { emptyPreferences } from './src/lib/application-preferences.ts';
import { ADAPTER_EVIDENCE_SCHEMA } from './application-navigation-policy.ts';
import {
  createManagedPreparationDriver,
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


test('managed preparation reads starred ATS requirements, including privacy and upload, before readiness', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://jobs.example.test/**', route => route.fulfill({
      contentType: 'text/html',
      body: `<form>
        <label for="resume">Resume/CV *</label><input id="resume" type="file" style="display:none">
        <label for="heard">How did you hear about us? *</label>
        <select id="heard"><option value="">Choose</option><option value="linkedin">LinkedIn</option></select>
        <fieldset><legend>Have you previously been employed by us? *</legend>
          <label><input type="radio" name="employed" value="yes">Yes</label>
          <label><input type="radio" name="employed" value="no">No</label>
        </fieldset>
        <label for="notice">Applicant Privacy Notice *</label><input id="notice" type="checkbox">
        <label>Optional notes <input id="notes"></label>
      </form>`,
    }));
    await page.goto('https://jobs.example.test/apply');
    const driver = createManagedPreparationDriver({
      page,
      authorization: {
        sessionId: 'synthetic-session', opportunityId: 'synthetic-magnet',
        origin: 'https://jobs.example.test', navigationEnabled: true,
        allowedEffectClasses: ['DRAFT_WRITE_AND_ADVANCE'],
        allowedDataCategories: ['synthetic_cover_note'],
        expiresAtUtc: new Date(Date.now() + 60_000).toISOString(),
      },
      registry: { schema: ADAPTER_EVIDENCE_SCHEMA, adapterId: 'synthetic', atsProvider: 'synthetic', evidence: [] },
      preferences: emptyPreferences(),
    });
    const before = await driver.inspect();
    assert.equal(before.uploadsVerified, false);
    assert.ok(before.unresolvedRequired.some(item => /How did you hear about us/.test(item)));
    assert.ok(before.unresolvedRequired.some(item => /previously been employed/.test(item)));
    assert.ok(before.unresolvedRequired.some(item => /Applicant Privacy Notice/.test(item)));
    assert.ok(before.unresolvedRequired.some(item => /Resume\/CV/.test(item)));
    assert.ok(!before.unresolvedRequired.some(item => /Optional notes/.test(item)));
    await page.locator('#resume').setInputFiles({name:'test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\n')});
    await page.locator('#heard').selectOption('linkedin');
    await page.locator('input[name="employed"][value="no"]').check();
    const consentPending = await driver.inspect();
    assert.equal(consentPending.uploadsVerified, true);
    assert.ok(consentPending.unresolvedRequired.some(item => /Applicant Privacy Notice/.test(item)));
    await page.locator('#notice').check();
    const complete = await driver.inspect();
    assert.deepEqual(complete.unresolvedRequired, []);
    assert.equal(complete.uploadsVerified, true);
  } finally {
    await browser.close();
  }
});
