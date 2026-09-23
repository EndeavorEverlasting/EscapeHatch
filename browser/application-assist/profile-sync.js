(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EscapeHatchProfileSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PROFILE_KEYS = Object.freeze([
    "name_prefix",
    "first_name",
    "last_name",
    "preferred_name",
    "email",
    "phone",
    "linkedin_url",
    "street_address",
    "city",
    "region",
    "postal_code",
    "country"
  ]);

  const PHONE_AUTHORITY_VALUES = Object.freeze([
    "unconfirmed",
    "user_confirmed_primary",
    "secondary_or_forwarded"
  ]);

  const MAX_IMPORT_BYTES = 65536;
  const CANONICAL_OUTPUT_ROOT = "Outputs/application-assist/";
  const RECOVERY_EXPORT_PREFIX = "escapehatch-application-assist-profile";
  const PROFILE_STORAGE_KEY = "escapeHatch.applicationAssistProfile.v1";
  const PREFERENCE_STORAGE_KEY = "escapeHatch.applicationQuestionPreferences.v1";
  const EXPORT_SCHEMA = "escapehatch-application-assist-profile/v2";
  const LEGACY_SCHEMAS = Object.freeze([
    "escapehatch-application-assist-profile/v2",
    "escapehatch-application-assist-profile/v1",
    "escapehatch-application-autofill-profile/v1"
  ]);

  const COCKPIT_PROFILE_KEYS = Object.freeze(["escape-hatch-profile"]);
  const COCKPIT_ASSIST_KEYS = Object.freeze(["escape-hatch-assist-profile"]);
  const COCKPIT_WORKSPACE_KEYS = Object.freeze(["escape-hatch-workspace"]);
  const EXTENSION_PROFILE_KEYS = Object.freeze(["escapeHatch.applicationAssistProfile.v1"]);

  // Accept only known profile keys; drop everything else.
  function acceptOnlyKnownProfileKeys(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    for (const key of PROFILE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(raw, key) && typeof raw[key] === "string") {
        const trimmed = raw[key].trim();
        if (trimmed) out[key] = trimmed;
      }
    }
    if (typeof raw.phone_authority === "string" && PHONE_AUTHORITY_VALUES.includes(raw.phone_authority)) {
      out.phone_authority = raw.phone_authority;
    } else if (Object.prototype.hasOwnProperty.call(raw, "phone_authority")) {
      // explicitly preserve invalid for validation to reject; caller will sanitize
      out.phone_authority = String(raw.phone_authority || "");
    }
    return out;
  }

  function hasProfileValues(profile) {
    return PROFILE_KEYS.some(function (key) {
      return typeof profile[key] === "string" && profile[key].trim();
    });
  }

  function countProfileValues(profile) {
    return PROFILE_KEYS.filter(function (key) {
      return typeof profile[key] === "string" && profile[key].trim();
    }).length;
  }

  function sanitizeProfile(profile) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      throw new Error("Profile must be a JSON object.");
    }
    const clean = {};
    for (const key of PROFILE_KEYS) {
      if (!(key in profile)) continue;
      if (typeof profile[key] !== "string") {
        throw new Error("Profile field " + key + " must be text.");
      }
      const value = profile[key].trim();
      if (value) clean[key] = value;
    }
    const authority = typeof profile.phone_authority === "string" ? profile.phone_authority : "unconfirmed";
    if (PHONE_AUTHORITY_VALUES.indexOf(authority) === -1) {
      throw new Error("Profile phone_authority is invalid.");
    }
    clean.phone_authority = authority;
    return clean;
  }

  function bytesOf(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    // Node fallback
    if (typeof Buffer !== "undefined") return Buffer.byteLength(text, "utf8");
    return text.length;
  }

  function validateImportPayloadText(text) {
    if (typeof text !== "string") throw new Error("Import payload must be text.");
    if (bytesOf(text) > MAX_IMPORT_BYTES) throw new Error("Import rejected: payload exceeds 64 KiB.");
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (_e) {
      throw new Error("Import rejected: invalid JSON.");
    }
    const schema = payload && payload.schema_version;
    if (LEGACY_SCHEMAS.indexOf(schema) === -1) {
      throw new Error("Import rejected: unsupported schema.");
    }
    let rawProfile = payload && payload.profile;
    if (!rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile)) {
      throw new Error("Import rejected: profile missing.");
    }
    // Clone to avoid mutating original
    const incoming = {};
    for (const k in rawProfile) if (Object.prototype.hasOwnProperty.call(rawProfile, k)) incoming[k] = rawProfile[k];
    if (schema !== EXPORT_SCHEMA || !Object.prototype.hasOwnProperty.call(incoming, "phone_authority")) {
      incoming.phone_authority = "unconfirmed";
    }
    const profile = sanitizeProfile(incoming);
    return { profile: profile, schema_version: schema, payload: payload };
  }

  function isValidSyncSize(text) {
    return bytesOf(text) <= MAX_IMPORT_BYTES;
  }


  function isTrustedCockpitUrl(value) {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      const host = String(url.hostname || "").toLowerCase();
      return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
    } catch (_e) {
      return false;
    }
  }

  // Cockpit storage extraction helpers.
  // dump is a plain object mapping storage key -> raw string value (as stored in localStorage)
  // Returns array of candidate raw profile objects (unvalidated)
  function extractCandidatesFromDump(dump) {
    const candidates = [];
    if (!dump || typeof dump !== "object") return candidates;
    function tryParse(key) {
      const raw = dump[key];
      if (typeof raw !== "string" || !raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_e) {
        return null;
      }
    }
    // Direct profile from cockpit storage (Profile)
    for (const k of COCKPIT_PROFILE_KEYS) {
      const parsed = tryParse(k);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed);
      }
    }
    // Assist profile contact
    for (const k of COCKPIT_ASSIST_KEYS) {
      const parsed = tryParse(k);
      if (!parsed) continue;
      // assist-contract may store {schema, version, profile: {contact: ...}}
      // Try multiple shapes
      if (parsed.profile && parsed.profile.contact && typeof parsed.profile.contact === "object") {
        candidates.push(parsed.profile.contact);
      } else if (parsed.contact && typeof parsed.contact === "object") {
        candidates.push(parsed.contact);
      } else if (typeof parsed.first_name === "string" || typeof parsed.email === "string") {
        candidates.push(parsed);
      }
    }
    // Workspace backup style: {profile: {...}}
    for (const k of COCKPIT_WORKSPACE_KEYS) {
      const parsed = tryParse(k);
      if (parsed && parsed.profile && typeof parsed.profile === "object") {
        candidates.push(parsed.profile);
      }
    }
    // Extension profile stored via cockpit? fallback
    for (const k of EXTENSION_PROFILE_KEYS) {
      const parsed = tryParse(k);
      if (parsed && typeof parsed === "object") candidates.push(parsed);
    }
    // Also allow direct object dump (when already parsed) e.g., tests pass objects directly
    if (candidates.length === 0) {
      // If dump itself looks like a profile object (has email etc.), treat as candidate
      if (typeof dump.email === "string" || typeof dump.first_name === "string") {
        candidates.push(dump);
      }
    }
    return candidates;
  }

  function selectBestCockpitProfile(candidates) {
    for (const raw of candidates) {
      try {
        const filtered = acceptOnlyKnownProfileKeys(raw);
        // Preserve phone_authority if present in raw and valid, else unconfirmed will be used
        if (typeof raw.phone_authority === "string" && raw.phone_authority) {
          filtered.phone_authority = raw.phone_authority;
        } else if (!filtered.phone_authority) {
          filtered.phone_authority = "unconfirmed";
        }
        const clean = sanitizeProfile(filtered);
        if (hasProfileValues(clean)) return clean;
      } catch (_e) {
        continue;
      }
    }
    return null;
  }

  function parseCockpitDump(dump) {
    const candidates = extractCandidatesFromDump(dump);
    return selectBestCockpitProfile(candidates);
  }

  // Project identity profile into preference-cache store (profile_preference scope)
  const PROFILE_TO_QUESTION = Object.freeze({
    name_prefix: "identity.title",
    first_name: "identity.first_name",
    last_name: "identity.last_name",
    preferred_name: "identity.preferred_name",
    email: "identity.email",
    phone: "identity.phone",
    linkedin_url: "identity.linkedin",
    street_address: "identity.street_address",
    city: "identity.city",
    region: "identity.region",
    postal_code: "identity.postal_code",
    country: "identity.country"
  });

  function projectProfileToPreferenceStore(profile, existing) {
    const clean = sanitizeProfile(acceptOnlyKnownProfileKeys(profile));
    const base = existing && typeof existing === "object" && existing.preferences && typeof existing.preferences === "object" ? existing.preferences : {};
    const next = {};
    const identityQuestionIds = new Set(Object.values(PROFILE_TO_QUESTION));
    for (const k in base) {
      if (!Object.prototype.hasOwnProperty.call(base, k)) continue;
      const prior = base[k];
      if (identityQuestionIds.has(k) && prior && prior.scope === "profile_preference") continue;
      next[k] = prior;
    }
    for (const key of PROFILE_KEYS) {
      if (!clean[key]) continue;
      next[PROFILE_TO_QUESTION[key]] = { scope: "profile_preference", value: clean[key] };
    }
    return {
      schema_version: "escapehatch-application-question-preferences/v1",
      preferences: next
    };
  }

  // Recovery import/export helper: cap size and schema-check, never log secrets
  function validateRecoveryExportText(text) {
    return validateImportPayloadText(text);
  }

  // No-agent bootstrap helper: proves profile available without file archaeology
  // Returns true if profile has at least email and passes validation
  function isNoAgentBootstrapReady(profile) {
    try {
      const clean = sanitizeProfile(profile);
      return hasProfileValues(clean) && typeof clean.email === "string" && clean.email.trim().length > 0;
    } catch (_e) {
      return false;
    }
  }

  // For testing: create a synthetic cockpit localStorage dump from a profile
  function createCockpitDumpFromProfile(profile) {
    const clean = sanitizeProfile(profile);
    return {
      "escape-hatch-profile": JSON.stringify(clean)
    };
  }

  return Object.freeze({
    PROFILE_KEYS: PROFILE_KEYS,
    PHONE_AUTHORITY_VALUES: PHONE_AUTHORITY_VALUES,
    MAX_IMPORT_BYTES: MAX_IMPORT_BYTES,
    CANONICAL_OUTPUT_ROOT: CANONICAL_OUTPUT_ROOT,
    RECOVERY_EXPORT_PREFIX: RECOVERY_EXPORT_PREFIX,
    PROFILE_STORAGE_KEY: PROFILE_STORAGE_KEY,
    PREFERENCE_STORAGE_KEY: PREFERENCE_STORAGE_KEY,
    EXPORT_SCHEMA: EXPORT_SCHEMA,
    LEGACY_SCHEMAS: LEGACY_SCHEMAS,
    PROFILE_TO_QUESTION: PROFILE_TO_QUESTION,
    acceptOnlyKnownProfileKeys: acceptOnlyKnownProfileKeys,
    sanitizeProfile: sanitizeProfile,
    hasProfileValues: hasProfileValues,
    countProfileValues: countProfileValues,
    validateImportPayloadText: validateImportPayloadText,
    validateRecoveryExportText: validateRecoveryExportText,
    isValidSyncSize: isValidSyncSize,
    bytesOf: bytesOf,
    isTrustedCockpitUrl: isTrustedCockpitUrl,
    extractCandidatesFromDump: extractCandidatesFromDump,
    parseCockpitDump: parseCockpitDump,
    selectBestCockpitProfile: selectBestCockpitProfile,
    projectProfileToPreferenceStore: projectProfileToPreferenceStore,
    isNoAgentBootstrapReady: isNoAgentBootstrapReady,
    createCockpitDumpFromProfile: createCockpitDumpFromProfile
  });
});
