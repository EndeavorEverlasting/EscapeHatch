(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.EscapeHatchAutofill = api;
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

  const RULES = Object.freeze({
    name_prefix: {
      autocomplete: ["honorific-prefix"],
      labels: ["title", "name prefix", "prefix", "salutation"],
      names: ["honorificprefix", "nameprefix", "salutation"]
    },
    first_name: {
      autocomplete: ["given-name"],
      labels: ["first name", "given name"],
      names: ["firstname", "first_name", "givenname", "given_name"]
    },
    last_name: {
      autocomplete: ["family-name"],
      labels: ["last name", "family name", "surname"],
      names: ["lastname", "last_name", "familyname", "family_name", "surname"]
    },
    preferred_name: {
      autocomplete: ["nickname"],
      labels: ["preferred name", "preferred first name", "nickname"],
      names: ["preferredname", "preferred_name", "nickname"]
    },
    email: {
      autocomplete: ["email"],
      labels: ["email", "email address", "e mail"],
      names: ["email", "emailaddress", "email_address"]
    },
    phone: {
      autocomplete: ["tel", "tel-national"],
      labels: ["phone", "phone number", "telephone", "mobile phone", "mobile number"],
      names: ["phone", "phonenumber", "phone_number", "telephone", "mobile", "mobilenumber"]
    },
    linkedin_url: {
      autocomplete: [],
      labels: ["linkedin", "linkedin profile", "linkedin url", "linkedin profile url"],
      names: ["linkedin", "linkedinprofile", "linkedin_profile", "linkedinurl", "linkedin_url"]
    },
    street_address: {
      autocomplete: ["street-address", "address-line1"],
      labels: ["street address", "home street address", "address line 1", "address 1", "home address"],
      names: ["streetaddress", "street_address", "addressline1", "address_line_1", "address1", "homeaddress"]
    },
    city: {
      autocomplete: ["address-level2"],
      labels: ["city", "city municipality", "municipality", "town"],
      names: ["city", "municipality", "town", "addresslevel2", "address_level_2"]
    },
    region: {
      autocomplete: ["address-level1"],
      labels: ["state", "state province", "province", "region"],
      names: ["state", "province", "region", "addresslevel1", "address_level_1"]
    },
    postal_code: {
      autocomplete: ["postal-code"],
      labels: ["zip code", "zipcode", "postal code", "zip postal code"],
      names: ["zip", "zipcode", "zip_code", "postalcode", "postal_code"]
    },
    country: {
      autocomplete: ["country", "country-name"],
      labels: ["country", "country region"],
      names: ["country", "countryname", "country_name"]
    }
  });

  const DISALLOWED_TYPES = new Set([
    "password", "file", "hidden", "submit", "button", "reset", "image",
    "checkbox", "radio", "date", "datetime-local", "month", "time", "week",
    "color", "range"
  ]);

  function normalizeSignal(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[*:_/\\()[\].,-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compactSignal(value) {
    return normalizeSignal(value).replace(/\s+/g, "");
  }

  function isSupportedDescriptor(field) {
    const tag = String(field.tag || "input").toLowerCase();
    const type = String(field.type || "text").toLowerCase();
    if (field.disabled || field.readOnly) return false;
    if (tag !== "input" && tag !== "select") return false;
    return !DISALLOWED_TYPES.has(type);
  }

  function classifyField(field) {
    if (!isSupportedDescriptor(field)) return null;

    const autocomplete = normalizeSignal(field.autocomplete).split(" ").filter(Boolean);
    const label = normalizeSignal(field.label);
    const name = compactSignal(field.name);
    const id = compactSignal(field.id);
    const placeholder = normalizeSignal(field.placeholder);

    let best = null;
    let bestScore = 0;

    for (const key of PROFILE_KEYS) {
      const rule = RULES[key];
      let score = 0;

      if (rule.autocomplete.some((token) => autocomplete.includes(token))) {
        score = Math.max(score, 100);
      }
      if (rule.labels.includes(label)) {
        score = Math.max(score, 80);
      }
      if (rule.names.includes(name) || rule.names.includes(id)) {
        score = Math.max(score, 70);
      }
      if (rule.labels.includes(placeholder)) {
        score = Math.max(score, 60);
      }

      if (score > bestScore) {
        best = key;
        bestScore = score;
      }
    }
    return best;
  }

  function normalizeProfile(profile) {
    const clean = {};
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return clean;
    for (const key of PROFILE_KEYS) {
      if (typeof profile[key] !== "string") continue;
      const value = profile[key].trim();
      if (value) clean[key] = value;
    }
    return clean;
  }

  function currentValue(field) {
    return String(field.value == null ? "" : field.value).trim();
  }

  function selectExactOption(options, desired) {
    const target = normalizeSignal(desired);
    for (const option of options || []) {
      if (normalizeSignal(option.value) === target || normalizeSignal(option.text) === target) {
        return option.value;
      }
    }
    return null;
  }

  function planAssignments(fields, profile) {
    const clean = normalizeProfile(profile);
    const assignments = [];
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      const key = classifyField(field);
      if (!key || !clean[key] || currentValue(field)) continue;

      let value = clean[key];
      if (String(field.tag || "input").toLowerCase() === "select") {
        value = selectExactOption(field.options, value);
        if (value == null) continue;
      }
      assignments.push({ index, key, value });
    }
    return assignments;
  }

  function descriptorFromElement(element) {
    const labels = element.labels ? Array.from(element.labels).map((label) => label.textContent || "").join(" ") : "";
    return {
      tag: element.tagName ? element.tagName.toLowerCase() : "input",
      type: element.type || "text",
      disabled: Boolean(element.disabled),
      readOnly: Boolean(element.readOnly),
      value: element.value || "",
      autocomplete: element.getAttribute ? element.getAttribute("autocomplete") || "" : "",
      label: labels || (element.getAttribute ? element.getAttribute("aria-label") || "" : ""),
      name: element.name || "",
      id: element.id || "",
      placeholder: element.placeholder || "",
      options: element.options
        ? Array.from(element.options).map((option) => ({ value: option.value, text: option.textContent || option.label || "" }))
        : []
    };
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function fillDocument(documentObject, profile) {
    const elements = Array.from(documentObject.querySelectorAll("input, select"));
    const descriptors = elements.map(descriptorFromElement);
    const assignments = planAssignments(descriptors, profile);

    for (const assignment of assignments) {
      const element = elements[assignment.index];
      setNativeValue(element, assignment.value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    return {
      filled: assignments.length,
      matched_fields: assignments.map((item) => item.key),
      inspected: elements.length
    };
  }

  return Object.freeze({
    PROFILE_KEYS,
    normalizeSignal,
    normalizeProfile,
    classifyField,
    planAssignments,
    fillDocument
  });
});
