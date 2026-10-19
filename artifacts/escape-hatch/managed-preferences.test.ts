import { withCareerPreferences } from './career-preferences.ts';
import { emptyAssistProfile } from './src/lib/assist-contract.ts';
import { emptyProfile } from './src/lib/storage.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { emptyPreferences, parsePreferences, optionMatches, matchQuestion, expandProfessionalTitles, suggestProfessionalTitles } from './src/lib/application-preferences.ts';
import { savePreferences, readPreferences, clearPreferences } from './preference-file.ts';
import { fillSavedPreferences, openApplicationForm, internationalPhone, captureMilitaryAnswers } from './managed-form.ts';
import { attachPdfs, parsePrivatePdf } from './browser-assist-control.ts';

function syntheticPreferences() {
  const data = emptyPreferences();
  for (const [id, value] of Object.entries({ 'identity.first_name': 'Synthetic', 'identity.last_name': 'Candidate', 'identity.phone': '+15550123456', 'identity.region': 'New York', 'identity.country': 'United States', 'employment.us_citizenship': 'Yes', 'employment.current_clearance': 'No', 'eeo.gender': 'Male', 'eeo.race_ethnicity': 'Hispanic or Latino', 'legal.non_compete_blocking': 'No', 'attestation.truth_accuracy': 'Yes' })) {
    data.preferences[id] = { scope: 'profile_preference', value, source: 'user', updated_at: data.exported_at };
  }
  return data;
}

test('explicit preferences survive process-independent disk reads; invalid imports preserve data; clear removes file', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-preferences-'));
  const file = path.join(directory, 'preferences.json');
  try {
    const data = syntheticPreferences();
    await savePreferences(data, file);
    assert.deepEqual(await readPreferences(file), data);
    const invalid = { ...data, preferences: { ...data.preferences, 'unknown.question': data.preferences['identity.first_name'] } };
    await assert.rejects(savePreferences(invalid, file));
    assert.deepEqual(await readPreferences(file), data);
    assert.equal(parsePreferences({ ...data, schema_version: 'wrong' }), null);
    assert.equal(optionMatches('Male', 'Female'), false);
    assert.equal(internationalPhone('(555) 012-3456', 'United States'), '+15550123456');
    assert.equal(internationalPhone('(555) 012-3456', ''), null);
    assert.equal(internationalPhone('+44 7700 900123', ''), '+447700900123');
    await clearPreferences(file);
    assert.deepEqual((await readPreferences(file)).preferences, {});
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('Ashby entry opens only the same job application and verifies its contact form without submitting', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    let mode = 'valid';
    await page.route('https://jobs.ashbyhq.com/**', route => route.fulfill({ contentType: 'text/html', body:
      route.request().url().endsWith('/application')
        ? '<div role="tabpanel" aria-label="Application"><form onsubmit="window.submitted=true;return false"><label>Name<input></label><label>Email<input type="email"></label><button>Submit Application</button></form></div>'
        : '<a href="' + (mode === 'foreign' ? 'https://example.test/other/application' : mode === 'other-job' ? '/synthetic/other/application' : '/synthetic/job/application') + '">Apply for this Job</a>' }));
    await page.goto('https://jobs.ashbyhq.com/synthetic/job');
    assert.equal(await openApplicationForm(page), true);
    assert.equal(page.url(), 'https://jobs.ashbyhq.com/synthetic/job/application');
    assert.equal(await page.evaluate(() => (window as unknown as { submitted?: boolean }).submitted), undefined);
    for (mode of ['foreign', 'other-job']) {
      await page.goto('https://jobs.ashbyhq.com/synthetic/job');
      assert.equal(await openApplicationForm(page), false);
      assert.equal(page.url(), 'https://jobs.ashbyhq.com/synthetic/job');
    }
  } finally { await browser.close(); }
});

