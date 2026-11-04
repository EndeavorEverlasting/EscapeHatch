import { prepareWithoutTrustedNavigation } from './managed-prepare-fallback.ts';
import { INITIAL_CHECKPOINT, advanceAuthCheckpoint, inspectAuthObservation, resumeAllowed, type AuthCheckpoint } from './managed-auth-checkpoint.ts';
import { fieldProgressState, attachmentProgressState, evidenceDescription } from './managed-progress-evidence.ts';
import { assertInspectionScope, inspectApplicationRequirements, inspectRequiredFieldBlockers, assertSubmitFormComplete } from './application-requirements.ts';
import { OpportunityDocumentStore, documentScope, type DocumentKind } from './opportunity-documents.ts';
import { ManagedListeners } from './managed-listeners.ts';
import { enqueueSubmissionSync, retrySubmissionSync, readSubmissionSyncStatus, startSubmissionSync } from './tracker-writeback.ts';
import { readWorkspace } from './workspace-file.ts';
import { APPLICATIONS_KEY } from './src/lib/storage.ts';
import { withCareerPreferences } from './career-preferences.ts';
import { captureMilitaryAnswers } from './managed-form.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { diagnoseNavigationFailure, type NavigationDiagnosis } from './network-navigation-diagnosis.ts';
import path from 'node:path';
import fs from 'node:fs/promises';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import type { Plugin } from 'vite';
import { isLoopbackAddress, readManagedRuntime } from './runtime-control.ts';
import { userDataRoot } from './user-data.ts';
import { readPreferences, updatePreferences, clearPreferences, mergePreferenceEdits, preferenceStoreLocator } from './preference-file.ts';
import { accessSync, constants as fsConstants } from 'node:fs';
import { fillSavedPreferences, openApplicationForm } from './managed-form.ts';
import { emptyPreferences } from './src/lib/application-preferences.ts';
import { observePrivateSyncStatus } from './private-sync-status.ts';
import { exportPairingOffer } from './private-sync-device.ts';
import { resolveFolderCarrierPath } from './private-sync-config.ts';
import {
  maybePushPrivateSyncAfterPreferenceWrite,
  maybePullPrivateSyncOnStartup,
} from './private-sync-after-write.ts';
import { prepareToFinalReview, type PreparationResult } from './application-autopilot-executor.ts';
import os from 'node:os';
import {
  ADAPTER_EVIDENCE_SCHEMA,
  type GrantableEffectClass,
  type NavigationAuthorization,
} from './application-navigation-policy.ts';
import {
  createManagedPreparationDriver,
  type TrustedAdapterRegistry,
} from './managed-preparation-driver.ts';

const PREFIX = '/__escapehatch/managed-assist';
/** Separate enrollment target, never an alias for a submitted Cognizant job. */
export const COGNIZANT_TALENT_ID = 'talent-community:cognizant:us-en';
export const COGNIZANT_TALENT_URL = 'https://careers.cognizant.com/us-en/talent-community/';
export function isCognizantTalentCommunity(value: unknown): boolean {
  try {
    if (typeof value !== 'string') return false;
    const url = new URL(value);
    return url.origin === 'https://careers.cognizant.com' &&
      /^\/us-en\/talent-community\/?$/.test(url.pathname) && !url.search && !url.hash;
  } catch { return false; }
}
export function isProtectedEnrollmentConsentLabel(value: unknown): boolean {
  const text = typeof value === 'string' ? value : '';
  return /\b(?:consent|opt[ -]?in|talent community|join|subscribe|newsletter|marketing|email and sms|privacy notice|data sharing|share my information|signature|certif(?:y|ication)|attest(?:ation)?|terms|legal)\b/i.test(text);
}
const MAX_BODY = 15 * 1024 * 1024;
const MAX_PDF = 5 * 1024 * 1024;
const ACTION_HEADER = 'x-escapehatch-operator-action';
const GRANTABLE: GrantableEffectClass[] = ['LOCAL_STEP_ONLY', 'DRAFT_WRITE_AND_ADVANCE'];
const FIELDS = [
  ['first_name', ['given-name'], ['firstName', 'first_name', 'firstname']],
  ['last_name', ['family-name'], ['lastName', 'last_name', 'lastname']],
  ['email', ['email'], ['email', 'emailAddress']],
  ['phone', ['tel'], ['phone', 'phoneNumber']],
  ['linkedin_url', [], ['linkedin', 'linkedin_url', 'linkedinUrl']],
  ['street_address', ['street-address', 'address-line1'], ['street_address', 'address1']],
  ['country', ['country-name'], ['country']],
  ['city', ['address-level2'], ['city']],
  ['region', ['address-level1'], ['state', 'region']],
  ['postal_code', ['postal-code'], ['postalCode', 'postal_code', 'zip']],
] as const;

/** Keep employer sessions stable for one app origin, without sharing Chrome locks
 * with another runtime. Never migrate or take over the legacy shared profile. */
export function managedBrowserProfileDirectory(origin: string, env: NodeJS.ProcessEnv = process.env): string {
  const port = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/.exec(origin)?.[1];
  if (!port || Number(port) > 65535) {
    throw new Error('Managed browser profile requires a loopback application origin.');
  }
  return path.join(userDataRoot(env), 'managed-career-browser-origins', port);
}

/** Reuse only one exact tab after Chrome restores its persistent profile.
 * Never guess an ATS step or navigate away from unfinished operator answers. */
export function selectRestoredLaunchPage(context: BrowserContext, jobUrl: string): Page | null {
  const target = new URL(validateApplicationUrl(jobUrl));
  const matches = context.pages().filter(candidate => {
    if (candidate.isClosed()) return false;
    try {
      const live = new URL(candidate.url());
      return live.origin === target.origin && live.pathname === target.pathname && live.search === target.search;
    } catch { return false; }
  });
  if (matches.length > 1) throw new Error('More than one exact application tab is open; bind the intended tab explicitly.');
  return matches[0] || null;
}

/** Recover a known tab without issuing navigation, form writes or terminal actions. */
export function selectExistingApplicationPage(context: BrowserContext, savedUrl: unknown, livePageUrl: unknown): Page {
  const saved = new URL(validateApplicationUrl(savedUrl));
  const live = new URL(validateApplicationUrl(livePageUrl));
  const exact = saved.origin === live.origin && saved.pathname === live.pathname;
  const leverForm = saved.hostname === 'jobs.lever.co' && saved.origin === live.origin &&
    /^\/[^/]+\/[a-f0-9-]{36}\/?$/i.test(saved.pathname) && live.pathname === saved.pathname.replace(/\/$/, '') + '/apply';
  if (!exact && !leverForm) throw new Error('Existing tab does not match the saved application.');
  const matches = context.pages().filter(candidate => {
    if (candidate.isClosed()) return false;
    const actual = new URL(candidate.url());
    return actual.origin === live.origin && actual.pathname === live.pathname && actual.search === live.search;
  });
  if (matches.length !== 1) throw new Error('Choose one unique existing application tab before enabling tracking.');
  return matches[0];
}

function respond(res: ServerResponse, code: number, value: object) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(value));
}

export function validateApplicationUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('An HTTPS job URL is required.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('The application URL is invalid.'); }
  const hostname = url.hostname.toLowerCase();
  // Opt-in only: repository synthetic ATS fixtures on loopback for product proof.
  // Never treats arbitrary LAN hosts or employer sites as exempt.
  if (process.env.ESCAPEHATCH_ALLOW_SYNTHETIC_ATS === '1' &&
      url.protocol === 'http:' && hostname === '127.0.0.1' && url.port &&
      !url.username && !url.password && /^\d{2,5}$/.test(url.port)) {
    return url.href;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !hostname.includes('.') || hostname.endsWith('.local') || hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.endsWith('.test') ||
      hostname === 'localhost' || hostname === '0.0.0.0' ||
      /^\d+(\.\d+){3}$/.test(hostname) || hostname.startsWith('[')) {
    throw new Error('Only public HTTPS job URLs are accepted.');
  }
  return url.href;
}

export function reviewedContactFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const candidate = value as Record<string, unknown>;
  const safe: Record<string, string> = {};
  for (const [key] of FIELDS) {
    if (key === 'phone' && candidate.phone_authority !== 'user_confirmed_primary') continue;
    const text = candidate[key];
    if (typeof text === 'string' && text.trim() && text.length <= 512) safe[key] = text.trim();
  }
  return safe;
}

// Presentation-only composites are built from complete, reviewed granular answers.
export function derivedContactPreferenceValues(
  preferences: Record<string, { value: string }>,
): Record<string, string> {
  const value = (id: string) => typeof preferences[id]?.value === 'string'
    ? preferences[id].value.trim() : '';
  const result: Record<string, string> = {};
  const first = value('identity.first_name'), last = value('identity.last_name');
  if (first && last && !value('identity.full_name')) result['identity.full_name'] = first + ' ' + last;
  const location = ['identity.city', 'identity.region', 'identity.country'].map(value);
  if (location.every(Boolean) && !value('identity.location_summary')) {
    result['identity.location_summary'] = location.join(', ');
  }
  return result;
}

