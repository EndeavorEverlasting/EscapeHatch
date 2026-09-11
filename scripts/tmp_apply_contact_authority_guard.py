#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    p = ROOT / path
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"expected patch anchor missing in {path}: {old[:120]!r}")
    if text.count(old) != 1:
        raise SystemExit(f"patch anchor is not unique in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# Canonical runtime policy: an observed/stored phone is not authority to use it.
replace_once(
    "browser/application-assist/assist-core.js",
    '  const SESSION_STATUSES = Object.freeze(["idle", "active", "paused", "stopped"]);\n',
    '  const SESSION_STATUSES = Object.freeze(["idle", "active", "paused", "stopped"]);\n'
    '  const HIGH_STAKES_CONTACT_AUTHORITY = Object.freeze({\n'
    '    phone: "user_confirmed_controlled_primary"\n'
    '  });\n',
)
replace_once(
    "browser/application-assist/assist-core.js",
    '    for (const key of PROFILE_KEYS) {\n'
    '      if (typeof profile[key] !== "string") continue;\n'
    '      const value = profile[key].trim();\n'
    '      if (value) clean[key] = value;\n'
    '    }\n'
    '    return clean;\n',
    '    for (const key of PROFILE_KEYS) {\n'
    '      if (typeof profile[key] !== "string") continue;\n'
    '      const value = profile[key].trim();\n'
    '      if (value) clean[key] = value;\n'
    '    }\n'
    '    const authority = profile.contact_authority;\n'
    '    if (authority && typeof authority === "object" && !Array.isArray(authority)) {\n'
    '      if (authority.phone === HIGH_STAKES_CONTACT_AUTHORITY.phone) {\n'
    '        clean.contact_authority = { phone: HIGH_STAKES_CONTACT_AUTHORITY.phone };\n'
    '      }\n'
    '    }\n'
    '    return clean;\n',
)
replace_once(
    "browser/application-assist/assist-core.js",
    '  function policyGate(session, field, profileKey, proposedValue) {\n',
    '  function policyGate(session, field, profileKey, proposedValue, contactAuthority) {\n',
)
replace_once(
    "browser/application-assist/assist-core.js",
    '    if (!profileKey || !PROFILE_TO_QUESTION[profileKey]) {\n'
    '      return { allow: false, reason: "unknown_or_disallowed_field" };\n'
    '    }\n'
    '    if (PROFILE_TO_QUESTION[profileKey] === "attestation.truth_accuracy") {\n',
    '    if (!profileKey || !PROFILE_TO_QUESTION[profileKey]) {\n'
    '      return { allow: false, reason: "unknown_or_disallowed_field" };\n'
    '    }\n'
    '    if (\n'
    '      profileKey === "phone" &&\n'
    '      (!contactAuthority || contactAuthority.phone !== HIGH_STAKES_CONTACT_AUTHORITY.phone)\n'
    '    ) {\n'
    '      return { allow: false, reason: "high_stakes_contact_unconfirmed" };\n'
    '    }\n'
    '    if (PROFILE_TO_QUESTION[profileKey] === "attestation.truth_accuracy") {\n',
)
replace_once(
    "browser/application-assist/assist-core.js",
    '      const gated = policyGate(session, field, key, clean[key]);\n',
    '      const gated = policyGate(session, field, key, clean[key], clean.contact_authority);\n',
)
replace_once(
    "browser/application-assist/assist-core.js",
    '      const gated = policyGate(session, live, item.profile_key, clean[item.profile_key]);\n',
    '      const gated = policyGate(\n'
    '        session,\n'
    '        live,\n'
    '        item.profile_key,\n'
    '        clean[item.profile_key],\n'
    '        clean.contact_authority\n'
    '      );\n',
)
replace_once(
    "browser/application-assist/assist-core.js",
    '    PROFILE_TO_QUESTION,\n'
    '    SESSION_STATUSES,\n',
    '    PROFILE_TO_QUESTION,\n'
    '    HIGH_STAKES_CONTACT_AUTHORITY,\n'
    '    SESSION_STATUSES,\n',
)

# Popup keeps the user's explicit choice next to the number; legacy profiles remain unconfirmed.
replace_once(
    "browser/application-assist/popup.js",
    'const MAX_IMPORT_BYTES = 65536;\n',
    'const MAX_IMPORT_BYTES = 65536;\n'
    'const PHONE_AUTHORITY = "user_confirmed_controlled_primary";\n',
)
replace_once(
    "browser/application-assist/popup.js",
    '  for (const key of PROFILE_KEYS) {\n'
    '    const value = document.getElementById(key).value.trim();\n'
    '    if (value) profile[key] = value;\n'
    '  }\n'
    '  return profile;\n',
    '  for (const key of PROFILE_KEYS) {\n'
    '    const value = document.getElementById(key).value.trim();\n'
    '    if (value) profile[key] = value;\n'
    '  }\n'
    '  const phoneAuthority = document.getElementById("phone_authority");\n'
    '  if (phoneAuthority && phoneAuthority.checked) {\n'
    '    profile.contact_authority = { phone: PHONE_AUTHORITY };\n'
    '  }\n'
    '  return profile;\n',
)
replace_once(
    "browser/application-assist/popup.js",
    '  for (const key of PROFILE_KEYS) {\n'
    '    document.getElementById(key).value = profile && typeof profile[key] === "string" ? profile[key] : "";\n'
    '  }\n'
    '}\n',
    '  for (const key of PROFILE_KEYS) {\n'
    '    document.getElementById(key).value = profile && typeof profile[key] === "string" ? profile[key] : "";\n'
    '  }\n'
    '  const phoneAuthority = document.getElementById("phone_authority");\n'
    '  if (phoneAuthority) {\n'
    '    phoneAuthority.checked = Boolean(\n'
    '      profile &&\n'
    '        profile.contact_authority &&\n'
    '        profile.contact_authority.phone === PHONE_AUTHORITY\n'
    '    );\n'
    '  }\n'
    '}\n',
)
replace_once(
    "browser/application-assist/popup.js",
    '  for (const key of PROFILE_KEYS) {\n'
    '    if (!(key in profile)) continue;\n'
    '    if (typeof profile[key] !== "string") {\n'
    '      throw new Error(`Profile field ${key} must be text.`);\n'
    '    }\n'
    '    const value = profile[key].trim();\n'
    '    if (value) clean[key] = value;\n'
    '  }\n'
    '  return clean;\n',
    '  for (const key of PROFILE_KEYS) {\n'
    '    if (!(key in profile)) continue;\n'
    '    if (typeof profile[key] !== "string") {\n'
    '      throw new Error(`Profile field ${key} must be text.`);\n'
    '    }\n'
    '    const value = profile[key].trim();\n'
    '    if (value) clean[key] = value;\n'
    '  }\n'
    '  if ("contact_authority" in profile) {\n'
    '    if (!profile.contact_authority || typeof profile.contact_authority !== "object" || Array.isArray(profile.contact_authority)) {\n'
    '      throw new Error("Profile contact_authority must be an object.");\n'
    '    }\n'
    '    if (profile.contact_authority.phone === PHONE_AUTHORITY) {\n'
    '      clean.contact_authority = { phone: PHONE_AUTHORITY };\n'
    '    }\n'
    '  }\n'
    '  return clean;\n',
)
replace_once(
    "browser/application-assist/popup.js",
    'async function saveProfile() {\n'
    '  const profile = sanitizeProfile(readForm());\n'
    '  await chrome.storage.local.set({ [PROFILE_KEY]: profile });\n'
    '  setStatus(`Saved ${Object.keys(profile).length} profile fields locally.`);\n'
    '}\n',
    'function countProfileFields(profile) {\n'
    '  return PROFILE_KEYS.filter((key) => typeof profile[key] === "string" && profile[key]).length;\n'
    '}\n'
    '\n'
    'function contactAuthoritySuffix(profile) {\n'
    '  if (!profile.phone) return "";\n'
    '  if (profile.contact_authority && profile.contact_authority.phone === PHONE_AUTHORITY) {\n'
    '    return " Phone is approved for high-stakes career contact.";\n'
    '  }\n'
    '  return " Phone is stored but blocked from autofill until you explicitly mark it as the number you control and prefer for high-stakes career contact.";\n'
    '}\n'
    '\n'
    'async function saveProfile() {\n'
    '  const profile = sanitizeProfile(readForm());\n'
    '  await chrome.storage.local.set({ [PROFILE_KEY]: profile });\n'
    '  setStatus(`Saved ${countProfileFields(profile)} profile fields locally.${contactAuthoritySuffix(profile)}`);\n'
    '}\n',
)
replace_once(
    "browser/application-assist/popup.js",
    '  setStatus(`Imported ${Object.keys(profile).length} profile fields locally.`);\n',
    '  setStatus(`Imported ${countProfileFields(profile)} profile fields locally.${contactAuthoritySuffix(profile)}`);\n',
)

replace_once(
    "browser/application-assist/popup.html",
    '    .session { border-top: 1px solid #ddd; margin-top: 12px; padding-top: 10px; }\n',
    '    .session { border-top: 1px solid #ddd; margin-top: 12px; padding-top: 10px; }\n'
    '    .authority { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; font-weight: 500; color: #333; }\n'
    '    .authority input { margin-top: 2px; padding: 0; min-width: auto; }\n',
)
replace_once(
    "browser/application-assist/popup.html",
    '    <label>Email <input id="email" type="email" autocomplete="email"></label>\n'
    '    <label>Phone <input id="phone" type="tel" autocomplete="tel"></label>\n'
    '    <label class="wide">LinkedIn <input id="linkedin_url" type="url"></label>\n',
    '    <label>Email <input id="email" type="email" autocomplete="email"></label>\n'
    '    <label>Phone <input id="phone" type="tel" autocomplete="tel"></label>\n'
    '    <label class="wide authority"><input id="phone_authority" type="checkbox"> <span>Use this phone for high-stakes career contact — I control this number and prefer employers/recruiters to use it.</span></label>\n'
    '    <label class="wide">LinkedIn <input id="linkedin_url" type="url"></label>\n',
)

# Contract makes the fail-closed rule inspectable and provider-agnostic.
contract_path = ROOT / "contracts/application-assist-session.v1.json"
contract = json.loads(contract_path.read_text(encoding="utf-8"))
contract["contact_authority"] = {
    "high_stakes_fields": ["phone"],
    "phone_required_marker": "user_confirmed_controlled_primary",
    "default": "unconfirmed_fail_closed",
    "selection_principle": "The user chooses the reachable phone number they control and prefer for life-changing career contact. A number's provider, forwarding/relay status, or prior appearance is not authority to use it.",
    "legacy_profile_behavior": "A stored/imported phone without the explicit authority marker remains stored but must not enter a Fill Plan.",
}
rules = contract["policy_gate"]["rules"]
if "high_stakes_phone_requires_explicit_user_control_and_preference" not in rules:
    rules.append("high_stakes_phone_requires_explicit_user_control_and_preference")
security = contract["portability"]["security"]
if "legacy_phone_without_authority_must_not_fill" not in security:
    security.append("legacy_phone_without_authority_must_not_fill")
contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")

# Runtime tests: authorized phone passes; observed/legacy phone fails closed.
replace_once(
    "tests/test_application_assist_session.mjs",
    '  country: "US",\n'
    '  extra_field: "must not survive"\n'
    '};\n'
    'assert.deepEqual(Object.keys(core.normalizeProfile(profile)).sort(), [...core.PROFILE_KEYS].sort());\n',
    '  country: "US",\n'
    '  contact_authority: { phone: core.HIGH_STAKES_CONTACT_AUTHORITY.phone },\n'
    '  extra_field: "must not survive"\n'
    '};\n'
    'assert.deepEqual(\n'
    '  Object.keys(core.normalizeProfile(profile)).sort(),\n'
    '  [...core.PROFILE_KEYS, "contact_authority"].sort()\n'
    ');\n',
)
replace_once(
    "tests/test_application_assist_session.mjs",
    'assert.equal(\n'
    '  plan.denied.some((item) => item.decision === "unknown_fields_stay_blank"),\n'
    '  true\n'
    ');\n',
    'assert.equal(\n'
    '  plan.denied.some((item) => item.decision === "unknown_fields_stay_blank"),\n'
    '  true\n'
    ');\n'
    '\n'
    'const legacyObservedProfile = { ...profile };\n'
    'delete legacyObservedProfile.contact_authority;\n'
    'const legacyObservedPlan = core.buildFillPlan(fields, legacyObservedProfile, session);\n'
    'assert.equal(\n'
    '  legacyObservedPlan.items.some((item) => item.profile_key === "phone"),\n'
    '  false,\n'
    '  "a stored or previously observed phone must not become a high-stakes contact channel by inference"\n'
    ');\n'
    'assert.equal(\n'
    '  legacyObservedPlan.denied.some(\n'
    '    (item) => item.profile_key === "phone" && item.decision === "high_stakes_contact_unconfirmed"\n'
    '  ),\n'
    '  true\n'
    ');\n',
)
replace_once(
    "tests/test_application_assist_session.mjs",
    'const wrote = core.fillDocument({ querySelectorAll: () => [phone] }, { phone: "+1 555 010 0142" }, undoSession);\n',
    'const wrote = core.fillDocument(\n'
    '  { querySelectorAll: () => [phone] },\n'
    '  {\n'
    '    phone: "+1 555 010 0142",\n'
    '    contact_authority: { phone: core.HIGH_STAKES_CONTACT_AUTHORITY.phone }\n'
    '  },\n'
    '  undoSession\n'
    ');\n',
)

# Contract/static tests pin the UI and fail-closed doctrine.
replace_once(
    "tests/test_application_assist_session_contract.py",
    '        self.assertTrue(self.contract["session"]["stop_cancels_future_writes"])\n',
    '        self.assertTrue(self.contract["session"]["stop_cancels_future_writes"])\n'
    '        authority = self.contract["contact_authority"]\n'
    '        self.assertEqual(authority["phone_required_marker"], "user_confirmed_controlled_primary")\n'
    '        self.assertEqual(authority["default"], "unconfirmed_fail_closed")\n'
    '        self.assertIn("provider", authority["selection_principle"].lower())\n'
    '        self.assertIn("legacy_phone_without_authority_must_not_fill", self.contract["portability"]["security"])\n',
)
replace_once(
    "tests/test_application_assist_session_contract.py",
    '            "recordConfirmation",\n'
    '            "save",\n',
    '            "recordConfirmation",\n'
    '            "phone_authority",\n'
    '            "save",\n',
)
replace_once(
    "tests/test_application_assist_session_contract.py",
    '        self.assertIn("cross_origin_transition", self.core)\n',
    '        self.assertIn("cross_origin_transition", self.core)\n'
    '        self.assertIn("high_stakes_contact_unconfirmed", self.core)\n'
    '        self.assertIn("user_confirmed_controlled_primary", self.core)\n',
)
replace_once(
    "tests/test_application_assist_session_contract.py",
    '            "canonical Fill Plan",\n'
    '            "Load unpacked",\n',
    '            "canonical Fill Plan",\n'
    '            "high-stakes career contact",\n'
    '            "Load unpacked",\n',
)

# Documentation: control and reachability are user decisions; provenance alone is never authority.
replace_once(
    "docs/APPLICATION_ASSIST_SESSION.md",
    '- Imports are capped at 64 KiB, schema-checked, field-whitelisted, and never executed\n',
    '- Imports are capped at 64 KiB, schema-checked, field-whitelisted, and never executed\n'
    '- A stored/imported phone number is **not** automatically authorized for high-stakes career contact\n'
    '- Phone autofill requires the user to explicitly mark the number they control and prefer employers/recruiters to use\n'
    '- Provider, forwarding/relay status, and prior appearance are context only; they do not prove which number should represent the user\n',
)
replace_once(
    "docs/APPLICATION_ASSIST_SESSION.md",
    'questions. Unknown fields stay blank.\n\n## Hard safety boundary\n',
    'questions. Unknown fields stay blank.\n\n### High-stakes contact authority\n\nFor life-changing career opportunities, reachability and user control are explicit user choices rather than inferred metadata.\nA phone can remain stored locally without being eligible for autofill. EscapeHatch adds the phone to a canonical Fill Plan only when\n`contact_authority.phone` is `user_confirmed_controlled_primary`, set through the popup checkbox **Use this phone for high-stakes career contact**.\nLegacy profiles and imported profiles that contain a phone but no authority marker fail closed for that field; all other allowed fields continue normally.\nThis prevents an old, forwarding, relay, work, or merely observed number from silently becoming the contact channel for an application.\n\n## Hard safety boundary\n',
)

print("CONTACT_AUTHORITY_GUARD_PATCHED")
