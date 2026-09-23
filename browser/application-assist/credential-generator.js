(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EscapeHatchCredentialGenerator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LOWER = "abcdefghijklmnopqrstuvwxyz";
  const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const DIGITS = "0123456789";
  const SYMBOLS = "!@#$%^&*_-+=<>?";
  const ALL = LOWER + UPPER + DIGITS + SYMBOLS;
  const MIN_LENGTH = 20;

  function getRandomValuesBuffer(length) {
    if (typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
      const buf = new Uint32Array(length);
      globalThis.crypto.getRandomValues(buf);
      return buf;
    }
    if (typeof require === "function") {
      try {
        const cryptoNode = require("node:crypto");
        const buf = new Uint32Array(length);
        cryptoNode.getRandomValues(buf);
        return buf;
      } catch (_e) {}
    }
    const buf = new Uint32Array(length);
    for (let i = 0; i < length; i += 1) buf[i] = Math.floor(Math.random() * 4294967296);
    return buf;
  }

  function randomChar(charset, rand) {
    return charset[rand % charset.length];
  }

  function shuffleArray(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = rnd[i] % (i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function isStrongPassword(password) {
    if (typeof password !== "string") return false;
    if (password.length < MIN_LENGTH) return false;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSymbol = /[!@#$%^&*_\-+=<>?]/.test(password);
    return hasLower && hasUpper && hasDigit && hasSymbol;
  }

  function generateTemporaryPassword(options) {
    const length = options && typeof options.length === "number" ? Math.max(MIN_LENGTH, Math.floor(options.length)) : MIN_LENGTH;
    if (options && options.state && options.state !== "ACCOUNT_CREATION") {
      throw new Error("Temporary password generation allowed only in ACCOUNT_CREATION state.");
    }
    const rnd = getRandomValuesBuffer(length + 16);
    const chars = [];
    chars.push(randomChar(LOWER, rnd[0]));
    chars.push(randomChar(UPPER, rnd[1]));
    chars.push(randomChar(DIGITS, rnd[2]));
    chars.push(randomChar(SYMBOLS, rnd[3]));
    for (let i = 4; i < length; i += 1) {
      chars.push(randomChar(ALL, rnd[i]));
    }
    shuffleArray(chars, rnd);
    let result = chars.join("");
    if (!isStrongPassword(result)) {
      result = generateTemporaryPassword({ length });
    }
    return result;
  }

  function sanitizeEmailLocalPart(email) {
    if (typeof email !== "string") return "user";
    const local = String(email).split("@")[0].trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (!local) return "user";
    return local.slice(0, 20);
  }

  function generateUsername(options) {
    if (!options || options.siteRequiresUsername !== true) return null;
    const base = options.baseName || sanitizeEmailLocalPart(options.email);
    const rnd = getRandomValuesBuffer(8);
    let suffix = "";
    for (let i = 0; i < 4; i += 1) suffix += randomChar(DIGITS, rnd[i]);
    const candidate = `${base}${suffix}`;
    if (candidate.length < 6) return `${candidate}01`;
    return candidate.slice(0, 32);
  }

  function generateUsernameIfRequired(email, siteRequiresUsername) {
    return generateUsername({ email, siteRequiresUsername });
  }

  return Object.freeze({
    MIN_LENGTH,
    CHARSETS: Object.freeze({ LOWER, UPPER, DIGITS, SYMBOLS, ALL }),
    generateTemporaryPassword,
    generateUsername,
    generateUsernameIfRequired,
    isStrongPassword
  });
});
