/* Executed in one admitted tab. The host supplies only approved values. */
(function (root) {
  'use strict';

  function fillKnownLever(packet) {
    const blank = state => ({ state, filled: [], preserved: [], unresolved: [] });
    if (!packet || !Number.isFinite(packet.expiresAt) || Date.now() >= packet.expiresAt) return blank('PACKET_EXPIRED');
    const bound = () => location.href === packet.applicationUrl;
    if (!bound() || location.origin !== 'https://jobs.lever.co' ||
        !/^\/[a-z0-9_-]+\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/apply\/?$/i.test(location.pathname)) {
      return blank('WRONG_TAB');
    }

    const forms = document.querySelectorAll('form#application-form:has(#btn-submit)');
    if (forms.length !== 1) return blank('FORM_UNVERIFIED');
    const form = forms[0];
    const normalize = text => String(text || '').normalize('NFKC').toLowerCase()
      .replace(/\bu\.s\.(?:a\.)?/g, 'us')
      .replace(/\((?:required|optional|voluntary|select one|please select)\)|\[(?:required|optional)\]|\brequired\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
    const protectedQuestion = /(?:^|\s)(?:e[\s-]?mail|privacy|consent|attest\w*|certif\w*|sign\w*|agree\w*|acknowledg\w*|password|passcode|captcha|disclosure|voluntary|terms|disability|veteran|ethnicity|race|gender)(?:\s|$)/;
    const protectedId = /^(?:identity\.email$|(?:eeo|legal|attestation|marketing|accommodation|military|veteran|talent_community)\.)/;
    const types = ['text', 'tel', 'url', 'number', 'textarea', 'select-one', 'select-multiple', 'radio', 'checkbox'];
    const options = ['select-one', 'select-multiple', 'radio', 'checkbox'];
    const visible = el => !el.closest('[hidden], [aria-hidden="true"]') &&
      el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible';
    const editable = el => el.isConnected && el.form === form && visible(el) && !el.matches(':disabled, [readonly]');
    const hasOptionValue = option => option.value.trim() && !option.matches(':disabled') &&
      !/^(?:please )?(?:select|choose)(?: one)?$/.test(normalize(option.text));

    const aliases = new Map();
    for (const answer of packet.answers || []) {
      if (typeof answer?.id !== 'string' || protectedId.test(answer.id) ||
          typeof answer.value !== 'string' || !answer.value.trim() || answer.value.length > 4096 ||
          !Array.isArray(answer.aliases)) continue;
      for (const alias of answer.aliases) {
        if (typeof alias !== 'string' || !alias || protectedQuestion.test(alias)) continue;
        aliases.set(alias, aliases.has(alias) ? null : answer);
      }
    }
    const matches = new Map();
    for (const field of form.querySelectorAll('input, textarea, select')) {
      const type = field.type;
      if (!types.includes(type) || field.form !== form || !visible(field) || /^(?:eeo|consent)\[/i.test(field.name)) continue;
      const group = field.closest('fieldset, [role="group"], [role="radiogroup"], .application-question');
      const groupText = group?.getAttribute('aria-label') ||
        group?.querySelector('legend, .application-label')?.textContent || '';
      const labels = [...(field.labels || [])].map(label => {
        const copy = label.cloneNode(true);
        copy.querySelectorAll('input,textarea,select,button,[aria-hidden="true"],.required').forEach(el => el.remove());
        return copy.textContent.trim();
      }).filter(Boolean);
      const labelled = (field.getAttribute('aria-labelledby') || '').split(/\s+/)
        .map(id => document.getElementById(id)?.textContent || '').join(' ');
      const choice = type === 'checkbox' || type === 'radio';
      const promptParts = choice ? [groupText, labelled] : [field.getAttribute('aria-label'), labelled, ...labels, groupText];
      // Email is excluded even when a text control carries a misleading prompt.
      const identity = [field.name, field.id, field.autocomplete].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2');
      const promptKeys = promptParts.map(normalize).filter(Boolean);
      if ([...promptKeys, ...labels.map(normalize), normalize(identity)].some(key => protectedQuestion.test(key)) ||
          /email/i.test(identity) || (choice && !group)) continue;
      if (promptKeys.some(key => aliases.get(key) === null)) continue;
      const candidates = [...new Set(promptKeys.map(key => aliases.get(key)).filter(Boolean))];
      if (candidates.length !== 1 || (candidates[0].id.startsWith('reviewed-role:') && type !== 'textarea')) continue;
      const answer = candidates[0];
      const entry = matches.get(answer.id) || { answer, fields: [] };
      entry.fields.push({ field, group, choice, type, label: labels[0] || field.getAttribute('aria-label') || '',
        required: field.required || field.getAttribute('aria-required') === 'true' ||
          Boolean(group?.querySelector('.required, .required-field, [aria-required="true"]')) ||
          promptParts.some(part => /[*✱]|\brequired\b/i.test(part || '')) });
      matches.set(answer.id, entry);
    }

    const result = blank('FILL_READ_BACK');
    for (const { answer, fields } of matches.values()) {
      if (!bound() || !form.isConnected) return { ...result, state: 'FORM_CHANGED' };
      const first = fields[0];
      if (answer.requiredOnly && !fields.some(item => item.required)) {
        result.unresolved.push(answer.id); continue;
      }
      if ((!first.choice && fields.length !== 1) ||
          (first.choice && fields.some(item => item.type !== first.type || item.group !== first.group ||
            (item.type === 'radio' && (!item.field.name || item.field.name !== first.field.name))))) {
        result.unresolved.push(answer.id); continue;
      }
      const existed = ({ field, choice, type }) => choice ? field.checked :
        options.includes(type) ? [...field.selectedOptions].some(hasOptionValue) : Boolean(field.value.trim());
      if (fields.some(existed)) { result.preserved.push(answer.id); continue; }
      if (fields.some(item => !editable(item.field))) { result.unresolved.push(answer.id); continue; }

      const { field, type } = first;
      const selected = [];
      if (options.includes(type)) {
        const available = first.choice ? fields.map(item => ({
          el: item.field, text: item.label, value: item.field.value,
        })) : [...field.options].filter(hasOptionValue).map(el => ({ el, text: el.text, value: el.value }));
        const wanted = (type === 'checkbox' || type === 'select-multiple' ? answer.value.split(/\r?\n/) : [answer.value])
          .map(normalize).filter(Boolean);
        for (const value of new Set(wanted)) {
          const choices = available.filter(item => normalize(item.text) === value || normalize(item.value) === value);
          if (choices.length !== 1) break;
          selected.push(choices[0].el);
        }
        if (!selected.length || selected.length !== new Set(wanted).size || new Set(selected).size !== selected.length) {
          result.unresolved.push(answer.id); continue;
        }
      }
      if (first.choice) {
        for (const element of selected) element.checked = true;
      } else if (selected.length) {
        for (const option of field.options) option.selected = selected.includes(option);
      } else {
        if (field.maxLength >= 0 && answer.value.length > field.maxLength) { result.unresolved.push(answer.id); continue; }
        field.value = answer.value;
      }
      for (const element of first.choice ? selected : [field]) {
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const retained = fields.every(item => editable(item.field)) && (first.choice
        ? fields.every(item => item.field.checked === selected.includes(item.field))
        : selected.length ? [...field.selectedOptions].length === selected.length && selected.every(option => option.selected)
          : field.value === answer.value);
      (retained ? result.filled : result.unresolved).push(answer.id);
    }
    if (!bound() || !form.isConnected) return { ...result, state: 'FORM_CHANGED' };
    for (const answer of new Set([...aliases.values()].filter(Boolean))) {
      if (!matches.has(answer.id)) result.unresolved.push(answer.id);
    }
    return result;
  }

  if (typeof module === 'object' && module.exports) module.exports = fillKnownLever;
  else root.EscapeHatchFillKnownLever = fillKnownLever;
})(globalThis);
