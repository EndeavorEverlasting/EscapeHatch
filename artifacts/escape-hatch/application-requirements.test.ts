import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { inspectApplicationRequirements, unresolvedCurrentPageRequirements, assertSubmitFormComplete } from './application-requirements.ts';

const applicationUrl = 'https://example.test/apply';

test('starred Lever-style controls and private required consent are never silently optional', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://example.test/**', route => route.fulfill({ contentType: 'text/html', body: `
      <form>
        <label for="cv">Resume/CV <span style="color:red">*</span></label>
        <input id="cv" type="file" style="display:none">
        <label for="source">How did you hear about us? *</label>
        <select id="source"><option value="">Select one</option><option>LinkedIn</option></select>
        <fieldset><legend>Previously employed by us? <span style="color:red">*</span></legend>
          <label><input type="radio" name="previous" value="yes">Yes</label>
          <label><input type="radio" name="previous" value="no">No</label>
        </fieldset>
        <label>Country legally eligible to work in <input aria-required="true" id="country"></label>
        <fieldset><legend>Communication preferences</legend>
          <label for="consent">Applicant Privacy Notice *</label><input id="consent" type="checkbox">
          <label>Optional newsletter <input id="newsletter" type="checkbox"></label>
        </fieldset>
        <label>Optional notes <input id="notes"></label>
      </form>` }));
    await page.goto(applicationUrl);
    const first = await inspectApplicationRequirements(page, 'job-one', applicationUrl);
    const resume = first.requirements.find(item => item.kind === 'resume');
    const source = first.requirements.find(item => /How did you hear/.test(item.label));
    const previous = first.requirements.filter(item => /Previously employed/.test(item.label));
    const country = first.requirements.find(item => /Country legally/.test(item.label));
    const consent = first.requirements.find(item => /Privacy Notice/.test(item.label));
    assert.equal(resume?.requirement, 'required');
    assert.equal(resume?.populated, false);
    assert.equal(source?.requirement, 'required');
    assert.equal(source?.populated, false);
    assert.equal(previous.length, 2);
    assert.ok(previous.every(item => item.requirement === 'required' && !item.populated));
    assert.equal(country?.requirement, 'required');
    assert.equal(consent?.requirement, 'required');
    assert.equal(consent?.populated, false);
    assert.equal(first.requirements.find(item => /Optional notes/.test(item.label))?.requirement, 'optional');

    await page.locator('#cv').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\\n') });
    await page.locator('#source').selectOption({ label: 'LinkedIn' });
    await page.locator('[name="previous"][value="no"]').check();
    await page.locator('#country').fill('United States');
    const second = await inspectApplicationRequirements(page, 'job-one', applicationUrl);
    assert.equal(second.requirements.find(item => item.kind === 'resume')?.populated, true);
    assert.ok(second.requirements.filter(item => /Previously employed/.test(item.label)).every(item => item.populated));
    assert.equal(second.requirements.find(item => /Privacy Notice/.test(item.label))?.populated, false);
    assert.equal(await page.locator('#consent').isChecked(), false);
    // A separate checkbox in the same fieldset must not satisfy privacy consent.
    await page.locator('#newsletter').check();
    const afterNewsletter = await inspectApplicationRequirements(page, 'job-one', applicationUrl);
    assert.equal(afterNewsletter.requirements.find(item => /Privacy Notice/.test(item.label))?.populated, false);
    assert.equal(await page.locator('#consent').isChecked(), false);
  } finally { await browser.close(); }
});

test('dynamic starred fields are re-inventoried after conditional controls appear', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://example.test/**', route => route.fulfill({ contentType: 'text/html', body: `
      <label>Availability to begin *<select id="start" onchange="document.getElementById('later').hidden = this.value !== 'later'">
        <option value="">Choose</option><option value="immediate">Immediately</option><option value="later">1–2 weeks</option>
      </select></label>
      <div id="later" hidden><label>Proposed start date *<input id="date"></label></div>
    ` }));
    await page.goto(applicationUrl);
    const before = await inspectApplicationRequirements(page, 'job-one', applicationUrl);
    assert.equal(before.requirements.filter(item => item.requirement === 'required').length, 1);
    await page.locator('#start').selectOption('later');
    const after = await inspectApplicationRequirements(page, 'job-one', applicationUrl);
    assert.equal(after.requirements.filter(item => item.requirement === 'required').length, 2);
    assert.equal(after.requirements.find(item => /Proposed start date/.test(item.label))?.populated, false);
  } finally { await browser.close(); }
});

test('required-field blocker projection never counts a separate checkbox as consent', () => {
  const blockers = unresolvedCurrentPageRequirements({
    opportunityId: 'synthetic', applicationUrl, pageUrl: applicationUrl,
    capturedAt: '2026-10-27T00:00:00Z', scope: 'current_page_only',
    requirements: [
      { id: 'resume', label: 'Resume/CV *', kind: 'resume', requirement: 'required', populated: false },
      { id: 'consent', label: 'Applicant Privacy Notice *', kind: 'question', requirement: 'required', populated: false },
      { id: 'newsletter', label: 'Newsletter', kind: 'question', requirement: 'optional', populated: true },
      { id: 'custom', label: 'Unclassified custom widget', kind: 'question', requirement: 'unknown', populated: false },
      { id: 'country', label: 'Country *', kind: 'question', requirement: 'required', populated: true },
    ],
  });
  assert.deepEqual(blockers, [
    'required_field_unresolved:Resume/CV *',
    'required_operator_action:Applicant Privacy Notice *',
    'unclassified_field_review:Unclassified custom widget',
  ]);
  assert.throws(() => assertSubmitFormComplete(blockers), /submit_blocked_incomplete_form/);
  assert.doesNotThrow(() => assertSubmitFormComplete([]));
});


test('conditional cover-letter file is a requirement only while observed and visible', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://example.test/**', route => route.fulfill({ contentType: 'text/html', body: `
      <form>
        <label>Résumé <input type="file" id="cv" required></label>
        <label>Include a cover letter?
          <select id="extra" onchange="document.getElementById('cover-wrapper').hidden = this.value !== 'yes'">
            <option value="no">No</option><option value="yes">Yes</option>
          </select>
        </label>
        <div id="cover-wrapper" hidden><label>Cover letter * <input type="file" id="cover" required></label></div>
        <label>Why are you interested? <textarea id="interest" required></textarea></label>
      </form>`
    }));
    await page.goto(applicationUrl);
    let inspected = await inspectApplicationRequirements(page, 'synthetic-cover', applicationUrl);
    assert.equal(inspected.requirements.some(item => item.kind === 'cover'), false);
    assert.equal(inspected.requirements.filter(item => item.requirement === 'required').length, 2);
    await page.locator('#extra').selectOption('yes');
    inspected = await inspectApplicationRequirements(page, 'synthetic-cover', applicationUrl);
    assert.equal(inspected.requirements.find(item => item.kind === 'cover')?.requirement, 'required');
    assert.equal(inspected.requirements.find(item => item.kind === 'cover')?.populated, false);
    assert.equal(inspected.requirements.filter(item => item.requirement === 'required').length, 3);
    await page.locator('#extra').selectOption('no');
    inspected = await inspectApplicationRequirements(page, 'synthetic-cover', applicationUrl);
    assert.equal(inspected.requirements.find(item => item.kind === 'cover'), undefined);
    assert.equal(inspected.requirements.filter(item => item.requirement === 'required').length, 2);
  } finally { await browser.close(); }
});
