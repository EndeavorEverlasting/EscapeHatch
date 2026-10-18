/**
 * Production Playwright PreparationDriver for the managed Chrome lane.
 *
 * Trusted ATS effect evidence is supplied by the host from a versioned registry.
 * The live page never authors effect classification. Intermediate clicks are
 * permitted only through prepareToFinalReview after fingerprint rebind.
 */
import type { Page } from '@playwright/test';
import {
  ADAPTER_EVIDENCE_SCHEMA,
  type AdapterEvidence,
  type ControlObservation,
  type NavigationAuthorization,
} from './application-navigation-policy.ts';
import type { PageInspection, PreparationDriver, PreparationReceipt } from './application-autopilot-executor.ts';
import { fillSavedPreferences } from './managed-form.ts';
import type { Preferences } from './src/lib/application-preferences.ts';

export type AdapterEvidenceEntry = Pick<
  AdapterEvidence,
  | 'pageFingerprint'
  | 'controlId'
  | 'controlFingerprint'
  | 'enclosingFormAction'
  | 'enclosingFormMethod'
  | 'verifiedEffectClass'
  | 'evidenceRefs'
>;

export type TrustedAdapterRegistry = {
  schema: string;
  adapterId: string;
  atsProvider: string;
  evidence: AdapterEvidenceEntry[];
};

export type ManagedPreparationDriverOptions = {
  page: Page;
  authorization: NavigationAuthorization;
  registry: TrustedAdapterRegistry;
  preferences: Preferences;
  /** When false, missing file inputs do not block progression (default true). */
  requireUploadsVerified?: boolean;
};

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function loadTrustedEvidence(
  registry: TrustedAdapterRegistry,
  observation: ControlObservation,
  authorization: NavigationAuthorization,
  now: Date = new Date(),
): AdapterEvidence | null {
  if (!registry || registry.schema !== ADAPTER_EVIDENCE_SCHEMA) return null;
  if (!hasText(registry.adapterId) || !hasText(registry.atsProvider)) return null;
  if (observation.pageOrigin !== authorization.origin) return null;
  const entry = registry.evidence.find(
    (row) =>
      row.pageFingerprint === observation.pageFingerprint &&
      row.controlId === observation.controlId &&
      row.controlFingerprint === observation.controlFingerprint &&
      (row.enclosingFormAction ?? null) === (observation.enclosingFormAction ?? null) &&
      (row.enclosingFormMethod ?? null) === (observation.enclosingFormMethod ?? null),
  );
  if (!entry) return null;
  const nowMs = now.getTime();
  return {
    ...entry,
    schema: registry.schema,
    adapterId: registry.adapterId,
    atsProvider: registry.atsProvider,
    origin: authorization.origin,
    verifiedAtUtc: new Date(nowMs - 60_000).toISOString(),
    expiresAtUtc: new Date(nowMs + 3_600_000).toISOString(),
  };
}

export async function observePrimaryControl(page: Page): Promise<ControlObservation | null> {
  return await page.evaluate(() => {
    const marked = Array.from(document.querySelectorAll<HTMLElement>('[data-control-id]'));
    if (marked.length !== 1) return null;
    const element = marked[0];
    const form = element.closest('form');
    const pageFingerprint = document.documentElement.dataset.pageFp || '';
    if (!pageFingerprint) return null;
    return {
      accessibleName: (element.textContent || '').trim(),
      htmlType: element.getAttribute('type'),
      tag: element.tagName.toLowerCase(),
      pageUrl: location.href,
      pageOrigin: location.origin,
      pageFingerprint,
      controlId: element.dataset.controlId || '',
      controlFingerprint: element.dataset.controlFp || '',
      enclosingFormAction: form?.getAttribute('action') || null,
      enclosingFormMethod: form?.getAttribute('method') || null,
    };
  });
}

async function pageFingerprint(page: Page): Promise<string> {
  return await page.evaluate(() => document.documentElement.dataset.pageFp || '');
}

async function collectValidationErrors(page: Page): Promise<string[]> {
  const count = await page.locator('[aria-invalid="true"], [role="alert"]').count();
  return count > 0 ? ['live_validation_error'] : [];
}

async function uploadsVerified(page: Page, requireUploads: boolean): Promise<boolean> {
  if (!requireUploads) return true;
  const required = await page.locator('input[type="file"][required]').count();
  return required === 0;
}

export function createManagedPreparationDriver(
  options: ManagedPreparationDriverOptions,
): PreparationDriver {
  const requireUploads = options.requireUploadsVerified !== false;
  const { page, authorization, registry, preferences } = options;

  return {
    async inspect(): Promise<PageInspection> {
      const origin = new URL(page.url()).origin;
      const fingerprint = await pageFingerprint(page);
      const control = await observePrimaryControl(page);
      if (!fingerprint || origin !== authorization.origin) {
        return {
          pageFingerprint: fingerprint || 'unverified',
          origin,
          control: null,
          trustedEvidence: null,
          unresolvedRequired: [],
          validationErrors: [],
          manualGates: origin !== authorization.origin ? ['application_origin_changed'] : ['page_fingerprint_missing'],
          uploadsVerified: await uploadsVerified(page, requireUploads),
        };
      }
      const trustedEvidence = control
        ? loadTrustedEvidence(registry, control, authorization)
        : null;
      return {
        pageFingerprint: fingerprint,
        origin,
        control,
        trustedEvidence,
        unresolvedRequired: [],
        validationErrors: await collectValidationErrors(page),
        manualGates: control ? [] : ['no_unique_fingerprinted_control'],
        uploadsVerified: await uploadsVerified(page, requireUploads),
      };
    },

    async prepareCurrentPage(): Promise<PreparationReceipt> {
      const outcome = await fillSavedPreferences(page, preferences);
      const unresolved = outcome.skipped.filter(
        (item) =>
          item.endsWith(':missing_or_current_confirmation_required') ||
          item.endsWith(':not_verified') ||
          item.endsWith(':option_mismatch') ||
          item.endsWith(':option_not_verified'),
      );
      return { deterministic: true as const, unresolved };
    },

    async activateVerifiedIntermediate(control: ControlObservation): Promise<void> {
      if (new URL(page.url()).origin !== authorization.origin) {
        throw new Error('application_origin_changed_review_required');
      }
      if (control.pageOrigin !== authorization.origin) {
        throw new Error('control_origin_mismatch');
      }
      if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(control.controlId)) {
        throw new Error('control_id_unsafe');
      }
      const locator = page.locator('[data-control-id="' + control.controlId + '"]');
      if ((await locator.count()) !== 1) throw new Error('control_rebinding_failed');
      const fingerprint = await locator.getAttribute('data-control-fp');
      if (fingerprint !== control.controlFingerprint) throw new Error('control_fingerprint_drift');
      const formAction = await locator.evaluate((element) => {
        const form = element.closest('form');
        return {
          action: form?.getAttribute('action') || null,
          method: form?.getAttribute('method') || null,
        };
      });
      if ((formAction.action ?? null) !== (control.enclosingFormAction ?? null) ||
          (formAction.method ?? null) !== (control.enclosingFormMethod ?? null)) {
        throw new Error('enclosing_form_drift');
      }
      await locator.click({ timeout: 5000 });
      await page.waitForFunction(
        (previous) => document.documentElement.dataset.pageFp !== previous,
        control.pageFingerprint,
        { timeout: 8000 },
      );
    },
  };
}
