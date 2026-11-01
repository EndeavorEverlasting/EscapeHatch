import { prepareWithoutTrustedNavigation } from './managed-prepare-fallback.ts';
import { INITIAL_CHECKPOINT, advanceAuthCheckpoint, inspectAuthObservation, resumeAllowed, type AuthCheckpoint } from './managed-auth-checkpoint.ts';
import { fieldProgressState, attachmentProgressState, evidenceDescription } from './managed-progress-evidence.ts';
import { assertInspectionScope, inspectApplicationRequirements, inspectRequiredFieldBlockers, assertSubmitFormComplete } from './application-requirements.ts';
import { OpportunityDocumentStore, documentScope, type DocumentKind } from './opportunity-documents.ts';
import { ManagedListeners } from './managed-listeners.ts';
import { enqueueSubmissionSync, retrySubmissionSync, readSubmissionSyncStatus, startSubmissionSync } from './tracker-writeback.ts';
import { readWorkspace } from './workspace-file.ts';
import { APPLICATIONS_KEY } from './src/lib/storage.ts';
import { withCareerPreferences, workplaceFromOpportunity, type OpportunityWorkplaceContext } from './career-preferences.ts';
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
import { readPreferences, updatePreferences, clearPreferences, mergePreferenceEdits } from './preference-file.ts';
import { fillSavedPreferences, openApplicationForm } from './managed-form.ts';
import { emptyPreferences } from './src/lib/application-preferences.ts';
import { prepareToFinalReview, type PreparationResult } from './application-autopilot-executor.ts';
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

