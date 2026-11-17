'use strict';
const fill = document.getElementById('fill');
const status = document.getElementById('status');
const unresolved = document.getElementById('unresolved');
fill.addEventListener('click', async event => {
  if (!event.isTrusted) return;
  fill.disabled = true;
  unresolved.replaceChildren();
  try {
    const response = await fetch(browser.runtime.getURL('answers.json'));
    if (!response.ok) throw new Error('Private answer packet unavailable.');
    const packet = await response.json();
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id) || tab.url !== packet.applicationUrl) {
      status.textContent = 'Select the exact Lever application you prepared, then retry here.';
      return;
    }
    const [injection] = await browser.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      func: globalThis.EscapeHatchFillKnownLever,
      args: [packet],
    });
    const result = injection?.result;
    if (result?.state !== 'FILL_READ_BACK') {
      status.textContent = result?.state === 'PACKET_EXPIRED'
        ? 'The answer packet expired. Run EscapeHatch’s prepare command again.'
        : 'The exact application form could not be verified.';
      return;
    }
    status.textContent = result.filled.length + ' filled and verified, ' + result.preserved.length +
      ' already filled, ' + result.unresolved.length + ' saved answers did not match an editable field. Email preserved. Review before submitting.';
    if (result.unresolved.length) {
      for (const id of result.unresolved) {
        const item = document.createElement('li');
        item.textContent = id;
        unresolved.append(item);
      }
    }
  } catch {
    status.textContent = 'EscapeHatch could not fill this tab. Check the prepared add-on and existing application.';
  } finally {
    fill.disabled = false;
  }
});
