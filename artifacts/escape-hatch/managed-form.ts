import type { Page } from '@playwright/test';
import { matchQuestion, normalizeQuestion, discoveredValue, optionMatches, reusableValue, isRoutineApplicantPrivacyAcknowledgement, type Preferences } from './src/lib/application-preferences.ts';
import { assertEmployerFacingDocumentUrl } from './src/lib/employer-facing-document-url.ts';

export type FillOutcome = { filled: string[]; skipped: string[] };

// Prevent a repeated Prepare from overriding an applicant's deliberate uncheck
// after EscapeHatch previously checked the same notice in this browser session.
const privacyChecksApplied = new WeakMap<Page, Set<string>>();

export function internationalPhone(value: string, country: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) return '+' + digits;
  if (['United States', 'United States of America', 'US', 'USA', 'Canada'].includes(country)) {
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  }
  return null;
}

export async function openApplicationForm(page: Page): Promise<boolean> {
  const current = new URL(page.url());
  if (current.origin === 'https://jobs.ashbyhq.com' && /^\/[^/]+\/[^/]+\/?$/.test(current.pathname)) {
    // Ashby exposes a normal, same-job application-entry link outside the form.
    // Never classify an Apply/Submit button inside a form as entry navigation.
    const entry = page.getByRole('link', { name: 'Apply for this Job', exact: true });
    try {
      await entry.waitFor({ state: 'visible', timeout: 5000 });
      if (await entry.count() !== 1 || !await entry.isEnabled()) return false;
      const href = await entry.getAttribute('href');
      if (!href) return false;
      const target = new URL(href, current);
      if (target.origin !== current.origin || target.pathname !== current.pathname.replace(/\/$/, '') + '/application' ||
          target.search || target.hash || target.username || target.password ||
          !await entry.evaluate(element => !element.closest('form'))) return false;
      await entry.click({ timeout: 5000 });
      await page.waitForURL(target.href, { timeout: 10000 });
      const form = page.getByRole('tabpanel', { name: 'Application', exact: true });
      await form.getByRole('textbox', { name: /^Name\*?$/ }).waitFor({ state: 'visible', timeout: 10000 });
      await form.getByRole('textbox', { name: /^Email\*?$/ }).waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch { return false; }
  }
  const entries = page.getByRole('button', { name: /^Apply for this position(?: button)?$/ });
  const count = await entries.count();
  // Some job pages repeat the same entry at top and bottom. Neither may be a form submit.
  if (count < 1 || count > 2) return false;
  for (const entry of await entries.all()) {
    if (!await entry.evaluate(element => element.tagName === 'BUTTON' && !element.closest('form') &&
      element.getAttribute('type') !== 'submit' && element.getAttribute('type') !== 'reset')) return false;
  }
  if (!await entries.first().isVisible() || !await entries.first().isEnabled()) return false;
  await entries.first().click({ timeout: 2500 });
  // Report an observed form, never merely a successful click.
  try { await page.getByRole('heading', { name: 'Contact Details', exact: true }).waitFor({ state: 'visible', timeout: 5000 }); }
  catch { return false; }
  return true;
}

async function inspectPreferenceFields(page: Page, employerName = '') {
  // Hold observed elements, not nth-based locators: React may insert hidden controls after a selection.
  const controls = await page.locator('input,textarea,select,button[aria-pressed]').elementHandles();
  const descriptors = await Promise.all(controls.map(control => control.evaluate(element => {
    const field = element as HTMLInputElement;
    const safeToggle = field.tagName === 'BUTTON' && (field.getAttribute('type') === 'button' ||
      !field.hasAttribute('type') && !(field as unknown as HTMLButtonElement).form);
    const type = field.tagName === 'BUTTON' ? (safeToggle ? 'toggle' : 'submit') : field.tagName === 'SELECT' ? 'select' : field.type || 'text';
    const labels = Array.from(field.labels || []).map(label => {
      const copy = label.cloneNode(true) as Element;
      copy.querySelectorAll('input,select,textarea,button').forEach(control => control.remove());
      return copy.textContent || '';
    });
    const labelled = (field.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '');
    const group = field.closest('fieldset');
    const named = [field.name, field.id].flatMap(id => [document.getElementById(id + '_label')?.textContent || '', id.replace(/^user\./, '').replace(/_/g, ' ')]);
    const eeoId = field.id.match(/__systemfield_eeoc_(gender|race|veteran_status)-labeled-radio-\d+$/)?.[1];
    const prompts = [eeoId?.replace(/_/g, ' ') || '', ...labels, ...labelled, field.getAttribute('aria-label') || '', group?.querySelector('legend')?.textContent || '', ...named];
    // Ashby groups plain labels and binary buttons without label IDs or a form element.
    const ashbyEntry = field.closest('.ashby-application-form-field-entry');
    if (ashbyEntry) for (const child of Array.from(ashbyEntry.children)) {
      if (child.tagName === 'LABEL') prompts.push(child.textContent || '');
    }
    // React forms commonly separate their prompt and radio choices into adjacent sibling groups.
    let ancestor: Element | null = field.parentElement;
    for (let depth = 0; ancestor && depth < 3; depth++, ancestor = ancestor.parentElement) {
      const previous = ancestor.previousElementSibling;
      if (previous && /label$/i.test(previous.id)) prompts.push(previous.textContent || '');
    }
    const selectWidget = field.closest('.Select');
    return { type, name: field.name, prompts, readonly: field.readOnly, option: type === 'toggle' ? field.textContent?.trim() || '' : labels.join(' ').trim() || field.value,
      role: field.getAttribute('role'), selectWidget: Boolean(selectWidget),
      selectedText: selectWidget?.querySelector('[role="option"][aria-selected="true"]')?.textContent?.trim() || '' };
  })));
  const available = await Promise.all(controls.map(async (control, i) =>
    !descriptors[i].readonly && ['text', 'email', 'tel', 'url', 'textarea', 'number', 'select', 'radio', 'toggle'].includes(descriptors[i].type) &&
    await control.isVisible() && await control.isEnabled()));
  const ids = descriptors.map(d => [...new Set(d.prompts.map(prompt => matchQuestion(prompt, employerName)).filter((id): id is string => id !== null))]);
  return { controls, descriptors, available, ids };
}

// Explicitly enabled capture is limited to veteran/service answers. It never infers either from the other.
export async function captureMilitaryAnswers(page: Page): Promise<Record<string, string>> {
  const { controls, descriptors, available, ids } = await inspectPreferenceFields(page);
  const answers: Record<string, string> = {};
  for (const id of ['eeo.veteran_status', 'military.service_history']) {
    const peers = ids.map((matches, i) => available[i] && matches.length === 1 && matches[0] === id ? i : -1).filter(i => i >= 0);
    if (!peers.length) continue;
    const radios = peers.every(i => descriptors[i].type === 'radio');
    if (radios) {
      if (!descriptors[peers[0]].name || !peers.every(i => descriptors[i].name === descriptors[peers[0]].name)) continue;
      const selected = [];
      for (const i of peers) if (await controls[i].isChecked()) selected.push(i);
      if (selected.length === 1) answers[id] = descriptors[selected[0]].option;
    } else if (peers.length === 1 && descriptors[peers[0]].type === 'select') {
      const selected = await controls[peers[0]].evaluate(element => {
        const select = element as HTMLSelectElement;
        const option = select.selectedOptions[0];
        return select.value && option && !option.disabled ? option.textContent?.trim() || '' : '';
      });
      if (selected) answers[id] = selected;
    }
  }
  return Object.fromEntries(Object.entries(answers).filter(([, value]) => value.trim() && value.length <= 512 && !/^(select|choose|please select|select one)(?:\b|$)/i.test(value)));
}

// Fills approved values and narrowly scoped saved privacy-notice acknowledgements; never navigates, certifies, or submits.
export async function fillSavedPreferences(page: Page, preferences: Preferences, employerName = ''): Promise<FillOutcome> {
  const result: FillOutcome = { filled: [], skipped: [] };
  const { controls, descriptors, available, ids } = await inspectPreferenceFields(page, employerName);
  for (let i = 0; i < controls.length; i++) {
    if (!ids[i].length) {
      const candidates = [...new Set(descriptors[i].prompts.filter(prompt => discoveredValue(prompt, preferences)).map(normalizeQuestion))];
      if (candidates.length === 1) ids[i] = ['discovered:' + candidates[0]];
    }
  }
  for (let index = 0; index < controls.length; index++) {
    const control = controls[index], descriptor = descriptors[index];
    if (descriptor.type === 'checkbox') {
      if (preferences.application_privacy_acknowledgement_enabled !== true) continue;
      const noticeText = await control.evaluate(element => {
        const field = element as HTMLInputElement;
        const labels = Array.from(field.labels || []).map(label => label.textContent || '');
        const aria = field.getAttribute('aria-label') || '';
        const labelledBy = (field.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '');
        return [...labels, aria, ...labelledBy].filter(Boolean).join(' ');
      });
      if (!isRoutineApplicantPrivacyAcknowledgement(noticeText)) continue;
      const proofId = 'privacy.application_notice_acknowledged';
      try {
        if (!await control.isVisible() || !await control.isEnabled() || await control.getAttribute('readonly') !== null) {
          result.skipped.push(proofId + ':unavailable'); continue;
        }
        const fingerprint = [page.url(), await control.getAttribute('id') || '', await control.getAttribute('name') || '', normalizeQuestion(noticeText)].join('|');
        if (await control.isChecked()) { result.skipped.push(proofId + ':preserved'); continue; }
        const prior = privacyChecksApplied.get(page);
        if (prior?.has(fingerprint)) { result.skipped.push(proofId + ':user_override'); continue; }
        await control.check({ timeout: 2500 });
        if (!await control.isChecked()) throw new Error('privacy acknowledgement not retained');
        if (prior) prior.add(fingerprint);
        else privacyChecksApplied.set(page, new Set([fingerprint]));
        result.filled.push(proofId);
      } catch { result.skipped.push(proofId + ':not_verified'); }
      continue;
    }
    if (['hidden', 'file', 'password', 'submit', 'button', 'reset'].includes(descriptor.type)) continue;
    if (ids[index].length !== 1) { result.skipped.push('unmapped_or_ambiguous'); continue; }
    const id = ids[index][0];
    if (preferences.optional_omissions?.includes(id) && !await control.evaluate(element => {
      const field = element as HTMLInputElement;
      const labelText = Array.from(field.labels || []).map(label => label.textContent || '').join(' ');
      const groupText = element.closest('fieldset')?.querySelector('legend')?.textContent || '';
      return field.required === true || element.getAttribute('aria-required') === 'true' ||
        /\*|\brequired\b/i.test([labelText, groupText].join(' '));
    })) { result.skipped.push(id + ':optional_omitted'); continue; }
    let value = id.startsWith('discovered:') ? discoveredValue(id.slice(11), preferences) : reusableValue(id, preferences);
    if (id === 'identity.phone' && value) value = internationalPhone(value, reusableValue('identity.country', preferences) || '');
    // Conditional detail is applicable only when a clearance is held. Never invent a clearance.
    if (id === 'employment.clearance_details' && reusableValue('employment.current_clearance', preferences) === 'No') value = 'N/A';
    if (!value) { result.skipped.push(id + ':missing_or_current_confirmation_required'); continue; }
    try {
      assertEmployerFacingDocumentUrl(descriptor.prompts.join(' '), value);
    } catch {
      result.skipped.push(id + ':private_cloud_document_url_forbidden');
      continue;
    }
    try {
      if (!await control.isVisible() || !await control.isEnabled() || await control.getAttribute('readonly') !== null) {
        result.skipped.push(id + ':unavailable'); continue;
      }
      let peers = ids.map((matches, i) => available[i] && matches.includes(id) ? i : -1).filter(i => i >= 0);
      // Intl telephone widgets also expose an editable country-code search with the Phone label.
      // Prefer the actual tel control only when present; multiple tel controls still fail closed.
      if (id === 'identity.phone' && peers.some(i => descriptors[i].type === 'tel')) peers = peers.filter(i => descriptors[i].type === 'tel');
      if (!peers.includes(index)) continue;
      if (descriptor.type === 'toggle') {
        if (peers.length !== 2 || peers.some(i => descriptors[i].type !== 'toggle') ||
            new Set(peers.map(i => descriptors[i].option.toLowerCase())).size !== 2 ||
            peers.some(i => !/^(yes|no)$/i.test(descriptors[i].option)) || !/^(yes|no)$/i.test(value)) {
          result.skipped.push(id + ':ambiguous_toggle'); continue;
        }
        if ((await Promise.all(peers.map(i => controls[i].getAttribute('aria-pressed')))).includes('true')) {
          result.skipped.push(id + ':preserved'); continue;
        }
        const matches = peers.filter(i => optionMatches(value, descriptors[i].option));
        if (matches.length !== 1 || matches[0] !== index) continue;
        await control.click({ timeout: 2500 });
        if (await control.getAttribute('aria-pressed') !== 'true') throw new Error('not retained');
      } else if (descriptor.type === 'radio') {
        const group = peers.filter(i => descriptors[i].type === 'radio' && descriptors[i].name === descriptor.name);
        if (!descriptor.name || group.length !== peers.length) { result.skipped.push(id + ':ambiguous'); continue; }
        if (await Promise.all(group.map(i => controls[i].isChecked())).then(values => values.some(Boolean))) {
          result.skipped.push(id + ':preserved'); continue;
        }
        const matches = group.filter(i => optionMatches(value, descriptors[i].option));
        if (matches.length !== 1) { result.skipped.push(id + ':option_mismatch'); continue; }
        if (matches[0] !== index) continue;
        await control.check({ timeout: 2500 });
        if (!await control.isChecked()) throw new Error('not retained');
      } else {
        if (peers.length !== 1) { result.skipped.push(id + ':ambiguous'); continue; }
        if (descriptor.selectedText) { result.skipped.push(id + ':preserved'); continue; }
        const existing = await control.inputValue();
        if (existing.trim() && !(id === 'identity.phone' && existing.trim() === '+1')) {
          result.skipped.push(id + ':preserved'); continue;
        }
        if (descriptor.role === 'combobox') {
          if (!descriptor.selectWidget) { result.skipped.push(id + ':unsupported_combobox'); continue; }
          await control.fill(value, { timeout: 2500 });
          const option = page.getByRole('option', { name: value, exact: true });
          try {
            await option.waitFor({ state: 'visible', timeout: 2500 });
            if (await option.count() !== 1) throw new Error('ambiguous option');
            await option.click({ timeout: 2500 });
            const selected = await control.evaluate(element => (element as Element).closest('.Select')?.querySelector('[role="option"][aria-selected="true"]')?.textContent?.trim());
            if (!selected || !optionMatches(value, selected)) throw new Error('selection not retained');
          } catch {
            await control.fill(existing, { timeout: 2500 });
            result.skipped.push(id + ':option_not_verified'); continue;
          }
        } else if (descriptor.type === 'select') {
          const options = await control.evaluate(element => Array.from((element as HTMLSelectElement).options).map(e => ({ text: e.textContent || '', value: e.value, disabled: e.disabled })));
          const matches = options.filter(o => !o.disabled && optionMatches(value, o.text));
          if (matches.length !== 1) { result.skipped.push(id + ':option_mismatch'); continue; }
          await control.selectOption(matches[0].value, { timeout: 2500 });
          if (await control.inputValue() !== matches[0].value) throw new Error('not retained');
        } else if (descriptor.type === 'number') {
          const numeric = value.trim();
          if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(numeric) || !Number.isFinite(Number(numeric))) {
            result.skipped.push(id + ':invalid_number'); continue;
          }
          // Let native HTML number validity own min/max/step semantics before
          // changing the real field. Detached controls cannot trigger form events.
          const permitted = await control.evaluate((element, candidate) => {
            const probe = document.createElement('input'); probe.type = 'number';
            for (const attribute of ['min', 'max', 'step', 'value']) {
              const setting = element.getAttribute(attribute);
              if (setting !== null) probe.setAttribute(attribute, setting);
            }
            probe.value = candidate;
            return probe.validity.valid && Number.isFinite(probe.valueAsNumber) && probe.valueAsNumber === Number(candidate);
          }, numeric);
          if (!permitted) { result.skipped.push(id + ':number_constraint_mismatch'); continue; }
          await control.fill(numeric, { timeout: 2500 });
          const retained = await control.evaluate((element, expected) => {
            const field = element as HTMLInputElement;
            return field.validity.valid && Number.isFinite(field.valueAsNumber) && field.valueAsNumber === expected;
          }, Number(numeric));
          if (!retained) { await control.fill(existing, { timeout: 2500 }); throw new Error('number not retained'); }
        } else if (['text', 'email', 'tel', 'url', 'textarea'].includes(descriptor.type)) {
          await control.fill(value, { timeout: 2500 });
          const actual = await control.inputValue();
          const retained = id === 'identity.phone' ? actual.replace(/\D/g, '') === value.replace(/\D/g, '') : actual === value;
          if (!retained) {
            await control.fill(existing, { timeout: 2500 });
            throw new Error('not retained');
          }
        } else { result.skipped.push(id + ':unsupported_control'); continue; }
      }
      result.filled.push(id);
    } catch { result.skipped.push(id + ':not_verified'); }
  }
  return { filled: [...new Set(result.filled)], skipped: [...new Set(result.skipped)] };
}
