import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { firefox } from '@playwright/test';
import { prepareFirefoxApplication } from './prepare-firefox-application.ts';
import { saveWorkspace } from './workspace-file.ts';
import { savePreferences } from './preference-file.ts';
import { APPLICATIONS_KEY, PROFILE_KEY, emptyProfile } from './src/lib/storage.ts';
import { WORKSPACE_SCHEMA } from './src/lib/workspace-bootstrap.ts';
import { emptyPreferences } from './src/lib/application-preferences.ts';

const readAndFill = createRequire(import.meta.url)('../../browser/firefox-reviewed-fill/fill-known.js');
const listing = 'https://jobs.lever.co/fixture/11111111-1111-4111-8111-111111111111';
const application = listing + '/apply';
const other = application.replace('11111111-', '22222222-');
const alias = 'linkedin-alias@example.test';
const preferred = 'resume-default@example.test';

test('prepare on host, restore approved answers in Firefox and protect email and Submit', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eh-firefox-test-'));
  const oldHome = process.env.ESCAPEHATCH_DATA_HOME;
  const oldPreferences = process.env.ESCAPEHATCH_PREFERENCES_FILE;
  process.env.ESCAPEHATCH_DATA_HOME = root;
  process.env.ESCAPEHATCH_PREFERENCES_FILE = path.join(root, 'prefs.json');
  t.after(async () => {
    if (oldHome === undefined) delete process.env.ESCAPEHATCH_DATA_HOME;
    else process.env.ESCAPEHATCH_DATA_HOME = oldHome;
    if (oldPreferences === undefined) delete process.env.ESCAPEHATCH_PREFERENCES_FILE;
    else process.env.ESCAPEHATCH_PREFERENCES_FILE = oldPreferences;
    await fs.rm(root, { recursive: true, force: true });
  });
  const stamp = new Date().toISOString();
  const jobs = [{ id: 'fixture', url: listing, company: 'Fixture', role: 'Engineer', status: 'preparing',
    priority: 'normal', notes: '', nextAction: '', updatedAt: stamp }];
  await saveWorkspace({ schema: WORKSPACE_SCHEMA, values: {
    [APPLICATIONS_KEY]: jobs,
    [PROFILE_KEY]: { ...emptyProfile, first_name: 'Ada', last_name: 'Applicant', email: preferred },
  } }, null);
  const preference = (value: string) => ({ scope: 'profile_preference' as const, value, source: 'user' as const, updated_at: stamp });
  const roleAnswer = 'Approved paragraph one.\n\nApproved paragraph two.';
  await savePreferences({
    ...emptyPreferences(),
    preferences: { 'identity.email': preference(preferred), 'identity.website': preference('https://portfolio.example.test'),
      'interview.live_coding_comfort': preference('No'), 'identity.country': preference('United States'),
      'identity.linkedin': preference('https://www.linkedin.com/in/fixture') },
    discovered_answers: {
      'which tools did you use': { question: 'Which tools did you use?', value: 'Service Desk\nWorkflow Studio', source: 'user', updated_at: stamp, accepted: true },
      'provide additional details': { question: 'Provide additional details', value: 'Draft only', source: 'user', updated_at: stamp, accepted: false },
    },
    reviewed_role_answers: [
      { opportunityId: 'fixture', url: listing, question: 'What excites you about this role? 1–4 sentences', value: roleAnswer, approvedAt: stamp },
      { opportunityId: 'other', url: other, question: 'What excites you about this role? 1–4 sentences', value: 'Other private job', approvedAt: stamp },
    ],
  });

  await assert.rejects(prepareFirefoxApplication(other), /SAVED_LEVER_OPPORTUNITY_REQUIRED/);
  const prepared = await prepareFirefoxApplication(application);
  const directory = path.dirname(prepared.manifestPath);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  assert.equal(prepared.emailPolicy, 'PRESERVE');
  const manifest = JSON.parse(await fs.readFile(prepared.manifestPath, 'utf8'));
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
  const packetText = await fs.readFile(path.join(directory, 'answers.json'), 'utf8');
  assert.doesNotMatch(packetText, /resume-default|identity\.email|Other private job|Draft only/);
  const packet = JSON.parse(packetText);

  const browser = await firefox.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<meta charset="utf-8">' +
    '<form id="application-form" onsubmit="document.body.dataset.submitted = 1; return false">' +
    '<label>Full name<input id="name"></label><label>Email<input type="email" id="email" value="' + alias + '"></label>' +
    '<label>Website<input type="text" id="alternate" name="alternateEmail"></label>' +
    '<label>Website<input id="website"></label><label>LinkedIn URL<input id="linkedin" value="Existing user edit"></label>' +
    '<label>Country<select id="country"><option value="">Choose</option><option value="US">United States</option></select></label>' +
    '<fieldset><legend>Are you comfortable completing a live coding exercise?</legend>' +
    '<label><input name="coding" type="radio" value="yes">Yes</label><label><input name="coding" type="radio" value="no">No</label></fieldset>' +
    '<fieldset><legend>Which tools did you use?</legend><label><input type="checkbox" id="tool1" value="1">Service Desk</label>' +
    '<label><input type="checkbox" id="tool2" value="2">Workflow Studio</label></fieldset>' +
    '<label>What excites you about this role? 1–4 sentences<textarea id="role-answer"></textarea></label>' +
    '<label>Provide additional details<textarea id="draft"></textarea></label>' +
    '<fieldset><legend>Applicant Privacy Notice</legend><label><input id="consent" type="checkbox" required>I agree</label></fieldset>' +
    '<button id="btn-submit">Submit Application</button></form>' }));
  await page.goto(other);
  assert.equal((await page.evaluate(readAndFill, packet)).state, 'WRONG_TAB');
  assert.equal(await page.locator('#name').inputValue(), '');
  await page.goto(application);
  const result = await page.evaluate(readAndFill, packet);
  assert.equal(result.state, 'FILL_READ_BACK');
  assert.deepEqual(result.filled.sort(), [
    'approved-question:which tools did you use', 'identity.country', 'identity.full_name', 'identity.website',
    'interview.live_coding_comfort', 'reviewed-role:what excites you about this role 1 4 sentences',
  ]);
  assert.deepEqual(result.preserved, ['identity.linkedin']);
  assert.equal(await page.locator('#email').inputValue(), alias);
  assert.equal(await page.locator('#alternate').inputValue(), '');
  assert.equal(await page.locator('#country').inputValue(), 'US');
  assert.equal(await page.locator('input[name="coding"]:checked').inputValue(), 'no');
  assert.equal(await page.locator('#tool1').isChecked(), true);
  assert.equal(await page.locator('#tool2').isChecked(), true);
  assert.equal(await page.locator('#role-answer').inputValue(), roleAnswer);
  assert.equal(await page.locator('#draft').inputValue(), '');
  assert.equal(await page.locator('#consent').isChecked(), false);
  assert.equal(await page.locator('body').getAttribute('data-submitted'), null);
  assert.deepEqual((await page.evaluate(readAndFill, packet)).filled, []);
  assert.equal((await page.evaluate(readAndFill, { ...packet, expiresAt: 0 })).state, 'PACKET_EXPIRED');
  await page.locator('#email').fill('');
  assert.deepEqual((await page.evaluate(readAndFill, packet)).filled, []);
  assert.equal(await page.locator('#email').inputValue(), '');
  assert.match(await fs.readFile(path.join(root, 'prefs.json'), 'utf8'), /resume-default/);
});