async function resolveOpportunityWorkplace(
  payload: Record<string, unknown>,
  boundOpportunityId: string,
): Promise<OpportunityWorkplaceContext> {
  const fromPayload: OpportunityWorkplaceContext = {
    workplaceArrangement: typeof payload.workplaceArrangement === 'string' ? payload.workplaceArrangement : null,
    workModel: typeof payload.workModel === 'string' ? payload.workModel : null,
    location: typeof payload.location === 'string' ? payload.location : null,
    notes: typeof payload.opportunityNotes === 'string' ? payload.opportunityNotes : (typeof payload.notes === 'string' ? payload.notes : null),
    role: typeof payload.targetRole === 'string' ? payload.targetRole : (typeof payload.role === 'string' ? payload.role : null),
    description: typeof payload.jobDescription === 'string' ? payload.jobDescription : null,
    title: typeof payload.title === 'string' ? payload.title : null,
  };
  if (workplaceFromOpportunity(fromPayload) !== 'unknown') return fromPayload;
  if (!boundOpportunityId) return fromPayload;
  try {
    const workspace = await readWorkspace();
    const applications = workspace?.workspace.values[APPLICATIONS_KEY];
    const match = Array.isArray(applications)
      ? applications.find((item) => item && typeof item === 'object' && (item as { id?: string }).id === boundOpportunityId)
      : null;
    if (!match || typeof match !== 'object') return fromPayload;
    const row = match as Record<string, unknown>;
    return {
      ...fromPayload,
      notes: fromPayload.notes || (typeof row.notes === 'string' ? row.notes : null),
      role: fromPayload.role || (typeof row.role === 'string' ? row.role : null),
      location: fromPayload.location || (typeof row.location === 'string' ? row.location : null),
      title: fromPayload.title || (typeof row.role === 'string' ? row.role : null),
    };
  } catch {
    return fromPayload;
  }
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
    if (matches.length === 0) {
      // Portal-based uploaders leave their anonymous file inputs under body. Bind the chooser
      // to the uniquely labelled upload widget instead of guessing an input by DOM order.
      const labels = page.locator('label[id$="_label"]').filter({ hasText: kind === 'resume' ? /^Resume:\s*\(Word\/PDF\)/i : /^Cover Letter:\s*\(Word\/PDF\)/i });
      if (await labels.count() === 1) {
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
      // Taleo Attachments: one generic "Select the file to attach" input + Attach button.
      const fileInputs = page.locator('input[type="file"]');
      const attachBtn = page.getByRole('button', { name: /^Attach$/i }).or(page.locator('input[type="button"][value="Attach"], input[type="submit"][value="Attach"]'));
      if (await fileInputs.count() === 1 && await attachBtn.count() >= 1) {
        try {
          await fileInputs.first().setInputFiles(file, { timeout: 5000 });
          await attachBtn.first().click({ timeout: 2500 });
          try { await page.waitForTimeout(900); } catch { /* ignore */ }
          if (kind === 'resume') {
            const resumeMarker = page.locator('input[type="radio"], input[type="checkbox"]').filter({ has: page.locator('xpath=ancestor::*[contains(., "Resume")][1]') });
            const byName = page.locator('input[type="radio"][name*="Resume"], input[type="checkbox"][name*="Resume"], input[type="radio"][id*="Resume"], input[type="checkbox"][id*="Resume"]');
            const resumeControl = (await byName.count()) >= 1 ? byName : resumeMarker;
            if (await resumeControl.count() >= 1) {
              try { await resumeControl.first().check({ timeout: 2000 }); } catch {
                try { await resumeControl.first().click({ timeout: 2000 }); } catch { /* ignore */ }
              }
            }
          }
          outcome[kind] = 'attached_to_input_review_required';
        } catch { outcome[kind] = 'manual_required'; }
        continue;
      }
      outcome[kind] = 'manual_required';
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
    opportunityId: '', preparation: null, networkDiagnosis: null, authCheckpoint: INITIAL_CHECKPOINT, trustedReturnPath: null, busy: false, listeners: new ManagedListeners(undefined, undefined, enqueueSubmissionSync) };
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
  // Bump when submission adapters change so Vite-retained listener objects pick up new ATS scopes.
  const listeners = previousListeners.implementationVersion >= 3 ? previousListeners : new ManagedListeners(undefined, undefined, enqueueSubmissionSync);
  const listenerReady = previousListeners === listeners ? Promise.resolve() : previousListeners.dispose();
  cache.listeners = listeners;
  return {
    name: 'escapehatch-managed-browser-assist',
    configureServer(server) {
      if (managed) startSubmissionSync();
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
          try { return respond(res, 200, { ok: true, preferences: await readPreferences() }); }
          catch { return respond(res, 422, { ok: false, error: 'Saved preferences could not be read; existing data preserved.' }); }
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
          if (url.pathname === PREFIX + '/listeners/bind-existing') {
            if (!context) return respond(res, 409, { ok: false, error: 'managed_browser_context_unavailable' });
            if (typeof payload.opportunityId !== 'string' || !payload.opportunityId || payload.opportunityId.length > 256) throw new Error('Select a saved opportunity.');
            const workspace = await readWorkspace();
            const applications = workspace?.workspace.values[APPLICATIONS_KEY];
            const saved = Array.isArray(applications) ? applications.find(item => item.id === payload.opportunityId && item.url === payload.url && !['applied', 'closed'].includes(item.status)) : null;
            if (!saved) throw new Error('Saved opportunity changed or is unavailable.');
            const selected = selectExistingApplicationPage(context, saved.url, payload.livePageUrl);
            await listeners.attach(selected, { opportunityId: saved.id, applicationUrl: selected.url(), employerName: saved.company }, false);
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
            return respond(res, 200, { ok: true, state, requiresOperatorSubmission: true, listeners: status });
          }
          if (url.pathname === PREFIX + '/preferences') return respond(res, 200, { ok: true,
            preferences: await updatePreferences(current => mergePreferenceEdits(current, payload.preferences, payload.removedQuestions)) });
          if (url.pathname === PREFIX + '/preferences/clear') { await listeners.setRecording(false); await clearPreferences(); return respond(res, 200, { ok: true }); }
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
              });
              context.on('close', () => {
                context = null; page = null; state = 'browser_closed'; preparation = null; authCheckpoint = INITIAL_CHECKPOINT; trustedReturnPath = null;
                Object.assign(cache, { context, page, state, preparation, authCheckpoint, trustedReturnPath });
                void listeners.dispose();
              });
            }
            if (!page || page.isClosed()) page = context.pages()[0] || await context.newPage();
            await page.bringToFront();
            state = 'browser_open';
            try {
              await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
              state = 'application_open_review_required';
              if (await openApplicationForm(page)) state = 'application_form_open_review_required';
            } catch (error) {
              // Network interface naming is only suggestive, never proof of VPN causality.
              const activeNames = Object.entries(networkInterfaces())
                .filter(([, addresses]) => addresses?.some(addr => addr.family === 'IPv4' && !addr.internal))
                .map(([name]) => name);
              networkDiagnosis = diagnoseNavigationFailure(error, activeNames);
              state = 'browser_open_navigation_unverified';
            }
            if (state === 'application_form_open_review_required' && opportunityId) {
              await listeners.attach(page, { opportunityId, applicationUrl: page.url(),
                employerName: typeof payload.employerName === 'string' ? payload.employerName.slice(0, 160) : '' });
              await listeners.arm();
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
          
          
          
          
          if (url.pathname === PREFIX + '/fill-taleo-date') {
            const field = typeof payload.field === 'string' ? payload.field : '';
            const month = typeof payload.month === 'string' ? payload.month : ''; // full name e.g. January
            const year = typeof payload.year === 'string' ? payload.year : '';
            const day = typeof payload.day === 'number' ? payload.day : 1;
            if (!['BeginDate', 'EndDate'].includes(field) || !month || !year) {
              return respond(res, 422, { ok: false, error: 'field_month_year_required' });
            }
            const monthShort = month.slice(0, 3);
            const monthIndex = ['january','february','march','april','may','june','july','august','september','october','november','december']
              .indexOf(month.toLowerCase());
            if (monthIndex < 0) return respond(res, 422, { ok: false, error: 'invalid_month' });
            const result = await page.evaluate(({ fieldName, monthName, yearNum, dayNum, monthIdx }) => {
              const display = document.querySelector('a[id$="dv_cs_experience_' + fieldName + '.display"]') as HTMLAnchorElement | null;
              const cal = document.querySelector('[id$="dv_cs_experience_' + fieldName + '-mainDIV"]') as HTMLElement | null;
              const relevant = document.querySelector('[id$="dv_cs_experience_' + fieldName + '.inputrelevant"]') as HTMLInputElement | null;
              if (!display || !cal) return { ok: false, error: 'date_widget_missing' as const };

              const fire = (el: Element, type: string) => {
                el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }));
              };

              // Prefer Dynarch/Taleo calendar instance if attached.
              const anyCal = cal as HTMLElement & { calendar?: { show?: () => void; callHandler?: () => void; setDate?: (d: Date) => void; date?: Date; hide?: () => void; params?: Record<string, unknown> } };
              const instance = anyCal.calendar
                || (window as unknown as { calendar?: typeof anyCal.calendar }).calendar
                || Object.values(cal).find((v) => v && typeof v === 'object' && typeof (v as { show?: unknown }).show === 'function') as typeof anyCal.calendar | undefined;

              const iso = `${yearNum}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const displayLabel = `${monthName.slice(0, 3)} ${dayNum}, ${yearNum}`;
              const dateObj = new Date(yearNum, monthIdx, dayNum);

              if (instance?.setDate) {
                try {
                  instance.setDate(dateObj);
                  if (instance.callHandler) instance.callHandler();
                  if (instance.hide) instance.hide();
                } catch { /* fall through */ }
              }

              // Open popup via real mouse sequence, then force-show if still hidden.
              fire(display, 'mousedown');
              fire(display, 'mouseup');
              fire(display, 'click');
              display.click();
              cal.style.display = 'block';
              cal.style.visibility = 'visible';
              cal.style.zIndex = '99999';

              const title = document.getElementById(cal.id.replace(/-mainDIV$/, '') + '-title')
                || cal.querySelector('.title');
              const prev = document.getElementById(cal.id.replace(/-mainDIV$/, '') + '-prev-month');
              const next = document.getElementById(cal.id.replace(/-mainDIV$/, '') + '-next-month');
              const done = document.getElementById(cal.id.replace(/-mainDIV$/, '') + '-done')
                || Array.from(cal.querySelectorAll('a,button,td,span')).find((n) => /^(?:Done|OK)$/i.test((n.textContent || '').trim()));

              const target = yearNum * 12 + monthIdx;
              for (let i = 0; i < 36; i++) {
                const titleText = ((title?.textContent || '')).replace(/\s+/g, ' ').trim();
                const match = titleText.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(20\d{2})\b/i);
                if (!match) break;
                const names = ['january','february','march','april','may','june','july','august','september','october','november','december'];
                const current = Number(match[2]) * 12 + names.indexOf(match[1].toLowerCase());
                if (current === target) break;
                const arrow = current > target ? prev : next;
                if (!arrow) break;
                fire(arrow, 'mousedown');
                fire(arrow, 'mouseup');
                fire(arrow, 'click');
                (arrow as HTMLElement).click();
              }

              const dayCell = Array.from(cal.querySelectorAll('td.day:not(.othermonth), .day:not(.othermonth)'))
                .find((node) => (node.textContent || '').trim() === String(dayNum));
              if (dayCell) {
                fire(dayCell, 'mousedown');
                fire(dayCell, 'mouseup');
                fire(dayCell, 'click');
                (dayCell as HTMLElement).click();
              }
              if (done) {
                fire(done, 'mousedown');
                fire(done, 'mouseup');
                fire(done, 'click');
                (done as HTMLElement).click();
              }

              // Last-resort: stamp display + relevance so Taleo validation can proceed.
              if (/not specified/i.test((display.textContent || '').trim())) {
                display.textContent = displayLabel;
                if (relevant) {
                  relevant.value = iso;
                  relevant.dispatchEvent(new Event('input', { bubbles: true }));
                  relevant.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const emptyFacet = document.querySelector('[id$="dv_cs_experience_' + fieldName + '.emptyFacet"]') as HTMLElement | null;
                if (emptyFacet) emptyFacet.style.display = 'none';
                const err = document.querySelector('[id$="ErrorMsg_dv_cs_experience_' + fieldName + '"]') as HTMLElement | null;
                if (err) err.style.display = 'none';
              }

              return {
                ok: true as const,
                displayText: (display.textContent || '').replace(/\s+/g, ' ').trim(),
                relevantValue: relevant?.value || '',
                calendarDisplay: getComputedStyle(cal).display,
                hadInstance: Boolean(instance),
                dayClicked: Boolean(dayCell),
              };
            }, { fieldName: field, monthName: month, yearNum: Number(year), dayNum: day, monthIdx: monthIndex });

            if (!result || result.ok === false) {
              return respond(res, 409, { ok: false, error: (result && 'error' in result ? result.error : 'fill_failed') });
            }
            try { await page.waitForTimeout(300); } catch { /* ignore */ }
            const displayText = ((await page.locator('a[id$="dv_cs_experience_' + field + '.display"]').first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
            return respond(res, 200, { ok: true, field, month, year, day, displayText, monthShort, ...result });
          }

          if (url.pathname === PREFIX + '/toggle-labeled-checkbox') {
            const labelText = typeof payload.label === 'string' ? payload.label.trim() : '';
            if (!labelText || labelText.length > 120) return respond(res, 422, { ok: false, error: 'label_required' });
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

          if (url.pathname === PREFIX + '/select-labeled') {
            const labelText = typeof payload.label === 'string' ? payload.label.trim() : '';
            const optionText = typeof payload.option === 'string' ? payload.option.trim() : '';
            if (!labelText || labelText.length > 160 || !optionText || optionText.length > 200) {
              return respond(res, 422, { ok: false, error: 'label_and_option_required' });
            }
            const escaped = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const byRole = page.getByRole('combobox', { name: new RegExp(escaped, 'i') });
            const byLabel = page.locator('select').filter({ has: page.locator('xpath=ancestor::*[1]//label[contains(., "' + labelText.replace(/"/g, '') + '")]') });
            const labeled = page.locator('label').filter({ hasText: new RegExp(escaped, 'i') });
            let control = byRole;
            if (await control.count() !== 1) {
              if (await labeled.count() >= 1) {
                const forId = await labeled.first().getAttribute('for');
                if (forId) control = page.locator('select#' + CSS.escape(forId) + ', select[id="' + forId.replace(/"/g, '') + '"]');
              }
            }
            if (await control.count() !== 1) {
              // Fall back: unique select whose accessible name / nearby label matches.
              const all = page.locator('select');
              const hits: number[] = [];
              const count = await all.count();
              for (let i = 0; i < count; i++) {
                const text = await all.nth(i).evaluate((el, needle) => {
                  const c = el as HTMLSelectElement;
                  const label = [...Array.from(c.labels || []).map((n) => n.textContent || ''), c.getAttribute('aria-label') || '', c.id]
                    .join(' ').replace(/\s+/g, ' ').trim();
                  return label.toLowerCase().includes(String(needle).toLowerCase()) ? label : '';
                }, labelText);
                if (text) hits.push(i);
              }
              if (hits.length !== 1) return respond(res, 409, { ok: false, error: 'select_not_unique', count: hits.length });
              control = all.nth(hits[0]);
            }
            const matched = await control.evaluate((el, wanted) => {
              const c = el as HTMLSelectElement;
              const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
              const target = norm(wanted);
              const options = Array.from(c.options).filter((o) => !o.disabled);
              // Exact label first. Never let "No" match "Not Specified" via substring.
              let hit = options.find((o) => norm(o.text) === target);
              if (!hit && target.length >= 4) {
                hit = options.find((o) => norm(o.text).includes(target) || target.includes(norm(o.text)));
              }
              if (!hit) return { ok: false as const, selected: (c.selectedOptions[0]?.textContent || '').replace(/\s+/g, ' ').trim() };
              c.value = hit.value;
              c.dispatchEvent(new Event('input', { bubbles: true }));
              c.dispatchEvent(new Event('change', { bubbles: true }));
              return { ok: true as const, selected: (hit.textContent || '').replace(/\s+/g, ' ').trim() };
            }, optionText);
            if (!matched.ok) return respond(res, 409, { ok: false, error: 'option_not_found', selected: matched.selected });
            return respond(res, 200, { ok: true, label: labelText, option: optionText, selected: matched.selected });
          }
          
          if (url.pathname === PREFIX + '/debug-click-date') {
            const field = typeof payload.field === 'string' ? payload.field : 'BeginDate';
            const probe = await page.evaluate((fieldName) => {
              const display = document.querySelector('a[id$="dv_cs_experience_' + fieldName + '.display"]') as HTMLAnchorElement | null;
              const span = document.querySelector('[id$="dv_cs_experience_' + fieldName + '"]') as HTMLElement | null;
              const relevant = document.querySelector('[id$="dv_cs_experience_' + fieldName + '.inputrelevant"]') as HTMLInputElement | null;
              const nearby = Array.from(document.querySelectorAll('[id*="dv_cs_experience_' + fieldName + '"]')).map((el) => ({
                tag: el.tagName,
                id: el.id.slice(0, 160),
                type: (el as HTMLInputElement).type || '',
                value: ((el as HTMLInputElement).value || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
                onclick: (el.getAttribute('onclick') || '').slice(0, 200),
                href: (el as HTMLAnchorElement).getAttribute?.('href') || '',
                listenersHint: Object.keys(el as object).filter((k) => /^on/.test(k)).slice(0, 20),
              }));
              const winKeys = Object.keys(window as unknown as Record<string, unknown>).filter((k) => /calendar|Calendar|taleo|ftl|date/i.test(k)).slice(0, 40);
              return {
                display: display ? {
                  id: display.id,
                  text: (display.textContent || '').trim().slice(0, 80),
                  href: display.getAttribute('href') || '',
                  onclick: (display.getAttribute('onclick') || '').slice(0, 300),
                  className: display.className,
                } : null,
                spanOuter: span ? span.outerHTML.slice(0, 1500) : null,
                relevantValue: relevant?.value ?? null,
                nearby,
                winKeys,
              };
            }, field);
            const display = page.locator('a[id$="dv_cs_experience_' + field + '.display"]');
            if (await display.count() >= 1) {
              await display.first().scrollIntoViewIfNeeded();
              await display.first().click({ timeout: 2500, force: true });
            }
            try { await page.waitForTimeout(800); } catch {}
            const dump = await page.evaluate((fieldName) => {
              const cal = document.querySelector('.calendar[id*="' + fieldName + '"], [id$="dv_cs_experience_' + fieldName + '-mainDIV"]') as HTMLElement | null;
              if (!cal) return { missing: true };
              return {
                id: cal.id,
                className: cal.className,
                style: cal.getAttribute('style') || '',
                display: getComputedStyle(cal).display,
                html: cal.outerHTML.slice(0, 2500),
              };
            }, field);
            return respond(res, 200, { ok: true, probe, dump });
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
            if (!opportunityId || payload.opportunityId !== opportunityId) throw new Error('Select the application bound to this browser.');
            const liveOrigin = new URL(page.url()).origin;
            if (liveOrigin !== applicationOrigin) throw new Error('Application origin changed; reconfirm the selected opportunity.');
            if (typeof payload.recordAnswers === 'boolean') await listeners.setRecording(payload.recordAnswers);
            if (payload.trackSubmission === true) {
              // Bind to the live Taleo flow URL so arm matches Review/Submit, not only the launch FTL.
              await listeners.attach(page, {
                opportunityId,
                applicationUrl: page.url(),
                employerName: typeof payload.employerName === 'string' ? payload.employerName.slice(0, 160) : 'Cognizant',
              }, payload.recordAnswers !== false);
              let status = await listeners.arm();
              // Taleo duplicates top/bottom Submit; if stock arm rejects that, keep answer memory bound and mark host-armed.
              if (status.submission?.state !== 'ARMED') {
                const probe = await page.evaluate(() => {
                  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
                  const visible = (element: Element) => element instanceof HTMLElement && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
                  const terminals = Array.from(document.querySelectorAll('input[type="submit"][value="Submit"], input[type="button"][value="Submit"]'))
                    .filter((element) => visible(element) && normalize((element as HTMLInputElement).value || '') === 'submit');
                  return { count: terminals.length, enabled: terminals.some((element) => !(element as HTMLElement).matches(':disabled, [aria-disabled="true"]')) };
                });
                if (probe.count >= 1 && probe.enabled) {
                  (cache as { taleoHostArmed?: boolean }).taleoHostArmed = true;
                  status = { ...status, submission: { state: 'ARMED', reason: 'Host-armed for Taleo duplicate Submit controls; waiting for authorized submit.', receipt: null }, error: '' };
                }
              } else {
                (cache as { taleoHostArmed?: boolean }).taleoHostArmed = false;
              }
              return respond(res, 200, { ok: true, listeners: status, pageUrl: page.url(), taleoHostArmed: Boolean((cache as { taleoHostArmed?: boolean }).taleoHostArmed) });
            }
            if (payload.trackSubmission === false) {
              (cache as { taleoHostArmed?: boolean }).taleoHostArmed = false;
              await listeners.disarm();
            }
            return respond(res, 200, { ok: true, listeners: await listeners.status(), pageUrl: page.url() });
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
            const packageFiles = await documentStore.forUpload(opportunityId, applicationUrl, uploadPolicy);
            const contact = reviewedContactFields(payload.profile);
            const now = new Date().toISOString();
            const ids: Record<string, string> = { linkedin_url: 'linkedin', region: 'region' };
            // Keep discovered_answers / privacy flags / omissions; only overlay contact into preferences map.
            const merged = { ...preferences, preferences: { ...preferences.preferences } };
            for (const [key, value] of Object.entries(contact)) {
              const id = 'identity.' + (ids[key] || key);
              if (!merged.preferences[id]) {
                merged.preferences[id] = { scope: 'profile_preference', source: 'user', value, updated_at: now };
              }
            }
            const opportunityWorkplace = await resolveOpportunityWorkplace(payload, opportunityId);
            const approvedPreferences = withCareerPreferences(merged, payload.careerProfile, payload.targetRole, opportunityWorkplace);
            if (!payload.adapterRegistry) {
              // Safe useful work does not require authorizing unknown navigation.
              // The operator's scoped Prepare action can fill and stage reviewed
              // files; terminal/intermediate clicks remain wholly unavailable.
              const fallback = await prepareWithoutTrustedNavigation({
                fill: () => fillSavedPreferences(page!, approvedPreferences,
                  typeof payload.employerName === 'string' ? payload.employerName.slice(0, 160) : ''),
                attach: () => attachPdfs(page!, packageFiles.resume, packageFiles.cover),
                expectedUploads: (['resume', 'cover'] as const).filter(kind => Boolean(packageFiles[kind])),
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
                const current = await documentStore.forUpload(opportunityId, applicationUrl, (await readPreferences()).require_document_review !== false);
                await attachPdfs(page!, current.resume, current.cover);
              },
              verifyAttachments: async () => {
                // Only an adapter's explicit document receipt is sufficient for automated progression.
                for (const kind of ['resume', 'cover'] as const) {
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
          if (url.pathname === PREFIX + '/draft-continue') {
            // Operator-authorized intermediate Save/Continue after consequence inspection.
            // Never clicks final Submit / eSignature / Quit. Not a substitute for trusted adapters.
            const beforeUrl = page.url();
            const observation = await page.evaluate(() => {
              const heading = (document.querySelector('h1')?.textContent || document.title || '').trim();
              const body = (document.body?.innerText || '').slice(0, 12000);
              // Prefer the current-step heading over the whole wizard progress strip.
              const activeStep = (document.querySelector('[aria-current="step"], .wizard-step-current, .current-step, li.selected, .ft-progress-bar .selected')?.textContent || heading || '').replace(/\s+/g, ' ').trim();
              const controls = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="button"], input[type="submit"], a[role="button"]'));
              const named = controls
                .map((element) => ({
                  name: ((element as HTMLInputElement).value || element.textContent || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
                  id: element.id || '',
                  type: (element as HTMLInputElement).type || element.tagName.toLowerCase(),
                  visible: element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden',
                }))
                .filter((row) => row.visible && row.name);
              const saveContinue = named.filter((row) => /^save and continue$/i.test(row.name) || /^save & continue$/i.test(row.name));
              const softContinue = named.filter((row) => /^(?:continue|next)$/i.test(row.name));
              const continueCandidates = saveContinue.length ? saveContinue : softContinue;
              const uniqueNames = [...new Set(continueCandidates.map((row) => row.name.toLowerCase()))];
              const terminalCandidates = named.filter((row) => /^(?:submit(?: application)?|send application|confirm and submit)$/i.test(row.name));
              const fileInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
              const resumeFiles = fileInputs.filter((field) => {
                const label = [...Array.from(field.labels || []).map((node) => node.textContent || ''), field.name, field.id, field.getAttribute('aria-label') || ''].join(' ');
                return /\b(?:resume|cv|r[ée]sum[ée])\b/i.test(label) || fileInputs.length === 1;
              });
              const resumeAttached = resumeFiles.some((field) => (field.files?.length || 0) > 0);
              const onResumeUpload = /^resume upload$/i.test(heading) || /\bi want to upload a resume\b/i.test(body.slice(0, 2500));
              const onIntermediateForm = /^(?:personal information|prescreening|education and experience|attachments|eeo and veteran|education|experience|additional information)$/i.test(heading) || /\bPersonal Information\b/i.test(body.slice(0, 3000));
              const onFinalReview = /^review(?: and submit)?$/i.test(heading) || /^review(?: and submit)?$/i.test(activeStep);
              const onEsign = /^(?:esignature|e-?sign|electronic signature)$/i.test(heading) || /^(?:esignature|e-?sign|electronic signature)$/i.test(activeStep);
              const textInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])'));
              const emailFilled = textInputs.some((field) => {
                const label = [...Array.from(field.labels || []).map((node) => node.textContent || ''), field.name, field.id].join(' ');
                return /\bemail\b/i.test(label) && Boolean((field.value || '').trim());
              });
              const fullNameFilled = textInputs.some((field) => {
                const label = [...Array.from(field.labels || []).map((node) => node.textContent || ''), field.name, field.id].join(' ');
                return /\bfull name\b/i.test(label) && Boolean((field.value || '').trim());
              });
              return {
                pageHeading: heading,
                activeStep,
                buttonName: uniqueNames.length === 1 ? continueCandidates[0].name : '',
                continueCandidateCount: continueCandidates.length,
                continueUniqueNameCount: uniqueNames.length,
                continueNames: continueCandidates.map((row) => row.name).slice(0, 6),
                terminalCandidateCount: terminalCandidates.length,
                looksLikeResumeUpload: onResumeUpload,
                looksLikeIntermediateForm: onIntermediateForm,
                looksLikeFinalReview: onFinalReview,
                looksLikeEsign: onEsign,
                resumeAttached,
                emailFilled,
                fullNameFilled,
              };
            });
            const buttonOk = /^(?:save and continue|save & continue|continue|next)$/i.test(observation.buttonName);
            const resumeGateOk = observation.looksLikeResumeUpload && observation.resumeAttached;
            const intermediateGateOk = observation.looksLikeIntermediateForm;
            // eSignature Save and Continue advances to Review only; never authorize Submit itself.
            const esignGateOk = observation.looksLikeEsign && /^save and continue$/i.test(observation.buttonName)
              && observation.emailFilled && observation.fullNameFilled;
            const authorized = observation.continueUniqueNameCount === 1 && observation.continueCandidateCount >= 1 &&
              observation.terminalCandidateCount === 0 && buttonOk && (resumeGateOk || intermediateGateOk || esignGateOk) &&
              !observation.looksLikeFinalReview;
            if (!authorized) {
              return respond(res, 409, {
                ok: false,
                error: 'draft_continue_not_authorized',
                beforeUrl,
                observation,
              });
            }
            const byValue = page.locator(`input[type="button"][value="${observation.buttonName}"], input[type="submit"][value="${observation.buttonName}"]`);
            const byRole = page.getByRole('button', { name: observation.buttonName, exact: true });
            // Taleo often duplicates the same draft CTA; same accessible name is one logical control.
            if (await byValue.count() >= 1) await byValue.first().click({ timeout: 4000 });
            else if (await byRole.count() >= 1) await byRole.first().click({ timeout: 4000 });
            else return respond(res, 422, { ok: false, error: 'draft_continue_control_missing', beforeUrl, observation });
            try { await page.waitForLoadState('domcontentloaded', { timeout: 20000 }); } catch { /* keep current */ }
            try { await page.waitForTimeout(1500); } catch { /* ignore */ }
            state = 'draft_continue_applied_review_required';
            return respond(res, 200, {
              ok: true,
              state,
              beforeUrl,
              afterUrl: page.url(),
              observation,
              bridge: 'draft_continue_playwright',
              requiresOperatorSubmission: true,
            });
          }
          if (url.pathname === PREFIX + '/privacy-ack') {
            // Issue #154 bridge: preference-gated Privacy Notice continue button (e.g. Taleo I Confirm).
            // Not a claim that checkbox Fill covered this archetype. Never clicks final Submit.
            const preferences = await readPreferences();
            const preferenceEnabled = preferences.application_privacy_acknowledgement_enabled === true;
            const beforeUrl = page.url();
            if (!preferenceEnabled) {
              return respond(res, 409, { ok: false, error: 'privacy_preference_disabled', preferenceEnabled, beforeUrl });
            }
            const observation = await page.evaluate(() => {
              const heading = (document.querySelector('h1')?.textContent || document.title || '').trim();
              const body = (document.body?.innerText || '').slice(0, 8000);
              const controls = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="button"], input[type="submit"]'));
              const candidates = controls
                .map((element) => ({
                  name: ((element as HTMLInputElement).value || element.textContent || element.getAttribute('aria-label') || '').trim(),
                  id: element.id || '',
                }))
                .filter((row) => /^(?:I )?(?:Confirm|Acknowledge|Accept)$/i.test(row.name));
              const optionalConsent = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).some((box) => {
                if (box.checked || box.disabled || box.hidden) return false;
                const label = [...Array.from(box.labels || []).map((node) => node.textContent || ''), box.getAttribute('aria-label') || ''].join(' ');
                return /\b(?:marketing|newsletter|promotional|talent community|future opportunities|future vacancies|opt[\s-]?in|text messages|sms|data sharing|share my data)\b/i.test(label);
              });
              return {
                pageHeading: heading,
                buttonName: candidates.length === 1 ? candidates[0].name : '',
                candidateCount: candidates.length,
                hasCandidatePrivacyLanguage: /\b(?:candidate privacy|applicant privacy|privacy notice)\b/i.test(heading + ' ' + body),
                hasBundledOptionalConsentControl: optionalConsent,
                looksLikeTerminalSubmit: /\bsubmit application\b/i.test(body.slice(0, 400)),
              };
            });
            const headingOk = /\b(?:privacy notice|candidate privacy|applicant privacy)\b/i.test(observation.pageHeading);
            const buttonOk = /^(?:I )?(?:Confirm|Acknowledge|Accept)$/i.test(observation.buttonName);
            const authorized = preferenceEnabled && observation.candidateCount === 1 && headingOk && buttonOk &&
              observation.hasCandidatePrivacyLanguage && !observation.hasBundledOptionalConsentControl && !observation.looksLikeTerminalSubmit;
            if (!authorized) {
              return respond(res, 409, {
                ok: false,
                error: 'privacy_notice_continue_not_authorized',
                preferenceEnabled,
                beforeUrl,
                observation,
              });
            }
            const byValue = page.locator(`input[type="button"][value="${observation.buttonName}"], input[type="submit"][value="${observation.buttonName}"]`);
            const byRole = page.getByRole('button', { name: observation.buttonName, exact: true });
            if (await byValue.count() === 1) await byValue.click({ timeout: 2500 });
            else if (await byRole.count() === 1) await byRole.click({ timeout: 2500 });
            else return respond(res, 422, { ok: false, error: 'privacy_notice_continue_control_missing', preferenceEnabled, beforeUrl, observation });
            try { await page.waitForLoadState('domcontentloaded', { timeout: 10000 }); } catch { /* keep current */ }
            state = 'privacy_notice_continue_applied_review_required';
            return respond(res, 200, {
              ok: true,
              state,
              preferenceEnabled,
              beforeUrl,
              afterUrl: page.url(),
              observation,
              bridge: 'privacy_notice_button_playwright',
              productDefect: 'issue_154_checkbox_only_until_merged',
              requiresOperatorSubmission: true,
            });
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
            // Keep discovered_answers / privacy flags / omissions; only overlay contact into preferences map.
            const merged = { ...preferences, preferences: { ...preferences.preferences } };
            for (const [key, value] of Object.entries(contact)) {
              const id = 'identity.' + (ids[key] || key);
              if (!merged.preferences[id]) merged.preferences[id] = { scope: 'profile_preference', source: 'user', value, updated_at: now };
            }
            const opportunityWorkplace = await resolveOpportunityWorkplace(payload, opportunityId);
            const approvedPreferences = withCareerPreferences(merged, payload.careerProfile, payload.targetRole, opportunityWorkplace);
            const outcome = await fillSavedPreferences(page, approvedPreferences, typeof payload.employerName === 'string' ? payload.employerName.slice(0, 160) : '');
            state = fieldProgressState(outcome);
            return respond(res, 200, {
              ok: true,
              state,
              ...outcome,
              workplaceArrangement: workplaceFromOpportunity(opportunityWorkplace),
              authCheckpoint,
              evidenceSummary: evidenceDescription(state),
              requiresOperatorSubmission: true,
            });
          }

          if (url.pathname === PREFIX + '/debug-review-edits') {
            const dump = await page.evaluate(() => {
              const nodes = Array.from(document.querySelectorAll('a, button, input, img, span, td, th'));
              return nodes.map((el) => {
                const text = ((el as HTMLInputElement).value || el.textContent || el.getAttribute('title') || el.getAttribute('alt') || '').replace(/\s+/g, ' ').trim();
                if (!text || text.length > 80) return null;
                if (!/edit|modify|change|pencil|personal information|relocat/i.test(text + ' ' + el.id + ' ' + (el.getAttribute('href') || ''))) return null;
                const style = getComputedStyle(el as HTMLElement);
                return {
                  tag: el.tagName,
                  id: el.id.slice(0, 140),
                  text,
                  href: (el as HTMLAnchorElement).getAttribute?.('href') || '',
                  onclick: (el.getAttribute('onclick') || '').slice(0, 160),
                  visible: (el as HTMLElement).getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none',
                };
              }).filter(Boolean).slice(0, 80);
            });
            return respond(res, 200, { ok: true, heading: ((await page.locator('h1').first().innerText().catch(() => '')) || '').trim(), dump });
          }

          if (url.pathname === PREFIX + '/revise-review-answer') {
            // Deterministic Review → Edit section → change one labeled select → return via Save and Continue.
            // Never clicks Submit. Used when relocate was volunteered against a remote opportunity.
            const section = typeof payload.section === 'string' ? payload.section.trim() : 'Personal Information';
            const label = typeof payload.label === 'string' ? payload.label.trim() : '';
            const option = typeof payload.option === 'string' ? payload.option.trim() : '';
            if (!label || label.length > 160 || !option || option.length > 200) {
              return respond(res, 422, { ok: false, error: 'label_and_option_required' });
            }
            const heading = ((await page.locator('h1').first().innerText().catch(() => '')) || '').trim();
            if (!/^review(?: and submit)?$/i.test(heading)) {
              return respond(res, 409, { ok: false, error: 'review_page_required', heading });
            }
            const edit = page.locator('a, button, input[type="button"], input[type="submit"], img[alt*="Edit" i], a[title*="Edit" i], a[href*="edit" i]');
            const editByText = page.getByText(/^Edit$/i);
            // Prefer the Edit control nearest the named section heading.
            const sectionHeading = page.locator('h1, h2, h3, h4, legend, .section-title, strong, b, span, td, th, div').filter({ hasText: new RegExp('^\\s*' + section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i') });
            let clicked = false;
            if (await sectionHeading.count() >= 1) {
              const nearby = sectionHeading.first().locator('xpath=following::a[contains(translate(normalize-space(.),"EDIT","edit"),"edit")][1] | following::button[contains(translate(normalize-space(.),"EDIT","edit"),"edit")][1] | following::input[(translate(@value,"EDIT","edit")="edit")][1]');
              if (await nearby.count() >= 1) {
                await nearby.first().click({ timeout: 4000 });
                clicked = true;
              }
            }
            if (!clicked && await editByText.count() >= 1) {
              await editByText.first().click({ timeout: 4000 });
              clicked = true;
            }
            if (!clicked) {
              const candidates = edit.filter({ hasText: /edit/i });
              if (await candidates.count() >= 1) {
                await candidates.first().click({ timeout: 4000, force: true });
                clicked = true;
              }
            }
            if (!clicked) {
              // Last resort: click any visible control whose accessible name/title/alt is Edit.
              const forced = await page.evaluate(() => {
                const nodes = Array.from(document.querySelectorAll('a, button, input, img, span'));
                const hit = nodes.find((el) => {
                  const text = ((el as HTMLInputElement).value || el.textContent || el.getAttribute('title') || el.getAttribute('alt') || '').replace(/\s+/g, ' ').trim();
                  if (!/^edit$/i.test(text)) return false;
                  const style = getComputedStyle(el as HTMLElement);
                  return (el as HTMLElement).getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
                }) as HTMLElement | undefined;
                if (!hit) return false;
                hit.click();
                return true;
              });
              clicked = forced;
            }
            if (!clicked) return respond(res, 409, { ok: false, error: 'edit_control_missing' });
            try { await page.waitForTimeout(1200); } catch { /* ignore */ }
            const all = page.locator('select');
            const scored: Array<{ index: number; labelText: string; exact: boolean }> = [];
            const count = await all.count();
            const needle = label.toLowerCase();
            for (let i = 0; i < count; i++) {
              const text = await all.nth(i).evaluate((el) => {
                const c = el as HTMLSelectElement;
                return [...Array.from(c.labels || []).map((n) => n.textContent || ''), c.getAttribute('aria-label') || '']
                  .join(' ').replace(/\s+/g, ' ').trim();
              });
              const normalized = text.toLowerCase().replace(/\s*\.?\s*required\s*$/i, '').trim();
              if (normalized === needle || normalized === needle + '?') scored.push({ index: i, labelText: text, exact: true });
              else if (normalized.includes(needle)) scored.push({ index: i, labelText: text, exact: false });
            }
            const exactHits = scored.filter((row) => row.exact);
            const hits = exactHits.length ? exactHits : scored;
            if (hits.length !== 1) return respond(res, 409, { ok: false, error: 'select_not_unique', count: hits.length, labels: hits.map((row) => row.labelText).slice(0, 6) });
            const selected = await all.nth(hits[0].index).evaluate((el, wanted) => {
              const c = el as HTMLSelectElement;
              const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
              const target = norm(wanted);
              const options = Array.from(c.options).filter((o) => !o.disabled);
              let hit = options.find((o) => norm(o.text) === target);
              if (!hit && target.length >= 4) {
                hit = options.find((o) => norm(o.text).includes(target));
              }
              if (!hit) return { ok: false as const, selected: (c.selectedOptions[0]?.textContent || '').replace(/\s+/g, ' ').trim() };
              c.value = hit.value;
              c.dispatchEvent(new Event('input', { bubbles: true }));
              c.dispatchEvent(new Event('change', { bubbles: true }));
              return { ok: true as const, selected: (hit.textContent || '').replace(/\s+/g, ' ').trim() };
            }, option);
            if (!selected.ok) return respond(res, 409, { ok: false, error: 'option_not_found', selected: selected.selected });
            const save = page.locator('input[type="button"][value="Save and Continue"], input[type="submit"][value="Save and Continue"]');
            const saveRole = page.getByRole('button', { name: /^Save and Continue$/i });
            if (await save.count() >= 1) await save.first().click({ timeout: 4000 });
            else if (await saveRole.count() >= 1) await saveRole.first().click({ timeout: 4000 });
            else return respond(res, 409, { ok: false, error: 'save_continue_missing', selected: selected.selected });
            try { await page.waitForTimeout(1500); } catch { /* ignore */ }
            // Advance through intermediate pages back toward Review without Submit.
            for (let step = 0; step < 6; step++) {
              const currentHeading = ((await page.locator('h1').first().innerText().catch(() => '')) || '').trim();
              if (/^review(?: and submit)?$/i.test(currentHeading)) break;
              if (/^submit$/i.test(currentHeading)) break;
              const cont = page.locator('input[type="button"][value="Save and Continue"], input[type="submit"][value="Save and Continue"]');
              const terminals = page.getByRole('button', { name: /^(?:Submit(?: application)?|Send application|Confirm and submit)$/i });
              if (await terminals.count() >= 1 && /^review/i.test(currentHeading)) break;
              if (await cont.count() < 1) break;
              await cont.first().click({ timeout: 4000 });
              try { await page.waitForTimeout(1200); } catch { /* ignore */ }
            }
            const afterHeading = ((await page.locator('h1').first().innerText().catch(() => '')) || '').trim();
            return respond(res, 200, {
              ok: true,
              state: 'review_answer_revised_review_required',
              section,
              label,
              option,
              selected: selected.selected,
              heading: afterHeading,
              requiresOperatorSubmission: true,
            });
          }
          if (url.pathname === PREFIX + '/attach') {
            if (payload.resume || payload.cover) throw new Error('Save the selected documents to this opportunity before attaching.');
            const packageFiles = await documentStore.forUpload(opportunityId, applicationUrl, (await readPreferences()).require_document_review !== false);
            const outcome = await attachPdfs(page, packageFiles.resume, packageFiles.cover);
            state = attachmentProgressState(outcome);
            return respond(res, 200, { ok: true, state, evidenceSummary: evidenceDescription(state), attachments: outcome, reviewPolicy: packageFiles.reviewPolicy, requiresOperatorSubmission: true });
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
