import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../browser/application-assist/assist-core.js");

const cases = [
  [{ label: "Title", tag: "select", type: "select-one" }, "name_prefix"],
  [{ label: "First Name *", name: "firstName", type: "text" }, "first_name"],
  [{ label: "Last Name *", type: "text" }, "last_name"],
  [{ label: "Preferred Name *", type: "text" }, "preferred_name"],
  [{ label: "Email *", type: "email" }, "email"],
  [{ label: "Phone Number *", type: "tel" }, "phone"],
  [{ label: "LinkedIn Profile", type: "url" }, "linkedin_url"],
  [{ label: "Home Street Address *", type: "text" }, "street_address"],
  [{ label: "City / Municipality *", type: "text" }, "city"],
  [{ label: "Zip Code *", type: "text" }, "postal_code"],
  [{ label: "State / Province", autocomplete: "address-level1", type: "text" }, "region"],
  [{ label: "Country", autocomplete: "country-name", type: "text" }, "country"],
  [{ autocomplete: "given-name", type: "text" }, "first_name"],
  [{ autocomplete: "shipping address-level1", type: "text" }, "region"]
];
for (const [descriptor, expected] of cases) {
  assert.equal(core.classifyField(descriptor), expected, JSON.stringify(descriptor));
}

for (const descriptor of [
  { label: "Are you legally authorized to work?", type: "text" },
  { label: "Why do you want this job?", tag: "textarea", type: "text" },
  { label: "Resume", type: "file" },
  { label: "Password", type: "password" },
  { label: "Submit Application", type: "submit" },
  { label: "Job Title", type: "text" },
  { label: "Email", type: "email", hidden: true },
  { label: "I certify that this information is true and accurate", type: "checkbox" }
]) {
  assert.equal(core.classifyField(descriptor), null, `unexpected match: ${JSON.stringify(descriptor)}`);
}

const profile = {
  name_prefix: "Mr.",
  first_name: "Alex",
  last_name: "Example",
  preferred_name: "Alex",
  email: "alex@example.invalid",
  phone: "+1 555 010 0142",
  phone_authority: "user_confirmed_primary",
  linkedin_url: "https://www.linkedin.com/in/example-candidate",
  street_address: "123 Example Avenue",
  city: "Example City",
  region: "NY",
  postal_code: "00000",
  country: "US",
  extra_field: "must not survive"
};
assert.deepEqual(Object.keys(core.normalizeProfile(profile)).sort(), [...core.PROFILE_KEYS].sort());
assert.equal(core.phoneAuthority(profile), "user_confirmed_primary");
assert.equal(core.phoneAuthority({ phone: "+1 555 010 0999" }), "unconfirmed");

const session = core.createSession({ origin: "https://jobs.example.invalid" });
assert.equal(session.status, "active");

const fields = [
  { label: "Title", tag: "select", value: "", options: [{ value: "", text: "Select a title" }, { value: "Mr.", text: "Mr." }] },
  { label: "First Name", value: "" },
  { label: "Last Name", value: "Already Present" },
  { label: "Email", value: "" },
  { label: "Phone Number", value: "" },
  { label: "LinkedIn Profile", value: "" },
  { label: "Home Street Address", value: "" },
  { label: "City / Municipality", value: "" },
  { label: "Zip Code", value: "" },
  { label: "Questionnaire response", value: "" },
  { label: "Resume", type: "file", value: "" },
  { label: "Email", type: "email", hidden: true, value: "" }
];

const plan = core.buildFillPlan(fields, profile, session);
const unconfirmedPhonePlan = core.buildFillPlan(
  [{ label: "Phone Number", value: "" }],
  { phone: "+1 555 010 0999" },
  session
);
assert.equal(unconfirmedPhonePlan.items.length, 0);
assert.equal(unconfirmedPhonePlan.denied[0].decision, "phone_contact_not_user_confirmed_primary");
const secondaryPhonePlan = core.buildFillPlan(
  [{ label: "Phone Number", value: "" }],
  { phone: "+1 555 010 0999", phone_authority: "secondary_or_forwarded" },
  session
);
assert.equal(secondaryPhonePlan.items.length, 0);
assert.equal(secondaryPhonePlan.denied[0].decision, "phone_contact_not_user_confirmed_primary");
assert.equal(plan.schema_version, "escapehatch-application-fill-plan/v1");
assert.deepEqual(
  plan.items.map((item) => item.profile_key),
  ["name_prefix", "first_name", "email", "phone", "linkedin_url", "street_address", "city", "postal_code"]
);
assert.equal(
  plan.items.every((item) => item.decision === "gate_allowed"),
  true
);
assert.equal(
  plan.denied.some((item) => item.decision === "preserve_existing_value"),
  true,
  "existing values must be denied by the policy gate"
);
assert.equal(
  plan.denied.some((item) => item.decision === "unknown_fields_stay_blank"),
  true
);

const paused = core.pauseSession(session, "user_pause");
const pausedPlan = core.buildFillPlan(fields, profile, paused);
assert.equal(pausedPlan.items.length, 0);
assert.equal(pausedPlan.denied.every((item) => item.decision === "session_not_active" || item.decision === "unknown_fields_stay_blank" || item.decision === "unsupported_control"), true);

