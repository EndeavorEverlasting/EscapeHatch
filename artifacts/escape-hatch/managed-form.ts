import type { Page } from '@playwright/test';
import { matchQuestion, optionMatches, reusableValue, type Preferences } from './src/lib/application-preferences.ts';

export type FillOutcome = { filled: string[]; skipped: string[] };

// This routine changes values only. It never clicks buttons, checks agreements, or navigates.
export async function fillSavedPreferences(page: Page, preferences: Preferences): Promise<FillOutcome> {
  const result: FillOutcome = { filled: [], skipped: [] };
  const controls = await page.locator('input,textarea,select').all();
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
    return { type, name: field.name, prompts, readonly: field.readOnly, option: labels.join(' ').trim() || field.value };
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
        const existing = await control.inputValue();
        if (existing.trim() && !(id === 'identity.phone' && existing.trim() === '+1')) {
          result.skipped.push(id + ':preserved'); continue;
        }
        if (descriptor.type === 'select') {
          const options = await control.locator('option').evaluateAll(elements => elements.map(e => ({ text: e.textContent || '', value: (e as HTMLOptionElement).value, disabled: (e as HTMLOptionElement).disabled })));
          const matches = options.filter(o => !o.disabled && optionMatches(value, o.text));
          if (matches.length !== 1) { result.skipped.push(id + ':option_mismatch'); continue; }
          await control.selectOption(matches[0].value, { timeout: 2500 });
          if (await control.inputValue() !== matches[0].value) throw new Error('not retained');
        } else if (['text', 'email', 'tel', 'url', 'textarea'].includes(descriptor.type)) {
          await control.fill(value, { timeout: 2500 });
          if (await control.inputValue() !== value) throw new Error('not retained');
        } else { result.skipped.push(id + ':unsupported_control'); continue; }
      }
      result.filled.push(id);
    } catch { result.skipped.push(id + ':not_verified'); }
  }
  return { filled: [...new Set(result.filled)], skipped: [...new Set(result.skipped)] };
}
