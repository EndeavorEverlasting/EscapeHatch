/* Read-only Lever snapshot shared by the managed browser and the extension. */
(function (root) {
  'use strict';

  function readReviewedLeverForm(expectedUrl) {
    if (location.href !== expectedUrl || location.origin !== 'https://jobs.lever.co' ||
        !/^\/[a-z0-9_-]+\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/apply\/?$/i.test(location.pathname)) return null;
    const forms = document.querySelectorAll('form#application-form:has(#btn-submit)');
    if (forms.length !== 1) return null;
    const labelText = (label) => {
      const copy = label.cloneNode(true);
      copy.querySelectorAll('input,select,textarea,button,[aria-hidden="true"],.required').forEach(control => control.remove());
      return copy.textContent.trim();
    };
    const visible = element => !element.closest('[hidden], [aria-hidden="true"]') &&
      element.getClientRects().length && getComputedStyle(element).visibility === 'visible';
    const groups = new Map();
    for (const field of forms[0].querySelectorAll('input, select, textarea')) {
      if (/^(eeo|consent)\[/i.test(field.name) || field.matches(':disabled, [readonly]') || !visible(field) ||
          !['text', 'email', 'tel', 'url', 'number', 'textarea', 'select-one', 'select-multiple', 'radio', 'checkbox'].includes(field.type)) continue;
      const container = field.closest('fieldset, [role="group"], [role="radiogroup"], .application-question');
      const heading = container?.querySelector('legend, .application-label');
      const groupLabel = container?.getAttribute('aria-label') || (heading ? labelText(heading) : '');
      const labels = [...(field.labels || [])].map(labelText).filter(Boolean);
      const labelledBy = (field.getAttribute('aria-labelledby') || '').split(/\s+/)
        .map(id => document.getElementById(id)).filter(Boolean).map(labelText).join(' ').trim();
      const choice = field.type === 'checkbox' || field.type === 'radio';
      const question = (choice ? groupLabel : field.getAttribute('aria-label') || labelledBy || labels[0] || groupLabel)?.trim();
      if (!question) continue;
      // Group only the options of one actual control. Equal labels on two
      // separate controls remain separate rows so the host can reject ambiguity.
      const group = choice ? container : field;
      if (!group) continue;
      const rows = groups.get(group) || new Map();
      // Lever may assign a distinct name to each checkbox option. Its
      // labelled container defines the answer, while radio names define groups.
      const key = field.type === 'radio' ? field.type + ':' + field.name : choice ? field.type : '';
      const row = rows.get(key) || { question, kind: field.type, values: [] };
      if (field instanceof HTMLSelectElement) {
        row.values.push(...[...field.selectedOptions].filter(option => option.value && !option.matches(':disabled')).map(option => option.text.trim()));
      } else if (choice) {
        if (field.checked && labels[0]) row.values.push(labels[0]);
      } else if (field.value.trim()) {
        row.values.push(field.value);
      }
      rows.set(key, row);
      groups.set(group, rows);
    }
    return [...groups.values()].flatMap(rows => [...rows.values()].map(({ question, kind, values }) =>
      ({ question, kind, value: [...new Set(values.filter(Boolean))].join('\n') })));
  }

  root.EscapeHatchReviewedForm = readReviewedLeverForm;
  if (typeof module !== 'undefined') module.exports = readReviewedLeverForm;
})(globalThis);
