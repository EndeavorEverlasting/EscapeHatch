import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const modality = require("../browser/application-assist/modality.js");

assert.equal(modality.detectMode({ coarsePointer: true }), "phone");
assert.equal(modality.detectMode({ narrowViewport: true }), "phone");
assert.equal(modality.detectMode({}), "mouse");
assert.equal(modality.detectMode({ keyboardFirst: true }), "keyboard");
assert.equal(modality.shouldAutofocusText("phone"), false);
assert.equal(modality.shouldAutofocusText("mouse"), true);

const calls = [];
for (const id of [
  "start_assist",
  "fill_allowed",
  "pause_session",
  "resume_session",
  "undo_last_fill",
  "emergency_stop",
  "record_confirmation",
  "save_profile",
  "clear_profile",
  "export_profile",
  "import_profile",
  "open_command_palette",
  "open_profile_panel",
  "dismiss_overlay"
]) {
  modality.registerHandler(id, (detail) => {
    calls.push({ id, detail, source: detail && detail._source });
    return { ran: id };
  });
}

function run(id, source) {
  return modality.invokeSemantic(id, source, { _source: source });
}

const mouse = run("fill_allowed", "click");
const keyboard = run("fill_allowed", "keyboard");
assert.equal(mouse.ok, true);
assert.equal(keyboard.ok, true);
assert.equal(mouse.actionId, keyboard.actionId);

const touch = run("emergency_stop", "touch");
assert.equal(touch.ok, true);
const dupClick = run("emergency_stop", "click");
assert.equal(dupClick.deduped, true);

const phoneHome = modality.phoneHomeActions().map((item) => item.id);
assert.ok(phoneHome.includes("start_assist"));
assert.ok(phoneHome.includes("fill_allowed"));
assert.ok(phoneHome.includes("open_profile_panel"));
assert.ok(!phoneHome.includes("save_profile"));

assert.equal(
  modality.shortcutAction({ key: "Escape", shiftKey: false, ctrlKey: false, metaKey: false, target: {} }),
  "dismiss_overlay"
);
assert.equal(
  modality.shortcutAction({ key: "Escape", shiftKey: true, ctrlKey: false, metaKey: false, target: {} }),
  "emergency_stop"
);
assert.equal(
  modality.shortcutAction({
    key: "f",
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: "INPUT" }
  }),
  null
);
assert.equal(
  modality.shortcutAction({
    key: "f",
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: "BODY" }
  }),
  "fill_allowed"
);
assert.equal(
  modality.shortcutAction({ key: "/", shiftKey: false, ctrlKey: false, metaKey: false, target: { tagName: "BODY" } }),
  "open_command_palette"
);

const filtered = modality.paletteActions("fill");
assert.ok(filtered.some((item) => item.id === "fill_allowed"));

console.log("MODALITY_HARNESS: PASS");
console.log(`calls=${calls.length}`);
console.log(`phone_home=${phoneHome.length}`);
