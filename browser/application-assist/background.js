chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ escapeHatchAssistVersion: 1 });
});
