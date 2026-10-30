/**
 * Reuse an already-paired disposable Chromium profile against the live native host,
 * prove privacy opt-out / opt-in / reopen, then clear the ephemeral pairing so the
 * operator's real Chrome can enroll without CHROME_PROFILE_MISMATCH.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, 'artifacts/escape-hatch/package.json'));
const { chromium } = require(path.join(root, 'artifacts/escape-hatch/node_modules/@playwright/test'));
const prefFile = path.join(process.env.LOCALAPPDATA || '', 'EscapeHatch', 'application-question-preferences.json');
const pairingFile = path.join(process.env.LOCALAPPDATA || '', 'EscapeHatch', 'extension-native-pairing.v1.json');
const pairedProfile = process.env.ESCAPEHATCH_PAIRED_CHROME_PROFILE
  || path.join(process.env.TEMP || '', 'eh-privacy-popup-HITNvC', 'chrome');

async function privacyFromDisk() {
  return (JSON.parse(await readFile(prefFile, 'utf8'))).application_privacy_acknowledgement_enabled === true;
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

async function setPrivacy(popup, enabled) {
  const toggle = popup.locator('#privacyConsentToggle');
  if ((await toggle.isChecked()) === enabled) return;
  await toggle.focus();
  await popup.keyboard.press(' ');
  await popup.waitForFunction(wanted => {
    const input = document.querySelector('#privacyConsentToggle');
    const status = document.querySelector('#privacyConsentState')?.textContent || '';
    if (!input || input.checked !== wanted) return false;
    return wanted
      ? /Enabled and saved|Enabled in your private/i.test(status)
      : /Disabled and saved/i.test(status);
  }, enabled, { timeout: 15000 });
}

const session = await openPopup(pairedProfile);
try {
  console.log('EXTENSION_ID=' + session.id);
  assert.equal(session.id, 'okjcckicklgdjgfaobipmnojleaeepbg');
  await session.popup.waitForFunction(() => !document.querySelector('#privacyConsentToggle')?.disabled, null, { timeout: 20000 });
  console.log('STATUS=' + (await session.popup.locator('#privacyConsentState').innerText()).replace(/\s+/g, ' ').trim());
  console.log('CHECKED=' + (await session.popup.locator('#privacyConsentToggle').isChecked()));

  await setPrivacy(session.popup, false);
  assert.equal(await privacyFromDisk(), false);
  console.log('OPT_OUT_DISK=true');

  await setPrivacy(session.popup, true);
  assert.equal(await privacyFromDisk(), true);
  console.log('OPT_IN_DISK=true');
} finally {
  await session.context.close().catch(() => {});
}

const reopened = await openPopup(pairedProfile);
try {
  await reopened.popup.waitForFunction(() => {
    const input = document.querySelector('#privacyConsentToggle');
    return input && !input.disabled && input.checked === true;
  }, null, { timeout: 20000 });
  assert.equal(await privacyFromDisk(), true);
  console.log('REOPEN_PERSISTENCE=PASS');
  console.log('MATERIALS_HINT_PRESENT=' + (await reopened.popup.locator('#materialsReviewHint').count()));
} finally {
  await reopened.context.close().catch(() => {});
}

const backup = pairingFile + '.ephemeral-proof-backup.json';
await writeFile(backup, await readFile(pairingFile));
await unlink(pairingFile);
console.log('EPHEMERAL_PAIRING_CLEARED=true');
console.log('DISK_FINAL_PRIVACY=' + (await privacyFromDisk()));
console.log('PROOF_CEILING=POPUP_NATIVE_DISK_ROUNDTRIP_PAIRED_PROFILE');
