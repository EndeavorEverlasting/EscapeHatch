import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { matchQuestion, normalizeQuestion, questions, safeDiscoveredQuestion, parsePreferences, type Preferences } from './src/lib/application-preferences.ts';

export type CapturedAnswer = { question: string; normalized_question: string; question_id: string | null; value: string; source: 'user'; captured_at: string };
export function mergeCapturedAnswer(data: Preferences, event: CapturedAnswer): Preferences {
  if (event.source !== 'user' || typeof event.value !== 'string' || !event.value.trim() || event.value.length > 512 || !Number.isFinite(Date.parse(event.captured_at))) return data;
  const id = matchQuestion(event.question) || (event.question_id && questions.some(q => q.id === event.question_id) && /^employment\.(current|previous)_employee$/.test(event.question_id) ? event.question_id : null);
  let candidate: Preferences;
  if (id) {
    const owner = questions.find(q => q.id === id)!;
    if (owner.automation_policy !== 'fill_if_explicit_preference' || owner.confirmation_policy !== 'until_changed') return data;
    candidate = { ...data, preferences: { ...data.preferences, [id]: { scope: 'profile_preference', value: event.value.trim(), source: 'user', updated_at: event.captured_at } } };
  } else {
    if (!safeDiscoveredQuestion(event.question)) return data;
    const key = normalizeQuestion(event.question);
    candidate = { ...data, discovered_answers: { ...data.discovered_answers, [key]: { question: event.question, value: event.value.trim(), source: 'user', updated_at: event.captured_at, accepted: false } } };
  }
  return parsePreferences(candidate) || data;
}

// Runs in the document before navigation. Values cross the bridge on user events,
// rather than polling after a React route change has discarded the controls.
function installCapture(config: { binding: string; nonce: string; aliases: Record<string, string>; blocked: string[]; employer: string }) {
  const state = window as unknown as Record<string, any>;
  if (state.__escapeHatchAnswerMemory) return;
  state.__escapeHatchAnswerMemory = true;
  const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\bu\.s\.(?:a\.)?/g, 'us').replace(/\((?:required|optional|voluntary|select one|please select)\)|\[(?:required|optional)\]|\brequired\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const describe = (field: HTMLInputElement) => {
    const labels = Array.from(field.labels || []).map(label => { const copy = label.cloneNode(true) as Element; copy.querySelectorAll('input,select,textarea,button').forEach(e => e.remove()); return copy.textContent || ''; });
    const entry = field.closest('.ashby-application-form-field-entry');
    const prompts = [...labels, ...(field.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || ''), field.getAttribute('aria-label') || '', field.closest('fieldset')?.querySelector('legend')?.textContent || '', ...Array.from(entry?.children || []).filter(e => e.tagName === 'LABEL').map(e => e.textContent || '')].map(s => s.trim()).filter(Boolean);
    const known = prompts.filter(p => config.aliases[normalize(p)]);
    if (new Set(known.map(p => config.aliases[normalize(p)])).size > 1) return '';
    return known.length ? known[0] : prompts[0] || '';
  };
  state.__escapeHatchQuestionCatalog = () => Array.from(document.querySelectorAll('input,textarea,select,button[aria-pressed]')).filter(element => {
    const input = element as HTMLInputElement;
    return !['password','hidden','file','checkbox','submit','reset'].includes(input.type) && input.getClientRects().length;
  }).map(e => describe(e as HTMLInputElement)).filter(Boolean);
  const listener = (event: Event) => {
    if (!event.isTrusted || !state.__escapeHatchAnswerMemory) return;
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
      void state[config.binding]({ question: prompt, normalized_question: normalized, question_id: canonical || null, value, source: 'user', captured_at: new Date().toISOString() }, config.nonce);
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
  const binding = '__escapeHatchRememberUserAnswer';
  const nonce = randomUUID();
  let enabled = true;
  await page.exposeBinding(binding, async ({ frame }, event: CapturedAnswer, proof: string) => {
    if (enabled && proof === nonce && frame === page.mainFrame()) await onAnswer(event);
  });
  const config = { binding, nonce, aliases, blocked, employer: employerName };
  await page.addInitScript(installCapture, config);
  await page.evaluate(installCapture, config);
  return async () => { enabled = false; if (!page.isClosed()) await page.evaluate(() => { (window as unknown as Record<string, any>).__escapeHatchAnswerMemory = false; }); };
}
export async function scanQuestionCatalog(page: Page): Promise<{ question: string; normalized_question: string; question_id: string | null }[]> {
  const prompts = await page.evaluate(() => (window as unknown as { __escapeHatchQuestionCatalog?: () => string[] }).__escapeHatchQuestionCatalog?.() || []);
  return [...new Set(prompts)].slice(0, 100).filter(question => matchQuestion(question) || safeDiscoveredQuestion(question)).map(question => ({ question, normalized_question: normalizeQuestion(question), question_id: matchQuestion(question) }));
}