test('binary toggles reuse exact preferences, bind employer wording, preserve selections and exclude submit controls', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const preferences = syntheticPreferences();
    for (const [id, value] of Object.entries({ 'employment.work_authorization_proof': 'Yes', 'employment.current_employee': 'No', 'employment.lower_48_resident': 'Yes' })) {
      preferences.preferences[id] = { scope: 'profile_preference', value, source: 'user', updated_at: preferences.exported_at };
    }
    const group = (id: string, prompt: string) => `<section><label id="${id}_label">${prompt}</label><div>${['Yes','No'].map(value => `<button type="button" aria-pressed="false" onclick="this.setAttribute('aria-pressed','true')">${value}</button>`).join('')}</div></section>`;
    await page.setContent('<form onsubmit="window.submitted=true;return false">' +
      group('authorized', 'Are you legally authorized to work in the United States?') +
      group('employee', 'Are you a current employee of Synthetic Health?') +
      group('location', 'Do you live within the lower 48 United States?') +
      group('unknown', 'Do you agree to our terms?') + '<button type="submit" aria-pressed="false">Yes</button></form>');
    let result = await fillSavedPreferences(page, preferences, 'Synthetic Health');
    assert.ok(result.filled.includes('employment.work_authorization_proof'));
    assert.ok(result.filled.includes('employment.current_employee'));
    assert.ok(result.filled.includes('employment.lower_48_resident'));
    assert.equal(await page.locator('section').nth(1).getByRole('button', { name: 'No', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('section').nth(3).locator('[aria-pressed="true"]').count(), 0);
    assert.equal(await page.evaluate(() => (window as unknown as { submitted?: boolean }).submitted), undefined);
    result = await fillSavedPreferences(page, preferences, 'Synthetic Health');
    assert.ok(result.skipped.includes('employment.current_employee:preserved'));
    await page.setContent(group('employee', 'Are you a current employee of Another Employer?'));
    result = await fillSavedPreferences(page, preferences, 'Synthetic Health');
    assert.equal(result.filled.length, 0);
    assert.equal(await page.locator('[aria-pressed="true"]').count(), 0);
  } finally { await browser.close(); }
});

