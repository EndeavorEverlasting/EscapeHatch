import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import type { Plugin } from 'vite';
import { isLoopbackAddress, readManagedRuntime } from './runtime-control.ts';
import { readPreferences, savePreferences, clearPreferences } from './preference-file.ts';
import { fillSavedPreferences, openApplicationForm } from './managed-form.ts';
import { emptyPreferences } from './src/lib/application-preferences.ts';

const PREFIX = '/__escapehatch/managed-assist';
const MAX_BODY = 15 * 1024 * 1024;
const MAX_PDF = 5 * 1024 * 1024;
const ACTION_HEADER = 'x-escapehatch-operator-action';
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
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let busy = false;
  let state = 'idle';
  let applicationOrigin = '';
  const managed = readManagedRuntime();
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
          return respond(res, 200, { ok: true, state, browserOpen: Boolean(page), requiresOperatorSubmission: true });
        }
        if (url.pathname === PREFIX + '/preferences' && req.method === 'GET') {
          if (req.headers.origin && req.headers.origin !== expectedOrigin || req.headers['sec-fetch-site'] === 'cross-site') return respond(res, 403, { ok: false, error: 'operator_origin_required' });
          try { return respond(res, 200, { ok: true, preferences: await readPreferences() }); }
          catch { return respond(res, 422, { ok: false, error: 'Saved preferences could not be read; existing data preserved.' }); }
        }
        if (req.method !== 'POST' ||
            req.headers.origin !== expectedOrigin ||
            req.headers[ACTION_HEADER] !== 'confirmed' ||
            req.headers['sec-fetch-site'] === 'cross-site') {
          return respond(res, 403, { ok: false, error: 'operator_origin_required' });
        }
        if (busy) return respond(res, 409, { ok: false, error: 'action_in_progress' });
        busy = true;
        try {
          const payload = await readJson(req);
          if (url.pathname === PREFIX + '/preferences') return respond(res, 200, { ok: true, preferences: await savePreferences(payload.preferences) });
          if (url.pathname === PREFIX + '/preferences/clear') { await clearPreferences(); return respond(res, 200, { ok: true }); }
          if (url.pathname === PREFIX + '/launch') {
            const jobUrl = validateApplicationUrl(payload.url);
            applicationOrigin = new URL(jobUrl).origin;
            if (!context) {
              const folder = path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'EscapeHatch', 'managed-career-browser');
              await fs.mkdir(folder, { recursive: true });
              context = await chromium.launchPersistentContext(folder, {
                channel: 'chrome', headless: false, acceptDownloads: false, viewport: null,
              });
              context.on('close', () => { context = null; page = null; state = 'browser_closed'; });
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
            return respond(res, 200, { ok: true, state, requiresOperatorSubmission: true });
          }
          if (!page || page.isClosed()) return respond(res, 409, { ok: false, error: 'launch_browser_first' });
          if (new URL(page.url()).origin !== applicationOrigin) return respond(res, 409, { ok: false, error: 'application_origin_changed_review_required' });
          await page.bringToFront();
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
            const outcome = await fillSavedPreferences(page, merged);
            state = 'fields_filled_review_required';
            return respond(res, 200, { ok: true, state, ...outcome, requiresOperatorSubmission: true });
          }
          if (url.pathname === PREFIX + '/attach') {
            const resume = parsePrivatePdf(payload.resume);
            const cover = parsePrivatePdf(payload.cover);
            if (!resume && !cover) throw new Error('Choose a resume or cover-letter PDF first.');
            const outcome = await attachPdfs(page, resume, cover);
            state = 'attachments_staged_review_required';
            return respond(res, 200, { ok: true, state, attachments: outcome, requiresOperatorSubmission: true });
          }
          return respond(res, 404, { ok: false, error: 'unknown_action' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Operation failed.';
          // Never log URLs, profile values, job forms, tokens or private document contents.
          return respond(res, 422, { ok: false, error: message.slice(0, 160) });
        } finally { busy = false; }
      });
    },
  };
}
