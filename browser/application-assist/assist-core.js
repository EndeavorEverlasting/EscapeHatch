(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EscapeHatchAssist = api;
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
    "password",
    "file",
    "hidden",
    "submit",
    "button",
    "reset",
    "image",
    "checkbox",
    "radio",
    "date",
    "datetime-local",
    "month",
    "time",
    "week",
    "color",
    "range"
  ]);

  const SESSION_STATUSES = Object.freeze(["idle", "active", "paused", "stopped"]);

  function normalizeSignal(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[*:_/\\()[\].,-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function autocompleteTokens(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function compactSignal(value) {
    return normalizeSignal(value).replace(/\s+/g, "");
  }

  function currentValue(field) {
    return String(field.value == null ? "" : field.value).trim();
  }

  function isSupportedDescriptor(field) {
    const tag = String(field.tag || "input").toLowerCase();
    const type = String(field.type || "text").toLowerCase();
    if (field.disabled || field.readOnly || field.hidden) return false;
    if (tag !== "input" && tag !== "select") return false;
    return !DISALLOWED_TYPES.has(type);
  }

  function classifyField(field) {
    if (!isSupportedDescriptor(field)) return null;
    const autocomplete = autocompleteTokens(field.autocomplete);
    const label = normalizeSignal(field.label);
    const name = compactSignal(field.name);
    const id = compactSignal(field.id);
    const placeholder = normalizeSignal(field.placeholder);
    let best = null;
    let bestScore = 0;
    for (const key of PROFILE_KEYS) {
      const rule = RULES[key];
      let score = 0;
      if (rule.autocomplete.some((token) => autocomplete.includes(token))) score = Math.max(score, 100);
      if (rule.labels.includes(label)) score = Math.max(score, 80);
      if (rule.names.includes(name) || rule.names.includes(id)) score = Math.max(score, 70);
      if (rule.labels.includes(placeholder)) score = Math.max(score, 60);
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

  function selectExactOption(options, desired) {
    const target = normalizeSignal(desired);
    for (const option of options || []) {
      if (normalizeSignal(option.value) === target || normalizeSignal(option.text) === target) {
        return option.value;
      }
    }
    return null;
  }

  function createSession(input) {
    const origin = String((input && input.origin) || "");
    if (!origin) throw new Error("Assist session requires an application origin.");
    return {
      schema_version: "escapehatch-application-assist-session/v1",
      session_id: String((input && input.session_id) || `assist-${Date.now()}`),
      application_id: String((input && input.application_id) || ""),
      origin,
      status: "active",
      started_at: String((input && input.started_at) || new Date().toISOString()),
      updated_at: String((input && input.updated_at) || new Date().toISOString()),
      plan_revision: 0,
      fill_stack: [],
      confirmation: null
    };
  }

  function touchSession(session) {
    return Object.assign({}, session, { updated_at: new Date().toISOString() });
  }

  function assertSession(session) {
    if (!session || typeof session !== "object") throw new Error("Assist session is missing.");
    if (!SESSION_STATUSES.includes(session.status)) throw new Error("Assist session status is invalid.");
  }

  function pauseSession(session, reason) {
    assertSession(session);
    if (session.status === "stopped") return touchSession(session);
    return touchSession(
      Object.assign({}, session, {
        status: "paused",
        pause_reason: String(reason || "user_pause")
      })
    );
  }

  function resumeSession(session, currentOrigin) {
    assertSession(session);
    if (session.status === "stopped") {
      throw new Error("Emergency Stop is latched. Start a new assist session.");
    }
    if (String(currentOrigin || "") !== String(session.origin || "")) {
      throw new Error("Resume blocked: tab origin no longer matches the assist session.");
    }
    return touchSession(Object.assign({}, session, { status: "active", pause_reason: null }));
  }

  function stopSession(session) {
    assertSession(session);
    return touchSession(
      Object.assign({}, session, {
        status: "stopped",
        pause_reason: "emergency_stop",
        fill_stack: Array.isArray(session.fill_stack) ? session.fill_stack.slice() : []
      })
    );
  }

  function observeOrigin(session, currentOrigin) {
    assertSession(session);
    if (!session.origin || !currentOrigin) return session;
    if (session.status === "stopped" || session.status === "idle") return session;
    if (String(currentOrigin) !== String(session.origin)) {
      return pauseSession(session, "cross_origin_transition");
    }
    return session;
  }

  function policyGate(session, field, profileKey, proposedValue) {
    if (!session || session.status !== "active") {
      return { allow: false, reason: "session_not_active" };
    }
    if (!profileKey || !PROFILE_TO_QUESTION[profileKey]) {
      return { allow: false, reason: "unknown_or_disallowed_field" };
    }
    if (PROFILE_TO_QUESTION[profileKey] === "attestation.truth_accuracy") {
      return { allow: false, reason: "attestation_manual_only" };
    }
    if (!isSupportedDescriptor(field)) {
      return { allow: false, reason: "unsupported_control" };
    }
    if (classifyField(field) !== profileKey) {
      return { allow: false, reason: "classification_mismatch" };
    }
    if (currentValue(field)) {
      return { allow: false, reason: "preserve_existing_value" };
    }
    if (!proposedValue) {
      return { allow: false, reason: "missing_user_value" };
    }
    if (String(field.tag || "input").toLowerCase() === "select") {
      const matched = selectExactOption(field.options, proposedValue);
      if (matched == null) return { allow: false, reason: "option_mismatch" };
      return { allow: true, reason: "gate_allowed", value: matched };
    }
    return { allow: true, reason: "gate_allowed", value: proposedValue };
  }

  /**
   * Canonical Fill Plan. DOM writes must consume only gate-allowed items from this plan.
   */
  function buildFillPlan(fields, profile, session) {
    assertSession(session);
    const clean = normalizeProfile(profile);
    const items = [];
    const denied = [];
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      const key = classifyField(field);
      if (!key) {
        denied.push({ index, profile_key: null, question_id: null, decision: "unknown_fields_stay_blank" });
        continue;
      }
      const questionId = PROFILE_TO_QUESTION[key];
      const gated = policyGate(session, field, key, clean[key]);
      if (!gated.allow) {
        denied.push({
          index,
          profile_key: key,
          question_id: questionId,
          decision: gated.reason
        });
        continue;
      }
      items.push({
        index,
        profile_key: key,
        question_id: questionId,
        value: gated.value,
        decision: "gate_allowed"
      });
    }
    return {
      schema_version: "escapehatch-application-fill-plan/v1",
      session_id: session.session_id,
      origin: session.origin,
      revision: Number(session.plan_revision || 0) + 1,
      items,
      denied
    };
  }

  function descriptorFromElement(element) {
    const labels = element.labels
      ? Array.from(element.labels)
          .map((label) => label.textContent || "")
          .join(" ")
      : "";
    return {
      tag: element.tagName ? element.tagName.toLowerCase() : "input",
      type: element.type || "text",
      disabled: Boolean(element.disabled),
      readOnly: Boolean(element.readOnly),
      hidden: Boolean(
        element.hidden === true ||
          (typeof element.offsetParent !== "undefined" &&
            element.offsetParent === null &&
            (!element.getClientRects || element.getClientRects().length === 0))
      ),
      value: element.value || "",
      autocomplete: element.getAttribute ? element.getAttribute("autocomplete") || "" : "",
      label: labels || (element.getAttribute ? element.getAttribute("aria-label") || "" : ""),
      name: element.name || "",
      id: element.id || "",
      placeholder: element.placeholder || "",
      options: element.options
        ? Array.from(element.options).map((option) => ({
            value: option.value,
            text: option.textContent || option.label || ""
          }))
        : []
    };
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && typeof descriptor.set === "function") descriptor.set.call(element, value);
    else element.value = value;
  }

  /**
   * DOM writer: executes only gate-allowed Fill Plan items. Re-gates on live DOM before each write.
   */
  function applyFillPlan(documentObject, plan, profile, session) {
    assertSession(session);
    if (session.status !== "active") {
      return {
        filled: 0,
        matched_fields: [],
        inspected: 0,
        session,
        skipped_reason: "session_not_active"
      };
    }
    if (!plan || plan.schema_version !== "escapehatch-application-fill-plan/v1") {
      throw new Error("DOM writer requires a canonical Fill Plan.");
    }
    const clean = normalizeProfile(profile);
    const elements = Array.from(documentObject.querySelectorAll("input, select"));
    const matched = [];
    const writes = [];
    for (const item of plan.items || []) {
      if (session.status !== "active") break;
      if (!item || item.decision !== "gate_allowed") continue;
      const element = elements[item.index];
      if (!element || element.isConnected === false) continue;
      const live = descriptorFromElement(element);
      const gated = policyGate(session, live, item.profile_key, clean[item.profile_key]);
      if (!gated.allow) continue;
      if (gated.value !== item.value) continue;
      const previous = element.value || "";
      setNativeValue(element, gated.value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      matched.push(item.profile_key);
      writes.push({
        index: item.index,
        profile_key: item.profile_key,
        question_id: item.question_id,
        previous_value: previous,
        written_value: gated.value
      });
    }
    const nextSession = touchSession(
      Object.assign({}, session, {
        plan_revision: plan.revision,
        fill_stack: (Array.isArray(session.fill_stack) ? session.fill_stack : []).concat(
          writes.length
            ? [
                {
                  batch_id: `batch-${plan.revision}`,
                  origin: session.origin,
                  writes
                }
              ]
            : []
        )
      })
    );
    return {
      filled: matched.length,
      matched_fields: matched,
      inspected: elements.length,
      session: nextSession,
      plan_revision: plan.revision
    };
  }

  function fillDocument(documentObject, profile, session) {
    const plan = buildFillPlan(
      Array.from(documentObject.querySelectorAll("input, select")).map(descriptorFromElement),
      profile,
      session
    );
    return Object.assign({ plan }, applyFillPlan(documentObject, plan, profile, session));
  }

  function undoLastFill(documentObject, session) {
    assertSession(session);
    const stack = Array.isArray(session.fill_stack) ? session.fill_stack.slice() : [];
    if (!stack.length) {
      return { undone: 0, skipped: 0, session, reason: "empty_fill_stack" };
    }
    const batch = stack.pop();
    const elements = Array.from(documentObject.querySelectorAll("input, select"));
    let undone = 0;
    let skipped = 0;
    for (const write of batch.writes || []) {
      const element = elements[write.index];
      if (!element || element.isConnected === false) {
        skipped += 1;
        continue;
      }
      const live = descriptorFromElement(element);
      if (classifyField(live) !== write.profile_key) {
        skipped += 1;
        continue;
      }
      if (String(element.value || "") !== String(write.written_value || "")) {
        skipped += 1;
        continue;
      }
      setNativeValue(element, write.previous_value || "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      undone += 1;
    }
    return {
      undone,
      skipped,
      session: touchSession(Object.assign({}, session, { fill_stack: stack })),
      batch_id: batch.batch_id
    };
  }

  function recordConfirmation(session, evidence) {
    assertSession(session);
    const source = evidence && evidence.source;
    const allowed = new Set([
      "explicit_user_action",
      "same_session_page_confirmation",
      "user_confirmed_external_evidence"
    ]);
    if (!allowed.has(source)) {
      throw new Error("Confirmation evidence source is not permitted.");
    }
    return touchSession(
      Object.assign({}, session, {
        confirmation: {
          recorded_at: new Date().toISOString(),
          source,
          application_id: String((evidence && evidence.application_id) || session.application_id || ""),
          note: "operator_recorded_confirmation_metadata_only"
        }
      })
    );
  }

  // Donor-compatible helper used by legacy-style planners in tests.
  function planAssignments(fields, profile) {
    const session = createSession({ origin: "https://example.invalid" });
    return buildFillPlan(fields, profile, session).items.map((item) => ({
      index: item.index,
      key: item.profile_key,
      value: item.value
    }));
  }

  return Object.freeze({
    PROFILE_KEYS,
    PROFILE_TO_QUESTION,
    SESSION_STATUSES,
    normalizeSignal,
    normalizeProfile,
    classifyField,
    planAssignments,
    createSession,
    pauseSession,
    resumeSession,
    stopSession,
    observeOrigin,
    policyGate,
    buildFillPlan,
    applyFillPlan,
    fillDocument,
    undoLastFill,
    recordConfirmation,
    descriptorFromElement
  });
});
