import type { AssistAnswer, AssistProfile, CanonicalQuestionId } from './assist-contract';

export type FieldKind = 'text' | 'email' | 'tel' | 'url' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'file' | 'password' | 'button' | 'unknown';
export type PolicyStatus = 'fillable' | 'already-populated' | 'manual-review' | 'blocked' | 'unknown';
export type RecognizedField = {
  id: string;
  kind: FieldKind;
  label: string;
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement;
  value: string;
  proposedValue: string;
  status: PolicyStatus;
  reason?: string;
  canonicalQuestionId?: CanonicalQuestionId;
};

const sensitive = /\b(password|confirm password|ssn|social security|work authorization|authorized to work|sponsorship|visa|legal|attest|certif|demographic|gender|race|ethnicity|disability|veteran|salary|compensation|accommodation|criminal|background check|truth|accuracy|consent)\b/i;
const continuation = /\b(next|continue|submit|apply|save and continue|certif|send application)\b/i;

export function classifyQuestion(label: string): { id: CanonicalQuestionId; status: 'known' | 'sensitive' | 'unknown' } {
  if (sensitive.test(label)) return { id: 'unknown', status: 'sensitive' };
  const normalized = label.toLowerCase();
  if (/professional summary|tell us about yourself|overview/.test(normalized)) return { id: 'professional-summary', status: 'known' };
  if (/why (this|the) (role|position|job)|why do you want (this|the) (role|position|job)/.test(normalized)) return { id: 'why-this-role', status: 'known' };
  if (/why (this|the) company|why do you want to work/.test(normalized)) return { id: 'why-this-company', status: 'known' };
  if (/strength/.test(normalized)) return { id: 'strengths', status: 'known' };
  if (/relevant experience|experience.*role/.test(normalized)) return { id: 'relevant-experience', status: 'known' };
  return { id: 'unknown', status: 'unknown' };
}

function labelFor(element: Element) {
  const input = element as HTMLInputElement;
  const id = input.id;
  const byId = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : '';
  const wrapping = element.closest('label')?.textContent ?? '';
  const described = element.getAttribute('aria-label') ?? element.getAttribute('placeholder') ?? element.getAttribute('name') ?? '';
  return (byId || wrapping || described || '').replace(/\s+/g, ' ').trim();
}

function kindOf(element: Element): FieldKind {
  const tag = element.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  if (tag === 'button') return 'button';
  if (tag !== 'input') return 'unknown';
  const type = ((element as HTMLInputElement).type || 'text').toLowerCase();
  return ['text', 'email', 'tel', 'url', 'password', 'file', 'checkbox', 'radio', 'button', 'submit'].includes(type) ? type as FieldKind : 'unknown';
}

function valueFor(profile: AssistProfile, answers: AssistAnswer[], label: string, kind: FieldKind) {
  const normalized = label.toLowerCase();
  if (/\b(first|given) name\b/.test(normalized)) return profile.contact.first_name;
  if (/\b(last|family|sur)name\b/.test(normalized)) return profile.contact.last_name;
  if (/\b(preferred|chosen) name\b/.test(normalized)) return profile.contact.preferred_name;
  if (/\bemail\b/.test(normalized) || kind === 'email') return profile.contact.email;
  if (/\b(phone|mobile|telephone)\b/.test(normalized) || kind === 'tel') return profile.contact.phone;
  if (/linkedin/.test(normalized)) return profile.contact.linkedin_url;
  if (/\bcity\b/.test(normalized)) return profile.contact.city;
  if (/\b(state|province|region)\b/.test(normalized)) return profile.contact.region;
  if (/\bpostal|zip\b/.test(normalized)) return profile.contact.postal_code;
  if (/\bcountry\b/.test(normalized)) return profile.contact.country;
  const question = classifyQuestion(label);
  if (question.status === 'known') return answers.find((answer) => answer.canonicalId === question.id && answer.scope === 'reusable')?.content
    ?? (question.id === 'professional-summary' ? profile.summary : '');
  return '';
}

export function scanPage(document: Document, profile: AssistProfile, answers: AssistAnswer[]): RecognizedField[] {
  const elements = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input, textarea, select, button'));
  return elements.map((element, index) => {
    const kind = kindOf(element);
    const label = labelFor(element);
    const value = 'value' in element ? String(element.value ?? '') : '';
    const proposedValue = valueFor(profile, answers, label, kind);
    const question = classifyQuestion(label);
    const blocked = kind === 'password' || kind === 'file' || kind === 'checkbox' || kind === 'radio' || kind === 'button' || continuation.test(`${label} ${element.textContent ?? ''}`) || question.status === 'sensitive';
    const id = element.id || element.getAttribute('name') || `field-${index}`;
    return {
      id,
      kind,
      label: label || 'Unlabeled control',
      element,
      value,
      proposedValue,
      status: blocked ? 'blocked' : !label || question.status === 'unknown' && !proposedValue ? 'unknown' : value.trim() ? 'already-populated' : proposedValue ? 'fillable' : 'manual-review',
      reason: blocked ? 'Protected or navigation control' : !label ? 'Needs a visible label' : undefined,
      canonicalQuestionId: question.status === 'known' ? question.id : undefined,
    };
  });
}

export type FillRecord = { id: string; element: RecognizedField['element']; previousValue: string; value: string };

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function fillApprovedFields(fields: RecognizedField[], approvedIds: Set<string>, emergencyStopped = false, paused = false): FillRecord[] {
  if (emergencyStopped || paused) return [];
  const records: FillRecord[] = [];
  for (const field of fields) {
    if (!approvedIds.has(field.id) || field.status !== 'fillable' || !field.proposedValue) continue;
    if (field.kind === 'select') {
      const select = field.element as HTMLSelectElement;
      const option = Array.from(select.options).find((item) => item.text.trim().toLowerCase() === field.proposedValue.trim().toLowerCase() || item.value.trim().toLowerCase() === field.proposedValue.trim().toLowerCase());
      if (!option) continue;
      records.push({ id: field.id, element: field.element, previousValue: select.value, value: option.value });
      setNativeValue(select, option.value);
    } else if (field.kind === 'text' || field.kind === 'email' || field.kind === 'tel' || field.kind === 'url' || field.kind === 'textarea') {
      const input = field.element as HTMLInputElement | HTMLTextAreaElement;
      if (input.value.trim()) continue;
      records.push({ id: field.id, element: field.element, previousValue: input.value, value: field.proposedValue });
      setNativeValue(input, field.proposedValue);
    }
  }
  return records;
}

export function undoFill(records: FillRecord[]) {
  for (const record of [...records].reverse()) {
    if ('value' in record.element && (record.element as HTMLInputElement).value === record.value) {
      setNativeValue(record.element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, record.previousValue);
    }
  }
}