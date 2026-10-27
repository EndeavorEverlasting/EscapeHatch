import type { Page } from '@playwright/test';
import { sameApplicationUrl, type FormInspection } from './src/lib/application-puzzle.ts';

export function assertInspectionScope(selectedId: unknown, selectedUrl: unknown, opportunityId: string, applicationUrl: string, liveUrl: string) {
  const live = new URL(liveUrl), launched = new URL(applicationUrl);
  if (!opportunityId || selectedId !== opportunityId || !sameApplicationUrl(selectedUrl, applicationUrl) || live.origin !== launched.origin || live.search !== launched.search ||
    (live.pathname !== launched.pathname && !live.pathname.startsWith(launched.pathname.replace(/\/$/, '') + '/'))) {
    throw new Error('Application changed. Relaunch the selected opportunity before inspecting its form.');
  }
}

/** Returns labels/metadata, never answer values. Does not click, record preferences, or navigate. */
export async function inspectApplicationRequirements(page: Page, opportunityId: string, applicationUrl: string): Promise<FormInspection> {
  const pageUrl = page.url();
  assertInspectionScope(opportunityId, applicationUrl, opportunityId, applicationUrl, pageUrl);
  const requirements = await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll('input, textarea, select, [role="combobox"], [role="textbox"], [role="checkbox"], [role="radio"]'));
    return controls.flatMap((element, index) => {
      const control = element as HTMLElement;
      const native = control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement;
      const type = control instanceof HTMLInputElement ? control.type : '';
      const visible = (item: Element) => item.getClientRects().length > 0 && !['hidden', 'collapse'].includes(getComputedStyle(item).visibility);
      const visibleFileLabel = native && Array.from(control.labels || []).some(visible);
      // File controls are commonly visually hidden behind labelled upload triggers.
      if (['hidden', 'submit', 'button', 'reset', 'image', 'password'].includes(type) || control.matches(':disabled') ||
        control.getAttribute('aria-disabled') === 'true' || control.closest('[hidden], [aria-hidden="true"]') ||
        (!visible(control) && !(type === 'file' && visibleFileLabel))) return [];
      const labels = native ? Array.from(control.labels || []).map(label => label.textContent?.trim() || '').join(' ') : '';
      const labelledBy = (control.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      // Asterisk-based labels are an employer-facing required signal even when
      // native HTML validation and aria-required are absent (common in Lever/SPA forms).
      // Radios often carry only an option label: use their fieldset/role-group prompt.
      const group = control.closest('fieldset, [role="group"], [role="radiogroup"]');
      const groupLabel = (group?.querySelector('legend, [aria-label], [class*="question-label"]')?.textContent || group?.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      const prompt = control.getAttribute('aria-label') || labelledBy || (groupLabel || labels) || control.getAttribute('placeholder') || 'Unlabelled field';
      const label = prompt.replace(/\s+/g, ' ').slice(0, 240);
      const ariaRequired = control.getAttribute('aria-required');
      const labelElements = native ? Array.from(control.labels || []) : [];
      const requiredAttribute = [control, group, ...labelElements].some(node =>
        node?.getAttribute('aria-required') === 'true' ||
        /^(true|required)$/i.test(node?.getAttribute('data-required') || '') ||
        Boolean(node?.getAttribute('data-val-required')));
      const cssRequiredMark = labelElements.some(node => ['::before', '::after'].some(pseudo =>
        /^['"]?\*['"]?$/.test(getComputedStyle(node, pseudo).content.replace(/\s/g, ''))));
      const explicitRequired = Boolean(native && control.required || ariaRequired === 'true' || requiredAttribute);
      const indicatedRequired = /\*|\brequired\b/i.test([label, labels, groupLabel].join(' ')) || cssRequiredMark;
      // Prefer a false positive requiring review to silently losing a marked requirement.
      const requirement = explicitRequired || indicatedRequired ? 'required' as const :
        ariaRequired === 'false' || native ? 'optional' as const : 'unknown' as const;
      // A value is not evidence of approval. Native validity is only a current-page observation.
      const radioSelected = type === 'radio' && control instanceof HTMLInputElement && Boolean(control.name) &&
        Array.from(document.getElementsByName(control.name)).some(item => item instanceof HTMLInputElement && item.type === 'radio' && item.checked && item.form === control.form && item.getRootNode() === control.getRootNode());
      const peers = group && (type === 'radio' || type === 'checkbox') ?
        Array.from(group.querySelectorAll('input[type="radio"], input[type="checkbox"]')) as HTMLInputElement[] : [];
      const groupSelected = peers.some(peer => peer.checked && !peer.disabled);
      const populated = native ? (type === 'checkbox' || type === 'radio' ?
        ((control as HTMLInputElement).checked || radioSelected || (!explicitRequired && indicatedRequired && groupSelected)) :
        (type === 'file' ? ((control as HTMLInputElement).files?.length || 0) > 0 : Boolean(control.value.trim()))) &&
        control.validity.valid : false;
      const isFile = type === 'file';
      const resume = /r[ée]sum[ée]|\bcv\b/i.test(label), cover = /cover\s*(letter|note)?/i.test(label);
      const kind = isFile ? (resume && !cover ? 'resume' as const : cover && !resume ? 'cover' as const : 'file' as const) : 'question' as const;
      return [{ id: 'field-' + index, label, requirement, kind, populated: Boolean(populated) }];
    }).slice(0, 200);
  });
  if (page.url() !== pageUrl) throw new Error('Page changed during inspection. Inspect again.');
  return { opportunityId, applicationUrl, pageUrl, capturedAt: new Date().toISOString(), scope: 'current_page_only', requirements };
}
