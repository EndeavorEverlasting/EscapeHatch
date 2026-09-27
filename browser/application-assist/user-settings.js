"use strict";

/**
 * Application Assist user settings (AutofillPreference).
 * Candidate A: Start Assist may chain one canonical Fill Plan execution.
 * Candidate B (page-lifecycle refill) is deferred until permission evidence exists.
 * This module never bypasses Fill Plan / field policy / phone authority rules.
 */
(function (root) {
  const SCHEMA = "escapehatch/application-assist-user-settings/v1";
  const STORAGE_KEY = "escapeHatch.applicationAssistUserSettings.v1";

  function defaultSettings() {
    return { schema: SCHEMA, autofill_enabled: true };
  }

  function normalizeSettings(raw) {
    if (raw == null) {
      return { settings: defaultSettings(), note: null, source: "missing_default_on" };
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
      return {
        settings: defaultSettings(),
        note: "Autofill settings were malformed; defaulted to ON.",
        source: "malformed_default_on"
      };
    }
    if (typeof raw.autofill_enabled !== "boolean") {
      return {
        settings: defaultSettings(),
        note: "Autofill settings were incomplete; defaulted to ON.",
        source: "malformed_default_on"
      };
    }
    return {
      settings: {
        schema: SCHEMA,
        autofill_enabled: raw.autofill_enabled
      },
      note: null,
      source: "stored"
    };
  }

  function isAutofillEnabled(raw) {
    return normalizeSettings(raw).settings.autofill_enabled === true;
  }

  root.EscapeHatchAssistUserSettings = {
    SCHEMA: SCHEMA,
    STORAGE_KEY: STORAGE_KEY,
    defaultSettings: defaultSettings,
    normalizeSettings: normalizeSettings,
    isAutofillEnabled: isAutofillEnabled
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.EscapeHatchAssistUserSettings;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
