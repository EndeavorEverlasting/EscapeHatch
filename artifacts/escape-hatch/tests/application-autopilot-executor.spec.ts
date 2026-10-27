import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prepareToFinalReview, type PageInspection, type PreparationDriver } from '../application-autopilot-executor.ts';
import { type AdapterEvidence, type ControlObservation, type NavigationAuthorization } from '../application-navigation-policy.ts';
import { createManagedPreparationDriver, type TrustedAdapterRegistry } from '../managed-preparation-driver.ts';
import { emptyPreferences } from '../src/lib/application-preferences.ts';
import { startSyntheticAts, type SyntheticAtsEffects, type SyntheticAtsHandle } from '../../../fixtures/application-navigation-ats/server.ts';

// Actual Chromium/HTTP consequence test: only synthetic values, no job seeker data.
type EvidenceEntry = Pick<AdapterEvidence, 'pageFingerprint' | 'controlId' | 'controlFingerprint' | 'enclosingFormAction' | 'enclosingFormMethod' | 'verifiedEffectClass' | 'evidenceRefs'>;
type Contract = {schema:string; adapterId:string; atsProvider:string; evidence:EvidenceEntry[]};

let ats: SyntheticAtsHandle;
let contract: Contract;
test.beforeAll(async () => {
  ats = await startSyntheticAts();
  contract = JSON.parse(readFileSync(fileURLToPath(new URL('../../../fixtures/application-navigation-ats/adapter-contract.v1.json', import.meta.url)), 'utf8')) as Contract;
});
test.afterAll(async () => { await ats.close(); });

async function journal(): Promise<SyntheticAtsEffects> {
  const response = await fetch(ats.origin + '/__effects');
  expect(response.ok).toBe(true);
  return await response.json() as SyntheticAtsEffects;
}
function permission(): NavigationAuthorization {
  return {
    sessionId:'synthetic-runtime-session', opportunityId:'synthetic-opportunity', origin:ats.origin,
    navigationEnabled:true, allowedEffectClasses:['LOCAL_STEP_ONLY','DRAFT_WRITE_AND_ADVANCE'],
    allowedDataCategories:['synthetic_cover_note'], expiresAtUtc:new Date(Date.now()+3_600_000).toISOString(),
  };
}

async function observe(page: Page): Promise<ControlObservation> {
  return await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[data-control-id]');
    if (!element) throw new Error('fixture control absent');
    const form = element.closest('form');
    return {
      accessibleName:(element.textContent || '').trim(),
      htmlType:element.getAttribute('type'), tag:element.tagName.toLowerCase(),
      pageUrl:location.href, pageOrigin:location.origin,
      pageFingerprint:document.documentElement.dataset.pageFp || '',
      controlId:element.dataset.controlId || '',
      controlFingerprint:element.dataset.controlFp || '',
      enclosingFormAction:form?.getAttribute('action') || null,
      enclosingFormMethod:form?.getAttribute('method') || null,
    };
  });
}
function trustedEvidence(observation:ControlObservation): AdapterEvidence | null {
  const entry=contract.evidence.find(e=>e.pageFingerprint===observation.pageFingerprint && e.controlId===observation.controlId);
  if (!entry) return null;
  const now=Date.now();
  return {
    ...entry, schema:contract.schema, adapterId:contract.adapterId, atsProvider:contract.atsProvider,
    origin:ats.origin, verifiedAtUtc:new Date(now-60_000).toISOString(), expiresAtUtc:new Date(now+3_600_000).toISOString(),
  };
}

function chromiumDriver(page: Page): PreparationDriver {
  return {
    async inspect(): Promise<PageInspection> {
      const control = await observe(page);
      const errors = await page.locator('[aria-invalid="true"], [role="alert"]').count();
      const requiredFiles = await page.locator('input[type="file"][required]').count();
      return {
        pageFingerprint: control.pageFingerprint, origin:control.pageOrigin, control,
        trustedEvidence:trustedEvidence(control),
        unresolvedRequired:[], validationErrors:errors?['synthetic_validation_error']:[],
        manualGates:[], uploadsVerified:requiredFiles===0,
      };
    },
    async prepareCurrentPage() {
      // Deterministic fixture-only writer, never an agent. Preserve any present value.
      const note=page.locator('input[name="note"]');
      if (await note.count() === 1) {
        const value=await note.inputValue();
        if (!value) await note.fill('synthetic-cover-note');
        if ((await note.inputValue()).length === 0) return {deterministic:true as const,unresolved:['synthetic_note_not_verified']};
      }
      return {deterministic:true as const,unresolved:[]};
    },
    async activateVerifiedIntermediate(control) {
      const locator=page.locator('[data-control-id="' + control.controlId + '"]');
      expect(await locator.count()).toBe(1);
      expect(await locator.getAttribute('data-control-fp')).toBe(control.controlFingerprint);
      await locator.click({timeout:5000});
      await page.waitForFunction(previous => document.documentElement.dataset.pageFp !== previous,
        control.pageFingerprint, {timeout:5000});
    },
  };
}

test('actual Chromium: Submit → Submit → terminal Submit, only two draft POSTs', async ({page}) => {
  await page.goto(ats.origin+'/apply/step/1');
  const before=await journal();
  const result=await prepareToFinalReview(chromiumDriver(page),permission(),{maxSteps:4});
  expect(result.state).toBe('REVIEW_READY');
  expect(result.pagesPrepared).toBe(3);
  expect(result.intermediateSteps).toBe(2);
  expect(result.finalActionActivated).toBe(false);
  expect(page.url()).toContain('/apply/step/3');
  const after=await journal();
  expect(after.nativeDrafts.length).toBe(before.nativeDrafts.length+2);
  expect(after.terminalCommits.length).toBe(before.terminalCommits.length);
});

