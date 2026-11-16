import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { emptyPreferences, matchQuestion, acceptDiscoveredAnswer, discoveredValue, parsePreferences, isRoutineApplicantPrivacyAcknowledgement } from './src/lib/application-preferences.ts';
import { installAnswerMemory, mergeCapturedAnswer, mergeQuestionCatalog, readReviewedRoleAnswers, scanQuestionCatalog, type CapturedAnswer } from './managed-answer-memory.ts';
import { fillSavedPreferences } from './managed-form.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeQuestion } from './src/lib/application-preferences.ts';
import { readPreferences, savePreferences } from './preference-file.ts';
import { syncReviewedApplicationAnswers } from './reviewed-application-answers.ts';

test('recapturing an identical discovered answer preserves approval; changed or unapproved answers require review', () => {
  const question = 'Favorite work environment';
  const event: CapturedAnswer = { question, normalized_question: 'favorite work environment', question_id: null,
    value: 'Remote', source: 'user', captured_at: '2026-01-01T00:00:00Z' };
  const captured = mergeCapturedAnswer(emptyPreferences(), event);
  assert.equal(discoveredValue(question, captured), null);
  const approved = acceptDiscoveredAnswer(captured, event.normalized_question);
  const repeated = mergeCapturedAnswer(approved, { ...event, value: ' Remote ', captured_at: '2026-01-02T00:00:00Z' });
  assert.equal(discoveredValue(question, repeated), 'Remote');
  assert.equal(repeated.discovered_answers![event.normalized_question].updated_at, '2026-01-02T00:00:00Z');
  assert.equal(discoveredValue(question, mergeCapturedAnswer(repeated, { ...event, value: 'Hybrid' })), null);
  assert.equal(discoveredValue(question, mergeCapturedAnswer(captured, event)), null);
  assert.equal(discoveredValue('Preferred schedule', mergeCapturedAnswer(approved, { ...event, question: 'Preferred schedule' })), null);
});

test('canonical website, pronouns and interview accommodation are independent explicit preferences', async () => {
  assert.equal(matchQuestion('Website Link (LinkedIn, github, portfolio, etc...)'), 'identity.website');
  assert.equal(matchQuestion('Please indicate your pronouns and let us know how we should address you.'), 'identity.pronouns');
  assert.equal(matchQuestion('Will you require a reasonable accommodation during the interview process?'), 'accommodation.interview_accommodation_needed');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<label>Website Link (LinkedIn, github, portfolio, etc...)<input type="url"></label><label>Pronouns<input></label><fieldset><legend>Will you require a reasonable accommodation during the interview process?</legend><button aria-pressed="false" onclick="this.setAttribute(\'aria-pressed\',\'true\')">No</button><button type="button" aria-pressed="false">Yes</button></fieldset>');
    const data = emptyPreferences();
    for (const [id,value] of Object.entries({ 'identity.website': 'https://example.test', 'identity.pronouns': 'they/them', 'eeo.disability_status': 'No' })) data.preferences[id] = { scope:'profile_preference', value, source:'user', updated_at:data.exported_at };
    const result = await fillSavedPreferences(page,data);
    assert.ok(result.filled.includes('identity.website'));
    assert.equal(await page.getByLabel('Pronouns').inputValue(), 'they/them');
    assert.equal(await page.getByRole('button',{name:'No',exact:true}).getAttribute('aria-pressed'),'false');
  } finally { await browser.close(); }
});

