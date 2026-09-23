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
  const MAX_LENGTH = 128;

  function getRandomValuesBuffer(length) {
    const buf = new Uint32Array(length);
    if (typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(buf);
      return buf;
    }
    if (typeof require === "function") {
      try {
        const cryptoNode = require("node:crypto");
        const webcrypto = cryptoNode && cryptoNode.webcrypto;
        if (webcrypto && typeof webcrypto.getRandomValues === "function") {
          webcrypto.getRandomValues(buf);
          return buf;
        }
      } catch (_e) {}
    }
    throw new Error("Cryptographically secure randomness is unavailable; refusing temporary credential generation.");
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
    if (!options || options.state !== "ACCOUNT_CREATION") {
      throw new Error("Temporary password generation requires explicit ACCOUNT_CREATION state.");
    }
    let length = MIN_LENGTH;
    if (options.length !== undefined) {
      if (typeof options.length !== "number" || !Number.isFinite(options.length)) {
        throw new Error("Temporary password length must be a finite number.");
      }
      const requested = Math.floor(options.length);
      if (requested > MAX_LENGTH) throw new Error(`Temporary password length must not exceed ${MAX_LENGTH}.`);
      length = Math.max(MIN_LENGTH, requested);
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
      result = generateTemporaryPassword({ state: "ACCOUNT_CREATION", length });
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
    MAX_LENGTH,
    CHARSETS: Object.freeze({ LOWER, UPPER, DIGITS, SYMBOLS, ALL }),
    generateTemporaryPassword,
    generateUsername,
    generateUsernameIfRequired,
    isStrongPassword
  });
});
