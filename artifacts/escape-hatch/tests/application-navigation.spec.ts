import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  classifyNavigationAction,
  type AdapterEvidence,
  type ClassificationVerdict,
  type ControlObservation,
  type NavigationAuthorization,
} from '../application-navigation-policy.ts';
import { startSyntheticAts, type SyntheticAtsEffects, type SyntheticAtsHandle } from '../../../fixtures/application-navigation-ats/server.ts';

type ContractEntry = Pick<
  AdapterEvidence,
  'pageFingerprint' | 'controlId' | 'controlFingerprint' | 'enclosingFormAction' | 'enclosingFormMethod' | 'verifiedEffectClass' | 'evidenceRefs'
>;
type AdapterContract = {
  schema: string;
  adapterId: string;
  atsProvider: string;
  originBinding: string;
  scopeNote: string;
  evidence: ContractEntry[];
};

let ats: SyntheticAtsHandle;
let contract: AdapterContract;

test.beforeAll(async () => {
  ats = await startSyntheticAts();
  contract = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../fixtures/application-navigation-ats/adapter-contract.v1.json', import.meta.url)),
      'utf8',
    ),
  ) as AdapterContract;
});

test.afterAll(async () => {
  await ats.close();
});

async function effects(): Promise<SyntheticAtsEffects> {
  const response = await fetch(`${ats.origin}/__effects`);
  expect(response.ok).toBe(true);
  return (await response.json()) as SyntheticAtsEffects;
}

function authorization(overrides: Partial<NavigationAuthorization> = {}): NavigationAuthorization {
  const nowMs = Date.now();
  return {
    sessionId: 'session-fix1-synthetic',
    opportunityId: 'opp-fix1-synthetic',
    origin: ats.origin,
    navigationEnabled: true,
    allowedEffectClasses: ['LOCAL_STEP_ONLY', 'DRAFT_WRITE_AND_ADVANCE'],
    allowedDataCategories: ['synthetic_cover_note'],
    expiresAtUtc: new Date(nowMs + 3_600_000).toISOString(),
    ...overrides,
  };
}

async function observe(page: Page): Promise<ControlObservation> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const control = document.querySelector<HTMLElement>('[data-control-id]');
    if (!control) throw new Error('synthetic control not found on page');
    const form = control.closest('form');
    return {
      accessibleName: (control.textContent ?? '').trim(),
      htmlType: control.getAttribute('type'),
      tag: control.tagName.toLowerCase(),
      pageUrl: location.href,
      pageOrigin: location.origin,
      pageFingerprint: root.dataset.pageFp ?? '',
      controlId: control.dataset.controlId ?? '',
      controlFingerprint: control.dataset.controlFp ?? '',
      enclosingFormAction: form?.getAttribute('action') ?? null,
      enclosingFormMethod: form?.getAttribute('method') ?? null,
    };
  });
}

function evidenceFor(observation: ControlObservation): AdapterEvidence | null {
  const entry = contract.evidence.find(
    (candidate) =>
      candidate.pageFingerprint === observation.pageFingerprint &&
      candidate.controlId === observation.controlId,
  );
  if (!entry) return null;
  const nowMs = Date.now();
  return {
    ...entry,
    schema: contract.schema,
    adapterId: contract.adapterId,
    atsProvider: contract.atsProvider,
    origin: ats.origin,
    verifiedAtUtc: new Date(nowMs - 60_000).toISOString(),
    expiresAtUtc: new Date(nowMs + 3_600_000).toISOString(),
  };
}

async function classifyOn(page: Page, auth: NavigationAuthorization | null = authorization()) {
  const observation = await observe(page);
  const verdict = classifyNavigationAction(observation, evidenceFor(observation), auth, new Date());
  return { observation, verdict };
}

