/**
 * Disposable Chromium + registered native host: pair, toggle privacy preference,
 * reopen popup, and read back the canonical preference file.
 * Does not open employer sites or submit applications.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, 'artifacts/escape-hatch/package.json'));
const { chromium } = require(path.join(root, 'artifacts/escape-hatch/node_modules/@playwright/test'));
const prefFile = process.env.ESCAPEHATCH_PREFERENCES_FILE
  || path.join(process.env.LOCALAPPDATA || '', 'EscapeHatch', 'application-question-preferences.json');

async function privacyFromDisk() {
  const raw = JSON.parse(await readFile(prefFile, 'utf8'));
  return raw.application_privacy_acknowledgement_enabled === true;
}

async function openPopup(directory) {
  const extension = path.join(root, 'browser/application-assist');
  const context = await chromium.launchPersistentContext(directory, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });
  const id = new URL(worker.url()).hostname;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  return { context, popup, id };
}

async function pairWorkspace(popup) {
  // Privacy controls require pairing; hydrate may already have failed closed.
  if (await popup.locator('#privacyConsentToggle').isEnabled()) return;
  await popup.locator('#connectWorkspace').click();
  try {
    await popup.locator('#workspaceChoices input').first().waitFor({ timeout: 20000 });
  } catch (error) {
    const status = await popup.locator('#workspaceStatus').innerText().catch(() => '');
    const privacy = await popup.locator('#privacyConsentState').innerText().catch(() => '');
    throw new Error(`workspace pairing choices unavailable: ${status} | ${privacy}`);
  }
  const field = popup.locator('#workspaceChoices input[data-kind="field"]').first();
  if (await field.count()) await field.check();
  else await popup.locator('#workspaceChoices input').first().check();
  await popup.locator('#confirmWorkspace').click();
  await popup.waitForFunction(() => {
    const input = document.querySelector('#privacyConsentToggle');
    return input && !input.disabled;
  }, null, { timeout: 20000 });
}

async function setPrivacy(popup, enabled) {
  const toggle = popup.locator('#privacyConsentToggle');
  const checked = await toggle.isChecked();
  if (checked === enabled) return;
  await toggle.focus();
  await popup.keyboard.press(' ');
  await popup.waitForFunction(wanted => {
    const input = document.querySelector('#privacyConsentToggle');
    const status = document.querySelector('#privacyConsentState')?.textContent || '';
    if (!input || input.checked !== wanted) return false;
    if (wanted) return /Enabled and saved|Enabled in your private/i.test(status);
    return /Disabled and saved/i.test(status);
  }, enabled, { timeout: 15000 });
}

const fixture = await mkdtemp(path.join(tmpdir(), 'eh-privacy-popup-'));
let session;
try {
  console.log('DISK_BEFORE=' + (await privacyFromDisk()));
  session = await openPopup(path.join(fixture, 'chrome'));
  console.log('EXTENSION_ID=' + session.id);
  console.log('MANIFEST_VERSION=' + JSON.parse(await readFile(path.join(root, 'browser/application-assist/manifest.json'), 'utf8')).version);
  assert.equal(session.id, 'okjcckicklgdjgfaobipmnojleaeepbg', 'loaded extension must match keyed native-host ID');

  await pairWorkspace(session.popup);
  const statusPaired = await session.popup.locator('#privacyConsentState').innerText();
  console.log('POPUP_PAIRED_STATUS=' + statusPaired.replace(/\s+/g, ' ').trim());
  console.log('POPUP_PAIRED_CHECKED=' + (await session.popup.locator('#privacyConsentToggle').isChecked()));

  await setPrivacy(session.popup, true);
  assert.equal(await privacyFromDisk(), true);
  console.log('OPT_IN_DISK=true');

  await setPrivacy(session.popup, false);
  assert.equal(await privacyFromDisk(), false);
  console.log('OPT_OUT_DISK=true');

  await setPrivacy(session.popup, true);
  assert.equal(await privacyFromDisk(), true);
  console.log('OPT_IN_AGAIN_DISK=true');

  await session.context.close();
  session = null;

  session = await openPopup(path.join(fixture, 'chrome'));
  await session.popup.waitForFunction(() => {
    const input = document.querySelector('#privacyConsentToggle');
    return input && !input.disabled && input.checked === true;
  }, null, { timeout: 20000 });
  assert.equal(await privacyFromDisk(), true);
  console.log('REOPEN_PERSISTENCE=PASS');
  console.log('MATERIALS_HINT=' + (await session.popup.locator('#materialsReviewHint').innerText()).slice(0, 80));
  console.log('PROOF_CEILING=POPUP_NATIVE_DISK_ROUNDTRIP');
} finally {
  // Leave the operator-requested routine preference enabled.
  const restore = spawnSync(process.execPath, ['--experimental-strip-types', '-e',
    "import { updatePreferences } from './artifacts/escape-hatch/preference-file.ts'; await updatePreferences(c => ({ ...c, application_privacy_acknowledgement_enabled: true })); console.log('ok');"],
    { cwd: root, encoding: 'utf8', windowsHide: true });
  console.log('DISK_RESTORE_STATUS=' + restore.status);
  console.log('DISK_FINAL_PRIVACY=' + (await privacyFromDisk()));
  if (session?.context) await session.context.close().catch(() => {});
}