test('trusted edits cross event binding before SPA navigation; script changes and forbidden controls excluded', async () => {
  const browser = await chromium.launch({ channel:'chrome',headless:true });
  try {
    const page = await browser.newPage();
    await page.setContent('<label>Website<input id="web"></label><label>Favorite work environment<input id="unknown"></label><label>Password<input type="password"></label><label>I certify this is true<input id="certify"></label><button id="navigate" onclick="document.body.innerHTML=\'Done\'">Continue</button>');
    let data = emptyPreferences(); const events: CapturedAnswer[] = [];
    const stop = await installAnswerMemory(page,event => { events.push(event);data = mergeCapturedAnswer(data,event); });
    assert.equal((await scanQuestionCatalog(page)).length,2);
    await page.locator('#web').evaluate(e => { (e as HTMLInputElement).value='https://untrusted.test'; e.dispatchEvent(new Event('input',{bubbles:true})); });
    await page.evaluate(async () => {
      const windowBridge = window as unknown as Record<string, any>;
      const binding = Object.keys(windowBridge).find(key => key.startsWith('__escapeHatchRememberUserAnswer_') && typeof windowBridge[key] === 'function')!;
      await windowBridge[binding]({ question:'Website',value:'https://spoofed.test',source:'user',captured_at:new Date().toISOString() });
    });
    assert.equal(events.length,0);
    await page.locator('#web').fill(''); await page.locator('#web').pressSequentially('https://example.test');
    await page.locator('#unknown').pressSequentially('Remote');
    await page.locator('#certify').pressSequentially('Yes');
    await page.locator('#navigate').click();
    await page.waitForFunction(() => document.body.textContent === 'Done');
    assert.equal(data.preferences['identity.website'].value,'https://example.test');
    assert.equal(discoveredValue('Favorite work environment',data),null);
    data = acceptDiscoveredAnswer(data,'favorite work environment');
    assert.equal(discoveredValue('Favorite work environment',data),'Remote');
    assert.ok(parsePreferences(data));
    assert.equal(events.some(e => e.question.includes('certify')),false);
    await stop();
    await page.setContent('<label>Favorite work environment<input></label>');
    assert.ok((await fillSavedPreferences(page,data)).filled.includes('discovered:favorite work environment'));
    assert.equal(await page.getByLabel('Favorite work environment').inputValue(),'Remote');
  } finally { await browser.close(); }
});

test('native select, radio and Ashby binary clicks remember only user actions', async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<label>Country<select><option value="">Select</option><option>Canada</option></select></label><fieldset><legend>Gender</legend><label><input type="radio" name="gender" value="female">Female</label><label><input type="radio" name="gender" value="male">Male</label></fieldset><div class="ashby-application-form-field-entry"><label>Will you require a reasonable accommodation during the interview process?</label><button aria-pressed="false" onclick="this.setAttribute(\'aria-pressed\',\'true\')">No</button><button type="button" aria-pressed="false">Yes</button></div>');
    let data = emptyPreferences();
    await installAnswerMemory(page,event => {data = mergeCapturedAnswer(data,event);});
    await page.getByLabel('Country').focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.getByLabel('Male',{exact:true}).check();
    await page.getByRole('button',{name:'No',exact:true}).click();
    await page.waitForTimeout(50);
    assert.equal(data.preferences['identity.country'].value,'Canada');
    assert.equal(data.preferences['eeo.gender'].value,'Male');
    assert.equal(data.preferences['accommodation.interview_accommodation_needed'].value,'No');
    assert.equal(data.preferences['eeo.disability_status'],undefined);
  } finally {await browser.close();}
});



test('optional omission persists, fills only explicitly required controls', async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage(); const data = emptyPreferences();
    data.optional_omissions = ['identity.pronouns'];
    data.preferences['identity.pronouns'] = {scope:'profile_preference',source:'user',value:'they/them',updated_at:data.exported_at};
    assert.deepEqual(parsePreferences(data)?.optional_omissions,['identity.pronouns']);
    assert.equal(parsePreferences({...data,optional_omissions:['unknown']}),null);
    await page.setContent('<label>Pronouns<input></label>');
    assert.ok((await fillSavedPreferences(page,data)).skipped.includes('identity.pronouns:optional_omitted'));
    assert.equal(await page.getByLabel('Pronouns').inputValue(),'');
    await page.getByLabel('Pronouns').evaluate(e => e.setAttribute('required',''));
    assert.ok((await fillSavedPreferences(page,data)).filled.includes('identity.pronouns'));
    await page.setContent('<label>Pronouns *<input></label>');
    assert.ok((await fillSavedPreferences(page,data)).filled.includes('identity.pronouns'));
    assert.equal(await page.getByLabel('Pronouns *').inputValue(),'they/them');
  } finally {await browser.close();}
});


