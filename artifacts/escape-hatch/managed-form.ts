import type { Page } from '@playwright/test';
import { matchQuestion, optionMatches, reusableValue, type Preferences } from './src/lib/application-preferences.ts';

export type FillOutcome = { filled: string[]; skipped: string[] };

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

// This routine changes values only. It never clicks buttons, checks agreements, or navigates.
export async function fillSavedPreferences(page: Page, preferences: Preferences): Promise<FillOutcome> {
  const result: FillOutcome = { filled: [], skipped: [] };
  // Hold observed elements, not nth-based locators: React may insert hidden controls after a selection.
  const controls = await page.locator('input,textarea,select').elementHandles();
  const descriptors = await Promise.all(controls.map(control => control.evaluate(element => {
    const field = element as HTMLInputElement;
    const type = field.tagName === 'SELECT' ? 'select' : field.type || 'text';
    const labels = Array.from(field.labels || []).map(label => label.textContent || '');
    const labelled = (field.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '');
    const group = field.closest('fieldset');
    const named = [field.name, field.id].flatMap(id => [document.getElementById(id + '_label')?.textContent || '', id.replace(/^user\./, '').replace(/_/g, ' ')]);
    const prompts = [...labels, ...labelled, field.getAttribute('aria-label') || '', group?.querySelector('legend')?.textContent || '', ...named];
    // React forms commonly separate their prompt and radio choices into adjacent sibling groups.
    let ancestor: Element | null = field.parentElement;
    for (let depth = 0; ancestor && depth < 3; depth++, ancestor = ancestor.parentElement) {
      const previous = ancestor.previousElementSibling;
      if (previous && /label$/i.test(previous.id)) prompts.push(previous.textContent || '');
    }
    const selectWidget = field.closest('.Select');
    return { type, name: field.name, prompts, readonly: field.readOnly, option: labels.join(' ').trim() || field.value,
      role: field.getAttribute('role'), selectWidget: Boolean(selectWidget),
      selectedText: selectWidget?.querySelector('[role="option"][aria-selected="true"]')?.textContent?.trim() || '' };
  })));
  const available = await Promise.all(controls.map(async (control, i) =>
    !descriptors[i].readonly && ['text', 'email', 'tel', 'url', 'textarea', 'select', 'radio'].includes(descriptors[i].type) &&
    await control.isVisible() && await control.isEnabled()));
  const ids = descriptors.map(d => [...new Set(d.prompts.map(matchQuestion).filter((id): id is string => id !== null))]);
  for (let index = 0; index < controls.length; index++) {
    const control = controls[index], descriptor = descriptors[index];
    if (['hidden', 'file', 'checkbox', 'password', 'submit', 'button', 'reset'].includes(descriptor.type)) continue;
    if (ids[index].length !== 1) { result.skipped.push('unmapped_or_ambiguous'); continue; }
    const id = ids[index][0];
    let value = reusableValue(id, preferences);
    if (id === 'identity.phone' && value) value = internationalPhone(value, reusableValue('identity.country', preferences) || '');
    // Conditional detail is applicable only when a clearance is held. Never invent a clearance.
    if (id === 'employment.clearance_details' && reusableValue('employment.current_clearance', preferences) === 'No') value = 'N/A';
    if (!value) { result.skipped.push(id + ':missing_or_current_confirmation_required'); continue; }
    try {
      if (!await control.isVisible() || !await control.isEnabled() || await control.getAttribute('readonly') !== null) {
        result.skipped.push(id + ':unavailable'); continue;
      }
      let peers = ids.map((matches, i) => available[i] && matches.includes(id) ? i : -1).filter(i => i >= 0);
      // Intl telephone widgets also expose an editable country-code search with the Phone label.
      // Prefer the actual tel control only when present; multiple tel controls still fail closed.
      if (id === 'identity.phone' && peers.some(i => descriptors[i].type === 'tel')) peers = peers.filter(i => descriptors[i].type === 'tel');
      if (!peers.includes(index)) continue;
      if (descriptor.type === 'radio') {
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
            const selected = await control.evaluate(element => element.closest('.Select')?.querySelector('[role="option"][aria-selected="true"]')?.textContent?.trim());
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
