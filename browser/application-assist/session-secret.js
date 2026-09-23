(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EscapeHatchSessionSecret = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SESSION_SECRET_KEY = "escapeHatch.accountBootstrapSecret.v1";
  const IN_MEMORY = new Map();

  function hasChromeSessionStorage() {
    return (
      typeof globalThis !== "undefined" &&
      globalThis.chrome &&
      globalThis.chrome.storage &&
      globalThis.chrome.storage.session &&
      typeof globalThis.chrome.storage.session.get === "function"
    );
  }

  async function setSecret(value, options) {
    if (typeof value !== "string" || !value) throw new Error("Secret must be a non-empty string.");
    if (!options || options.state !== "ACCOUNT_CREATION") {
      throw new Error("Secret storage requires explicit ACCOUNT_CREATION state.");
    }
    if (hasChromeSessionStorage()) {
      await globalThis.chrome.storage.session.set({ [SESSION_SECRET_KEY]: value });
      return true;
    }
    IN_MEMORY.set(SESSION_SECRET_KEY, value);
    return true;
  }

  async function getSecret() {
    if (hasChromeSessionStorage()) {
      const res = await globalThis.chrome.storage.session.get(SESSION_SECRET_KEY);
      const v = res && res[SESSION_SECRET_KEY];
      return typeof v === "string" && v ? v : null;
    }
    const v = IN_MEMORY.get(SESSION_SECRET_KEY);
    return typeof v === "string" && v ? v : null;
  }

  async function hasSecret() {
    const v = await getSecret();
    return Boolean(v);
  }

  async function clearSecret() {
    if (hasChromeSessionStorage()) {
      await globalThis.chrome.storage.session.remove(SESSION_SECRET_KEY);
      return true;
    }
    IN_MEMORY.delete(SESSION_SECRET_KEY);
    return true;
  }

  async function revealSecret() {
    const v = await getSecret();
    return v;
  }

  async function copySecret() {
    const v = await getSecret();
    if (!v) return false;
    if (typeof globalThis !== "undefined" && globalThis.navigator && globalThis.navigator.clipboard && typeof globalThis.navigator.clipboard.writeText === "function") {
      try {
        await globalThis.navigator.clipboard.writeText(v);
        return true;
      } catch (_e) {
        return false;
      }
    }
    return false;
  }

  function getStorageDiagnostics() {
    return {
      key: SESSION_SECRET_KEY,
      backend: hasChromeSessionStorage() ? "chrome.storage.session" : "memory",
      persistence: "session_scoped",
      never_commit: true,
      never_log: true,
      never_export: true
    };
  }

  return Object.freeze({
    SESSION_SECRET_KEY,
    setSecret,
    getSecret,
    hasSecret,
    clearSecret,
    revealSecret,
    copySecret,
    getStorageDiagnostics
  });
});
