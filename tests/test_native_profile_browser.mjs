import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { emptyProfile, PROFILE_KEY } from '../artifacts/escape-hatch/src/lib/storage.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../artifacts/escape-hatch/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const profileKey = 'escapeHatch.applicationAssistProfile.v1';
const answerKey = 'escapeHatch.approvedWorkspaceAnswers.v1';
const syncKey = 'escapeHatch.workspaceProfileSync.v1';
function powershell(args, env = process.env) {
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], { encoding: 'utf8', env, windowsHide: true, timeout: 90000 });
}
async function extensionContext(directory) {
  const extension = path.join(root, 'browser/application-assist');
  const context = await chromium.launchPersistentContext(directory, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(worker.url()).hostname;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  return { context, popup, id };
}
async function stored(popup) {
  return popup.evaluate(async keys => chrome.storage.local.get(keys), [profileKey, answerKey, syncKey]);
}

test('real Chrome native host hydrates the extension module and survives reopen without crossing browser profiles', { timeout: 180000 }, async t => {
  if (process.platform !== 'win32') return t.skip('Windows Chrome native registration proof requires Windows.');
  const probe = powershell(['-Command', "if (Test-Path -LiteralPath 'HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.escapehatch.profile') { exit 17 }"]);
  if (probe.status === 17) return t.skip('Existing native host belongs to another installation; preserved.');
  assert.equal(probe.status, 0, 'Native host registration preflight must succeed.');
  const fixture = await mkdtemp(path.join(tmpdir(), 'eh-native-browser-'));
  const dataRoot = path.join(fixture, 'private');
  await mkdir(dataRoot);
  const profile = { ...emptyProfile, first_name: 'Synthetic Ada', last_name: 'Fixture', email: 'ada@example.invalid', phone: '5550100011', phone_authority: 'user_confirmed_primary' };
  const workspace = { schema: 'escapehatch-local-workspace/v1', values: { [PROFILE_KEY]: profile } };
  await writeFile(path.join(dataRoot, 'workspace.v1.json'), JSON.stringify(workspace));
  const preference = value => ({ scope: 'profile_preference', source: 'user', value, updated_at: '2026-10-28T12:00:00Z' });
  await writeFile(path.join(dataRoot, 'application-question-preferences.json'), JSON.stringify({
    schema_version: 'escapehatch-application-question-preferences/v1', exported_at: '2026-10-28T12:00:00Z',
    preferences: { 'education.highest_completed_level': preference('Synthetic degree'), 'eeo.gender': preference('Protected fixture') },
  }));
  const portProbe = createServer();
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const env = { ...process.env, LOCALAPPDATA: path.join(fixture, 'windows-local'), ESCAPEHATCH_DATA_HOME: dataRoot,
    ESCAPEHATCH_PREFERENCES_FILE: path.join(dataRoot, 'application-question-preferences.json'),
    ESCAPEHATCH_NO_BROWSER: '1', PORT: String(port), BASE_PATH: '/' };
  const installer = path.join(root, 'scripts/windows/EscapeHatch-Install.ps1');
  const install = action => powershell(['-File', installer, '-Action', action, '-SourceRoot', root,
    '-AppDataRoot', dataRoot, '-ShortcutRoot', path.join(fixture, 'shortcuts')], env);
  let first, second;
  let registered = false;
  try {
    const bootstrap = install('Bootstrap');
    registered = true;
    assert.equal(bootstrap.status, 0, `Canonical Bootstrap failed: ${bootstrap.stdout} ${bootstrap.stderr}`);
    assert.match(bootstrap.stdout, /ESCAPEHATCH_STATE=OWNED_HEALTHY/);
    first = await extensionContext(path.join(fixture, 'chrome-a'));
    await first.popup.locator('#connectWorkspace').click();
    await first.popup.locator('#workspaceChoices input[value="first_name"]').waitFor({ timeout: 15000 });
    for (const id of ['first_name', 'last_name', 'email', 'phone']) await first.popup.locator(`#workspaceChoices input[value="${id}"]`).check();
    await first.popup.locator('#workspaceChoices input[value="education.highest_completed_level"]').check();
    assert.equal(await first.popup.locator('#workspaceChoices input[value="eeo.gender"]').count(), 0);
    await first.popup.locator('#confirmWorkspace').click();
    await first.popup.waitForFunction(() => document.querySelector('#first_name').value === 'Synthetic Ada', null, { timeout: 15000 });
    assert.equal(await first.popup.locator('#email').inputValue(), 'ada@example.invalid');
    assert.equal(await first.popup.locator('#phone_authority').inputValue(), 'unconfirmed');
    assert.match(await first.popup.locator('#knownAnswers').innerText(), /Synthetic degree/);
    const initial = await stored(first.popup);
    assert.equal(initial[profileKey].first_name, profile.first_name);
    assert.equal(initial[answerKey].length, 1);
    assert.equal(initial[syncKey].paired, true);
    assert.doesNotMatch(JSON.stringify(initial), /Protected fixture/);
    await first.popup.screenshot({ path: path.join(fixture, 'extension-profile-synthetic.png'), fullPage: true });
    await first.context.close(); first = null;
    first = await extensionContext(path.join(fixture, 'chrome-a'));
    await first.popup.waitForFunction(() => document.querySelector('#first_name').value === 'Synthetic Ada');
    await first.popup.waitForFunction(() => document.querySelector('#knownAnswers').textContent.includes('Synthetic degree'), null, { timeout: 15000 });
    assert.match(await first.popup.locator('#knownAnswers').innerText(), /Synthetic degree/);
    const reopened = await stored(first.popup);
    assert.equal(reopened[syncKey].ownerId, initial[syncKey].ownerId);
    const cockpit = await first.context.newPage();
    await cockpit.goto(`http://127.0.0.1:${port}/`);
    await cockpit.getByRole('complementary', { name: 'Extension workspace' }).getByRole('status').filter({ hasText: 'Extension workspace is current' }).waitFor({ timeout: 20000 });
    const wake = await cockpit.evaluate(extensionId => new Promise(resolve => chrome.runtime.sendMessage(extensionId, { type: 'workspace-refresh' }, resolve)), first.id);
    assert.equal(wake.ok, true);
    assert.equal(wake.status, 'ALREADY_CURRENT');
    assert.equal(wake.profileFieldCount, 4);
    assert.equal(wake.answerCount, 1);
    assert.deepEqual(Object.keys(wake).sort(), ['answerCount', 'ok', 'profileFieldCount', 'status']);
    second = await extensionContext(path.join(fixture, 'chrome-b'));
    await second.popup.locator('#connectWorkspace').click();
    await second.popup.waitForFunction(() => document.querySelector('#workspaceStatus').textContent.includes('matching owner connection'), null, { timeout: 15000 });
    assert.equal(await second.popup.locator('#first_name').inputValue(), '');
    const other = await stored(second.popup);
    assert.equal(other[profileKey], undefined);
    assert.equal(other[answerKey], undefined);
    assert.equal(JSON.parse(await readFile(path.join(dataRoot, 'workspace.v1.json'), 'utf8')).values[PROFILE_KEY].first_name, profile.first_name);
    await writeFile(path.join(dataRoot, 'workspace.v1.json'), JSON.stringify({ ...workspace, values: { [PROFILE_KEY]: { ...profile, first_name: 'Changed synthetic source' } } }));
    const changed = await cockpit.evaluate(extensionId => new Promise(resolve => chrome.runtime.sendMessage(extensionId, { type: 'workspace-refresh' }, resolve)), first.id);
    assert.equal(changed.ok, false);
    assert.equal(changed.reason, 'REAPPROVAL_REQUIRED');
    assert.equal((await stored(first.popup))[profileKey].first_name, profile.first_name);
    // Protected control: the existing profile editor must still save and clear
    // through the real worker after native projection and a rejected refresh.
    await first.popup.locator('#first_name').fill('Manual synthetic edit');
    await first.popup.locator('#save').click();
    await first.popup.waitForFunction(() => document.querySelector('#status').textContent.includes('Profile saved locally'));
    assert.equal((await stored(first.popup))[profileKey].first_name, 'Manual synthetic edit');
    await first.popup.locator('#clear').click();
    await first.popup.waitForFunction(() => document.querySelector('#first_name').value === '');
    const cleared = await stored(first.popup);
    assert.equal(cleared[profileKey], undefined);
    assert.equal(cleared[answerKey], undefined);
    const paused = await cockpit.evaluate(extensionId => new Promise(resolve => chrome.runtime.sendMessage(extensionId, { type: 'workspace-refresh' }, resolve)), first.id);
    assert.equal(paused.ok, true);
    assert.equal(paused.status, 'PAUSED');
    assert.equal(paused.profileFieldCount, 0);
    assert.equal(paused.answerCount, 0);
    assert.equal((await stored(first.popup))[profileKey], undefined, 'clear pauses native sync rather than silently repopulating');
    console.log('NATIVE_PROTECTED_PROFILE_EDITOR=PASS; manual_save_clear_and_paused_sync');
    console.log(`NATIVE_CHROME_PROFILE_PROOF=PASS; extension=${first.id}; version=${JSON.parse(await readFile(path.join(root, 'browser/application-assist/manifest.json'), 'utf8')).version}; profile_fields=4; approved_answers=1; browser_profiles=2; evidence=${fixture}`);
  } catch (error) {
    if (second?.popup && !second.popup.isClosed()) {
      console.log('NATIVE_SECOND_BROWSER_STATUS=' + await second.popup.locator('#workspaceStatus').innerText());
      console.log('NATIVE_SECOND_BROWSER_REVIEW=' + await second.popup.evaluate(async () => {
        const result = await chrome.runtime.sendMessage({ type: 'workspace-review' });
        return JSON.stringify({ ok: result?.ok, reason: result?.reason, status: result?.value?.status });
      }));
    }
    if (first?.popup && !first.popup.isClosed()) {
      console.log('NATIVE_BROWSER_STATUS=' + await first.popup.locator('#workspaceStatus').innerText());
      console.log('NATIVE_BROWSER_TRANSPORT=' + await first.popup.evaluate(() => new Promise(resolve => chrome.runtime.sendNativeMessage('com.escapehatch.profile', { protocol: 1, action: 'status', browserProfileId: 'invalid-diagnostic' }, () => resolve(chrome.runtime.lastError?.message || 'native-frame-received')))));
      console.log('NATIVE_BROWSER_REVIEW=' + await first.popup.evaluate(async () => {
        const result = await chrome.runtime.sendMessage({ type: 'workspace-review' });
        return JSON.stringify({ ok: result?.ok, reason: result?.reason, status: result?.value?.status });
      }));
      console.log('NATIVE_BROWSER_DIRECT=' + await first.popup.evaluate(async () => {
        const stored = await chrome.storage.local.get('escapeHatch.browserProfileId.v1');
        const result = await chrome.runtime.sendNativeMessage('com.escapehatch.profile', { protocol: 1, action: 'status', browserProfileId: stored['escapeHatch.browserProfileId.v1'] });
        return JSON.stringify({ ok: result?.ok, reason: result?.reason, status: result?.status });
      }));
    }
    throw error;
  } finally {
    await second?.context.close();
    await first?.context.close();
    if (registered) {
      const uninstall = install('Uninstall');
      assert.equal(uninstall.status, 0, `Disposable installation cleanup failed: ${uninstall.stdout} ${uninstall.stderr}`);
    }
  }
});
