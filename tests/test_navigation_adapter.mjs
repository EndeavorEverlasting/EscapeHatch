import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const progression = require("../browser/application-assist/progression.js");
const navigation = require("../browser/application-assist/navigation-adapter.js");

function fakeControl(label, extra = {}) {
  return {
    innerText: label,
    textContent: label,
    value: "",
    type: "button",
    disabled: false,
    clicks: 0,
    getAttribute(name) { return name === "aria-label" ? null : null; },
    click() { this.clicks += 1; },
    ...extra
  };
}

function fakeDocument(controls, fields = [], text = "Job application") {
  return {
    title: "Synthetic",
    body: { innerText: text },
    querySelectorAll(selector) {
      if (selector.includes("button")) return controls;
      if (selector === "input, select, textarea") return fields;
      return [];
    },
    querySelector() { return null; }
  };
}

const next = fakeControl("Continue");
const doc = fakeDocument([next], []);
const page = navigation.describeDocument(doc);
page.archetype = "identity-contact";
const plan = progression.buildProgressionPlan(page, { stable: true });
const live = navigation.buildLiveState(doc, {
  session: { status: "active" },
  archetype: "identity-contact",
  fillStable: true,
  pageId: "page-1"
});
const executed = navigation.executeGatedNavigation(plan, live, doc, progression);
assert.equal(executed.status, "dispatched");
assert.equal(executed.decision, "AUTO_ADVANCE_SAFE");
assert.equal(next.clicks, 1, "exactly one gated intermediate action may dispatch");

const submit = fakeControl("Submit Application");
const submitDoc = fakeDocument([submit], []);
const submitPage = navigation.describeDocument(submitDoc);
submitPage.archetype = "identity-contact";
const submitPlan = progression.buildProgressionPlan(submitPage, { stable: true });
const submitLive = navigation.buildLiveState(submitDoc, { session: { status: "active" }, archetype: "identity-contact", fillStable: true });
const submitResult = navigation.executeGatedNavigation(submitPlan, submitLive, submitDoc, progression);
assert.equal(submitResult.status, "blocked");
assert.equal(submit.clicks, 0, "final submit must never dispatch");

const changed = fakeControl("Different");
const changedDoc = fakeDocument([changed], []);
const changedResult = navigation.executeGatedNavigation(plan, navigation.buildLiveState(changedDoc, { session:{status:"active"}, archetype:"identity-contact", fillStable:true }), changedDoc, progression);
assert.equal(changedResult.status, "blocked");
assert.equal(changed.clicks, 0, "identity change between plan and execution must block");

const contentSource = fs.readFileSync(new URL("../browser/application-assist/content.js", import.meta.url), "utf8");
assert.ok(contentSource.includes('message.type === "advance"'), "content runtime must expose bounded advance command");
assert.ok(contentSource.includes("executeGatedNavigation"), "advance command must route through navigation adapter");
assert.equal(contentSource.includes(".click()"), false, "content runtime must not bypass the navigation adapter with direct clicks");

console.log("NAVIGATION_ADAPTER_TEST: PASS");