function trackTraffic(page: Page): { requests: string[]; responses: string[] } {
  const requests: string[] = [];
  const responses: string[] = [];
  page.on('request', (request) => {
    requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  page.on('response', (response) => {
    responses.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
  });
  return { requests, responses };
}

async function activateIfPermitted(page: Page, verdict: ClassificationVerdict): Promise<'activated' | 'suppressed'> {
  if (!verdict.automationPermitted) return 'suppressed';
  await page.locator('[data-control-id]').click();
  return 'activated';
}

async function settleWithMarker(page: Page, traffic: { requests: string[] }): Promise<void> {
  await page.evaluate(() => fetch('/__effects'));
  await expect.poll(() => traffic.requests.includes('GET /__effects'), { timeout: 5_000 }).toBe(true);
}

test('label invariance: every modeled page renders the identical visible Submit control', async ({ page }) => {
  const observedLabels: string[] = [];
  for (const path of ['/apply/step/1', '/apply/step/2', '/apply/step/3', '/spa/step/1', '/spa/step/2']) {
    await page.goto(ats.origin + path);
    const label = (await page.locator('[data-control-id]').textContent())?.trim();
    expect(label).toBe('Submit');
    observedLabels.push(label as string);
  }
  expect(new Set(observedLabels)).toEqual(new Set(['Submit']));
});

test('verified intermediate Submit advances natively and the server records the draft disclosure', async ({ page }) => {
  await page.goto(ats.origin + '/apply/step/1');
  const traffic = trackTraffic(page);
  const draftsBefore = (await effects()).nativeDrafts.length;

  const { observation, verdict } = await classifyOn(page);
  expect(observation.accessibleName).toBe('Submit');
  expect(observation.enclosingFormAction).toBe('/apply/step/1');
  expect(verdict.effectClass).toBe('DRAFT_WRITE_AND_ADVANCE');
  expect(verdict.confidence).toBe('verified');
  expect(verdict.automationPermitted).toBe(true);
  expect(verdict.evidenceRefs).toContain('escapehatch-synthetic-ats@1');

  expect(await activateIfPermitted(page, verdict)).toBe('activated');
  await page.waitForURL('**/apply/step/2');

  await expect
    .poll(() => traffic.responses.includes('303 POST /apply/step/1'), { timeout: 5_000 })
    .toBe(true);
  await expect
    .poll(async () => (await effects()).nativeDrafts.length, { timeout: 5_000 })
    .toBe(draftsBefore + 1);
  const draft = (await effects()).nativeDrafts.at(-1);
  expect(draft?.step).toBe('native-step-1');
  expect(draft?.fields).toEqual(expect.arrayContaining(['step_marker', 'note']));
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.dataset.pageFp), { timeout: 5_000 })
    .toBe('native-step-2');
});

test('draft disclosure without scoped data-category authorization fails closed before any request', async ({ page }) => {
  await page.goto(ats.origin + '/apply/step/1');
  const traffic = trackTraffic(page);
  const draftsBefore = (await effects()).nativeDrafts.length;
  const { verdict } = await classifyOn(page, authorization({ allowedDataCategories: [] }));
  expect(verdict.effectClass).toBe('DRAFT_WRITE_AND_ADVANCE');
  expect(verdict.automationPermitted).toBe(false);
  expect(verdict.blockers).toContain('draft_disclosure_data_categories_not_authorized');

  expect(await activateIfPermitted(page, verdict)).toBe('suppressed');
  await settleWithMarker(page, traffic);
  expect(traffic.requests.some((entry) => entry.startsWith('POST /apply/step/1'))).toBe(false);
  expect((await effects()).nativeDrafts.length).toBe(draftsBefore);
});

test('keyboard Enter is admitted on an intermediate step only after classification permits', async ({ page }) => {
  await page.goto(ats.origin + '/apply/step/2');
  const traffic = trackTraffic(page);
  const draftsBefore = (await effects()).nativeDrafts.length;

  const { verdict } = await classifyOn(page);
  expect(verdict.effectClass).toBe('DRAFT_WRITE_AND_ADVANCE');
  expect(verdict.automationPermitted).toBe(true);

  if (verdict.automationPermitted) await page.locator('input[name="note"]').press('Enter');
  await page.waitForURL('**/apply/step/3');

  await expect
    .poll(() => traffic.responses.includes('303 POST /apply/step/2'), { timeout: 5_000 })
    .toBe(true);
  await expect
    .poll(async () => (await effects()).nativeDrafts.length, { timeout: 5_000 })
    .toBe(draftsBefore + 1);
  expect((await effects()).nativeDrafts.at(-1)?.step).toBe('native-step-2');
  expect(page.url()).toContain('/apply/step/3');
});

test('identical Submit on the final page classifies TERMINAL and is suppressed under a maximal grant', async ({ page }) => {
  await page.goto(ats.origin + '/apply/step/3');
  const traffic = trackTraffic(page);
  const terminalsBefore = (await effects()).terminalCommits.length;

  const { observation, verdict } = await classifyOn(page);
  expect(observation.accessibleName).toBe('Submit');
  expect(observation.pageFingerprint).toBe('native-step-3');
  expect(verdict.effectClass).toBe('TERMINAL_APPLICATION_COMMIT');
  expect(verdict.confidence).toBe('verified');
  expect(verdict.automationPermitted).toBe(false);
  expect(verdict.requiresOperatorAction).toBe(true);
  expect(verdict.blockers).toContain('terminal_application_commit_is_operator_only');

  expect(await activateIfPermitted(page, verdict)).toBe('suppressed');
  await settleWithMarker(page, traffic);

  expect(traffic.requests.some((entry) => entry.startsWith('POST /apply/submit'))).toBe(false);
  expect(traffic.responses.some((entry) => entry.includes('POST /apply/submit'))).toBe(false);
  expect((await effects()).terminalCommits.length).toBe(terminalsBefore);
  expect(page.url()).toContain('/apply/step/3');
});