const stopped = core.stopSession(session);
assert.equal(stopped.status, "stopped");
assert.throws(() => core.resumeSession(stopped, session.origin), /Emergency Stop/);

const crossOrigin = core.observeOrigin(session, "https://other.example.invalid");
assert.equal(crossOrigin.status, "paused");
assert.equal(crossOrigin.pause_reason, "cross_origin_transition");

class FakeInput extends EventTarget {
  constructor({ label, autocomplete = "", value = "", type = "text", name = "", id = "", hidden = false }) {
    super();
    this.tagName = "INPUT";
    this.type = type;
    this.name = name;
    this.id = id;
    this.placeholder = "";
    this.disabled = false;
    this.readOnly = false;
    this.hidden = hidden;
    this.isConnected = true;
    this.labels = [{ textContent: label }];
    this._attrs = { autocomplete };
    this._value = value;
  }
  get value() {
    return this._value;
  }
  set value(next) {
    this._value = String(next);
  }
  getAttribute(name) {
    return this._attrs[name] || "";
  }
}

const first = new FakeInput({ label: "First Name", autocomplete: "given-name" });
const email = new FakeInput({ label: "Email", autocomplete: "email" });
const events = [];
first.addEventListener("input", () => {
  events.push("first:input");
  email.value = "framework@already.invalid";
});
first.addEventListener("change", () => events.push("first:change"));
email.addEventListener("input", () => events.push("email:input"));
email.addEventListener("change", () => events.push("email:change"));

const active = core.createSession({ origin: "https://jobs.example.invalid" });
const filled = core.fillDocument(
  { querySelectorAll: () => [first, email] },
  { first_name: "Alex", email: "alex@example.invalid" },
  active
);
assert.equal(first.value, "Alex");
assert.equal(email.value, "framework@already.invalid", "reactive fill must not be overwritten by a stale plan");
assert.deepEqual(events, ["first:input", "first:change"]);
assert.equal(filled.filled, 1);
assert.deepEqual(filled.matched_fields, ["first_name"]);
assert.ok(filled.plan.items.length >= 1);
assert.equal(filled.session.fill_stack.length, 1);

const afterStop = core.stopSession(filled.session);
const blocked = core.fillDocument(
  { querySelectorAll: () => [new FakeInput({ label: "Last Name" })] },
  { last_name: "Example" },
  afterStop
);
assert.equal(blocked.filled, 0);
assert.equal(blocked.skipped_reason, "session_not_active");

const phone = new FakeInput({ label: "Phone Number", autocomplete: "tel" });
const undoSession = core.createSession({ origin: "https://jobs.example.invalid" });
const wrote = core.fillDocument(
  { querySelectorAll: () => [phone] },
  { phone: "+1 555 010 0142", phone_authority: "user_confirmed_primary" },
  undoSession
);
assert.equal(phone.value, "+1 555 010 0142");
const undone = core.undoLastFill({ querySelectorAll: () => [phone] }, wrote.session);
assert.equal(undone.undone, 1);
assert.equal(phone.value, "");

const edited = new FakeInput({ label: "City", value: "" });
const editSession = core.createSession({ origin: "https://jobs.example.invalid" });
const cityWrite = core.fillDocument({ querySelectorAll: () => [edited] }, { city: "Example City" }, editSession);
edited.value = "User Edited City";
const skipUndo = core.undoLastFill({ querySelectorAll: () => [edited] }, cityWrite.session);
assert.equal(skipUndo.undone, 0);
assert.equal(skipUndo.skipped, 1);
assert.equal(edited.value, "User Edited City");

const confirmed = core.recordConfirmation(session, {
  source: "same_session_page_confirmation",
  application_id: "https://jobs.example.invalid"
});
assert.equal(confirmed.confirmation.source, "same_session_page_confirmation");

assert.throws(
  () =>
    core.applyFillPlan(
      { querySelectorAll: () => [] },
      {
        schema_version: "not-a-plan",
        items: [{ decision: "gate_allowed", index: 0, profile_key: "email", value: "alex@example.invalid" }]
      },
      { email: "alex@example.invalid" },
      session
    ),
  /canonical Fill Plan/
);

const runtime = fs.readFileSync(new URL("../browser/application-assist/content.js", import.meta.url), "utf8");
const coreSource = fs.readFileSync(new URL("../browser/application-assist/assist-core.js", import.meta.url), "utf8");
for (const forbidden of [".submit(", ".requestSubmit(", ".click(", "fetch(", "XMLHttpRequest", "WebSocket"]) {
  assert.equal(runtime.includes(forbidden), false, `runtime must not contain ${forbidden}`);
  assert.equal(coreSource.includes(forbidden), false, `core must not contain ${forbidden}`);
}
assert.equal(coreSource.includes("canonical Fill Plan"), true);

console.log("APPLICATION_ASSIST_SESSION_RUNTIME_TESTS: PASS");
