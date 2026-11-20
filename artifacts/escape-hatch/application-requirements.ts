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
  const requirements = await observeApplicationFields(page);
  // A collapsed review section can offer a letter without rendering an upload
  // control. Use the explicit optional offer as metadata, not an input.
  const optionalOffer = page.getByText(
    /^No cover letter or additional documents added\. This is optional to add\.$/i,
  ).filter({ visible: true });
  const optionalCoverLetterOffered = await optionalOffer.count() === 1;
  if (page.url() !== pageUrl) throw new Error('Page changed during inspection. Inspect again.');
  return { opportunityId, applicationUrl, pageUrl, capturedAt: new Date().toISOString(),
    scope: 'current_page_only', requirements, ...(optionalCoverLetterOffered ? { optionalCoverLetterOffered: true } : {}) };
}

/** Shared by preparation and terminal preflight as well as the progress display. */
export async function observeApplicationFields(page: Page): Promise<FormInspection['requirements']> {
  const pageUrl = page.url();
  const requirements = await page.evaluate(() => {
    const leverForm = location.origin === 'https://jobs.lever.co' ? document.querySelector('#application-form') : null;
    const selector = 'input, textarea, select, [role="combobox"], [role="textbox"], [role="checkbox"], [role="radio"], [role="switch"], [role="spinbutton"], [contenteditable="true"], [contenteditable="plaintext-only"]';
    const controls: Element[] = [];
    const roots: (Document | ShadowRoot)[] = [document];
    for (const root of roots) {
      for (const element of root.querySelectorAll('*')) {
        if (element.matches(selector)) controls.push(element);
        if (element.shadowRoot) roots.push(element.shadowRoot);
      }
    }
    const groups = new Map<Element | Document | ShadowRoot, Map<string, number>>();
    const fields: FormInspection['requirements'] = [];
    const dom = {
      visible(item: Element) {
        return item.getClientRects().length > 0 && !['hidden', 'collapse'].includes(getComputedStyle(item).visibility);
      },
      labelText(element: Element) {
        if (element.matches(selector)) return '';
        const copy = element.cloneNode(true) as Element;
        copy.querySelectorAll(`${selector}, button`).forEach(node => node.remove());
        return copy.textContent?.trim() || '';
      },
      labelledBy(element: Element, root: Document | ShadowRoot) {
        return (element.getAttribute('aria-labelledby') || '').split(/\s+/)
          .map(id => root.getElementById(id)).filter((label): label is HTMLElement => !!label).map(dom.labelText).join(' ').trim();
      },
    };
    const wrappedControls = new Map<Element, Element>();
    for (const widget of controls) {
      if (!widget.matches('[role="combobox"]:not(input):not(select)')) continue;
      const inputs = widget.querySelectorAll('input:not([type="hidden"]), select');
      if (inputs.length === 1) wrappedControls.set(inputs[0], widget);
    }
    const compositeWrappers = new Set(wrappedControls.values());
    for (const [index, element] of controls.entries()) {
      const control = element as HTMLElement;
      if (compositeWrappers.has(control) || leverForm && !leverForm.contains(control)) continue;
      const wrapper = wrappedControls.get(control);
      const native = control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement;
      const type = control instanceof HTMLInputElement ? control.type : '';
      const labelElements = native ? Array.from(control.labels || []) : [];
      // File controls are commonly visually hidden behind labelled upload triggers.
      if (['hidden', 'submit', 'button', 'reset', 'image', 'password'].includes(type) || control.matches(':disabled') ||
        control.getAttribute('aria-disabled') === 'true' || control.closest('[hidden], [aria-hidden="true"]') ||
        (!dom.visible(control) && !(type === 'file' && labelElements.some(dom.visible)))) continue;
      const root = control.getRootNode() as Document | ShadowRoot;
      const labels = labelElements.map(dom.labelText).join(' ');
      // Asterisk-based labels are an employer-facing required signal even when
      // native HTML validation and aria-required are absent (common in Lever/SPA forms).
      // Radios often carry only an option label: use their fieldset/role-group prompt.
      const leverQuestion = leverForm ? control.closest('.application-question') : null;
      const leverLabel = leverQuestion?.querySelector('.application-label');
      const group = leverQuestion || control.closest('fieldset, [role="group"], [role="radiogroup"]');
      const legend = leverLabel || group?.querySelector('legend, [class*="question-label"]');
      const groupLabel = group && (group.getAttribute('aria-label') || dom.labelledBy(group, root) || (legend && dom.labelText(legend)) || '');
      const role = control.getAttribute('role');
      const radio = type === 'radio' || !native && role === 'radio';
      const leverCheckboxGroup = leverQuestion && type === 'checkbox' && control instanceof HTMLInputElement && control.name &&
        !control.required && control.getAttribute('aria-required') !== 'true' && control.closest('.application-field');
      const checkboxGroup = Boolean(leverCheckboxGroup);
      const choiceGroup = radio || checkboxGroup;
      const name = native && control instanceof HTMLInputElement ? control.name : '';
      const prompt = (choiceGroup && groupLabel) || control.getAttribute('aria-label') || dom.labelledBy(control, root) ||
        (wrapper && (wrapper.getAttribute('aria-label') || dom.labelledBy(wrapper, root))) ||
        (radio && name && name.replace(/[_-]+/g, ' ')) ||
        (leverLabel ? groupLabel : labels || groupLabel) || control.getAttribute('placeholder') || 'Unlabelled field';
      const label = prompt.replace(/\s+/g, ' ').slice(0, 240);
      const ariaRequired = control.getAttribute('aria-required');
      const requiredAttribute = [control, wrapper, choiceGroup || leverQuestion ? group : null, ...labelElements].some(node =>
        node?.getAttribute('aria-required') === 'true' ||
        /^(true|required)$/i.test(node?.getAttribute('data-required') || '') ||
        Boolean(node?.getAttribute('data-val-required')));
      const cssRequiredMark = labelElements.some(node => ['::before', '::after'].some(pseudo =>
        /^['"]?\*['"]?$/.test(getComputedStyle(node, pseudo).content.replace(/\s/g, ''))));
      const explicitRequired = Boolean(native && control.required || ariaRequired === 'true' || requiredAttribute);
      const leverRequired = Boolean(leverQuestion && (leverLabel?.querySelector('.required') || control.closest('.application-field.required-field')));
      const indicatedRequired = leverRequired || /[*✱＊]|\brequired\b/i.test([label, labels].join(' ')) || cssRequiredMark;
      // Prefer a false positive requiring review to silently losing a marked requirement.
      const requirement = explicitRequired || indicatedRequired ? 'required' as const :
        ariaRequired === 'false' || native ? 'optional' as const : 'unknown' as const;
      // A value is not evidence of approval. Native validity is only a current-page observation.
      const populated = control.getAttribute('aria-invalid') !== 'true' && wrapper?.getAttribute('aria-invalid') !== 'true' && (native ? (type === 'checkbox' || type === 'radio'
        ? (control as HTMLInputElement).checked :
        (type === 'file' ? ((control as HTMLInputElement).files?.length || 0) > 0 : Boolean(control.value.trim()))) &&
        control.validity.valid : radio || role === 'checkbox' || role === 'switch' ? control.getAttribute('aria-checked') === 'true' :
          Boolean(control.getAttribute('aria-valuetext')?.trim() || (role === 'spinbutton' && control.hasAttribute('aria-valuenow')) ||
            (control.isContentEditable && control.textContent?.trim())));
      const isFile = type === 'file';
      const resume = /r[ée]sum[ée]|\bcv\b/i.test(label), cover = /cover\s*(letter|note)?/i.test(label);
      const kind = isFile ? (resume && !cover ? 'resume' as const : cover && !resume ? 'cover' as const : 'file' as const) : 'question' as const;
      // Only controls with a definite group identity can share a denominator term.
      const container = leverCheckboxGroup || (type === 'radio' && name
        ? (control as HTMLInputElement).form || root : radio ? control.closest('[role="radiogroup"]') : null);
      const key = container ? type + ':' + (native ? name : 'custom-radio') : '';
      const map = container ? (groups.get(container) ?? new Map<string, number>()) : null;
      if (container && map) groups.set(container, map);
      const prior = key ? map?.get(key) : undefined;
      if (prior !== undefined) {
        const field = fields[prior];
        field.populated ||= populated;
        if (requirement === 'required' || requirement === 'unknown' && field.requirement === 'optional') field.requirement = requirement;
        continue;
      }
      if (key) map?.set(key, fields.length);
      fields.push({ id: 'field-' + index, label, requirement, kind, populated: Boolean(populated) });
    }
    return fields;
  });
  if (page.url() !== pageUrl) throw new Error('Page changed during inspection. Inspect again.');
  return requirements;
}

/** Review blockers from the observed current page; no answer values or private bytes. */
export function unresolvedCurrentPageRequirements(inspection: Pick<FormInspection, 'requirements'>): string[] {
  return [...new Set(inspection.requirements.filter(field => !field.populated && field.requirement !== 'optional')
    .map(field => {
      const protectedAction = /privacy|consent|attest|certif|acknowledg|agree to|terms of/i.test(field.label);
      const status = field.requirement === 'unknown' ? 'unclassified_field_review' :
        protectedAction ? 'required_operator_action' : 'required_field_unresolved';
      return status + ':' + field.label;
    }))];
}

/** Reinspects after all SPA re-renders; inaccessible inventory itself blocks readiness. */
export async function inspectRequiredFieldBlockers(page: Page, opportunityId: string, applicationUrl: string): Promise<string[]> {
  try { return unresolvedCurrentPageRequirements(await inspectApplicationRequirements(page, opportunityId, applicationUrl)); }
  catch { return ['required_field_inventory_unverified']; }
}

/** Fail closed before any authorized terminal Submit click. */
export function assertSubmitFormComplete(blockers: string[]): void {
  if (!Array.isArray(blockers)) throw new Error('submit_readiness_unverified');
  if (blockers.length > 0) {
    const error = new Error('submit_blocked_incomplete_form');
    (error as Error & { blockers: string[] }).blockers = blockers.slice(0, 40);
    throw error;
  }
}
