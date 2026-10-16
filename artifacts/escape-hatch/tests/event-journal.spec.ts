import { expect, test, chromium } from '@playwright/test';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const sessionKey = 'escapeHatch.applicationAssistSession.v1';
const journalKey = 'escapeHatch.applicationEventJournal.v1';
const fixture = (reversed = false) => {
  const fields = [
    '<label>First name<input name="first_name" required></label>',
    '<label>Email<input name="email" type="email"></label>',
    '<label>Country<select name="country"><option></option><option>Exampleland</option></select></label>',
  ];
  return `<title>Synthetic application</title><form novalidate>
    ${(reversed ? fields.reverse() : fields).join('')}
    <label>Private notes<textarea>PRIVATE_ANSWER_SENTINEL</textarea></label>
    <label>Password<input type="password" value="PASSWORD_SENTINEL"></label>
    <label>Unknown<input name="unmapped" value="UNKNOWN_SENTINEL"></label>
    <label>Attestation<input type="checkbox"></label>
    <input type="hidden" value="HIDDEN_SENTINEL"><input type="file">
    <button type="button" id="next">Next</button><button type="submit">Submit</button>
    </form><script>
    window.clicks = []; window.attempts = 0;
    document.addEventListener('click', e => { if(e.target.tagName === 'BUTTON') window.clicks.push(e.target.textContent); });
    document.querySelector('form').onsubmit = e => { e.preventDefault(); window.attempts++; };
    document.querySelector('#next').onclick = () => {
      history.pushState({}, '', '/synthetic/step-two');
      const label = document.createElement('label'); label.textContent = 'City';
      const input = document.createElement('input'); input.name = 'city';
      label.append(input); document.querySelector('form').append(label);
    };
    </script>`;
};

