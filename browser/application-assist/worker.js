'use strict';
importScripts('submission-observer.js', 'assist-core.js', 'native-profile-bridge.js');
const submission = globalThis.EscapeHatchSubmission;
const SESSION = 'escapeHatch.applicationAssistSession.v1';
let serial = Promise.resolve();
function queued(work) { const result = serial.then(work); serial = result.catch(() => {}); return result; }
async function read() { return (await chrome.storage.local.get(submission.KEY))[submission.KEY] || null; }
async function save(value) { await chrome.storage.local.set({ [submission.KEY]: value }); return value; }
async function inject(tabId, record) {
  return (await chrome.scripting.executeScript({ target: { tabId }, func: submission.install,
    args: [{ origin: record.origin, path: record.path, sessionId: record.sessionId }] }))[0]?.result;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const popup = sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('popup.html') && !sender.tab;
  if (!message || !['submission-arm', 'submission-stop', 'submission-status', 'submission-observation'].includes(message.type)) return;
  queued(async () => {
    if (message.type === 'submission-status') { if (!popup) throw new Error('Popup required.'); return read(); }
    if (message.type === 'submission-stop') {
      if (!popup) throw new Error('Popup required.');
      const current = await read();
      if (!current) return null;
      const stopped = await save({ ...current, state: 'DISARMED', reason: 'Listening stopped.' });
      await chrome.scripting.executeScript({ target: { tabId: current.tabId }, func: () => globalThis.__ehSubmissionObserverDispose?.() }).catch(() => {});
      return stopped;
    }
    if (message.type === 'submission-arm') {
      if (!popup) throw new Error('Popup required.');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const bound = submission.binding(tab?.url);
      const session = (await chrome.storage.local.get(SESSION))[SESSION];
      if (!bound || !Number.isInteger(tab?.id) || session?.status !== 'active' || session.origin !== bound.origin) throw new Error('Start Assist on a supported Ashby application first.');
      const record = { ...bound, tabId: tab.id, sessionId: crypto.randomUUID(), state: 'ARMED', armedAt: Date.now(), connected: true, reason: 'Listening for your Submit Application click.', receipt: null };
      await save({ ...record, state: 'DISARMED', reason: 'Checking current application.' });
      const baseline = await inject(tab.id, record);
      if (!baseline || baseline.error || baseline.success || baseline.receiptText || baseline.terminalCount !== 1 || !baseline.enabled) throw new Error('A unique enabled Submit Application button and no existing confirmation are required.');
      return save(record);
    }
    const current = await read();
    if (!current || sender.id !== chrome.runtime.id || sender.frameId !== 0 || sender.tab?.id !== current.tabId || message.sessionId !== current.sessionId) return null;
    const actual = new URL(sender.url);
    if (actual.origin !== message.origin || actual.pathname !== message.path) return null;
    const next = submission.reduce(current, message, Date.now(), crypto.randomUUID());
    if (next !== current) await save(next);
    return next;
  }).then(value => respond({ ok: true, observation: value }), () => respond({ ok: false, error: 'Submission observer unavailable; review state and re-arm explicitly.' }));
  return true;
});
chrome.runtime.onStartup.addListener(() => {
  void queued(async () => { const current = await read(); if (current && current.state !== 'CONFIRMED') await save({ ...current, state: 'BLOCKED', reason: 'Browser restarted; re-arm explicitly.' }); }).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[SESSION]) return;
  void queued(async () => {
    const current = await read(), session = changes[SESSION].newValue;
    if (current && current.state !== 'CONFIRMED' && (!session || session.status !== 'active' || session.origin !== current.origin)) {
      await save({ ...current, state: 'DISARMED', reason: 'Assist paused or stopped; re-arm explicitly.' });
      await chrome.scripting.executeScript({ target: { tabId: current.tabId }, func: () => globalThis.__ehSubmissionObserverDispose?.() }).catch(() => {});
    }
  }).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (!change.url && !['loading', 'complete'].includes(change.status)) return;
  void queued(async () => {
    const current = await read();
    if (!current || current.tabId !== tabId || !['ARMED', 'PENDING', 'VALIDATION_FAILED'].includes(current.state)) return;
    const actual = new URL(tab.url || change.url);
    if (actual.origin !== current.origin || actual.pathname !== current.path) {
      await save({ ...current, state: 'BLOCKED', reason: 'Application changed; re-arm explicitly.' }); return;
    }
    if (change.status === 'loading') { await save({ ...current, connected: false }); return; }
    if (change.status === 'complete') {
      try {
        const result = await inject(tabId, current);
        if (!result || result.error) throw new Error('Observer did not bind.');
        await save({ ...current, connected: true });
      }
      catch (_) { await save({ ...current, state: 'BLOCKED', reason: 'Observer disconnected; re-arm explicitly.' }); }
    }
  }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(tabId => {
  void queued(async () => { const current = await read(); if (current?.tabId === tabId && current.state !== 'CONFIRMED') await save({ ...current, state: 'DISARMED', reason: 'Application tab closed.' }); }).catch(() => {});
});

/**
 * Boot the shipped first-party bird into Chrome's toolbar automatically.
 * MV3 service workers have OffscreenCanvas; the checked-in source is WebP.
 * The native setIcon ImageData path avoids a user-supplied PNG, manual copy,
 * external CDN or generated runtime file on fresh install and re-launch.
 * Failure does not change submission observation or any assist state.
 */
async function installEscapeHatchActionIcon() {
  if (!chrome.action?.setIcon || typeof OffscreenCanvas === 'undefined' ||
      typeof createImageBitmap !== 'function') return false;
  let bitmap;
  try {
    const response = await fetch(chrome.runtime.getURL('escapehatch-mascot.webp'));
    if (!response.ok) return false;
    bitmap = await createImageBitmap(await response.blob());
    const variants = {};
    for (const size of [16, 32]) {
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext('2d');
      if (!context) return false;
      context.clearRect(0, 0, size, size);
      const side = Math.min(bitmap.width, bitmap.height);
      context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2,
        side, side, 0, 0, size, size);
      variants[size] = context.getImageData(0, 0, size, size);
    }
    await chrome.action.setIcon({ imageData: variants });
    return true;
  } catch (_) {
    return false; // appearance failure must not alter application or submission state
  } finally {
    bitmap?.close?.();
  }
}
chrome.runtime.onInstalled.addListener(() => { void installEscapeHatchActionIcon(); });
chrome.runtime.onStartup.addListener(() => { void installEscapeHatchActionIcon(); });
void installEscapeHatchActionIcon();

// Only the registered Windows native host can supply private workspace values.
// Restrict storage to extension contexts; injected employer-page scripts receive
// only the existing explicit Fill Plan payload, never direct profile access.
void chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
const nativeProfile = globalThis.EscapeHatchNativeProfile.create({
  storage: chrome.storage.local,
  api: globalThis.EscapeHatchAssist,
  native: (host, request) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('NATIVE_HOST_TIMEOUT')), 15000);
    chrome.runtime.sendNativeMessage(host, request, response => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) reject(new Error('NATIVE_HOST_UNAVAILABLE'));
      else resolve(response);
    });
  })
});
function profileFailure(error) {
  return { ok: false, status: 'BLOCKED', reason: /^[A-Z0-9_]{1,100}$/.test(error?.message || '') ? error.message : 'WORKSPACE_PROFILE_UNAVAILABLE' };
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || !['workspace-view','workspace-review','workspace-confirm','workspace-refresh','workspace-edit','workspace-clear'].includes(message.type)) return;
  const popupUrl = chrome.runtime.getURL('popup.html');
  const popup = sender.id === chrome.runtime.id && sender.url === popupUrl &&
    (!sender.tab || sender.frameId === 0 && sender.tab.url === popupUrl);
  if (!popup) { respond({ ok: false, reason: 'POPUP_REQUIRED' }); return; }
  queued(async () => {
    if (message.type === 'workspace-view') return nativeProfile.view();
    if (message.type === 'workspace-review') return nativeProfile.review();
    if (message.type === 'workspace-confirm') return nativeProfile.confirm(message.approval);
    if (message.type === 'workspace-edit') return nativeProfile.edit('save', message.profile);
    if (message.type === 'workspace-clear') return nativeProfile.edit('clear');
    return nativeProfile.refresh();
  }).then(value => respond({ ok: true, value }), error => respond(profileFailure(error)));
  return true;
});
chrome.runtime.onMessageExternal.addListener((message, sender, respond) => {
  let allowed = false;
  try {
    const url = new URL(sender.url);
    allowed = !sender.id && sender.frameId === 0 && Number.isInteger(sender.tab?.id) && url.protocol === 'http:' && url.hostname === '127.0.0.1' && !url.username && !url.password;
  } catch (_) { /* malformed sender */ }
  if (!allowed || message?.type !== 'workspace-refresh' || Object.keys(message).length !== 1) { respond({ ok: false, status: 'BLOCKED', reason: 'WAKE_ONLY' }); return; }
  // A localhost page can wake the native reader, never provide/read private data.
  queued(() => nativeProfile.refresh()).then(value => respond({ ok: true, status: value.status, profileFieldCount: value.profileFieldCount, answerCount: value.answerCount }), error => respond(profileFailure(error)));
  return true;
});
function refreshNativeProfile() { void queued(() => nativeProfile.refresh()).catch(() => {}); }
chrome.runtime.onInstalled.addListener(refreshNativeProfile);
chrome.runtime.onStartup.addListener(refreshNativeProfile);