test('dispose and reinstall on one Page isolates callbacks across navigation', async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage();
    await page.route('https://example.test/**', route => route.fulfill({contentType:'text/html',body:'<label>Website<input></label>'}));
    await page.goto('https://example.test/first');
    const first: CapturedAnswer[] = [], second: CapturedAnswer[] = [];
    const stopFirst = await installAnswerMemory(page,event => {first.push(event);},'First');
    await page.getByLabel('Website').pressSequentially('one');
    await page.getByLabel('Website').blur();
    const countFirst = first.length;
    assert.ok(countFirst > 0);
    await stopFirst();
    await page.goto('https://example.test/second');
    const stopSecond = await installAnswerMemory(page,event => {second.push(event);},'Second');
    await stopFirst();
    await page.getByLabel('Website').pressSequentially('two');
    await page.getByLabel('Website').blur();
    assert.equal(first.length,countFirst);
    assert.equal(second.at(-1)?.value,'two');
    await stopSecond();
    const countSecond = second.length;
    await page.getByLabel('Website').pressSequentially('ignored');
    await page.getByLabel('Website').blur();
    assert.equal(second.length,countSecond);
  } finally {await browser.close();}
});


test('unanswered encountered question persists without fill until explicit user answer and acceptance', async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<label>Preferred working environment<input></label><label>Bank account<input></label>');
    const stop = await installAnswerMemory(page,() => {});
    let data = mergeQuestionCatalog(emptyPreferences(), await scanQuestionCatalog(page));
    const key = 'preferred working environment';
    assert.deepEqual(data.discovered_answers?.[key]?.source,'observed_question');
    assert.equal(data.discovered_answers?.[key]?.value,'');
    assert.ok(parsePreferences(data));
    assert.equal(data.discovered_answers?.['bank account'],undefined);
    assert.equal(discoveredValue(key,data),null);
    assert.deepEqual(acceptDiscoveredAnswer(data,key),data);
    await fillSavedPreferences(page,data);
    assert.equal(await page.getByLabel('Preferred working environment').inputValue(),'');
    data = mergeCapturedAnswer(data,{question:'Preferred working environment',normalized_question:key,question_id:null,value:'Remote',source:'user',captured_at:new Date().toISOString()});
    data = acceptDiscoveredAnswer(data,key);
    data = mergeQuestionCatalog(data,await scanQuestionCatalog(page));
    assert.equal(data.discovered_answers?.[key]?.source,'user');
    await fillSavedPreferences(page,data);
    assert.equal(await page.getByLabel('Preferred working environment').inputValue(),'Remote');
    // Invalid discovered rows are skipped so a stale taxonomy alias cannot poison the whole profile.
    const cleaned = parsePreferences({...data,discovered_answers:{[key]:{...data.discovered_answers![key],source:'observed_question',accepted:true}}});
    assert.ok(cleaned);
    assert.equal(cleaned.discovered_answers?.[key], undefined);
    await stop();
  } finally {await browser.close();}
});


test('controller and catalog reject sibling jobs and cross-origin navigation', async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage();
    await page.route('https://**/*', route => route.fulfill({contentType:'text/html',body:'<label>Website<input></label>'}));
    await page.goto('https://example.test/job-one/application');
    const events: CapturedAnswer[] = [];
    await installAnswerMemory(page,event => {events.push(event);});
    await page.getByLabel('Website').pressSequentially('one');
    await page.getByLabel('Website').blur();
    const count = events.length;
    for (const url of ['https://example.test/job-two/application','https://other.test/job-one/application']) {
      await page.goto(url);
      await page.getByLabel('Website').pressSequentially('forbidden');
      await page.getByLabel('Website').blur();
      assert.equal(events.length,count);
      assert.deepEqual(await scanQuestionCatalog(page),[]);
    }
  } finally {await browser.close();}
});

test('captured employer relationship is a question candidate, never a global employer answer', () => {
  const event: CapturedAnswer = {question:'Are you a current employee of Example Employer?',question_id:'employment.current_employee',normalized_question:'are you a current employee of example employer',value:'No',source:'user',captured_at:new Date().toISOString(),employer_name:'Example Employer'};
  const data = mergeCapturedAnswer(emptyPreferences(),event);
  assert.equal(data.preferences['employment.current_employee'],undefined);
  assert.equal(data.discovered_answers?.[event.normalized_question]?.value,'No');
  assert.equal(data.discovered_answers?.[event.normalized_question]?.accepted,false);
  const generic = mergeCapturedAnswer(emptyPreferences(),{...event,question:'Current employee',normalized_question:'current employee'});
  assert.equal(generic.preferences['employment.current_employee'],undefined);
  assert.equal(generic.discovered_answers?.['current employee employer example employer']?.value,'No');
});