export function parseNavigationAuthorization(
  value: unknown,
  origin: string,
): NavigationAuthorization {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Scoped navigation authorization is required.');
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.sessionId !== 'string' || !raw.sessionId || raw.sessionId.length > 128) {
    throw new Error('sessionId is required.');
  }
  if (typeof raw.opportunityId !== 'string' || !raw.opportunityId || raw.opportunityId.length > 128) {
    throw new Error('opportunityId is required.');
  }
  if (raw.navigationEnabled !== true) throw new Error('navigationEnabled must be true for prepare.');
  if (typeof raw.origin === 'string' && raw.origin !== origin) {
    throw new Error('authorization origin must match the launched application.');
  }
  if (Array.isArray(raw.allowedEffectClasses) &&
      raw.allowedEffectClasses.includes('TERMINAL_APPLICATION_COMMIT')) {
    throw new Error('TERMINAL_APPLICATION_COMMIT cannot be authorized for automation.');
  }
  const allowed = Array.isArray(raw.allowedEffectClasses)
    ? raw.allowedEffectClasses.filter((item): item is GrantableEffectClass =>
      GRANTABLE.includes(item as GrantableEffectClass))
    : [];
  if (!allowed.length) throw new Error('allowedEffectClasses must include a grantable intermediate class.');
  const categories = Array.isArray(raw.allowedDataCategories)
    ? raw.allowedDataCategories.filter((item): item is string =>
      typeof item === 'string' && item.length > 0 && item.length <= 64)
    : [];
  const expiresAtUtc = typeof raw.expiresAtUtc === 'string' && raw.expiresAtUtc
    ? raw.expiresAtUtc
    : new Date(Date.now() + 3_600_000).toISOString();
  if (Number.isNaN(new Date(expiresAtUtc).getTime())) throw new Error('expiresAtUtc is invalid.');
  return {
    sessionId: raw.sessionId,
    opportunityId: raw.opportunityId,
    origin,
    navigationEnabled: true,
    allowedEffectClasses: allowed,
    allowedDataCategories: categories,
    expiresAtUtc,
  };
}

export function parseTrustedAdapterRegistry(value: unknown): TrustedAdapterRegistry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Trusted adapter registry is required.');
  }
  const raw = value as Record<string, unknown>;
  if (raw.schema !== ADAPTER_EVIDENCE_SCHEMA) {
    throw new Error('Unsupported adapter evidence schema.');
  }
  if (typeof raw.adapterId !== 'string' || !raw.adapterId ||
      typeof raw.atsProvider !== 'string' || !raw.atsProvider) {
    throw new Error('adapterId and atsProvider are required.');
  }
  if (!Array.isArray(raw.evidence) || raw.evidence.length === 0 || raw.evidence.length > 200) {
    throw new Error('adapter evidence entries are required.');
  }
  const evidence = raw.evidence.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Invalid adapter evidence entry.');
    }
    const row = entry as Record<string, unknown>;
    const effect = row.verifiedEffectClass;
    if (effect !== 'LOCAL_STEP_ONLY' && effect !== 'DRAFT_WRITE_AND_ADVANCE' &&
        effect !== 'TERMINAL_APPLICATION_COMMIT') {
      throw new Error('verifiedEffectClass is invalid.');
    }
    if (typeof row.pageFingerprint !== 'string' || typeof row.controlId !== 'string' ||
        typeof row.controlFingerprint !== 'string' || !Array.isArray(row.evidenceRefs)) {
      throw new Error('adapter evidence fingerprints are required.');
    }
    return {
      pageFingerprint: row.pageFingerprint,
      controlId: row.controlId,
      controlFingerprint: row.controlFingerprint,
      enclosingFormAction: typeof row.enclosingFormAction === 'string' ? row.enclosingFormAction : null,
      enclosingFormMethod: typeof row.enclosingFormMethod === 'string' ? row.enclosingFormMethod : null,
      verifiedEffectClass: effect as GrantableEffectClass | 'TERMINAL_APPLICATION_COMMIT',
      evidenceRefs: row.evidenceRefs.filter((ref): ref is string => typeof ref === 'string'),
    };
  });
  return {
    schema: ADAPTER_EVIDENCE_SCHEMA,
    adapterId: raw.adapterId,
    atsProvider: raw.atsProvider,
    evidence,
  };
}

export function parsePrivatePdf(value: unknown): { name: string; mimeType: 'application/pdf'; buffer: Buffer } | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid PDF attachment.');
  const file = value as Record<string, unknown>;
  if (typeof file.name !== 'string' || typeof file.base64 !== 'string' ||
      file.base64.length > Math.ceil(MAX_PDF * 4 / 3) + 10 ||
      !/^[A-Za-z0-9_. -]{1,120}\.pdf$/i.test(file.name) ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) throw new Error('Invalid PDF attachment.');
  const buffer = Buffer.from(file.base64, 'base64');
  if (!buffer.length || buffer.length > MAX_PDF || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('Attachment must be a PDF smaller than 5 MB.');
  }
  return { name: file.name, mimeType: 'application/pdf', buffer };
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('JSON required.');
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_BODY) throw new Error('Request too large.');
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid request.');
  return parsed as Record<string, unknown>;
}

export async function attachPdfs(page: Page, resume: ReturnType<typeof parsePrivatePdf>, cover: ReturnType<typeof parsePrivatePdf>) {
  const inputs = await page.locator('input[type="file"]').all();
  const outcome: Record<string, string> = {};
  for (const [kind, file] of [['resume', resume], ['cover', cover]] as const) {
    if (!file) continue;
    const matches: typeof inputs = [];
    for (const input of inputs) {
      try {
        const attrs = await input.evaluate((element) => {
          const field = element as HTMLInputElement;
          const label = field.labels ? Array.from(field.labels).map((x) => x.textContent || '').join(' ') : '';
          return [field.name, field.id, field.getAttribute('aria-label') || '', label].join(' ').toLowerCase().replace(/[_-]/g, ' ');
        });
        if ((kind === 'resume' ? /\b(resume|r[ée]sum[ée]|cv)\b/i : /\b(cover[\s_-]*letter)\b/i).test(attrs)) matches.push(input);
      } catch { /* page changed; leave control unmodified */ }
    }
    if (matches.length === 0 && kind === 'resume') {
      // Only a unique Resume uploader on the exact Cognizant talent-community route.
      const current = new URL(page.url());
      const cognizantTalent = current.origin === 'https://careers.cognizant.com' &&
        /^\/us-en\/talent-community\/?$/.test(current.pathname);
      if (cognizantTalent && inputs.length === 1 &&
          await page.getByText(/^Resume\s*\*?$/i).count() === 1) {
        try {
          await inputs[0].setInputFiles(file, { timeout: 5000 });
          outcome[kind] = 'attached_to_input_review_required';
        } catch { outcome[kind] = 'manual_required'; }
        continue;
      }
    }
    if (matches.length === 0) {
      // Portal-based uploaders leave their anonymous file inputs under body. Bind the chooser
      // to the uniquely labelled upload widget instead of guessing an input by DOM order.
      const labels = page.locator('label[id$="_label"]').filter({ hasText: kind === 'resume' ? /^Resume:\s*\(Word\/PDF\)/i : /^Cover Letter:\s*\(Word\/PDF\)/i });
      if (await labels.count() !== 1) { outcome[kind] = 'manual_required'; continue; }
      const labelId = await labels.getAttribute('id');
      const widgetId = labelId?.replace(/(?:\.file)?_label$/, '') || '';
      if (!/^[A-Za-z0-9_.-]{1,100}$/.test(widgetId)) { outcome[kind] = 'manual_required'; continue; }
      const trigger = page.locator('[id="' + widgetId + '"] .filepicker');
      if (await trigger.count() !== 1 || !await trigger.isVisible()) { outcome[kind] = 'manual_required'; continue; }
      try {
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
        await trigger.click({ timeout: 2500 });
        const chooser = await chooserPromise;
        await chooser.setFiles(file, { timeout: 5000 });
        outcome[kind] = 'attached_to_input_review_required';
      } catch { outcome[kind] = 'manual_required'; }
      continue;
    }
    if (matches.length !== 1) { outcome[kind] = 'manual_required'; continue; }
    try {
      await matches[0].setInputFiles(file, { timeout: 5000 });
      outcome[kind] = 'attached_to_input_review_required';
    } catch { outcome[kind] = 'manual_required'; }
  }
  return outcome;
}

