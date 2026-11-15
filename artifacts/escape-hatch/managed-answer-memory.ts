import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { matchQuestion, normalizeQuestion, questions, safeDiscoveredQuestion, parsePreferences, type Preferences } from './src/lib/application-preferences.ts';

export type QuestionDescriptor = { question: string; normalized_question: string; question_id: string | null };
export type CapturedAnswer = { question: string; normalized_question: string; question_id: string | null; value: string; source: 'user'; captured_at: string; employer_name?: string };
export async function readReviewedAnswers(page: Page, employerName: string): Promise<CapturedAnswer[]> {
  const answers = await page.evaluate(() => {
    const labelText = (label: Element) => {
      const copy = label.cloneNode(true) as Element;
      copy.querySelectorAll('input,select,textarea,button').forEach(control => control.remove());
      return copy.textContent?.trim() || '';
    };
    const form = document.querySelector('#btn-submit')?.closest('form#application-form');
    const fields = Array.from(form?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea') || []);
    const answers = new Map<string, string[]>();
    for (const field of fields) {
      if (/^(eeo|consent)\[/i.test(field.name) || field.matches(':disabled, [readonly]') || field.closest('[hidden], [aria-hidden="true"]') ||
          !field.getClientRects().length || getComputedStyle(field).visibility !== 'visible' ||
          !['text', 'email', 'tel', 'url', 'number', 'textarea', 'select-one', 'select-multiple', 'radio', 'checkbox'].includes(field.type)) continue;
      const group = field.closest('fieldset, [role="group"], [role="radiogroup"], .application-question');
      const groupLabel = group?.getAttribute('aria-label') || group?.querySelector('legend, .application-label')?.textContent?.trim() || '';
      const labels = Array.from(field.labels || []).map(labelText).filter(Boolean);
      const labelledBy = (field.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || '').join(' ').trim();
      const choice = field.type === 'radio' || field.type === 'checkbox';
      const question = choice ? groupLabel : field.getAttribute('aria-label') || labelledBy || groupLabel || labels[0];
      if (!question) continue;
      const values = field instanceof HTMLSelectElement ? Array.from(field.selectedOptions).filter(option => option.value && !option.disabled).map(option => option.text.trim()) :
        field instanceof HTMLInputElement && choice ? (field.checked && labels[0] ? [labels[0]] : []) : [field.value.trim()];
      if (!values.some(Boolean)) continue;
      answers.set(question, [...new Set([...(answers.get(question) || []), ...values])]);
    }
    return Array.from(answers, ([question, values]) => ({ question, value: values.join('\n') }));
  });
  const capturedAt = new Date().toISOString();
  return answers.flatMap(({ question, value }) => {
    const label = normalizeQuestion(question);
    const id = matchQuestion(question, employerName);
    if (/\b(?:privacy|disclosure|terms|acknowledg\w*|attest\w*|certif\w*|signature|sign|agree\w*|consent\w*|date|voluntary)\b/.test(label) ||
        (id && /^(eeo|accommodation|military|veteran)\./.test(id))) return [];
    return [{ question, normalized_question: label, question_id: id, value, source: 'user' as const, captured_at: capturedAt, employer_name: employerName }];
  });
}

export function mergeCapturedAnswer(data: Preferences, event: CapturedAnswer): Preferences {
  if (event.source !== 'user' || typeof event.value !== 'string' || !event.value.trim() || event.value.length > 512 || !Number.isFinite(Date.parse(event.captured_at))) return data;
  const matched = matchQuestion(event.question);
  const relationship = /^employment\.(?:(?:current|previous)_employee|prior_employer_relationship)$/.test(matched || event.question_id || '');
  const id = relationship ? null : matched;
  const prompt = relationship && matched ? (event.employer_name?.trim() ? event.question + ' (employer: ' + event.employer_name.trim() + ')' : '') : event.question;
  let candidate: Preferences;
  if (id) {
    const owner = questions.find(q => q.id === id)!;
    if (owner.automation_policy !== 'fill_if_explicit_preference' || owner.confirmation_policy !== 'until_changed') return data;
    candidate = { ...data, preferences: { ...data.preferences, [id]: { scope: 'profile_preference', value: event.value.trim(), source: 'user', updated_at: event.captured_at } } };
  } else {
    if (!safeDiscoveredQuestion(prompt)) return data;
    const key = normalizeQuestion(prompt);
    const prior = data.discovered_answers?.[key];
    // Re-observing an approved value does not revoke the user's reuse choice.
    // A changed value still needs an explicit new approval.
    const accepted = prior?.source === 'user' && prior.accepted === true && prior.value === event.value.trim();
    candidate = { ...data, discovered_answers: { ...data.discovered_answers, [key]: { question: prompt, value: event.value.trim(), source: 'user', updated_at: event.captured_at, accepted } } };
  }
  return parsePreferences(candidate) || data;
}

// Runs in the document before navigation. Values cross the bridge on user events,
// rather than polling after a React route change has discarded the controls.
function installCapture(config: { binding: string; nonce: string; aliases: Record<string, string>; blocked: string[]; employer: string; origin: string; pathname: string }) {
  const state = window as unknown as Record<string, any>;
  const sentinel = config.binding + "_installed";
  if (state[sentinel]) return;
  state[sentinel] = true;
  const inScope = () => location.origin === config.origin && location.pathname === config.pathname;
  const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\bu\.s\.(?:a\.)?/g, 'us').replace(/\((?:required|optional|voluntary|select one|please select)\)|\[(?:required|optional)\]|\brequired\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const describe = (field: HTMLInputElement) => {
    const labels = Array.from(field.labels || []).map(label => { const copy = label.cloneNode(true) as Element; copy.querySelectorAll('input,select,textarea,button').forEach(e => e.remove()); return copy.textContent || ''; });
    const entry = field.closest('.ashby-application-form-field-entry');
    const prompts = [...labels, ...(field.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || ''), field.getAttribute('aria-label') || '', field.closest('fieldset')?.querySelector('legend')?.textContent || '', ...Array.from(entry?.children || []).filter(e => e.tagName === 'LABEL').map(e => e.textContent || '')].map(s => s.trim()).filter(Boolean);
    const known = prompts.filter(p => config.aliases[normalize(p)]);
    if (new Set(known.map(p => config.aliases[normalize(p)])).size > 1) return '';
    return known.length ? known[0] : prompts[0] || '';
  };
  state.__escapeHatchQuestionCatalog = () => !inScope() ? [] : Array.from(document.querySelectorAll('input,textarea,select,button[aria-pressed]')).filter(element => {
    const input = element as HTMLInputElement;
    return !['password','hidden','file','checkbox','submit','reset'].includes(input.type) && input.getClientRects().length;
  }).map(e => describe(e as HTMLInputElement)).filter(Boolean);
  const listener = (event: Event) => {
    if (!event.isTrusted || !inScope()) return;
    const target = event.target instanceof Element ? event.target.closest('input,textarea,select,button[aria-pressed]') as HTMLInputElement | null : null;
    if (!target || target.disabled || target.readOnly || !target.getClientRects().length) return;
    const toggle = target.tagName === 'BUTTON' && (target.getAttribute('type') === 'button' || !target.hasAttribute('type') && !(target as unknown as HTMLButtonElement).form) && target.hasAttribute('aria-pressed');
    if (target.tagName === 'BUTTON' && !toggle || !toggle && ['password','hidden','file','checkbox','submit','reset'].includes(target.type)) return;
    if (event.type === 'click' && !toggle || event.type !== 'click' && toggle) return;
    const prompt = describe(target), normalized = normalize(prompt);
    if (config.blocked.includes(normalized)) return;
    const canonical = config.aliases[normalized];
    if (!canonical && (normalized.length < 4 || normalized.length > 300 || /\b(password|secret|token|social security|ssn|birth|bank|account|credit|card|routing|passport|nationality|citizenship|health|insurance|medication|diagnosis|tax|medical|disability|accommodation|veteran|race|ethnicity|gender|religion|sexual|criminal|convict|felony|legal|certify|certification|attest|agree|consent|signature|salary|compensation|authorization|sponsor|clearance)\b/.test(normalized))) return;
    const value = toggle ? target.textContent?.trim() || '' : target.tagName === 'SELECT' ? (target as unknown as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() || '' : target.type === 'radio' ? (target.checked ? target.labels?.[0]?.textContent?.trim() || target.value : '') : target.value;
    if (!value?.trim() || value.length > 512 || /^(select|choose|please select|select one)(?:\b|$)/i.test(value)) return;
    const send = () => {
      if (toggle && target.getAttribute('aria-pressed') !== 'true') return;
      void state[config.binding]({ question: prompt, normalized_question: normalized, question_id: canonical || null, value, source: 'user', captured_at: new Date().toISOString(), employer_name: config.employer }, config.nonce);
    };
    if (toggle) setTimeout(send, 0); else send();
  };
  for (const kind of ['input','change','click']) document.addEventListener(kind, listener, true);
}

export async function installAnswerMemory(page: Page, onAnswer: (event: CapturedAnswer) => Promise<void> | void, employerName = ''): Promise<() => Promise<void>> {
  const aliases: Record<string, string> = {};
  const blocked: string[] = [];
  for (const question of questions) {
    if (question.automation_policy !== 'fill_if_explicit_preference' || question.confirmation_policy !== 'until_changed') { blocked.push(...question.aliases.map(normalizeQuestion)); continue; }
    for (const alias of question.aliases) aliases[normalizeQuestion(alias)] = question.id;
  }
  if (employerName.trim()) {
    aliases[normalizeQuestion('Are you a current employee of ' + employerName)] = 'employment.current_employee';
    aliases[normalizeQuestion('Have you previously been employed by ' + employerName)] = 'employment.previous_employee';
  }
  const scope = new URL(page.url());
  const binding = '__escapeHatchRememberUserAnswer_' + randomUUID().replace(/-/g, '');
  const nonce = randomUUID();
  let enabled = true;
  await page.exposeBinding(binding, async ({ frame }, event: CapturedAnswer, proof: string) => {
    if (!enabled || proof !== nonce || frame !== page.mainFrame()) return;
    const actual = new URL(frame.url());
    if (actual.origin === scope.origin && actual.pathname === scope.pathname) await onAnswer(event);
  });
  const config = { binding, nonce, aliases, blocked, employer: employerName, origin: scope.origin, pathname: scope.pathname };
  await page.addInitScript(installCapture, config);
  await page.evaluate(installCapture, config);
  return async () => { enabled = false; };
}
export async function scanQuestionCatalog(page: Page): Promise<QuestionDescriptor[]> {
  const prompts = await page.evaluate(() => (window as unknown as { __escapeHatchQuestionCatalog?: () => string[] }).__escapeHatchQuestionCatalog?.() || []);
  return [...new Set(prompts)].slice(0, 100).filter(question => matchQuestion(question) || safeDiscoveredQuestion(question)).map(question => ({ question, normalized_question: normalizeQuestion(question), question_id: matchQuestion(question) }));
}


// Discovery records a question, never an answer or permission to reuse one.
export function mergeQuestionCatalog(data: Preferences, catalog: QuestionDescriptor[]): Preferences {
  let candidate = data;
  for (const item of catalog.slice(0, 100)) {
    if (!safeDiscoveredQuestion(item.question)) continue;
    const key = normalizeQuestion(item.question);
    if (candidate.discovered_answers?.[key]) continue;
    const next: Preferences = { ...candidate, discovered_answers: { ...candidate.discovered_answers, [key]: { question: item.question, value: '', source: 'observed_question', updated_at: new Date().toISOString(), accepted: false } } };
    candidate = parsePreferences(next) || candidate;
  }
  return candidate;
}
