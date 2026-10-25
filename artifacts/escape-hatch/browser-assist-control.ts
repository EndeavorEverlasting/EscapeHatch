import { prepareWithoutTrustedNavigation } from './managed-prepare-fallback.ts';
import { assertInspectionScope, inspectApplicationRequirements } from './application-requirements.ts';
import { OpportunityDocumentStore, documentScope, type DocumentKind } from './opportunity-documents.ts';
import { ManagedListeners } from './managed-listeners.ts';
import { withCareerPreferences } from './career-preferences.ts';
import { captureMilitaryAnswers } from './managed-form.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import type { Plugin } from 'vite';
import { isLoopbackAddress, readManagedRuntime } from './runtime-control.ts';
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
    preparation: PreparationResult | null; listeners: ManagedListeners; busy: boolean };
  const cacheHost = globalThis as typeof globalThis & { [key: symbol]: SessionCache };
  const cacheKey = Symbol.for('escapehatch.managed-browser.' + (managed?.identity.instanceId || 'unmanaged'));
  const cache = cacheHost[cacheKey] ||= { context: null, page: null, state: 'idle', applicationOrigin: '', applicationUrl: '',
    opportunityId: '', preparation: null, busy: false, listeners: new ManagedListeners() };
  let context = cache.context;
  let page = cache.page;
  let state = cache.state;
  let applicationOrigin = cache.applicationOrigin;
  let applicationUrl = cache.applicationUrl;
  const documentStore = new OpportunityDocumentStore();
  let opportunityId = cache.opportunityId;
  let preparation = cache.preparation;
  const listeners = cache.listeners;
  return {
    name: 'escapehatch-managed-browser-assist',
    configureServer(server) {
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
        if (url.pathname === PREFIX + '/status' && req.method === 'GET') {
          if (page?.isClosed()) { page = null; state = 'browser_closed'; }
          let listenerState;
          try { listenerState = await listeners.status(); }
          catch { return respond(res, 422, { ok: false, error: 'Submission evidence unavailable; existing records preserved.' }); }
          return respond(res, 200, {
            ok: true,
            state,
            browserOpen: Boolean(page),
            requiresOperatorSubmission: true,
            preparationState: preparation?.state || null,
            preparationCode: preparation?.code || null,
            pagesPrepared: preparation?.pagesPrepared ?? 0,
            intermediateSteps: preparation?.intermediateSteps ?? 0,
            finalActionActivated: false,
            pendingManual: preparation?.pendingManual || [],
            listeners: listenerState,
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
              const file = await documentStore.file(scope.opportunityId, scope.url, kind);
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
            if (!context) {
              const folder = path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'EscapeHatch', 'managed-career-browser');
              await fs.mkdir(folder, { recursive: true });
              context = await chromium.launchPersistentContext(folder, {
                channel: 'chrome', headless: false, acceptDownloads: false, viewport: null,
              });
              context.on('close', () => {
                context = null; page = null; state = 'browser_closed'; preparation = null;
                Object.assign(cache, { context, page, state, preparation });
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
            } catch {
              state = 'browser_open_navigation_unverified';
            }
            if (state === 'application_form_open_review_required' && opportunityId) {
              await listeners.attach(page, { opportunityId, applicationUrl: page.url(),
                employerName: typeof payload.employerName === 'string' ? payload.employerName.slice(0, 160) : '' });
              await listeners.arm();
            }
            return respond(res, 200, { ok: true, state, requiresOperatorSubmission: true });
          }
          if (!page || page.isClosed()) return respond(res, 409, { ok: false, error: 'launch_browser_first' });
          if (new URL(page.url()).origin !== applicationOrigin) return respond(res, 409, { ok: false, error: 'application_origin_changed_review_required' });
          await page.bringToFront();
          if (url.pathname === PREFIX + '/requirements') {
            assertInspectionScope(payload.opportunityId, payload.url, opportunityId, applicationUrl, page.url());
            return respond(res, 200, { ok: true, inspection: await inspectApplicationRequirements(page, opportunityId, applicationUrl) });
          }
          if (url.pathname === PREFIX + '/listeners') {
            if (payload.opportunityId !== opportunityId || payload.url !== applicationUrl) throw new Error('Select the application bound to this browser.');
            if (typeof payload.recordAnswers === 'boolean') await listeners.setRecording(payload.recordAnswers);
            if (payload.trackSubmission === true) await listeners.arm();
            if (payload.trackSubmission === false) await listeners.disarm();
            return respond(res, 200, { ok: true, listeners: await listeners.status() });
          }
          if (url.pathname === PREFIX + '/questions') return respond(res, 200, { ok: true, questions: await listeners.catalog(page) });
          if ([PREFIX + '/attach', PREFIX + '/prepare'].includes(url.pathname)) {
            const scope = documentScope(payload.opportunityId, payload.url);
            const live = new URL(page.url()), launched = new URL(applicationUrl);
            if (!opportunityId || scope.opportunityId !== opportunityId || scope.url !== launched.href ||
              (live.pathname !== launched.pathname && !live.pathname.startsWith(launched.pathname.replace(/\/$/, '') + '/'))) throw new Error('Document opportunity binding changed; relaunch the selected opportunity.');
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
            const merged = { ...emptyPreferences(), preferences: { ...preferences.preferences } };
            for (const [key, value] of Object.entries(contact)) {
              const id = 'identity.' + (ids[key] || key);
              if (!merged.preferences[id]) {
                merged.preferences[id] = { scope: 'profile_preference', source: 'user', value, updated_at: now };
              }
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
                expectedUploads: (['resume', 'cover'] as const).filter(kind => Boolean(packageFiles[kind])),
              });
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
          if (url.pathname === PREFIX + '/fill') {
            const preferences = await readPreferences();
            const contact = reviewedContactFields(payload.profile);
            const now = new Date().toISOString();
            const ids: Record<string, string> = { linkedin_url: 'linkedin', region: 'region' };
            const merged = { ...emptyPreferences(), preferences: { ...preferences.preferences } };
            for (const [key, value] of Object.entries(contact)) {
              const id = 'identity.' + (ids[key] || key);
              if (!merged.preferences[id]) merged.preferences[id] = { scope: 'profile_preference', source: 'user', value, updated_at: now };
            }
            const outcome = await fillSavedPreferences(page, withCareerPreferences(merged, payload.careerProfile, payload.targetRole), typeof payload.employerName === 'string' ? payload.employerName.slice(0, 160) : '');
            state = 'fields_filled_review_required';
            return respond(res, 200, { ok: true, state, ...outcome, requiresOperatorSubmission: true });
          }
          if (url.pathname === PREFIX + '/attach') {
            if (payload.resume || payload.cover) throw new Error('Save the selected documents to this opportunity before attaching.');
            const packageFiles = await documentStore.forUpload(opportunityId, applicationUrl, (await readPreferences()).require_document_review !== false);
            const outcome = await attachPdfs(page, packageFiles.resume, packageFiles.cover);
            state = 'attachments_staged_review_required';
            return respond(res, 200, { ok: true, state, attachments: outcome, reviewPolicy: packageFiles.reviewPolicy, requiresOperatorSubmission: true });
          }
          return respond(res, 404, { ok: false, error: 'unknown_action' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Operation failed.';
          // Never log URLs, profile values, job forms, tokens or private document contents.
          return respond(res, 422, { ok: false, error: message.slice(0, 160) });
        } finally {
          Object.assign(cache, { context, page, state, applicationOrigin, applicationUrl, opportunityId, preparation });
          cache.busy = false;
        }
      });
    },
  };
}