test('real browser fills reordered saved answers, preserves existing values, and never checks agreements or submits', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<button type="button" aria-label="Apply for this position button" onclick="this.outerHTML=\'<h2>Contact Details</h2><label>First Name<input></label>\'">Apply for this position</button>');
    assert.equal(await openApplicationForm(page), true);
    await page.setContent('<form onsubmit="window.submitted=true;return false"><button type="submit">Apply for this position</button></form>');
    assert.equal(await openApplicationForm(page), false);
    assert.equal(await page.evaluate(() => (window as unknown as { submitted?: boolean }).submitted), undefined);
    await page.setContent(`<form onsubmit="window.submitted=true;return false">
      <label>Last Name (required)<input name="user.last_name" value="Keep existing"></label>
      <fieldset><legend>Do you currently hold a clearance?</legend><label><input type="radio" name="clearance" value="yes">Yes</label><label><input type="radio" name="clearance" value="no">No</label></fieldset>
      <label>If yes, please list your level of clearance and issuing agency. (required)<input name="clearanceDetails"></label>
      <label>Gender<select name="gender"><option value="">Choose</option><option>Female</option><option>Male</option></select></label>
      <div id="citizenship_label">Are you currently a US Citizen? (required)</div><div><label><input type="radio" name="citizenship" value="yes">Yes</label><label><input type="radio" name="citizenship" value="no">No</label></div>
      <label>First Name (required)<input name="user.first_name"></label>
      <label>Phone<input name="dial-search"><input type="tel" name="user.phone" value="+1"></label>
      <input type="hidden" name="user.phone" value="internal">
      <label>Race / Ethnicity<select><option value="">Choose</option><option>Asian</option></select></label>
      <label>Non-compete agreement<input name="legal"></label>
      <label>I certify that this information is true and accurate to the best of my knowledge<input type="checkbox" name="attest"></label>
      <button type="submit">Submit Application</button></form>`);
    const result = await fillSavedPreferences(page, syntheticPreferences());
    assert.ok(result.filled.includes('employment.us_citizenship'));
    assert.equal(await page.locator('[name="citizenship"][value="yes"]').isChecked(), true);
    assert.equal(await page.locator('[name="clearance"][value="no"]').isChecked(), true);
    assert.equal(await page.locator('[name="clearanceDetails"]').inputValue(), 'N/A');
    assert.equal(await page.locator('[name="gender"]').inputValue(), 'Male');
    assert.equal(await page.locator('[name="user.first_name"]').inputValue(), 'Synthetic');
    assert.equal(await page.locator('input[type="tel"]').inputValue(), '+15550123456');
    assert.equal(await page.locator('[name="dial-search"]').inputValue(), '');
    assert.equal(await page.locator('[name="user.last_name"]').inputValue(), 'Keep existing');
    assert.equal(await page.locator('select').nth(1).inputValue(), '');
    assert.equal(await page.locator('[name="legal"]').inputValue(), '');
    assert.equal(await page.locator('[name="attest"]').isChecked(), false);
    assert.equal(await page.evaluate(() => (window as unknown as { submitted?: boolean }).submitted), undefined);
    // Re-running must not overwrite the user's subsequent changes.
    await page.locator('[name="user.first_name"]').fill('Edited locally');
    await fillSavedPreferences(page, syntheticPreferences());
    assert.equal(await page.locator('[name="user.first_name"]').inputValue(), 'Edited locally');
    await page.setContent('<label>Phone<input type="tel" value="+1" oninput="if(this.value.length>3)this.value=\'rejected\'"></label>');
    const rejected = await fillSavedPreferences(page, syntheticPreferences());
    assert.equal(await page.locator('input').inputValue(), '+1');
    assert.ok(rejected.skipped.includes('identity.phone:not_verified'));
    assert.equal(rejected.filled.includes('identity.phone'), false);
    await page.setContent(`<label>State<div class="Select"><span id="selection"></span><input id="state" role="combobox" oninput="document.querySelector('#choice').hidden=false"></div></label><div role="option" id="choice" hidden onclick="document.querySelector('#selection').innerHTML='<input type=hidden><span role=option aria-selected=true>New York</span>';this.remove()">New York</div><label>First Name<input name="first_name"></label>`);
    const selected = await fillSavedPreferences(page, syntheticPreferences());
    assert.ok(selected.filled.includes('identity.region'));
    assert.equal(await page.locator('[aria-selected="true"]').textContent(), 'New York');
    assert.equal(await page.locator('[name="first_name"]').inputValue(), 'Synthetic');
    await page.setContent(`<div><label id="files.Resume.file_label">Resume: (Word/PDF)</label><div id="files.Resume"><button type="button" class="filepicker" onclick="document.querySelector('input[type=file]').click()">Choose</button></div></div><input type="file" style="display:none" onchange="document.querySelector('output').textContent=this.files[0].name"><output></output>`);
    const pdf = parsePrivatePdf({ name: 'synthetic.pdf', base64: Buffer.from('%PDF-1.4\n').toString('base64') });
    const attached = await attachPdfs(page, pdf, null);
    assert.equal(attached.resume, 'attached_to_input_review_required');
    assert.equal(await page.locator('output').textContent(), 'synthetic.pdf');
  } finally { await browser.close(); }
});

