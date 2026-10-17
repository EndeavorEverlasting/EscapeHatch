import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { emptyPreferences, parsePreferences, optionMatches } from './src/lib/application-preferences.ts';
import { savePreferences, readPreferences, clearPreferences } from './preference-file.ts';
import { fillSavedPreferences } from './managed-form.ts';

function syntheticPreferences() {
  const data = emptyPreferences();
  for (const [id, value] of Object.entries({ 'identity.first_name': 'Synthetic', 'identity.last_name': 'Candidate', 'identity.phone': '+15550123456', 'employment.us_citizenship': 'Yes', 'employment.current_clearance': 'No', 'eeo.gender': 'Male', 'eeo.race_ethnicity': 'Hispanic or Latino', 'legal.non_compete_blocking': 'No', 'attestation.truth_accuracy': 'Yes' })) {
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
    await clearPreferences(file);
    assert.deepEqual((await readPreferences(file)).preferences, {});
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('real browser fills reordered saved answers, preserves existing values, and never checks agreements or submits', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
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
  } finally { await browser.close(); }
});