for (const reversed of [false, true]) test(`headed journal layout ${reversed ? 'B' : 'A'}: privacy, ordering, controls and page consent`, async () => {
  test.setTimeout(90_000);
  const extension = await mkdtemp(resolve(tmpdir(), 'eh-listener-extension-'));
  const profile = await mkdtemp(resolve(tmpdir(), 'eh-listener-synthetic-'));
  const source = process.env.EH_EXTENSION_SOURCE || resolve(import.meta.dirname, '../../../browser/application-assist');
  await cp(source, extension, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
  expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage']);
  expect(manifest.host_permissions).toBeUndefined();
  // Temporary harness only. This does NOT prove production activeTab permission UX.
  manifest.background = { service_worker: 'synthetic-harness.js' };
  manifest.host_permissions = ['http://127.0.0.1:21031/*'];
  await writeFile(resolve(extension, 'synthetic-harness.js'), '// Synthetic extension discovery only.\n');
  await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).hostname;
    const application = await context.newPage();
    await application.route('http://127.0.0.1:21031/synthetic/**', route => route.fulfill({ contentType: 'text/html', body: fixture(reversed) }));
    await application.goto('http://127.0.0.1:21031/synthetic/start');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const journal = () => popup.evaluate(async key => (await chrome.storage.local.get(key))[key], journalKey);
    const events = async () => (await journal())?.events || [];
    const command = async (id: string) => {
      await application.bringToFront();
      // Invoke real popup handler while synthetic application is the active tab.
      await popup.evaluate(async id => {
        const action = document.getElementById(id)!.dataset.action;
        await globalThis.EscapeHatchAssistModality.invokeSemantic(action, 'browser-test').result;
      }, id);
    };
    const waitEvents = async (count: number) => expect.poll(async () => (await events()).length).toBe(count);
    const unchanged = await application.locator('form').evaluate(el => el.outerHTML);
    await command('listenCurrentPage');
    await waitEvents(2);
    await expect(popup.locator('#observerState')).toContainText('LISTENING');
    const binding = await popup.evaluate(async key => (await chrome.storage.local.get(key))[key], sessionKey);
    expect(binding.application_id).not.toBe(binding.origin);
    expect(binding.opportunity_id).not.toBe(binding.application_id);
    expect(binding.observation.receipt_event_id).toBe((await events()).at(-1).event_id);
    const mapping = await popup.evaluate(async tabId => (await chrome.scripting.executeScript({
      target: { tabId }, func: () => [...document.querySelectorAll('input,select')].map((el: any) => ({
        key: globalThis.EscapeHatchAssist.classifyField({ tag: el.tagName.toLowerCase(), type: el.type,
          name: el.name, label: [...(el.labels || [])].map((l: any) => l.textContent).join(' ') })
      })).map((f: any) => globalThis.EscapeHatchAssist.PROFILE_TO_QUESTION[f.key]).filter(Boolean).sort()
    }))[0].result, binding.observation.tab_id);
    expect(mapping).toEqual(['identity.country', 'identity.email', 'identity.first_name']);
    expect(await application.locator('form').evaluate(el => el.outerHTML)).toBe(unchanged);
    expect(await application.evaluate(() => ({ clicks: (window as any).clicks, attempts: (window as any).attempts }))).toEqual({ clicks: [], attempts: 0 });
    await command('listenCurrentPage');
    await application.waitForTimeout(450);
    await waitEvents(2);
    await application.locator('[name=first_name]').fill('NAME_SENTINEL');
    await application.locator('[name=first_name]').dispatchEvent('change');
    await expect.poll(async () => (await events()).filter((e: any) => e.type === 'field_completed').length).toBe(1);
    await application.locator('[name=first_name]').fill('');
    await application.locator('[name=first_name]').dispatchEvent('change');
    await expect.poll(async () => (await events()).some((e: any) => e.type === 'field_cleared')).toBe(true);
    await application.locator('input[type=file]').setInputFiles({ name: 'FILE_SENTINEL.txt', mimeType: 'text/plain', buffer: Buffer.from('DOCUMENT_SENTINEL') });
    await expect.poll(async () => (await events()).some((e: any) => e.type === 'upload_presence_changed')).toBe(true);
    await application.locator('#next').click();
    await expect.poll(async () => (await events()).some((e: any) => e.type === 'page_snapshot' && e.payload.known_field_count === 4)).toBe(true);
    expect((await events()).filter((e: any) => e.type === 'submit_attempt_observed')).toHaveLength(0);
    await application.locator('button[type=submit]').click();
    await expect.poll(async () => (await events()).filter((e: any) => e.type === 'submit_attempt_observed').length).toBe(1);
    expect((await events()).find((e: any) => e.type === 'submit_attempt_observed').payload).toEqual({ submission_verified: false });
    await command('pause');
    await expect.poll(() => popup.evaluate(async key => (await chrome.storage.local.get(key))[key].status, sessionKey)).toBe('paused');
    const pausedCount = (await events()).length;
    await application.locator('[name=email]').fill('EMAIL_SENTINEL@example.invalid');
    await application.locator('[name=email]').dispatchEvent('change');
    await application.waitForTimeout(500);
    await waitEvents(pausedCount);
    await command('resume');
    await expect.poll(() => popup.evaluate(async key => (await chrome.storage.local.get(key))[key].status, sessionKey)).toBe('active');
    await application.locator('[name=email]').dispatchEvent('change');
    await expect.poll(async () => (await events()).length).toBeGreaterThan(pausedCount);
    await command('emergencyStop');
    await expect.poll(() => popup.evaluate(async key => (await chrome.storage.local.get(key))[key].status, sessionKey)).toBe('stopped');
    const stoppedCount = (await events()).length;
    await expect(popup.locator('#observerState')).toContainText('Stopped');
    await application.locator('[name=email]').dispatchEvent('change');
    await application.waitForTimeout(500);
    await waitEvents(stoppedCount);
    const downloadEvent = popup.waitForEvent('download');
    await command('exportEventJournal');
    const download = await downloadEvent;
    const exported = await readFile((await download.path())!, 'utf8');
    expect(exported.trim().split('\n').map(line => JSON.parse(line))).toEqual(await events());
    expect(JSON.stringify(await journal()) + exported).not.toMatch(/SENTINEL|example\.invalid/);
    const captured = await events();
    captured.forEach((event: any, index: number) => {
      expect(event.sequence).toBe(index + 1);
      expect(event.caused_by).toBe(index ? captured[index - 1].event_id : null);
    });
    // New session and a real document reload: explicit reactivation, no implied continuity.
    await command('startAssist');
    await command('listenCurrentPage');
    await expect(popup.locator('#observerState')).toContainText('LISTENING');
    const beforeReload = (await events()).length;
    await application.reload();
    await expect(popup.locator('#observerState')).toContainText('Disconnected');
    await application.locator('[name=email]').fill('RELOAD_SENTINEL@example.invalid');
    await application.locator('[name=email]').dispatchEvent('change');
    await application.waitForTimeout(500);
    await waitEvents(beforeReload);
    await command('listenCurrentPage');
    await expect.poll(async () => (await events()).length).toBe(beforeReload + 2);
    popup.once('dialog', dialog => dialog.accept());
    await command('clearEventJournal');
    await expect.poll(journal).toBeUndefined();
    await application.locator('[name=email]').dispatchEvent('change');
    await application.waitForTimeout(500);
    await expect.poll(journal).toBeUndefined();
    // Reject stored corruption without modifying or exporting it.
    await popup.evaluate(async key => chrome.storage.local.set({ [key]: { schema: 'broken', events: [] } }), journalKey);
    await command('startAssist');
    await expect(command('listenCurrentPage')).rejects.toThrow('corrupt_journal');
    await expect(popup.locator('#observerState')).toContainText('Review Required');
    expect((await journal()).schema).toBe('broken');
    await expect(command('exportEventJournal')).rejects.toThrow('corrupted');
    await popup.evaluate(async key => chrome.storage.local.set({ [key]: null }), journalKey);
    await expect(command('exportEventJournal')).rejects.toThrow('corrupted');
    expect(await journal()).toBeNull();
    console.log(JSON.stringify({ proof: 'synthetic-headed-extension', layout: reversed ? 'B' : 'A', browser: context.browser()?.version(), events: captured.length, privacy_sentinels_found: 0, extension_id: extensionId, navigation: 'explicit-reactivation', corrupt_export: 'denied' }));
  } finally {
    await context.close();
    // Retain synthetic temporary profiles for diagnosis; never public artifacts.
  }
});