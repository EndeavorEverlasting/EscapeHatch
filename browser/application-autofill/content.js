(async () => {
  "use strict";

  const STORAGE_KEY = "escapeHatch.applicationAutofillProfile.v1";
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const profile = stored[STORAGE_KEY];

  if (!profile || typeof profile !== "object") {
    return { status: "no-profile", filled: 0, inspected: 0, matched_fields: [] };
  }
  if (!globalThis.EscapeHatchAutofill) {
    return { status: "core-missing", filled: 0, inspected: 0, matched_fields: [] };
  }

  const result = globalThis.EscapeHatchAutofill.fillDocument(document, profile);
  return { status: "ok", ...result };
})()