test('saved applicant privacy opt-in checks only routine notice, persists, and respects a later uncheck', async () => {
  assert.equal(isRoutineApplicantPrivacyAcknowledgement('I acknowledge I have read the applicant Privacy Notice.'), true);
  assert.equal(isRoutineApplicantPrivacyAcknowledgement('I agree to the Privacy Policy and Terms of Service.'), false);
  assert.equal(isRoutineApplicantPrivacyAcknowledgement('I agree to marketing updates and the Privacy Policy.'), false);
  assert.equal(isRoutineApplicantPrivacyAcknowledgement('I agree to cookies and the Privacy Policy.'), false);
  assert.equal(isRoutineApplicantPrivacyAcknowledgement('I have not read the Privacy Notice.'), false);
  assert.equal(isRoutineApplicantPrivacyAcknowledgement('I consent to a background check and the Privacy Policy.'), false);
  assert.equal(isRoutineApplicantPrivacyAcknowledgement('I certify the application is accurate.'), false);
  assert.equal(parsePreferences({ ...emptyPreferences(), application_privacy_acknowledgement_enabled: 'yes' }), null);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<form>
      <label><input type="checkbox" id="privacy">I acknowledge I have read the applicant Privacy Notice.</label>
      <label><input type="checkbox" id="marketing">I agree to marketing updates and the Privacy Policy.</label>
      <label><input type="checkbox" id="terms">I agree to the Privacy Policy and Terms of Service.</label>
      <label><input type="checkbox" id="certify">I certify my information is accurate.</label>
      <button type="submit">Submit application</button>
    </form>`);
    const disabled = emptyPreferences();
    await fillSavedPreferences(page, disabled);
    assert.equal(await page.locator('#privacy').isChecked(), false);
    const enabled = parsePreferences({ ...emptyPreferences(), application_privacy_acknowledgement_enabled: true });
    assert.ok(enabled);
    const first = await fillSavedPreferences(page, enabled);
    assert.ok(first.filled.includes('privacy.application_notice_acknowledged'));
    assert.equal(await page.locator('#privacy').isChecked(), true);
    assert.equal(await page.locator('#marketing').isChecked(), false);
    assert.equal(await page.locator('#terms').isChecked(), false);
    assert.equal(await page.locator('#certify').isChecked(), false);
    await page.locator('#privacy').uncheck();
    const second = await fillSavedPreferences(page, enabled);
    assert.ok(second.skipped.includes('privacy.application_notice_acknowledged:user_override'));
    assert.equal(await page.locator('#privacy').isChecked(), false);
  } finally {
    await browser.close();
  }
});

test('a reviewed long role narrative recalls in a fresh browser only for the exact opportunity', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const source = await browser.newPage();
    const label = 'What excites you about this role? 1–4 sentences';
    const form = `<form><div class="application-question"><div class="application-label">${label}</div>
      <div class="application-field"><textarea id="role-answer"></textarea></div></div>
      <label>Privacy consent<textarea>Preserve</textarea></label></form>`;
    const value = ['Fixture experience. '.repeat(20).trim(), 'Fixture review. '.repeat(24).trim()].join('\n\n');
    await source.setContent(form);
    await source.locator('#role-answer').fill(value);
    const rows = await readReviewedRoleAnswers(source);
    assert.deepEqual(rows, [{ question: label, value }]);
    const page = await browser.newPage();
    await page.setContent(form);
    const scope = { opportunityId: 'fixture-role', url: 'https://example.test/jobs/a', pageUrl: page.url() };
    const data = emptyPreferences();
    data.reviewed_role_answers = rows.map(row => ({ ...row, opportunityId: scope.opportunityId,
      url: scope.url, approvedAt: data.exported_at }));
    const textarea = page.locator('#role-answer');
    await fillSavedPreferences(page, data, '', { ...scope, url: 'https://example.test/jobs/b' });
    assert.equal(await textarea.inputValue(), '');
    await fillSavedPreferences(page, data, '', scope);
    assert.equal(await textarea.inputValue(), value);
    await textarea.fill('Current user edit');
    await fillSavedPreferences(page, data, '', scope);
    assert.equal(await textarea.inputValue(), 'Current user edit');
    assert.equal(await page.getByLabel('Privacy consent').inputValue(), 'Preserve');
    await textarea.fill('');
    await textarea.evaluate(element => element.setAttribute('maxlength', '20'));
    await fillSavedPreferences(page, data, '', scope);
    assert.equal(await textarea.inputValue(), '');
  } finally { await browser.close(); }
});

const LEVER_PRIOR = 'Have you previously been employed by Fixture Co (or acquired/merged company) in any capacity?';
const LEVER_TOOLS = 'Which of the following platforms have you used? (Select all that apply)';
const LEVER_ESSAY = 'Describe your automation experience';
const LEVER_LEVEL = 'Which statement best describes your experience?';
const LEVER_NOTICE = 'I have read and agree to the Applicant Privacy Notice and understand how my personal information will be used';
const leverQuestion = (prompt: string, field: string) => `<li class="application-question"><div class="application-label"><div class="text">${prompt}<span class="required">✱</span></div></div><div class="application-field">${field}</div></li>`;
const leverCheckboxes = (card: string, options: string[]) => `<ul data-qa="checkboxes">${options.map((option, n) =>
  `<li><label><input type="checkbox" name="cards[${card}][field${n}]" value="${option}"><span>${option}</span></label></li>`).join('')}</ul>`;
const leverForm = `<form id="application-form"><ul>
  ${leverQuestion(LEVER_PRIOR, leverCheckboxes('prior', ['Yes', 'No']))}
  ${leverQuestion(LEVER_TOOLS, leverCheckboxes('tools', ['Alpha Flow', 'Beta Flow', 'Gamma Flow']))}
  ${leverQuestion(LEVER_ESSAY, '<textarea name="cards[essay][field0]"></textarea>')}
  ${leverQuestion(LEVER_LEVEL, ['Led delivery', 'Built independently'].map(option => `<label><input type="radio" name="cards[level][field0]" value="${option}">${option}</label>`).join(''))}
  ${leverQuestion(LEVER_NOTICE, leverCheckboxes('notice', ['Yes']))}
  </ul>
  <select name="eeo[disability]"><option value="">Select ...</option><option value="yes">Yes, I have a disability</option>
    <option value="no">No, I do not have a disability and have not had one in the past</option></select>
  <label>Name<input type="text" name="eeo[disabilitySignature]"></label>
  <label>Date<input type="text" name="eeo[disabilitySignatureDate]"></label>
  <button id="btn-submit" type="submit">Submit application</button></form>`;

test('reviewed Lever answers wiped by the employer refill deterministically for only the exact application', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(leverForm);
    const scope = { opportunityId: 'fixture-lever', url: 'https://jobs.lever.co/fixture/11111111-1111-4111-8111-111111111111', pageUrl: page.url() };
    const data = emptyPreferences();
    const essay = 'Fixture automation narrative. '.repeat(30).trim();
    data.application_answers = [[LEVER_PRIOR, 'No'], [LEVER_TOOLS, 'Alpha Flow\nGamma Flow'], [LEVER_ESSAY, essay], [LEVER_LEVEL, 'Built independently']]
      .map(([question, value]) => ({ opportunityId: scope.opportunityId, url: scope.url, question, value, approvedAt: data.exported_at }));
    for (const [id, value] of Object.entries({ 'identity.full_name': 'Fixture Applicant', 'eeo.disability_status': 'No' })) {
      data.preferences[id] = { scope: 'profile_preference', value, source: 'user', updated_at: data.exported_at };
    }
    assert.ok(parsePreferences(data)?.application_answers?.length === 4);

    const other = await fillSavedPreferences(page, data, 'Fixture Co', { ...scope, url: scope.url.replace('1111-4111', '2222-4222') });
    assert.deepEqual(other.filled.filter(id => id.startsWith('application:')), []);
    assert.equal(await page.locator('input[name="cards[prior][field1]"]').isChecked(), false);
    assert.equal(await page.locator('textarea').inputValue(), '');

    await page.selectOption('select[name="eeo[disability]"]', 'no');
    const first = await fillSavedPreferences(page, data, 'Fixture Co', scope);
    for (const question of [LEVER_PRIOR, LEVER_TOOLS, LEVER_ESSAY, LEVER_LEVEL]) {
      assert.ok(first.filled.includes('application:' + normalizeQuestion(question)), question);
    }
    assert.deepEqual(await page.locator('[name^="cards[prior]"]').evaluateAll(els => els.map(el => (el as HTMLInputElement).checked)), [false, true]);
    assert.deepEqual(await page.locator('[name^="cards[tools]"]').evaluateAll(els => els.map(el => (el as HTMLInputElement).checked)), [true, false, true]);
    assert.equal(await page.locator('textarea').inputValue(), essay);
    assert.equal(await page.locator('input[value="Built independently"]').isChecked(), true);
    // Consent and signature stay untouched without their explicit opt-ins.
    assert.equal(await page.locator('[name="cards[notice][field0]"]').isChecked(), false);
    assert.equal(await page.locator('[name="eeo[disabilitySignature]"]').inputValue(), '');

    await page.locator('[name="cards[tools][field1]"]').check();
    const optedIn = { ...data, application_privacy_acknowledgement_enabled: true, application_eeo_signature_enabled: true };
    const second = await fillSavedPreferences(page, optedIn, 'Fixture Co', scope);
    assert.ok(second.skipped.includes('application:' + normalizeQuestion(LEVER_TOOLS) + ':preserved'));
    assert.deepEqual(await page.locator('[name^="cards[tools]"]').evaluateAll(els => els.map(el => (el as HTMLInputElement).checked)), [true, true, true]);
    assert.ok(second.filled.includes('privacy.application_notice_acknowledged'));
    assert.equal(await page.locator('[name="cards[notice][field0]"]').isChecked(), true);
    assert.ok(second.filled.includes('eeo.disability_self_identification_signature'));
    assert.equal(await page.locator('[name="eeo[disabilitySignature]"]').inputValue(), 'Fixture Applicant');
    assert.match(await page.locator('[name="eeo[disabilitySignatureDate]"]').inputValue(), /^\d{2}\/\d{2}\/\d{4}$/);

    await page.setContent(leverForm);
    await page.selectOption('select[name="eeo[disability]"]', 'yes');
    const mismatch = await fillSavedPreferences(page, optedIn, 'Fixture Co', scope);
    assert.ok(mismatch.skipped.includes('eeo.disability_self_identification_signature:saved_disability_answer_required'));
    assert.equal(await page.locator('[name="eeo[disabilitySignature]"]').inputValue(), '');
  } finally { await browser.close(); }
});

test('explicit review saves per-application answers without promoting employer-specific facts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-application-answers-'));
  const file = path.join(root, 'preferences.json');
  try {
    await savePreferences(emptyPreferences(), file);
    const scope = { opportunityId: 'fixture-lever', url: 'https://jobs.lever.co/fixture/11111111-1111-4111-8111-111111111111', employerName: 'Fixture Co' };
    const essay = 'Fixture automation narrative. '.repeat(30).trim();
    const fields = [
      { question: LEVER_PRIOR, kind: 'checkbox', value: 'No' },
      { question: 'How did you hear about us?', kind: 'checkbox', value: 'LinkedIn' },
      { question: LEVER_TOOLS, kind: 'checkbox', value: 'Alpha Flow\nGamma Flow' },
      { question: LEVER_ESSAY, kind: 'textarea', value: essay },
      { question: LEVER_NOTICE, kind: 'checkbox', value: 'Yes' },
      { question: 'Website', kind: 'url', value: 'https://fixture.example.test' },
    ];
    const receipt = await syncReviewedApplicationAnswers(fields, scope, file);
    assert.equal(receipt.status, 'REVIEWED_ANSWERS_SAVED_AND_READ_BACK');
    assert.equal(receipt.applicationAnswers.updated, 4);
    const saved = await readPreferences(file);
    const kept = new Map(saved.application_answers?.map(answer => [answer.question, answer]));
    assert.equal(kept.get(LEVER_PRIOR)?.value, 'No');
    assert.equal(kept.get('How did you hear about us?')?.value, 'LinkedIn');
    assert.equal(kept.get(LEVER_ESSAY)?.value, essay);
    assert.equal(kept.has(LEVER_NOTICE), false);
    assert.equal(kept.has('Website'), false);
    assert.ok([...kept.values()].every(answer => answer.opportunityId === scope.opportunityId && answer.url === scope.url));
    assert.equal(saved.preferences['identity.website']?.value, 'https://fixture.example.test');
    assert.equal(saved.preferences['recruitment.discovery_source'], undefined);
    assert.equal(saved.preferences['employment.prior_employer_relationship'], undefined);
    assert.equal(discoveredValue(LEVER_TOOLS, saved), null);
    const repeated = await syncReviewedApplicationAnswers(fields, scope, file);
    assert.deepEqual(repeated.applicationAnswers, { updated: 0, unchanged: 4 });
    assert.deepEqual(await readPreferences(file), saved);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