test('job titles persist separately from salutations; decorated military prompts match without conflating protected status', async () => {
  const preferences = syntheticPreferences();
  preferences.job_titles = ['Synthetic Role', 'Second Role'];
  preferences.preferences['identity.job_title'] = { scope: 'profile_preference', source: 'user', value: 'Synthetic Role', updated_at: preferences.exported_at };
  assert.deepEqual(parsePreferences(preferences)?.job_titles, preferences.job_titles);
  assert.equal(parsePreferences({ ...preferences, job_titles: [42] }), null);
  assert.equal(matchQuestion('Have you ever served in the U.S. Armed Forces? (Optional) *'), 'military.service_history');
  assert.equal(matchQuestion('Protected veteran status [Optional]'), 'eeo.veteran_status');
  assert.equal(matchQuestion('Previous job title'), null);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<label>Desired job title<input id="role"></label><label>Salutation<input id="salutation"></label>
      <label>Have you ever served in the U.S. Armed Forces? (Optional)<select id="service"><option value="">Choose</option><option value="n">No</option><option value="y">Yes</option></select></label>
      <fieldset><legend>Protected veteran status [Optional]</legend><label><input type="radio" name="veteran" value="n">I am not a protected veteran</label><label><input type="radio" name="veteran" value="y">I am a protected veteran</label></fieldset>
      <label>Race<input value="Do not capture"></label><button type="submit">Submit</button>`);
    assert.deepEqual(await captureMilitaryAnswers(page), {});
    await page.locator('#service').selectOption('n');
    await page.locator('[name="veteran"][value="y"]').check();
    assert.deepEqual(await captureMilitaryAnswers(page), { 'military.service_history': 'No', 'eeo.veteran_status': 'I am a protected veteran' });
    for (const [id, value] of Object.entries(await captureMilitaryAnswers(page))) preferences.preferences[id] = { scope: 'profile_preference', source: 'user', value, updated_at: preferences.exported_at };
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-recorded-'));
    try {
      const file = path.join(directory, 'preferences.json');
      await savePreferences(preferences, file);
      await page.locator('#service').selectOption('');
      const outcome = await fillSavedPreferences(page, await readPreferences(file));
      assert.ok(outcome.filled.includes('identity.job_title'));
      assert.ok(outcome.filled.includes('military.service_history'));
      assert.equal(await page.locator('#role').inputValue(), 'Synthetic Role');
      assert.equal(await page.locator('#salutation').inputValue(), '');
      assert.equal(await page.locator('#service').inputValue(), 'n');
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
    await page.setContent('<label>Military service<select><option value="">Choose</option><option selected>No</option></select></label><label>Military service<select><option selected>Yes</option></select></label>');
    assert.deepEqual(await captureMilitaryAnswers(page), {});
  } finally { await browser.close(); }
});

test('selected canonical career records fill descriptions and education without mixing posting, professional title, or repeated sections', async () => {
  const profile = emptyAssistProfile({ ...emptyProfile });
  const provenance = { source: 'user' as const, label: 'Reviewed synthetic record', capturedAt: new Date().toISOString() };
  profile.experience = [{ id: 'work', company: 'Synthetic Company', title: 'Past Role', dates: '2020-2024', location: '', bullets: ['Delivered synthetic work.'], provenance }];
  profile.education = [{ id: 'edu', institution: 'Synthetic University', credential: 'Bachelor of Science', fieldOfStudy: 'Systems', dates: '2016-2020', details: 'Synthetic coursework', provenance }];
  const saved = syntheticPreferences();
  saved.professional_titles = ['Systems Operator', 'Project Lead'];
  saved.preferences['identity.professional_title'] = { scope: 'profile_preference', source: 'user', value: 'Systems Operator', updated_at: saved.exported_at };
  assert.equal(withCareerPreferences(saved, profile, 'Target Role').preferences['education.institution'], undefined);
  profile.selectedExperienceId = 'work'; profile.selectedEducationId = 'edu';
  const projected = withCareerPreferences(saved, profile, 'Target Role');
  assert.deepEqual(parsePreferences(saved)?.professional_titles, saved.professional_titles);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<label>Professional title<input id="professional"></label><label>Desired job title<input id="target"></label><label>Job title<input id="past"></label><label>Job description<textarea id="description"></textarea></label><label>School<input id="school"></label><label>Degree<input id="degree"></label><label>Field of study<input id="major"></label>');
    await fillSavedPreferences(page, projected);
    for (const [id, value] of Object.entries({ professional: 'Systems Operator', target: 'Target Role', past: 'Past Role', description: 'Delivered synthetic work.', school: 'Synthetic University', degree: 'Bachelor of Science', major: 'Systems' })) assert.equal(await page.locator('#' + id).inputValue(), value);
    await page.setContent('<label>School<input id="one"></label><label>School<input id="two"></label>');
    const ambiguous = await fillSavedPreferences(page, projected);
    assert.ok(ambiguous.skipped.includes('education.institution:ambiguous'));
    assert.equal(await page.locator('#one').inputValue(), '');
    assert.equal(withCareerPreferences(saved, profile, '').preferences['identity.job_title'], undefined);
  } finally { await browser.close(); }
});


test('professional title combinations are distinct, bounded and independent of selected target title', () => {
  const titles = expandProfessionalTitles(['Project Manager', 'Engineer', 'Project Coordinator', 'Senior Technician']);
  assert.equal(titles.length, 64);
  assert.equal(new Set(titles).size, 64);
  assert.ok(titles.includes('Project Manager / Engineer'));
  assert.ok(titles.includes('Engineer / Project Manager'));
  assert.deepEqual(expandProfessionalTitles(['A', 'B', 'C', 'D', 'E']), []);
});

test('professional title suggestions require target evidence and do not mutate the user list', () => {
  const titles = ['Systems Engineer', 'Retail Supervisor'];
  const ranked = suggestProfessionalTitles(titles, 'Engineering Lead', 'Build systems and engineering workflows', 'Systems engineer work');
  assert.equal(ranked[0].title, 'Systems Engineer');
  assert.match(ranked[0].evidence, /Posting:/);
  assert.deepEqual(titles, ['Systems Engineer', 'Retail Supervisor']);
  assert.deepEqual(suggestProfessionalTitles(titles, '', '', 'Systems Engineer'), []);
});

test('full name and exact decorated EEO metadata fill without changing existing values or submitting', async () => {
  const preferences = syntheticPreferences();
  preferences.preferences['identity.last_name'] = { scope: 'profile_preference', source: 'user', value: 'Candidate', updated_at: preferences.exported_at };
  preferences.preferences['eeo.veteran_status'] = { scope: 'profile_preference', source: 'user', value: 'I am not a protected veteran', updated_at: preferences.exported_at };
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<form onsubmit="window.submitted=true;return false"><label>Name*<input id="name"></label><label><input type="radio" name="gender" id="fixture__systemfield_eeoc_gender-labeled-radio-0">Male</label><label><input type="radio" name="gender" id="fixture__systemfield_eeoc_gender-labeled-radio-1">Female</label><label><input type="radio" name="veteran" id="fixture__systemfield_eeoc_veteran_status-labeled-radio-0">I am not a protected veteran</label><button>Submit</button></form>');
    const result = await fillSavedPreferences(page, withCareerPreferences(preferences, null, ''));
    const explicit = { ...preferences, preferences: { ...preferences.preferences, 'identity.full_name': { scope: 'profile_preference' as const, source: 'user' as const, value: 'Synthetic Middle Candidate', updated_at: preferences.exported_at } } };
    assert.equal(withCareerPreferences(explicit, null, '').preferences['identity.full_name'].value, 'Synthetic Middle Candidate');
    assert.ok(result.filled.includes('identity.full_name'));
    assert.ok(result.filled.includes('eeo.veteran_status'));
    assert.equal(await page.locator('#name').inputValue(), 'Synthetic Candidate');
    assert.equal(await page.locator('[name="gender"]').first().isChecked(), true);
    assert.equal(await page.evaluate(() => (window as unknown as { submitted?: boolean }).submitted), undefined);
  } finally { await browser.close(); }
});