test('actual Chromium: SPA Submit advances, terminal fetch never happens',async ({page}) => {
  await page.goto(ats.origin+'/spa/step/1');
  const before=await journal();
  const result=await prepareToFinalReview(chromiumDriver(page),permission(),{maxSteps:3});
  expect(result.state).toBe('REVIEW_READY');
  expect(result.intermediateSteps).toBe(1);
  expect(result.finalActionActivated).toBe(false);
  const after=await journal();
  expect(after.spaAdvances.length).toBe(before.spaAdvances.length+1);
  expect(after.terminalCommits.length).toBe(before.terminalCommits.length);
});

test('actual Chromium: Next decoy, changed POST action and missing adapter trigger zero HTTP mutation',async ({page}) => {
  for (const [path,code] of [
    ['/apply/decoy','terminal_action_reserved_for_operator'],
    ['/apply/step/1?drift=1','intermediate_navigation_not_authorized'],
    ['/apply/unmodeled','intermediate_navigation_not_authorized'],
  ] as const) {
    await page.goto(ats.origin+path);
    const before=await journal();
    const result=await prepareToFinalReview(chromiumDriver(page),permission(),{maxSteps:2});
    expect(result.code).toBe(code);
    expect(result.intermediateSteps).toBe(0);
    const after=await journal();
    expect(after.terminalCommits.length).toBe(before.terminalCommits.length);
    expect(after.rejectedDriftPosts.length).toBe(before.rejectedDriftPosts.length);
    expect(after.unmodeledPosts.length).toBe(before.unmodeledPosts.length);
  }
});

test('production managed PreparationDriver reaches REVIEW_READY on synthetic native ATS', async ({ page }) => {
  await page.goto(ats.origin + '/apply/step/1');
  const before = await journal();
  const auth = permission();
  const driver = createManagedPreparationDriver({
    page,
    authorization: auth,
    registry: contract as TrustedAdapterRegistry,
    preferences: emptyPreferences(),
  });
  const result = await prepareToFinalReview(driver, auth, { maxSteps: 4 });
  expect(result.state).toBe('REVIEW_READY');
  expect(result.finalActionActivated).toBe(false);
  expect(result.intermediateSteps).toBe(2);
  const after = await journal();
  expect(after.nativeDrafts.length).toBe(before.nativeDrafts.length + 2);
  expect(after.terminalCommits.length).toBe(before.terminalCommits.length);
});

test('production driver stops SPA progression for unresolved required controls', async ({ page }) => {
  for (const markup of [
    '<label>Unmapped question<input required name="unmapped"></label>',
    '<label>Required choice<select required><option value="">Choose</option><option value="yes">Yes</option></select></label>',
    '<label>Required agreement<input required type="checkbox"></label>',
    '<label>Custom required question<input aria-required="true"></label>',
    '<label>Unmapped long answer<textarea required></textarea></label>',
    '<div role="combobox" aria-required="true">Choose an answer</div>',
    '<label>Invalid email<input type="email" required value="invalid"></label>',
    '<form><input type="radio" name="choice" checked></form><form><input type="radio" name="choice" aria-required="true"></form>',
  ]) {
    await page.goto(ats.origin + '/spa/step/1');
    await page.evaluate(html => document.body.insertAdjacentHTML('afterbegin', html), markup);
    const before = await journal();
    const auth = permission();
    const driver = createManagedPreparationDriver({ page, authorization: auth, registry: contract as TrustedAdapterRegistry, preferences: emptyPreferences() });
    const result = await prepareToFinalReview(driver, auth, { maxSteps: 3 });
    expect(result.state).toBe('REVIEW_REQUIRED');
    expect(result.code).toBe('required_preparation_unverified');
    expect(result.pendingManual).toContain('required_control_0');
    expect(result.intermediateSteps).toBe(0);
    const after = await journal();
    expect(after.spaAdvances.length).toBe(before.spaAdvances.length);
    expect(after.terminalCommits.length).toBe(before.terminalCommits.length);
  }
});

test('production driver preserves populated required answers and ignores hidden disabled controls', async ({ page }) => {
  await page.goto(ats.origin + '/spa/step/1');
  await page.evaluate(() => document.body.insertAdjacentHTML('afterbegin', `
    <label>Unmapped question<input required value="synthetic-user-answer"></label>
    <form><input type="radio" name="same-form-choice" aria-required="true"><input type="radio" name="same-form-choice" checked></form>
    <input required style="display:none"><input required disabled><input type="hidden" required>
  `));
  const before = await journal();
  const auth = permission();
  const driver = createManagedPreparationDriver({ page, authorization: auth, registry: contract as TrustedAdapterRegistry, preferences: emptyPreferences() });
  const result = await prepareToFinalReview(driver, auth, { maxSteps: 3 });
  expect(result.state).toBe('REVIEW_READY');
  expect(result.intermediateSteps).toBe(1);
  expect(result.finalActionActivated).toBe(false);
  await expect(page.locator('input[value="synthetic-user-answer"]')).toHaveValue('synthetic-user-answer');
  const after = await journal();
  expect(after.spaAdvances.length).toBe(before.spaAdvances.length + 1);
  expect(after.terminalCommits.length).toBe(before.terminalCommits.length);
});
