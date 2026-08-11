import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../browser/application-autofill/autofill-core.js");

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
  [{ label: "Country", autocomplete: "country-name", type: "text" }, "country"]
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
  { label: "Job Title", type: "text" }
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
  linkedin_url: "https://www.linkedin.com/in/example-candidate",
  street_address: "123 Example Avenue",
  city: "Example City",
  region: "NY",
  postal_code: "00000",
  country: "US",
  extra_field: "must not survive"
};

assert.deepEqual(Object.keys(core.normalizeProfile(profile)).sort(), [...core.PROFILE_KEYS].sort());

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
  { label: "Resume", type: "file", value: "" }
];

const assignments = core.planAssignments(fields, profile);
assert.deepEqual(
  assignments.map((item) => item.key),
  ["name_prefix", "first_name", "email", "phone", "linkedin_url", "street_address", "city", "postal_code"]
);
assert.equal(assignments.some((item) => item.key === "last_name"), false, "existing value must be preserved");

const runtime = fs.readFileSync(new URL("../browser/application-autofill/content.js", import.meta.url), "utf8");
for (const forbidden of [".submit(", ".requestSubmit(", ".click(", "fetch(", "XMLHttpRequest", "WebSocket"]) {
  assert.equal(runtime.includes(forbidden), false, `runtime must not contain ${forbidden}`);
}

console.log("APPLICATION_AUTOFILL_RUNTIME_TESTS: PASS");
