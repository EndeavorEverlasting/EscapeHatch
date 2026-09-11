from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"expected owner text missing in {path}: {old[:140]!r}")
    if text.count(old) != 1:
        raise SystemExit(f"expected exactly one match in {path}, got {text.count(old)}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


core = ROOT / "browser/application-assist/assist-core.js"
replace_once(
    core,
    '  const SESSION_STATUSES = Object.freeze(["idle", "active", "paused", "stopped"]);\n',
    '  const SESSION_STATUSES = Object.freeze(["idle", "active", "paused", "stopped"]);\n'
    '  const PHONE_AUTHORITY_VALUES = Object.freeze(["unconfirmed", "user_confirmed_primary", "secondary_or_forwarded"]);\n\n'
    '  function phoneAuthority(profile) {\n'
    '    const raw = profile && typeof profile === "object" ? String(profile.phone_authority || "") : "";\n'
    '    return PHONE_AUTHORITY_VALUES.includes(raw) ? raw : "unconfirmed";\n'
    '  }\n',
)
replace_once(
    core,
    '  function policyGate(session, field, profileKey, proposedValue) {\n',
    '  function policyGate(session, field, profileKey, proposedValue, context) {\n',
)
replace_once(
    core,
    '    if (!proposedValue) {\n      return { allow: false, reason: "missing_user_value" };\n    }\n',
    '    if (!proposedValue) {\n      return { allow: false, reason: "missing_user_value" };\n    }\n'
    '    if (profileKey === "phone" && (!context || context.phone_authority !== "user_confirmed_primary")) {\n'
    '      return { allow: false, reason: "phone_contact_not_user_confirmed_primary" };\n'
    '    }\n',
)
replace_once(
    core,
    '    const clean = normalizeProfile(profile);\n    const items = [];\n',
    '    const clean = normalizeProfile(profile);\n    const contactAuthority = { phone_authority: phoneAuthority(profile) };\n    const items = [];\n',
)
replace_once(
    core,
    '      const gated = policyGate(session, field, key, clean[key]);\n',
    '      const gated = policyGate(session, field, key, clean[key], contactAuthority);\n',
)
replace_once(
    core,
    '    const clean = normalizeProfile(profile);\n    const elements = Array.from(documentObject.querySelectorAll("input, select"));\n',
    '    const clean = normalizeProfile(profile);\n    const contactAuthority = { phone_authority: phoneAuthority(profile) };\n    const elements = Array.from(documentObject.querySelectorAll("input, select"));\n',
)
replace_once(
    core,
    '      const gated = policyGate(session, live, item.profile_key, clean[item.profile_key]);\n',
    '      const gated = policyGate(session, live, item.profile_key, clean[item.profile_key], contactAuthority);\n',
)
replace_once(
    core,
    '    PROFILE_TO_QUESTION,\n    SESSION_STATUSES,\n',
    '    PROFILE_TO_QUESTION,\n    SESSION_STATUSES,\n    PHONE_AUTHORITY_VALUES,\n    phoneAuthority,\n',
)

popup_js = ROOT / "browser/application-assist/popup.js"
replace_once(
    popup_js,
    'const EXPORT_SCHEMA = "escapehatch-application-assist-profile/v1";\nconst LEGACY_EXPORT_SCHEMA = "escapehatch-application-autofill-profile/v1";\n',
    'const EXPORT_SCHEMA = "escapehatch-application-assist-profile/v2";\n'
    'const LEGACY_ASSIST_EXPORT_SCHEMA = "escapehatch-application-assist-profile/v1";\n'
    'const LEGACY_EXPORT_SCHEMA = "escapehatch-application-autofill-profile/v1";\n'
    'const PHONE_AUTHORITY_VALUES = ["unconfirmed", "user_confirmed_primary", "secondary_or_forwarded"];\n',
)
replace_once(
    popup_js,
    'function readForm() {\n  const profile = {};\n  for (const key of PROFILE_KEYS) {\n    const value = document.getElementById(key).value.trim();\n    if (value) profile[key] = value;\n  }\n  return profile;\n}\n',
    'function readForm() {\n'
    '  const profile = {};\n'
    '  for (const key of PROFILE_KEYS) {\n'
    '    const value = document.getElementById(key).value.trim();\n'
    '    if (value) profile[key] = value;\n'
    '  }\n'
    '  const authority = document.getElementById("phone_authority").value;\n'
    '  profile.phone_authority = PHONE_AUTHORITY_VALUES.includes(authority) ? authority : "unconfirmed";\n'
    '  return profile;\n'
    '}\n',
)
replace_once(
    popup_js,
    'function writeForm(profile) {\n  for (const key of PROFILE_KEYS) {\n    document.getElementById(key).value = profile && typeof profile[key] === "string" ? profile[key] : "";\n  }\n}\n',
    'function writeForm(profile) {\n'
    '  for (const key of PROFILE_KEYS) {\n'
    '    document.getElementById(key).value = profile && typeof profile[key] === "string" ? profile[key] : "";\n'
    '  }\n'
    '  const authority = profile && typeof profile.phone_authority === "string" ? profile.phone_authority : "unconfirmed";\n'
    '  document.getElementById("phone_authority").value = PHONE_AUTHORITY_VALUES.includes(authority) ? authority : "unconfirmed";\n'
    '}\n',
)
replace_once(
    popup_js,
    '  for (const key of PROFILE_KEYS) {\n    if (!(key in profile)) continue;\n    if (typeof profile[key] !== "string") {\n      throw new Error(`Profile field ${key} must be text.`);\n    }\n    const value = profile[key].trim();\n    if (value) clean[key] = value;\n  }\n  return clean;\n}\n',
    '  for (const key of PROFILE_KEYS) {\n'
    '    if (!(key in profile)) continue;\n'
    '    if (typeof profile[key] !== "string") {\n'
    '      throw new Error(`Profile field ${key} must be text.`);\n'
    '    }\n'
    '    const value = profile[key].trim();\n'
    '    if (value) clean[key] = value;\n'
    '  }\n'
    '  const authority = typeof profile.phone_authority === "string" ? profile.phone_authority : "unconfirmed";\n'
    '  if (!PHONE_AUTHORITY_VALUES.includes(authority)) {\n'
    '    throw new Error("Profile phone_authority is invalid.");\n'
    '  }\n'
    '  clean.phone_authority = authority;\n'
    '  return clean;\n'
    '}\n',
)
replace_once(
    popup_js,
    '  if (schema !== EXPORT_SCHEMA && schema !== LEGACY_EXPORT_SCHEMA) {\n    throw new Error("Import rejected: unsupported schema.");\n  }\n  const profile = sanitizeProfile(payload.profile);\n',
    '  if (schema !== EXPORT_SCHEMA && schema !== LEGACY_ASSIST_EXPORT_SCHEMA && schema !== LEGACY_EXPORT_SCHEMA) {\n'
    '    throw new Error("Import rejected: unsupported schema.");\n'
    '  }\n'
    '  const incoming = payload && payload.profile && typeof payload.profile === "object" ? { ...payload.profile } : payload.profile;\n'
    '  if (incoming && !Object.prototype.hasOwnProperty.call(incoming, "phone_authority")) incoming.phone_authority = "unconfirmed";\n'
    '  const profile = sanitizeProfile(incoming);\n',
)

popup_html = ROOT / "browser/application-assist/popup.html"
replace_once(
    popup_html,
    '    <label>Phone <input id="phone" type="tel" autocomplete="tel"></label>\n    <label class="wide">LinkedIn <input id="linkedin_url" type="url"></label>',
    '    <label>Phone <input id="phone" type="tel" autocomplete="tel"></label>\n'
    '    <label>Phone authority\n'
    '      <select id="phone_authority">\n'
    '        <option value="unconfirmed">Do not fill — not explicitly confirmed</option>\n'
    '        <option value="user_confirmed_primary">Primary career number I control</option>\n'
    '        <option value="secondary_or_forwarded">Secondary / forwarding / other</option>\n'
    '      </select>\n'
    '    </label>\n'
    '    <label class="wide">LinkedIn <input id="linkedin_url" type="url"></label>',
)
replace_once(
    popup_html,
    '    input { font: inherit; padding: 7px; min-width: 0; }\n',
    '    input, select { font: inherit; padding: 7px; min-width: 0; }\n',
)
replace_once(
    popup_html,
    '<p class="privacy">User-owned browser-local state. Writes go through a canonical Fill Plan and policy gate. Never auto-submits, never clicks Next/Continue, never attests.</p>',
    '<p class="privacy">User-owned browser-local state. Writes go through a canonical Fill Plan and policy gate. Phone is withheld unless you explicitly mark it as the primary career number you control. Never auto-submits, never clicks Next/Continue, never attests.</p>',
)

contract_path = ROOT / "contracts/application-assist-session.v1.json"
contract = json.loads(contract_path.read_text(encoding="utf-8"))
contract["portability"]["export_schema"] = "escapehatch-application-assist-profile/v2"
contract["portability"]["accepted_import_schemas"] = [
    "escapehatch-application-assist-profile/v2",
    "escapehatch-application-assist-profile/v1",
    "escapehatch-application-autofill-profile/v1",
]
if "legacy_phone_defaults_to_unconfirmed" not in contract["portability"]["security"]:
    contract["portability"]["security"].append("legacy_phone_defaults_to_unconfirmed")
rules = contract["policy_gate"]["rules"]
if "phone_requires_explicit_user_confirmed_primary_contact_authority" not in rules:
    rules.append("phone_requires_explicit_user_confirmed_primary_contact_authority")
contract["contact_authority"] = {
    "phone_values": ["unconfirmed", "user_confirmed_primary", "secondary_or_forwarded"],
    "default": "unconfirmed",
    "fill_requires": "user_confirmed_primary",
    "principle": "observed_or_previously_used_contact_is_not_preferred_contact_authority",
    "privacy_tradeoff": "operator_may_choose_a_more_direct_or_database_joining_channel_when_they_explicitly_value_control_and_reachability",
}
contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")

docs = ROOT / "docs/APPLICATION_ASSIST_SESSION.md"
replace_once(
    docs,
    '- Export schema: `escapehatch-application-assist-profile/v1`\n- Legacy autofill profile import remains accepted for portability from the PR #6 donor lane',
    '- Export schema: `escapehatch-application-assist-profile/v2`\n'
    '- v1 Assist and legacy autofill imports remain accepted, but any legacy phone defaults to **unconfirmed** and is withheld until the operator explicitly marks it primary\n'
    '- A phone being present, previously used, forwarded, or discovered elsewhere is not authority to use it for a life-changing application',
)
replace_once(
    docs,
    'Title/prefix, first name, last name, preferred name, email, phone, LinkedIn URL, street address, city,\nregion/state, postal code, and country. Matching prefers HTML `autocomplete` tokens and otherwise uses',
    'Title/prefix, first name, last name, preferred name, email, phone, LinkedIn URL, street address, city,\n'
    'region/state, postal code, and country. **Phone is special:** it is fillable only when the browser-local profile marks it `user_confirmed_primary`; `unconfirmed` and `secondary_or_forwarded` are fail-closed. Matching prefers HTML `autocomplete` tokens and otherwise uses',
)
replace_once(
    docs,
    '- overwrite existing or user-edited values\n',
    '- overwrite existing or user-edited values\n- infer that an observed, stale, forwarding, or merely known phone number is the operator\'s preferred high-stakes contact channel\n',
)

runtime_test = ROOT / "tests/test_application_assist_session.mjs"
replace_once(
    runtime_test,
    '  phone: "+1 555 010 0142",\n  linkedin_url:',
    '  phone: "+1 555 010 0142",\n  phone_authority: "user_confirmed_primary",\n  linkedin_url:',
)
replace_once(
    runtime_test,
    'assert.deepEqual(Object.keys(core.normalizeProfile(profile)).sort(), [...core.PROFILE_KEYS].sort());\n',
    'assert.deepEqual(Object.keys(core.normalizeProfile(profile)).sort(), [...core.PROFILE_KEYS].sort());\n'
    'assert.equal(core.phoneAuthority(profile), "user_confirmed_primary");\n'
    'assert.equal(core.phoneAuthority({ phone: "+1 555 010 0999" }), "unconfirmed");\n',
)
replace_once(
    runtime_test,
    'const plan = core.buildFillPlan(fields, profile, session);\n',
    'const plan = core.buildFillPlan(fields, profile, session);\n'
    'const unconfirmedPhonePlan = core.buildFillPlan(\n'
    '  [{ label: "Phone Number", value: "" }],\n'
    '  { phone: "+1 555 010 0999" },\n'
    '  session\n'
    ');\n'
    'assert.equal(unconfirmedPhonePlan.items.length, 0);\n'
    'assert.equal(unconfirmedPhonePlan.denied[0].decision, "phone_contact_not_user_confirmed_primary");\n'
    'const secondaryPhonePlan = core.buildFillPlan(\n'
    '  [{ label: "Phone Number", value: "" }],\n'
    '  { phone: "+1 555 010 0999", phone_authority: "secondary_or_forwarded" },\n'
    '  session\n'
    ');\n'
    'assert.equal(secondaryPhonePlan.items.length, 0);\n'
    'assert.equal(secondaryPhonePlan.denied[0].decision, "phone_contact_not_user_confirmed_primary");\n',
)
replace_once(
    runtime_test,
    'const wrote = core.fillDocument({ querySelectorAll: () => [phone] }, { phone: "+1 555 010 0142" }, undoSession);',
    'const wrote = core.fillDocument(\n  { querySelectorAll: () => [phone] },\n  { phone: "+1 555 010 0142", phone_authority: "user_confirmed_primary" },\n  undoSession\n);',
)

contract_test = ROOT / "tests/test_application_assist_session_contract.py"
replace_once(
    contract_test,
    '        self.assertTrue(self.contract["session"]["stop_cancels_future_writes"])\n',
    '        self.assertTrue(self.contract["session"]["stop_cancels_future_writes"])\n'
    '        self.assertIn("phone_requires_explicit_user_confirmed_primary_contact_authority", self.contract["policy_gate"]["rules"])\n'
    '        self.assertEqual(self.contract["contact_authority"]["default"], "unconfirmed")\n'
    '        self.assertEqual(self.contract["contact_authority"]["fill_requires"], "user_confirmed_primary")\n',
)
replace_once(
    contract_test,
    '        self.assertIn("escapehatch-application-assist-profile/v1", self.popup)\n',
    '        self.assertIn("escapehatch-application-assist-profile/v2", self.popup)\n'
    '        self.assertIn("escapehatch-application-assist-profile/v1", self.popup)\n'
    '        self.assertIn(\'id="phone_authority"\', self.html)\n'
    '        self.assertIn("user_confirmed_primary", self.popup)\n',
)
replace_once(
    contract_test,
    '        self.assertIn("preserve_existing_value", self.core)\n',
    '        self.assertIn("preserve_existing_value", self.core)\n'
    '        self.assertIn("phone_contact_not_user_confirmed_primary", self.core)\n',
)
replace_once(
    contract_test,
    '            "canonical Fill Plan",\n            "Load unpacked",\n',
    '            "canonical Fill Plan",\n            "user_confirmed_primary",\n            "Load unpacked",\n',
)

print("contact-authority patch staged")