test('Next-labeled control that actually commits is classified by effect, not by label', async ({ page }) => {
  await page.goto(ats.origin + '/apply/decoy');
  const traffic = trackTraffic(page);
  const terminalsBefore = (await effects()).terminalCommits.length;

  const { observation, verdict } = await classifyOn(page);
  expect(observation.accessibleName).toBe('Next');
  expect(verdict.effectClass).toBe('TERMINAL_APPLICATION_COMMIT');
  expect(verdict.automationPermitted).toBe(false);
  expect(verdict.blockers).toContain('terminal_application_commit_is_operator_only');

  expect(await activateIfPermitted(page, verdict)).toBe('suppressed');
  await settleWithMarker(page, traffic);

  expect(traffic.requests.some((entry) => entry.startsWith('POST /apply/submit'))).toBe(false);
  expect((await effects()).terminalCommits.length).toBe(terminalsBefore);
  expect(page.url()).toContain('/apply/decoy');
});

test('endpoint drift without any text change fails closed to UNKNOWN and stays unsent', async ({ page }) => {
  await page.goto(ats.origin + '/apply/step/1?drift=1');
  const traffic = trackTraffic(page);
  const driftBefore = (await effects()).rejectedDriftPosts.length;

  const { observation, verdict } = await classifyOn(page);
  expect(observation.accessibleName).toBe('Submit');
  expect(observation.pageFingerprint).toBe('native-step-1');
  expect(observation.controlFingerprint).toBe('cta-native-step-1');
  expect(observation.enclosingFormAction).toBe('/apply/step/1-drifted');
  expect(verdict.effectClass).toBe('UNKNOWN_OR_COMPOSITE');
  expect(verdict.automationPermitted).toBe(false);
  expect(verdict.blockers).toContain('adapter_evidence_context_mismatch');

  expect(await activateIfPermitted(page, verdict)).toBe('suppressed');
  await settleWithMarker(page, traffic);

  expect(traffic.requests.some((entry) => entry.startsWith('POST /apply/step/1-drifted'))).toBe(false);
  expect((await effects()).rejectedDriftPosts.length).toBe(driftBefore);
  expect(page.url()).toContain('/apply/step/1?drift=1');
});

test('SPA route: verified intermediate Submit advances through the fetch path with a server-recorded effect', async ({ page }) => {
  await page.goto(ats.origin + '/spa/step/1');
  const traffic = trackTraffic(page);
  const advancesBefore = (await effects()).spaAdvances.length;

  const { observation, verdict } = await classifyOn(page);
  expect(observation.accessibleName).toBe('Submit');
  expect(observation.enclosingFormAction).toBeNull();
  expect(verdict.effectClass).toBe('DRAFT_WRITE_AND_ADVANCE');
  expect(verdict.automationPermitted).toBe(true);

  expect(await activateIfPermitted(page, verdict)).toBe('activated');
  await expect
    .poll(() => traffic.responses.includes('200 POST /api/spa/advance'), { timeout: 5_000 })
    .toBe(true);
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.dataset.pageFp), { timeout: 5_000 })
    .toBe('spa-step-2');
  expect(page.url()).toContain('/spa/step/2');
  await expect
    .poll(async () => (await effects()).spaAdvances.length, { timeout: 5_000 })
    .toBe(advancesBefore + 1);
});

test('SPA terminal handler classifies TERMINAL and never issues the commit fetch', async ({ page }) => {
  await page.goto(ats.origin + '/spa/step/2');
  const traffic = trackTraffic(page);
  const terminalsBefore = (await effects()).terminalCommits.length;

  const { observation, verdict } = await classifyOn(page);
  expect(observation.accessibleName).toBe('Submit');
  expect(verdict.effectClass).toBe('TERMINAL_APPLICATION_COMMIT');
  expect(verdict.automationPermitted).toBe(false);

  expect(await activateIfPermitted(page, verdict)).toBe('suppressed');
  await settleWithMarker(page, traffic);

  expect(traffic.requests.some((entry) => entry.startsWith('POST /apply/submit'))).toBe(false);
  expect((await effects()).terminalCommits.length).toBe(terminalsBefore);
});

test('page without adapter evidence fails closed to UNKNOWN and receives no traffic', async ({ page }) => {
  await page.goto(ats.origin + '/apply/unmodeled');
  const traffic = trackTraffic(page);

  const { observation, verdict } = await classifyOn(page);
  expect(observation.accessibleName).toBe('Submit');
  expect(verdict.effectClass).toBe('UNKNOWN_OR_COMPOSITE');
  expect(verdict.automationPermitted).toBe(false);
  expect(verdict.blockers).toContain('no_trusted_adapter_evidence');

  expect(await activateIfPermitted(page, verdict)).toBe('suppressed');
  await settleWithMarker(page, traffic);

  expect(traffic.requests.some((entry) => entry.startsWith('POST /apply/unmodeled/next'))).toBe(false);
  expect((await effects()).unmodeledPosts.length).toBe(0);
});

test('suite falsifier: zero terminal commits were recorded across the whole run', async () => {
  const observed = await effects();
  expect(observed.terminalCommits).toEqual([]);
  expect(observed.rejectedDriftPosts).toEqual([]);
  expect(observed.unmodeledPosts).toEqual([]);
});
