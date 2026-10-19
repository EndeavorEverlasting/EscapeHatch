import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { emptyPreferences, matchQuestion, acceptDiscoveredAnswer, discoveredValue, parsePreferences } from './src/lib/application-preferences.ts';
import { installAnswerMemory, mergeCapturedAnswer, scanQuestionCatalog, type CapturedAnswer } from './managed-answer-memory.ts';
import { fillSavedPreferences } from './managed-form.ts';

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