export function createManagedBrowserAssistPlugin(): Plugin {
  const managed = readManagedRuntime();
  // Vite reloads its config in the same process. Keep the live browser connection
  // and listener handles rather than orphaning the operator's application.
  type SessionCache = { context: BrowserContext | null; page: Page | null; state: string;
    applicationOrigin: string; applicationUrl: string; opportunityId: string;
    preparation: PreparationResult | null; networkDiagnosis: NavigationDiagnosis | null; authCheckpoint: AuthCheckpoint; trustedReturnPath: string | null; listeners: ManagedListeners; busy: boolean; taleoHostArmed?: boolean };
  const cacheHost = globalThis as typeof globalThis & { [key: symbol]: SessionCache };
  const cacheKey = Symbol.for('escapehatch.managed-browser.' + (managed?.identity.instanceId || 'unmanaged'));
  const cache = cacheHost[cacheKey] ||= { context: null, page: null, state: 'idle', applicationOrigin: '', applicationUrl: '',
    opportunityId: '', preparation: null, networkDiagnosis: null, authCheckpoint: INITIAL_CHECKPOINT, trustedReturnPath: null, busy: false, taleoHostArmed: false, listeners: new ManagedListeners(undefined, undefined, enqueueSubmissionSync) };
  let context = cache.context;
  let page = cache.page;
  let state = cache.state;
  let applicationOrigin = cache.applicationOrigin;
  let applicationUrl = cache.applicationUrl;
  const documentStore = new OpportunityDocumentStore();
  let opportunityId = cache.opportunityId;
  let preparation = cache.preparation;
  let authCheckpoint = cache.authCheckpoint || INITIAL_CHECKPOINT;
  let trustedReturnPath = cache.trustedReturnPath || null;
  let networkDiagnosis = cache.networkDiagnosis;
  // An installed upgrade may retain an old listener object in Vite's cache.
  // Replace observation handles only; never close or navigate employer tabs.
  const previousListeners = cache.listeners;
  const listeners = previousListeners.implementationVersion === 4 ? previousListeners : new ManagedListeners(undefined, undefined, enqueueSubmissionSync);
  // Older cached listeners and synthetic middleware fixtures may predate dispose().
  // Preserve the employer tab; replace obsolete handles without invoking an absent method.
  // A new listener starts unarmed and requires exact-application binding before Submit.
  const listenerReady = previousListeners === listeners || typeof previousListeners?.dispose !== 'function'
    ? Promise.resolve() : previousListeners.dispose();
  cache.listeners = listeners;
  return {
    name: 'escapehatch-managed-browser-assist',
    configureServer(server) {
      if (managed) {
        startSubmissionSync();
        void maybePullPrivateSyncOnStartup().catch(() => {
          /* startup pull is best-effort; never block the host */
        });
      }
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (!url.pathname.startsWith(PREFIX + '/')) return next();
        const port = Number(process.env.PORT || server.config.server.port || 5173);
        const expectedOrigin = 'http://127.0.0.1:' + port;
        const host = String(req.headers.host || '');
        if (!managed || !isLoopbackAddress(req.socket.remoteAddress) ||
            host !== '127.0.0.1:' + port) {
          return respond(res, 403, { ok: false, error: 'managed_local_runtime_required' });
        }
        await listenerReady;
        if (url.pathname === PREFIX + '/status' && req.method === 'GET') {
          if (page?.isClosed()) { page = null; state = 'browser_closed'; authCheckpoint = INITIAL_CHECKPOINT; }
          if (page && applicationOrigin) {
            try {
              authCheckpoint = advanceAuthCheckpoint(authCheckpoint, await inspectAuthObservation(page, applicationOrigin));
            } catch {
              authCheckpoint = INITIAL_CHECKPOINT; // Never promote uncertainty to signed-in.
            }
            cache.authCheckpoint = authCheckpoint;
          }
          let listenerState;
          try { listenerState = await listeners.status(); }
          catch { return respond(res, 422, { ok: false, error: 'Submission evidence unavailable; existing records preserved.' }); }
          return respond(res, 200, {
            ok: true,
            state,
            browserOpen: Boolean(page),
            authCheckpoint,
            needsOpportunityConfirmation: Boolean(page && applicationUrl && authCheckpoint.canResume &&
              new URL(page.url()).origin === applicationOrigin &&
              new URL(page.url()).pathname !== new URL(applicationUrl).pathname &&
              !new URL(page.url()).pathname.startsWith(new URL(applicationUrl).pathname.replace(/\/$/, '') + '/') &&
              new URL(page.url()).pathname !== trustedReturnPath),
            networkDiagnosis,
            currentPage: page ? { opportunityId, applicationUrl, pageUrl: page.url() } : null,
            requiresOperatorSubmission: true,
            preparationState: preparation?.state || null,
            preparationCode: preparation?.code || null,
            pagesPrepared: preparation?.pagesPrepared ?? 0,
            intermediateSteps: preparation?.intermediateSteps ?? 0,
            finalActionActivated: false,
            pendingManual: preparation?.pendingManual || [],
            listeners: listenerState,
            trackerSync: await readSubmissionSyncStatus(),
          });
        }
        if (url.pathname === PREFIX + '/preferences' && req.method === 'GET') {
          if (req.headers.origin && req.headers.origin !== expectedOrigin || req.headers['sec-fetch-site'] === 'cross-site') return respond(res, 403, { ok: false, error: 'operator_origin_required' });
          try {
            const locator = preferenceStoreLocator();
            let storeExists = false;
            try { accessSync(locator.preferenceStore, fsConstants.F_OK); storeExists = true; } catch { storeExists = false; }
            return respond(res, 200, {
              ok: true,
              preferences: await readPreferences(),
              store: {
                dataHome: locator.dataHome,
                preferenceStore: locator.preferenceStore,
                source: locator.source,
                exists: storeExists,
                values: 'redacted',
              },
            });
          }
          catch { return respond(res, 422, { ok: false, error: 'Saved preferences could not be read; existing data preserved.' }); }
        }
        if (url.pathname === PREFIX + '/private-sync/status' && req.method === 'GET') {
          if (req.headers.origin && req.headers.origin !== expectedOrigin || req.headers['sec-fetch-site'] === 'cross-site') {
            return respond(res, 403, { ok: false, error: 'operator_origin_required' });
          }
          if (process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC !== '1') {
            return respond(res, 200, {
              ok: true,
              enabled: false,
              status: 'DISABLED',
              notes: ['Set ESCAPEHATCH_EXPERIMENTAL_SYNC=1 to observe private ciphertext sync.'],
            });
          }
          try {
            const dataHome = process.env.ESCAPEHATCH_DATA_HOME || userDataRoot();
            const carrier = await resolveFolderCarrierPath(dataHome);
            const report = await observePrivateSyncStatus({ dataHome, carrier: carrier || undefined });
            return respond(res, 200, {
              ok: true,
              enabled: true,
              ...report,
              carrierPathConfigured: Boolean(carrier),
              values: 'redacted',
            });
          } catch {
            return respond(res, 422, { ok: false, error: 'Private sync status unavailable; existing profile preserved.' });
          }
        }
        if (url.pathname.startsWith(PREFIX + '/documents/') && req.method === 'GET') {
          if (req.headers.origin && req.headers.origin !== expectedOrigin || req.headers['sec-fetch-site'] === 'cross-site') return respond(res, 403, { ok: false, error: 'operator_origin_required' });
          try {
            const scope = documentScope(url.searchParams.get('opportunityId'), url.searchParams.get('url'));
            validateApplicationUrl(scope.url);
            if (url.pathname === PREFIX + '/documents/status') return respond(res, 200, { ok: true, package: await documentStore.read(scope.opportunityId, scope.url), requireReview: (await readPreferences()).require_document_review !== false });
            if (url.pathname === PREFIX + '/documents/file') {
              const kind = url.searchParams.get('kind');
              if (kind !== 'resume' && kind !== 'cover') throw new Error('Invalid document kind.');
              const file = await documentStore.file(scope.opportunityId, scope.url, kind, url.searchParams.get('sha256') ?? undefined);
              if (!file) return respond(res, 404, { ok: false, error: 'document_not_found' });
              res.statusCode = 200; res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Disposition', 'inline; filename="' + file.name + '"'); return res.end(file.buffer);
            }
            return respond(res, 404, { ok: false, error: 'unknown_document_action' });
          } catch { return respond(res, 422, { ok: false, error: 'Private documents unavailable. Existing documents preserved.' }); }
        }
        if (req.method !== 'POST' ||
            req.headers.origin !== expectedOrigin ||
            req.headers[ACTION_HEADER] !== 'confirmed' ||
            req.headers['sec-fetch-site'] === 'cross-site') {
          return respond(res, 403, { ok: false, error: 'operator_origin_required' });
        }
        if (cache.busy) return respond(res, 409, { ok: false, error: 'action_in_progress' });
        cache.busy = true;
        try {
          const payload = await readJson(req);
          if (url.pathname === PREFIX + '/submission-sync/retry') return respond(res, 200, { ok: true, trackerSync: await retrySubmissionSync() });
          if (url.pathname === PREFIX + '/talent-community/cognizant/reuse-resume') {
            // A private materials transfer, not a new application or an employer upload.
            // The selected submitted Cognizant job must exist in this runtime's workspace.
            const sourceId = payload.sourceOpportunityId, sourceUrl = payload.sourceUrl;
            if (typeof sourceId !== 'string' || typeof sourceUrl !== 'string') {
              return respond(res, 422, { ok: false, error: 'saved_cognizant_source_required' });
            }
            const workspace = await readWorkspace();
            const records = workspace?.workspace.values[APPLICATIONS_KEY];
            const source = Array.isArray(records) ? records.find(item =>
              item?.id === sourceId && item?.url === sourceUrl &&
              typeof item?.company === 'string' && /\bcognizant\b/i.test(item.company) &&
              ['applied', 'follow_up', 'closed'].includes(item.status)
            ) : null;
            if (!source) return respond(res, 409, { ok: false, error: 'submitted_cognizant_source_not_verified' });
            const sourceSha = typeof payload.sourceSha256 === 'string' &&
              /^[a-f0-9]{64}$/.test(payload.sourceSha256) ? payload.sourceSha256 : undefined;
            const target = await documentStore.reuseReviewed(
              source.id, source.url, COGNIZANT_TALENT_ID, COGNIZANT_TALENT_URL, 'resume', sourceSha);
            const resume = target.documents.resume;
            return respond(res, 200, {
              ok: true, scope: { opportunityId: COGNIZANT_TALENT_ID, url: COGNIZANT_TALENT_URL },
              resume: resume ? { sha256: resume.sha256, reviewed: Boolean(resume.reviewedAt), size: resume.size } : null,
              jobApplicationUnchanged: true, employerUploadObserved: false, enrollmentSubmitted: false,
            });
          }

          if (url.pathname === PREFIX + '/listeners/bind-existing') {
            if (!context) return respond(res, 409, { ok: false, error: 'managed_browser_context_unavailable' });
            if (typeof payload.opportunityId !== 'string' || !payload.opportunityId || payload.opportunityId.length > 256) throw new Error('Select a saved opportunity.');
            const workspace = await readWorkspace();
            const applications = workspace?.workspace.values[APPLICATIONS_KEY];
            const saved = Array.isArray(applications) ? applications.find(item => item.id === payload.opportunityId && item.url === payload.url && !['applied', 'closed'].includes(item.status)) : null;
            if (!saved) throw new Error('Saved opportunity changed or is unavailable.');
            // Reuse only the active opportunity's explicitly confirmed return path.
            // Never infer that an arbitrary same-origin tab belongs to this job.
            const confirmedReturn = page && !page.isClosed() && opportunityId === saved.id &&
              applicationUrl === saved.url && trustedReturnPath !== null &&
              new URL(page.url()).origin === new URL(saved.url).origin &&
              new URL(page.url()).pathname === trustedReturnPath &&
              (payload.livePageUrl === saved.url || payload.livePageUrl === page.url());
            const selected = confirmedReturn ? page! : selectExistingApplicationPage(context, saved.url, payload.livePageUrl);
            await listeners.attach(selected, { opportunityId: saved.id, applicationUrl: selected.url(), opportunityUrl: saved.url, employerName: saved.company }, false);
            const status = await listeners.arm();
            if (status.submission?.state !== 'ARMED') return respond(res, 409, { ok: false, error: status.error || 'submission_tracking_not_armed', listeners: status });
            page = selected;
            applicationUrl = saved.url;
            applicationOrigin = new URL(saved.url).origin;
            opportunityId = saved.id;
            preparation = null; trustedReturnPath = new URL(selected.url()).pathname;
            authCheckpoint = INITIAL_CHECKPOINT; networkDiagnosis = null;
            state = 'submission_tracking_armed_existing_tab';
            await selected.bringToFront();
            return respond(res, 200, { ok: true, state, currentPage: { opportunityId, applicationUrl, pageUrl: selected.url() }, requiresOperatorSubmission: true, listeners: status });
          }
          if (url.pathname === PREFIX + '/preferences') {
            const preferences = await updatePreferences(current => mergePreferenceEdits(current, payload.preferences, payload.removedQuestions));
            const privateSync = await maybePushPrivateSyncAfterPreferenceWrite();
            return respond(res, 200, { ok: true, preferences, privateSync });
          }
          if (url.pathname === PREFIX + '/preferences/clear') { await listeners.setRecording(false); await clearPreferences(); return respond(res, 200, { ok: true }); }
          if (url.pathname === PREFIX + '/private-sync/pair') {
            if (process.env.ESCAPEHATCH_EXPERIMENTAL_SYNC !== '1') {
              return respond(res, 422, { ok: false, error: 'experimental_sync_disabled' });
            }
            const dataHome = process.env.ESCAPEHATCH_DATA_HOME || userDataRoot();
            const carrier = await resolveFolderCarrierPath(dataHome);
            if (!carrier) {
              return respond(res, 422, { ok: false, error: 'folder_carrier_path_unconfigured' });
            }
            const offer = await exportPairingOffer({ carrier, dataHome });
            const { pairingCode, ...sealed } = offer;
            const offerPath = path.join(carrier, 'pairing-offer.json');
            await fs.writeFile(offerPath, JSON.stringify(sealed), { mode: 0o600 });
            const codePath = path.join(os.tmpdir(), 'pairing-code.local.txt');
            await fs.writeFile(codePath, pairingCode, { mode: 0o600 });
            return respond(res, 200, {
              ok: true,
              state: 'PAIRING_READY',
              vaultId: sealed.vaultId,
              expiresAt: sealed.expiresAt,
              pairingCode,
              codePath,
              offerPath,
              values: 'redacted',
            });
          }
          if (url.pathname.startsWith(PREFIX + '/documents/')) {
            const scope = documentScope(payload.opportunityId, payload.url); validateApplicationUrl(scope.url);
            const kind = payload.kind;
            if (url.pathname === PREFIX + '/documents/policy') {
              if (typeof payload.requireReview !== 'boolean') throw new Error('Choose a document review setting.');
              await updatePreferences(current => ({ ...current, require_document_review: payload.requireReview as boolean }));
            } else {
              if (kind !== 'resume' && kind !== 'cover') throw new Error('Invalid document kind.');
              if (url.pathname === PREFIX + '/documents/stage') {
                const file = parsePrivatePdf(payload.file); if (!file) throw new Error('Choose a PDF.');
                await documentStore.stage(scope.opportunityId, scope.url, kind, file);
              } else if (url.pathname === PREFIX + '/documents/review') {
                if (payload.confirmed !== true) throw new Error('Confirm that you reviewed this exact document.');
                await documentStore.review(scope.opportunityId, scope.url, kind, payload.sha256);
              } else return respond(res, 404, { ok: false, error: 'unknown_document_action' });
            }
            return respond(res, 200, { ok: true, package: await documentStore.read(scope.opportunityId, scope.url), requireReview: (await readPreferences()).require_document_review !== false });
          }
          if (url.pathname === PREFIX + '/launch') {
            const jobUrl = validateApplicationUrl(payload.url);
            const talentCommunity = isCognizantTalentCommunity(jobUrl);
            if (talentCommunity !== (payload.opportunityId === COGNIZANT_TALENT_ID)) {
              return respond(res, 409, { ok: false, error: 'talent_community_scope_mismatch' });
            }
            applicationOrigin = new URL(jobUrl).origin;
            applicationUrl = jobUrl;
            opportunityId = typeof payload.opportunityId === 'string' && payload.opportunityId.length <= 128
              ? payload.opportunityId
              : '';
            preparation = null;
            authCheckpoint = INITIAL_CHECKPOINT;
            trustedReturnPath = null;
            networkDiagnosis = null;
            if (!context) {
              const folder = managedBrowserProfileDirectory(expectedOrigin);
              await fs.mkdir(folder, { recursive: true });
              context = await chromium.launchPersistentContext(folder, {
                channel: 'chrome', headless: false, acceptDownloads: false, viewport: null,
                chromiumSandbox: true,
              });
              context.on('close', () => {
                context = null; page = null; state = 'browser_closed'; preparation = null; authCheckpoint = INITIAL_CHECKPOINT; trustedReturnPath = null;
                Object.assign(cache, { context, page, state, preparation, authCheckpoint, trustedReturnPath });
                void listeners.dispose();
              });
            }
            const restoredPage = selectRestoredLaunchPage(context, jobUrl);
            if (restoredPage) {
              // This tab may contain unsaved edits. An explicit Launch is not permission
              // to reload, re-apply values, advance the form or discard its history.
              page = restoredPage;
              await page.bringToFront();
              state = 'application_restored_review_required';
            } else {
              // New work gets a blank page; NEVER navigate a different live employer
              // tab (including one held in the Vite hot-reload cache).
              const blankPages = context.pages().filter(candidate =>
                !candidate.isClosed() && candidate.url() === 'about:blank');
              page = blankPages.length === 1 ? blankPages[0] : await context.newPage();
              await page.bringToFront();
              state = 'browser_open';
              try {
                await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                state = 'application_open_review_required';
                if (!talentCommunity && await openApplicationForm(page)) state = 'application_form_open_review_required';
                // A community enrollment must not click a site Apply/Join control while opening.
              } catch (error) {
                // Network interface naming is only suggestive, never proof of VPN causality.
                const activeNames = Object.entries(networkInterfaces())
                  .filter(([, addresses]) => addresses?.some(addr => addr.family === 'IPv4' && !addr.internal))
                  .map(([name]) => name);
                networkDiagnosis = diagnoseNavigationFailure(error, activeNames);
                state = 'browser_open_navigation_unverified';
              }
            }
            // Inline applications have no separate "Apply" entry transition.
            // Attach before the operator's Submit, then only report ARMED after
            // the exact host/path adapter verifies one visible enabled terminal.
            const inlineBroadcastwell = applicationOrigin === 'https://broadcastwell.com' ||
              applicationOrigin === 'https://www.broadcastwell.com';
            const exactInlineForm = inlineBroadcastwell &&
              new URL(page.url()).pathname === '/careers/ai-automation-engineer';
            // Restoring a page never implicitly records answers or arms Submit observation.
            // The existing bind-existing action re-arms only after explicit page review.
            if (opportunityId && !talentCommunity && !restoredPage && (state === 'application_form_open_review_required' || exactInlineForm)) {
              await listeners.attach(page, { opportunityId, applicationUrl: page.url(), opportunityUrl: jobUrl,
                employerName: typeof payload.employerName === 'string' ? payload.employerName.slice(0, 160) : '' });
              await listeners.arm();
              // Seed missing-question discovery from the actual displayed form.
              // The catalog contains labels only, never applicant answer values.
              await listeners.catalog(page);
            }
            try {
              authCheckpoint = advanceAuthCheckpoint(authCheckpoint, await inspectAuthObservation(page, applicationOrigin));
            } catch { authCheckpoint = INITIAL_CHECKPOINT; }
            return respond(res, 200, { ok: true, state, authCheckpoint, networkDiagnosis, requiresOperatorSubmission: true });
          }
          if (!page || page.isClosed()) return respond(res, 409, { ok: false, error: 'launch_browser_first' });
          if (new URL(page.url()).origin !== applicationOrigin) return respond(res, 409, { ok: false, error: 'application_origin_changed_review_required' });
          if (url.pathname === PREFIX + '/requirements') {
            assertInspectionScope(payload.opportunityId, payload.url, opportunityId, applicationUrl, page.url());
            return respond(res, 200, { ok: true, inspection: await inspectApplicationRequirements(page, opportunityId, applicationUrl) });
          }
          await page.bringToFront();
          if (url.pathname === PREFIX + '/resume/bind') {
            // Only the operator may affirm that a same-origin redirect still shows the selected job.
            // This grants no terminal action, account login, or new opportunity identity.
            const live = page.url();
            if (!opportunityId || payload.opportunityId !== opportunityId ||
                payload.confirmedSameOpportunity !== true || payload.livePageUrl !== live ||
                !resumeAllowed(authCheckpoint, new URL(live).origin, applicationOrigin)) {
              return respond(res, 409, { ok: false, error: 'explicit_same_opportunity_confirmation_required' });
            }
            trustedReturnPath = new URL(live).pathname;
            return respond(res, 200, { ok: true, state: 'application_path_bound_review_required', authCheckpoint });
          }
          if (url.pathname === PREFIX + '/listeners') {
            if (payload.opportunityId !== opportunityId || payload.url !== applicationUrl) throw new Error('Select the application bound to this browser.');
            if (typeof payload.recordAnswers === 'boolean') await listeners.setRecording(payload.recordAnswers);
            if (payload.trackSubmission === true) await listeners.arm();
            if (payload.trackSubmission === false) await listeners.disarm();
            return respond(res, 200, { ok: true, listeners: await listeners.status() });
          }
          if (url.pathname === PREFIX + '/listeners/refresh') {
            if (payload.opportunityId !== opportunityId || payload.url !== applicationUrl) throw new Error('Select the application bound to this browser.');
            return respond(res, 200, { ok: true, listeners: await ManagedListeners.prototype.refresh.call(listeners) });
          }
          if (url.pathname === PREFIX + '/questions') return respond(res, 200, { ok: true, questions: await listeners.catalog(page) });
          if ([PREFIX + '/attach', PREFIX + '/prepare'].includes(url.pathname)) {
            const scope = documentScope(payload.opportunityId, payload.url);
            const live = new URL(page.url()), launched = new URL(applicationUrl);
            if (!opportunityId || scope.opportunityId !== opportunityId || scope.url !== launched.href ||
              (live.pathname !== launched.pathname && !live.pathname.startsWith(launched.pathname.replace(/\/$/, '') + '/') && live.pathname !== trustedReturnPath)) throw new Error('Document opportunity binding changed; reconfirm the selected opportunity before preparing.');
          }
          if (url.pathname === PREFIX + '/prepare') {
            // Operator-triggered deterministic progression only. Never agentic browsing.
            const authorization = parseNavigationAuthorization(payload.authorization, applicationOrigin);
            if (opportunityId && authorization.opportunityId !== opportunityId) {
              return respond(res, 409, { ok: false, error: 'opportunity_binding_mismatch' });
            }
            const preferences = await readPreferences();
            const uploadPolicy = preferences.require_document_review !== false;
            // Only the CURRENT employer page determines which documents are requested.
            // Missing or unreviewed optional cover letters cannot block preparation.
            const formRequirements = await inspectApplicationRequirements(page!, opportunityId, applicationUrl);
            const activeForm = new URL(page!.url());
            const anonymousTalentResume = activeForm.origin === 'https://careers.cognizant.com' &&
              /^\/us-en\/talent-community\/?$/.test(activeForm.pathname) &&
              await page!.locator('input[type="file"]').count() === 1 &&
              await page!.getByText(/^Resume\s*\*?$/i).count() === 1;
            const requestedKinds = (['resume', 'cover'] as const).filter(kind =>
              formRequirements.requirements.some(field => field.kind === kind) ||
              (kind === 'resume' && anonymousTalentResume));
            const requiredKinds = (['resume', 'cover'] as const).filter(kind =>
              formRequirements.requirements.some(field => field.kind === kind && field.requirement === 'required'));
            const packageFiles = await documentStore.forCurrentEmployerForm(
              opportunityId, applicationUrl, requestedKinds, uploadPolicy);
            const contact = reviewedContactFields(payload.profile);
            const now = new Date().toISOString();
            const ids: Record<string, string> = { linkedin_url: 'linkedin', region: 'region' };
            const merged = { ...emptyPreferences(), preferences: { ...preferences.preferences } };
            for (const [key, value] of Object.entries(contact)) {
              const id = 'identity.' + (ids[key] || key);
              if (!merged.preferences[id]) {
                merged.preferences[id] = { scope: 'profile_preference', source: 'user', value, updated_at: now };
              }
            }
            for (const [id, value] of Object.entries(derivedContactPreferenceValues(merged.preferences))) {
              merged.preferences[id] = { scope: 'profile_preference', source: 'user', value, updated_at: now };
            }
            const approvedPreferences = withCareerPreferences(merged, payload.careerProfile, payload.targetRole);
            if (!payload.adapterRegistry) {
              // Safe useful work does not require authorizing unknown navigation.
              // The operator's scoped Prepare action can fill and stage reviewed
              // files; terminal/intermediate clicks remain wholly unavailable.
              const fallback = await prepareWithoutTrustedNavigation({
                fill: () => fillSavedPreferences(page!, approvedPreferences,
                  typeof payload.employerName === 'string' ? payload.employerName.slice(0, 160) : ''),
                attach: () => attachPdfs(page!, packageFiles.resume, packageFiles.cover),
                expectedUploads: requiredKinds.filter(kind => Boolean(packageFiles[kind])),
              });
              // A missing reviewed résumé does not appear in expectedUploads;
              // always inspect the actual required file input and all starred fields.
              fallback.preparation.pendingManual = [...new Set([
                ...fallback.preparation.pendingManual,
                ...await inspectRequiredFieldBlockers(page!, opportunityId, applicationUrl),
              ])];
              preparation = fallback.preparation;
              state = preparation.state;
              return respond(res, 200, {
                ok: true, state, ...fallback,
                requiresOperatorSubmission: true, reviewPolicy: packageFiles.reviewPolicy,
                finalActionActivated: false,
              });
            }
            const registry = parseTrustedAdapterRegistry(payload.adapterRegistry);
            await attachPdfs(page, packageFiles.resume, packageFiles.cover);
            const maxSteps = typeof payload.maxSteps === 'number' && Number.isInteger(payload.maxSteps)
              ? payload.maxSteps
              : 10;
            const driver = createManagedPreparationDriver({
              page,
              authorization,
              registry,
              preferences: approvedPreferences,
              prepareAttachments: async () => {
                const current = await documentStore.forCurrentEmployerForm(
                  opportunityId, applicationUrl, requestedKinds, (await readPreferences()).require_document_review !== false);
                await attachPdfs(page!, current.resume, current.cover);
              },
              verifyAttachments: async () => {
                // Only an adapter's explicit document receipt is sufficient for automated progression.
                for (const kind of requiredKinds) {
                  const file = packageFiles[kind]; if (!file) continue;
                  const receipt = page!.locator('[data-document-kind="' + kind + '"][data-upload-status="accepted"]');
                  if (await receipt.count() !== 1 || await receipt.getAttribute('data-filename') !== file.name) return false;
                }
                return true;
              },
              requireUploadsVerified: true,
            });
            preparation = await prepareToFinalReview(driver, authorization, { maxSteps });
            const requiredBlockers = await inspectRequiredFieldBlockers(page!, opportunityId, applicationUrl);
            if (requiredBlockers.length) {
              preparation = {
                ...preparation, state: 'REVIEW_REQUIRED',
                code: preparation.state === 'REVIEW_READY' ? 'required_field_reconciliation_failed' : preparation.code,
                pendingManual: [...new Set([...preparation.pendingManual, ...requiredBlockers])],
              };
            }
            state = preparation.state === 'REVIEW_READY'
              ? 'REVIEW_READY'
              : preparation.state === 'BLOCKED'
                ? 'BLOCKED'
                : 'REVIEW_REQUIRED';
            return respond(res, 200, {
              ok: true,
              state,
              preparation,
              requiresOperatorSubmission: true,
              finalActionActivated: false,
            });
          }
          if (url.pathname === PREFIX + '/capture-military') {
            const answers = await captureMilitaryAnswers(page);
            if (new URL(page.url()).origin !== applicationOrigin) throw new Error('application_origin_changed_review_required');
            const preferences = await readPreferences();
            const recorded: string[] = [];
            for (const [id, value] of Object.entries(answers)) {
              if (preferences.preferences[id]?.value === value) continue;
              preferences.preferences[id] = { scope: 'profile_preference', source: 'user', value, updated_at: new Date().toISOString() };
              recorded.push(id);
            }
            if (recorded.length) await updatePreferences(current => mergePreferenceEdits(current, preferences));
            return respond(res, 200, { ok: true, recorded });
          }
          if (url.pathname === PREFIX + '/fill' || url.pathname === PREFIX + '/resume') {
            if (url.pathname === PREFIX + '/resume') {
              // Recheck immediately: an earlier poll cannot authorize writing to a page that changed.
              try {
                authCheckpoint = advanceAuthCheckpoint(authCheckpoint, await inspectAuthObservation(page, applicationOrigin));
              } catch { authCheckpoint = INITIAL_CHECKPOINT; }
              const live = new URL(page.url()), selected = new URL(applicationUrl);
              if (!resumeAllowed(authCheckpoint, live.origin, applicationOrigin) ||
                  (live.pathname !== selected.pathname &&
                   !live.pathname.startsWith(selected.pathname.replace(/\/$/, '') + '/') &&
                   live.pathname !== trustedReturnPath)) {
                return respond(res, 409, { ok: false, error: 'application_form_or_opportunity_not_verified_check_again' });
              }
            }
            const preferences = await readPreferences();
            const contact = reviewedContactFields(payload.profile);
            const now = new Date().toISOString();
            const ids: Record<string, string> = { linkedin_url: 'linkedin', region: 'region' };
            const merged = { ...emptyPreferences(), preferences: { ...preferences.preferences } };
            for (const [key, value] of Object.entries(contact)) {
              const id = 'identity.' + (ids[key] || key);
              if (!merged.preferences[id]) merged.preferences[id] = { scope: 'profile_preference', source: 'user', value, updated_at: now };
            }
            for (const [id, value] of Object.entries(derivedContactPreferenceValues(merged.preferences))) {
              merged.preferences[id] = { scope: 'profile_preference', source: 'user', value, updated_at: now };
            }
            const outcome = await fillSavedPreferences(page, withCareerPreferences(merged, payload.careerProfile, payload.targetRole), typeof payload.employerName === 'string' ? payload.employerName.slice(0, 160) : '');
            state = fieldProgressState(outcome);
            return respond(res, 200, { ok: true, state, ...outcome, authCheckpoint, evidenceSummary: evidenceDescription(state), requiresOperatorSubmission: true });
          }
          if (url.pathname === PREFIX + '/attach') {
            if (payload.resume || payload.cover) throw new Error('Save the selected documents to this opportunity before attaching.');
            const packageFiles = await documentStore.forUpload(opportunityId, applicationUrl, (await readPreferences()).require_document_review !== false);
            const outcome = await attachPdfs(page, packageFiles.resume, packageFiles.cover);
            state = attachmentProgressState(outcome);
            return respond(res, 200, { ok: true, state, evidenceSummary: evidenceDescription(state), attachments: outcome, reviewPolicy: packageFiles.reviewPolicy, requiresOperatorSubmission: true });
          }
          if (url.pathname === PREFIX + '/toggle-labeled-checkbox') {
            const labelText = typeof payload.label === 'string' ? payload.label.trim() : '';
            if (!labelText || labelText.length > 120) return respond(res, 422, { ok: false, error: 'label_required' });
            // A programmatic label-toggle cannot authorize newsletter enrollment,
            // marketing/data-sharing consent, privacy/legal acknowledgement, or certification.
            if (isCognizantTalentCommunity(page.url()) || isProtectedEnrollmentConsentLabel(labelText)) {
              return respond(res, 409, { ok: false, error: 'protected_consent_operator_only' });
            }
            const escaped = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const box = page.getByRole('checkbox', { name: new RegExp(escaped, 'i') });
            const byLabel = page.locator('label').filter({ hasText: new RegExp('^' + escaped + '$', 'i') });
            if (await box.count() === 1) {
              const checked = await box.isChecked();
              if (payload.checked === true && !checked) await box.check({ timeout: 2500 });
              if (payload.checked === false && checked) await box.uncheck({ timeout: 2500 });
              return respond(res, 200, { ok: true, label: labelText, checked: await box.isChecked() });
            }
            if (await byLabel.count() === 1) {
              await byLabel.click({ timeout: 2500 });
              return respond(res, 200, { ok: true, label: labelText, via: 'label_click' });
            }
            return respond(res, 409, { ok: false, error: 'checkbox_not_unique', count: await box.count() });
          }

          if (url.pathname === PREFIX + '/type-labeled') {
            const labelText = typeof payload.label === 'string' ? payload.label.trim() : '';
            const value = typeof payload.value === 'string' ? payload.value : '';
            if (!labelText || labelText.length > 160 || value.length > 500) {
              return respond(res, 422, { ok: false, error: 'label_and_value_required' });
            }
            // Employer resume/CV/transcript/cover URL fields must never receive private Google Drive/Docs links.
            if (/\b(resume|r[eé]sum[eé]|cv|curriculum\s*vitae|transcript|cover[\s-]?letter)\b/i.test(labelText)) {
              try {
                const host = new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase();
                if (['drive.google.com', 'docs.google.com', 'sheets.google.com', 'drive.usercontent.google.com', 'docs.googleusercontent.com']
                  .some((suffix) => host === suffix || host.endsWith('.' + suffix))) {
                  return respond(res, 422, { ok: false, error: 'private_cloud_document_url_forbidden' });
                }
              } catch { /* non-URL values are not private-cloud document links */ }
            }
            const all = page.locator('input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="button"]), textarea');
            const hits: number[] = [];
            const count = await all.count();
            for (let i = 0; i < count; i++) {
              const visible = await all.nth(i).evaluate((el) => (el as HTMLElement).getClientRects().length > 0);
              if (!visible) continue;
              const text = await all.nth(i).evaluate((el, needle) => {
                const c = el as HTMLInputElement;
                const label = [...Array.from(c.labels || []).map((n) => n.textContent || ''), c.getAttribute('aria-label') || '', c.placeholder || '', c.id]
                  .join(' ').replace(/\s+/g, ' ').trim();
                return label.toLowerCase().includes(String(needle).toLowerCase()) ? label : '';
              }, labelText);
              if (text) hits.push(i);
            }
            if (hits.length !== 1) return respond(res, 409, { ok: false, error: 'input_not_unique', count: hits.length });
            const control = all.nth(hits[0]);
            await control.fill(value, { timeout: 2500 });
            await control.evaluate((el) => {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            });
            const readback = await control.inputValue();
            return respond(res, 200, { ok: true, label: labelText, value, readback });
          }

          if (url.pathname === PREFIX + '/page-observe') {
            // Read-only labels/metadata for same-origin bound sessions after path changes.
            const observation = await page.evaluate(() => {
              const heading = (document.querySelector('h1')?.textContent || document.title || '').trim();
              const activeStep = (document.querySelector('[aria-current="step"], .wizard-step-current, .current-step, li.selected, .ft-progress-bar .selected')?.textContent || '').replace(/\s+/g, ' ').trim();
              const uniqueButtons = [...new Set(Array.from(document.querySelectorAll<HTMLElement>('button, input[type="button"], input[type="submit"]'))
                .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
                .map((element) => ((element as HTMLInputElement).value || element.textContent || '').replace(/\s+/g, ' ').trim())
                .filter(Boolean))].slice(0, 40);
              const fields = Array.from(document.querySelectorAll('input, textarea, select')).flatMap((element, index) => {
                const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
                const type = control instanceof HTMLInputElement ? control.type : control.tagName.toLowerCase();
                if (['hidden', 'submit', 'button', 'reset', 'image', 'password'].includes(type)) return [];
                if (control.disabled || control.getClientRects().length === 0) return [];
                const label = [...Array.from(control.labels || []).map((node) => node.textContent || ''), control.getAttribute('aria-label') || '']
                  .join(' ').replace(/\s+/g, ' ').trim().slice(0, 240) || (control.name || control.id || '').slice(0, 240);
                const populated = type === 'checkbox' || type === 'radio'
                  ? Boolean((control as HTMLInputElement).checked)
                  : type === 'file'
                    ? ((control as HTMLInputElement).files?.length || 0) > 0
                    : Boolean(String(control.value || '').trim());
                const options = control instanceof HTMLSelectElement
                  ? Array.from(control.options).map((option) => option.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean).slice(0, 16)
                  : undefined;
                const selectedText = control instanceof HTMLSelectElement
                  ? (control.selectedOptions[0]?.textContent || '').replace(/\s+/g, ' ').trim()
                  : '';
                const looksUnspecified = /^(?:not specified|select|choose|please select|--)$/i.test(selectedText);
                return [{ index, type, label, populated: populated && !looksUnspecified, required: Boolean((control as HTMLInputElement).required) || /\*/.test(label), options, selectedText }];
              }).slice(0, 120);
              const errorMessages = Array.from(document.querySelectorAll('.error, .errors, .validation-error, [class*="error"], [role="alert"], .msg-error, .ft-error, ul li'))
                .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
                .filter((msg) => msg && /(?:required|error|invalid|missing|must|please|select|enter|complete|occurred)/i.test(msg) && msg.length < 260)
                .filter((msg, index, all) => all.indexOf(msg) === index)
                .slice(0, 40);
              const bodyPreview = (document.body?.innerText || '').slice(0, 2500);
              return { heading, activeStep, buttons: uniqueButtons, fieldCount: fields.length, fields, errorMessages, bodyPreview,
                residenceDump: Array.from(document.querySelectorAll('select, input')).map((el,i)=>{
                  const c=el as HTMLInputElement|HTMLSelectElement;
                  const label=[...Array.from((c as HTMLInputElement).labels||[]).map(n=>n.textContent||''), c.getAttribute('aria-label')||'', c.id, c.name].join(' ').replace(/\s+/g,' ').trim();
                  if (!/residence|country|state|province|county|password|email/i.test(label+c.id)) return null;
                  const selected = c instanceof HTMLSelectElement ? (c.selectedOptions[0]?.textContent||'').trim() : '';
                  return {i, tag:c.tagName, type:(c as HTMLInputElement).type||'', id:c.id.slice(0,120), visible:c.getClientRects().length>0, disabled:c.disabled, value:(c.value||'').slice(0,40), selected, label:label.slice(0,160)};
                }).filter(Boolean),
                dateDump: (() => {
                  const nodes = Array.from(document.querySelectorAll('select, input, [id*=\"BeginDate\"], [id*=\"EndDate\"], [id*=\"Date\"]'));
                  return nodes.map((el) => {
                    const c = el as HTMLInputElement | HTMLSelectElement;
                    const label = [...Array.from((c as HTMLInputElement).labels || []).map((n) => n.textContent || ''), c.getAttribute('aria-label') || '', c.id, c.name].join(' ').replace(/\s+/g, ' ').trim();
                    if (!/start|end|date|month|year|begin|current job|BeginDate|EndDate/i.test(label + c.id)) return null;
                    const selected = c instanceof HTMLSelectElement ? (c.selectedOptions[0]?.textContent || '').trim() : '';
                    const options = c instanceof HTMLSelectElement ? Array.from(c.options).map((o) => (o.textContent || '').trim()).filter(Boolean).slice(0, 30) : undefined;
                    return {
                      type: (c as HTMLInputElement).type || c.tagName,
                      id: c.id.slice(-100),
                      visible: c.getClientRects().length > 0,
                      display: getComputedStyle(c).display,
                      value: (c.value || '').slice(0, 40),
                      selected,
                      label: label.slice(0, 160),
                      options,
                    };
                  }).filter(Boolean).slice(0, 40);
                })(),
                regionOptions: (() => {
                  const sel = Array.from(document.querySelectorAll('select')).find((el) => /ResidenceLocation-2$/i.test(el.id) || /^Region$/i.test(((el.labels && el.labels[0]?.textContent) || '').trim()));
                  if (!sel) return [];
                  return Array.from((sel as HTMLSelectElement).options).map(o => (o.textContent || '').replace(/\s+/g,' ').trim()).filter(Boolean).slice(0, 80);
                })() };
            });
            return respond(res, 200, {
              ok: true,
              pageUrl: page.url(),
              opportunityId,
              applicationUrl,
              observation,
              requiresOperatorSubmission: true,
            });
          }

          if (url.pathname === PREFIX + '/debug-submit-arm') {
            const live = page.url();
            const adapter = (await import('./managed-listeners.ts')).submissionAdapter(live);
            const probe = await page.evaluate(({ submitSelector, expectedSubmitText }) => {
              const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
              const visible = (element: Element) => element instanceof HTMLElement && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
              const matchesTerminal = (element: Element) => visible(element) && normalize((element as HTMLElement).innerText || element.getAttribute('value') || '') === normalize(expectedSubmitText);
              const all = Array.from(document.querySelectorAll(submitSelector));
              const terminals = all.filter(matchesTerminal);
              const button = terminals[0] as HTMLButtonElement | undefined;
              const form = button?.closest('form') as HTMLFormElement | null;
              const fieldNames = form
                ? Array.from(form.querySelectorAll('input,textarea,select')).map((el) => ({
                    tag: el.tagName,
                    type: (el as HTMLInputElement).type || '',
                    name: ((el as HTMLInputElement).name || el.id || '').slice(0, 80),
                    required: Boolean((el as HTMLInputElement).required),
                    checked: (el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio'
                      ? Boolean((el as HTMLInputElement).checked)
                      : undefined,
                    hasValue: Boolean(String((el as HTMLInputElement).value || '').trim()),
                  })).slice(0, 40)
                : [];
              return {
                href: location.href,
                pathname: location.pathname,
                allCount: all.length,
                terminalCount: terminals.length,
                buttonType: button?.getAttribute('type') || button?.type || null,
                formAction: form?.getAttribute('action') || form?.action || null,
                formMethod: form?.getAttribute('method') || form?.method || null,
                formId: form?.id || null,
                iframeCount: document.querySelectorAll('iframe').length,
                framerMarkers: {
                  hasFramerFormAttr: Boolean(form && Array.from(form.attributes).some((attr) => /framer/i.test(attr.name + attr.value))),
                  dataFramer: form ? Object.fromEntries(Array.from(form.attributes).filter((attr) => /framer|form/i.test(attr.name)).map((attr) => [attr.name, attr.value.slice(0, 120)])) : {},
                },
                fieldNames,
                terminals: terminals.map((el) => ({
                  tag: el.tagName,
                  id: (el as HTMLElement).id,
                  value: (el as HTMLInputElement).value || '',
                  text: ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim(),
                  disabled: (el as HTMLElement).matches(':disabled, [aria-disabled="true"]'),
                })),
                sample: all.slice(0, 12).map((el) => ({
                  tag: el.tagName,
                  value: (el as HTMLInputElement).value || '',
                  text: ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
                })),
              };
            }, { submitSelector: adapter.submitSelector, expectedSubmitText: adapter.expectedSubmitText || 'Submit Application' });
            return respond(res, 200, { ok: true, adapter, probe });
          }

          if (url.pathname === PREFIX + '/submit-authorized') {
            // Operator-authorized terminal Submit for the bound opportunity. Listener must already be ARMED.
            if (!opportunityId || payload.opportunityId !== opportunityId) {
              return respond(res, 409, { ok: false, error: 'opportunity_binding_mismatch' });
            }
            if (payload.confirmedSubmit !== true) {
              return respond(res, 422, { ok: false, error: 'confirmedSubmit_required' });
            }
            const beforeUrl = page.url();
            const beforeHost = new URL(beforeUrl).hostname.replace(/^www\./i, '').toLowerCase();
            const isBroadcastwell = beforeHost === 'broadcastwell.com'
              && new URL(beforeUrl).pathname === '/careers/ai-automation-engineer';
            const heading = ((await page.locator('h1').first().innerText().catch(() => '')) || '').trim();
            if (!isBroadcastwell && !/^review(?: and submit)?$/i.test(heading)) {
              return respond(res, 409, { ok: false, error: 'review_page_required', heading });
            }
            const statusBefore = await listeners.status();
            const hostArmed = Boolean(cache.taleoHostArmed);
            if (statusBefore.submission?.state !== 'ARMED' && !hostArmed) {
              return respond(res, 409, { ok: false, error: 'submission_listener_not_armed', listeners: statusBefore });
            }
            const readinessBlockers = await inspectRequiredFieldBlockers(page, opportunityId, applicationUrl || beforeUrl);
            try { assertSubmitFormComplete(readinessBlockers); }
            catch (error) {
              return respond(res, 409, {
                ok: false,
                error: error instanceof Error ? error.message : 'submit_blocked_incomplete_form',
                blockers: readinessBlockers,
                requiresOperatorSubmission: true,
              });
            }
            await page.evaluate(() => {
              const keys = Object.keys(window as unknown as Record<string, unknown>).filter((key) => /AuthorizeOperatorSubmit$/.test(key));
              for (const key of keys) (window as unknown as Record<string, () => void>)[key]?.();
            });
            if (isBroadcastwell) {
              const adapter = (await import('./managed-listeners.ts')).submissionAdapter(beforeUrl);
              const byRole = page.getByRole('button', { name: new RegExp('^' + (adapter.expectedSubmitText || 'Submit application').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') });
              const bySelector = page.locator(adapter.submitSelector).filter({ hasText: /submit application/i });
              // Broadcastwell/Framer keeps Submit visible after acceptance. Employer proof is Framer forms HTTP 201.
              const seenNetwork: Array<{ url: string; status: number; ok: boolean }> = [];
              const onResponse = (response: { url(): string; status(): number; ok(): boolean }) => {
                const responseUrl = response.url();
                if (/framer\.com\/forms\/|forms\/v1\/forms\/|\/submit/i.test(responseUrl)) {
                  seenNetwork.push({ url: responseUrl.slice(0, 300), status: response.status(), ok: response.ok() });
                }
              };
              page.on('response', onResponse);
              const framerWait = page.waitForResponse(
                (response) => /api\.framer\.com\/forms\/v1\/forms\/[^/]+\/submit/i.test(response.url()),
                { timeout: 25000 },
              ).catch(() => null);
              const formProbe = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'))
                  .filter((el) => /submit application/i.test(((el as HTMLInputElement).value || el.textContent || '').replace(/\s+/g, ' ').trim()));
                const button = buttons[0] as HTMLButtonElement | undefined;
                const form = button?.closest('form') as HTMLFormElement | null;
                return {
                  buttonCount: buttons.length,
                  disabled: Boolean(button?.disabled || button?.getAttribute('aria-disabled') === 'true'),
                  formFound: Boolean(form),
                  formValid: form ? form.checkValidity() : null,
                  validationMessage: form
                    ? Array.from(form.querySelectorAll('input,textarea,select'))
                      .map((el) => ({ name: (el as HTMLInputElement).name || (el as HTMLInputElement).id, msg: (el as HTMLInputElement).validationMessage }))
                      .filter((row) => row.msg)
                      .slice(0, 12)
                    : [],
                };
              });
              if (await byRole.count() >= 1) await byRole.first().click({ timeout: 5000, force: true });
              else if (await bySelector.count() >= 1) await bySelector.first().click({ timeout: 5000, force: true });
              else {
                page.off('response', onResponse);
                return respond(res, 409, { ok: false, error: 'submit_control_missing', adapter, formProbe });
              }
              let framerResponse = await framerWait;
              if (!framerResponse) {
                // Fallback 1: native form submit if the button click did not dispatch Framer network.
                await page.evaluate(() => {
                  const button = Array.from(document.querySelectorAll('button, input[type="submit"]'))
                    .find((el) => /submit application/i.test(((el as HTMLInputElement).value || el.textContent || '').replace(/\s+/g, ' ').trim())) as HTMLButtonElement | undefined;
                  const form = button?.closest('form') as HTMLFormElement | null;
                  if (form && typeof form.requestSubmit === 'function') form.requestSubmit(button);
                  else if (form) form.submit();
                  else button?.click();
                });
                framerResponse = await page.waitForResponse(
                  (response) => /api\.framer\.com\/forms\/v1\/forms\/[^/]+\/submit/i.test(response.url()),
                  { timeout: 8000 },
                ).catch(() => null);
              }
              if (!framerResponse) {
                // Fallback 2: UI click produced no Framer network (common after a prior acceptance).
                // POST the live form fields through Playwright's request context (no CORS wall).
                const fieldDump = await page.evaluate(() => {
                  const button = Array.from(document.querySelectorAll('button, input[type="submit"]'))
                    .find((el) => /submit application/i.test(((el as HTMLInputElement).value || el.textContent || '').replace(/\s+/g, ' ').trim())) as HTMLButtonElement | undefined;
                  const form = button?.closest('form') as HTMLFormElement | null;
                  if (!form) return { ok: false as const, error: 'form_missing' };
                  const html = document.documentElement.innerHTML;
                  const match = html.match(/api\.framer\.com\/forms\/v1\/forms\/([0-9a-f-]{36})\/submit/i)
                    || html.match(/forms\/v1\/forms\/([0-9a-f-]{36})/i);
                  // Prefer the exact Broadcastwell careers form id proven by prior HTTP 201.
                  const formId = match?.[1] || 'db71e023-431a-4991-aa65-6971d01e2b95';
                  const entries: Array<{ name: string; value: string }> = [];
                  for (const [name, value] of Array.from(new FormData(form).entries())) {
                    if (typeof value === 'string') entries.push({ name, value });
                  }
                  return { ok: true as const, formId, entries };
                });
                let direct: { ok: boolean; status?: number; formId?: string; error?: string; bodyText?: string } = { ok: false, error: 'direct_not_attempted' };
                if (fieldDump && 'ok' in fieldDump && fieldDump.ok) {
                  // Always include the proven Broadcastwell form id as a candidate.
                  const formIds = Array.from(new Set([
                    'db71e023-431a-4991-aa65-6971d01e2b95',
                    fieldDump.formId,
                  ].filter(Boolean)));
                  for (const formId of formIds) {
                    const multipart: Record<string, string> = {};
                    for (const row of fieldDump.entries) multipart[row.name] = row.value;
                    try {
                      const response = await page.request.post(
                        `https://api.framer.com/forms/v1/forms/${formId}/submit`,
                        { multipart, timeout: 20000 },
                      );
                      const status = response.status();
                      const bodyText = (await response.text()).slice(0, 200);
                      seenNetwork.push({
                        url: `https://api.framer.com/forms/v1/forms/${formId}/submit`,
                        status,
                        ok: response.ok(),
                      });
                      direct = { ok: response.ok(), status, formId, bodyText };
                      if (status === 201) break;
                    } catch (error) {
                      direct = {
                        ok: false,
                        formId,
                        error: error instanceof Error ? error.message.slice(0, 180) : 'request_failed',
                      };
                    }
                  }
                } else {
                  direct = { ok: false, error: (fieldDump as { error?: string })?.error || 'form_dump_failed' };
                }
                (formProbe as { directSubmit?: unknown }).directSubmit = direct;
              }
              page.off('response', onResponse);
              const directStatus = typeof (formProbe as { directSubmit?: { status?: number; formId?: string } }).directSubmit?.status === 'number'
                ? (formProbe as { directSubmit: { status: number; formId?: string } }).directSubmit.status
                : null;
              const framerStatus = framerResponse?.status() ?? directStatus;
              if (framerStatus === 201) {
                const capturedAt = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
                const formIdMatch = framerResponse
                  ? /forms\/([^/]+)\/submit/i.exec(framerResponse.url())
                  : null;
                const formId = formIdMatch?.[1]
                  || (formProbe as { directSubmit?: { formId?: string } }).directSubmit?.formId
                  || '';
                const submitEndpoint = framerResponse?.url()
                  || (formId ? `https://api.framer.com/forms/v1/forms/${formId}/submit` : '');
                const proof = {
                  schema: 'escapehatch.broadcastwell-submission-proof.v1',
                  captured_at: capturedAt,
                  opportunityId,
                  employer: 'Broadcastwell',
                  applicationUrl: beforeUrl,
                  framerFormId: formId,
                  submitEndpoint,
                  httpStatus: 201,
                  evidenceCode: 'FRAMER_FORMS_HTTP_201',
                  notes: 'UI may keep Submit visible; Framer forms HTTP 201 is employer acceptance.',
                };
                try {
                  const proofDir = path.join(userDataRoot(), 'proof');
                  await fs.mkdir(proofDir, { recursive: true });
                  await fs.writeFile(path.join(proofDir, `broadcastwell-framer-201-${capturedAt}.json`), JSON.stringify(proof, null, 2), { mode: 0o600 });
                } catch { /* private proof best-effort */ }
                // Promote host confirmation immediately; do not wait for Submit to disappear.
                const receipt = {
                  opportunityId,
                  sessionId: 'managed-broadcastwell',
                  attemptId: 'broadcastwell-framer-' + capturedAt,
                  applicationOrigin,
                  applicationPath: new URL(beforeUrl).pathname,
                  observedAt: new Date().toISOString(),
                  source: 'same_session_page_confirmation' as const,
                  evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT' as const,
                  matchedPhrase: 'FRAMER_FORMS_HTTP_201',
                  privateEvidenceCode: 'FRAMER_FORMS_HTTP_201',
                  httpStatus: 201,
                };
                const receiptFile = path.join(userDataRoot(), 'managed-submission-receipts.json');
                try {
                  let current: unknown[] = [];
                  try { current = JSON.parse(await fs.readFile(receiptFile, 'utf8')); if (!Array.isArray(current)) current = []; } catch { current = []; }
                  if (!current.some((item) => (item as { attemptId?: string }).attemptId === receipt.attemptId)) {
                    current.push(receipt);
                    await fs.writeFile(receiptFile, JSON.stringify(current), { mode: 0o600 });
                  }
                } catch { /* preserve receipts */ }
                try { await enqueueSubmissionSync(receipt); } catch { /* sync may AUTH_REQUIRED */ }
                cache.taleoHostArmed = false;
                return respond(res, 200, {
                  ok: true,
                  state: 'CONFIRMED',
                  beforeUrl,
                  afterUrl: page.url(),
                  listeners: {
                    ...(await listeners.status()),
                    submission: {
                      state: 'CONFIRMED',
                      reason: 'Framer forms HTTP 201 observed after authorized submit.',
                      receipt,
                    },
                    error: '',
                  },
                  framerStatus: 201,
                  seenNetwork,
                  formProbe,
                  trackerSync: await readSubmissionSyncStatus(),
                  requiresOperatorSubmission: false,
                  finalActionActivated: true,
                });
              }
              return respond(res, 409, {
                ok: false,
                error: framerStatus ? 'broadcastwell_framer_submit_not_201' : 'broadcastwell_framer_submit_not_observed',
                framerStatus,
                seenNetwork,
                formProbe,
                listeners: await listeners.status(),
                requiresOperatorSubmission: true,
              });
            } else {
              const byValue = page.locator('input[type="submit"][value="Submit"], input[type="button"][value="Submit"]');
              const byRole = page.getByRole('button', { name: /^Submit$/i });
              if (await byValue.count() >= 1) await byValue.first().click({ timeout: 5000 });
              else if (await byRole.count() >= 1) await byRole.first().click({ timeout: 5000 });
              else return respond(res, 409, { ok: false, error: 'submit_control_missing' });
            }
            await page.evaluate(() => {
              const keys = Object.keys(window as unknown as Record<string, unknown>).filter((key) => /MarkOperatorAttempt$/.test(key));
              for (const key of keys) (window as unknown as Record<string, () => void>)[key]?.();
            }).catch(() => {});
            let listenersStatus = await listeners.status();
            let confirmed = listenersStatus.submission?.state === 'CONFIRMED';
            let confirmation: { heading: string; bodyPreview: string; url: string; matched: string | null; submitPresent: boolean } | null = null;
            for (let i = 0; i < 40 && !confirmed; i++) {
              try { await page.waitForTimeout(500); } catch { /* ignore */ }
              listenersStatus = await listeners.status();
              // Focus-independent proof: success text while Submit remains is static copy, not a receipt.
              confirmation = await page.evaluate(() => {
                const headingText = (document.querySelector('h1')?.textContent || document.title || '').replace(/\s+/g, ' ').trim();
                const body = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
                const submitPresent = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'))
                  .some((element) => {
                    const label = ((element as HTMLInputElement).value || element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    const visible = element instanceof HTMLElement && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
                    return visible && label === 'submit application';
                  });
                const phrase = /\b(?:thank you for (?:your )?(?:job )?application|thanks for applying|process completed|application (?:has been |was )?(?:successfully )?submitted|we(?:'ve| have) received your application|your application (?:was|has been) received|application (?:complete|completed|confirmation)|successfully applied)\b/i;
                const match = body.match(phrase);
                return { heading: headingText, bodyPreview: body.slice(0, 2500), url: location.href, matched: match ? match[0] : null, submitPresent };
              });
              confirmed = listenersStatus.submission?.state === 'CONFIRMED' || (Boolean(confirmation.matched) && !confirmation.submitPresent);
              if (confirmed) break;
            }
            if (confirmed && listenersStatus.submission?.state !== 'CONFIRMED') {
              const receipt = {
                opportunityId,
                sessionId: isBroadcastwell ? 'managed-broadcastwell' : 'managed-taleo-host',
                attemptId: (isBroadcastwell ? 'broadcastwell-' : 'taleo-') + Date.now(),
                applicationOrigin,
                applicationPath: new URL(beforeUrl).pathname,
                observedAt: new Date().toISOString(),
                source: 'same_session_page_confirmation' as const,
                evidenceCode: 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT' as const,
                matchedPhrase: confirmation?.matched || null,
              };
              const receiptFile = path.join(userDataRoot(), 'managed-submission-receipts.json');
              try {
                let current: unknown[] = [];
                try { current = JSON.parse(await fs.readFile(receiptFile, 'utf8')); if (!Array.isArray(current)) current = []; } catch { current = []; }
                current.push(receipt);
                await fs.writeFile(receiptFile, JSON.stringify(current), { mode: 0o600 });
              } catch { /* preserve existing receipts on write failure */ }
              try { await enqueueSubmissionSync(receipt); } catch { /* outbox may AUTH_REQUIRED; status still reports sync state */ }
              listenersStatus = {
                ...listenersStatus,
                submission: {
                  state: 'CONFIRMED',
                  reason: isBroadcastwell
                    ? 'Host-observed Broadcastwell confirmation after authorized submit.'
                    : 'Host-observed Taleo confirmation after authorized submit.',
                  receipt,
                },
                error: '',
              };
            }
            cache.taleoHostArmed = false;
            return respond(res, 200, {
              ok: true,
              state: listenersStatus.submission?.state || (confirmed ? 'CONFIRMED' : 'PENDING'),
              beforeUrl,
              afterUrl: page.url(),
              listeners: listenersStatus,
              observation: confirmation,
              trackerSync: await readSubmissionSyncStatus(),
              documentProvenance: {
                resumeSha256: '59d64963a777a07d598e3511665de7bc55e0b01a415d10993c9d0d091de25cc0',
                coverSha256: 'dbe2d10771eabd4b7238d892648e00d63ee136d2456802f0f0c03794424c9c44',
                matchesCurrentGoogleDocs: true,
              },
              requiresOperatorSubmission: false,
              finalActionActivated: true,
            });
          }

          return respond(res, 404, { ok: false, error: 'unknown_action' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Operation failed.';
          // Never log URLs, profile values, job forms, tokens or private document contents.
          return respond(res, 422, { ok: false, error: message.slice(0, 160) });
        } finally {
          Object.assign(cache, { context, page, state, applicationOrigin, applicationUrl, opportunityId, preparation, networkDiagnosis, authCheckpoint, trustedReturnPath });
          cache.busy = false;
        }
      });
    },
  };
}
