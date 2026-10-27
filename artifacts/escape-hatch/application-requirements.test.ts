import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { inspectApplicationRequirements } from './application-requirements.ts';

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
        <label for="consent">Applicant Privacy Notice *</label><input id="consent" type="checkbox">
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
