import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const board = require("../browser/application-assist/job-board-adapter.js");
const questions = board.classify("https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1");
assert.equal(questions.provider, "indeed");
assert.equal(questions.stage, "EMPLOYER_QUESTIONS");
assert.equal(questions.mayAdvance, false);
assert.equal(questions.maySubmit, false);
assert.equal(questions.mayPrepareAfterPolicyGate, true);
const resume = board.classify("https://smartapply.indeed.com/beta/indeedapply/form/resume-module/structured-data-review");
assert.equal(resume.stage, "RESUME");
const listing = board.classify("https://www.indeed.com/viewjob?jk=aaaaaaaaaaaaaaaa&from=shareddesktop_copy");
assert.equal(listing.opportunityKey, "indeed:aaaaaaaaaaaaaaaa");
assert.equal(listing.mayPrepareAfterPolicyGate, false);
for (const url of [
  "http://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1",
  "https://smartapply.indeed.com.evil.invalid/beta/indeedapply/form/questions-module/questions/1",
  "https://www.indeed.com.evil.invalid/viewjob?jk=aaaaaaaaaaaaaaaa",
  "https://user@smartapply.indeed.com/beta/indeedapply/form/questions-module",
  "https://smartapply.indeed.com:444/beta/indeedapply/form/questions-module"
]) assert.equal(board.classify(url).supported, false);
for (const host of ["www.ziprecruiter.com", "www.glassdoor.com"]) {
  const x = board.classify("https://" + host + "/apply/example");
  assert.equal(x.mayAdvance, false);
  assert.equal(x.supported, false);
  assert.equal(x.reason, "needs_provider_form_archetype");
}
assert.equal(board.canAttachToOpportunity(questions, null).attached, false);
assert.equal(board.canAttachToOpportunity(questions, { operatorSelected: true,
  provider: "indeed", opportunityKey: "indeed:aaaaaaaaaaaaaaaa",
  expectedFormOrigin: "https://smartapply.indeed.com" }).attached, false);
assert.equal(board.canAttachToOpportunity(questions, { operatorSelected: true,
  provider: "indeed", opportunityKey: "indeed:aaaaaaaaaaaaaaaa",
  expectedFormOrigin: "https://smartapply.indeed.com",
  trustedTransitionObserved: true, formTabId: 10, formSessionNonce: "synthetic-nonce",
  expectedSessionNonce: "synthetic-nonce" }).attached, true);
assert.equal(board.canAttachToOpportunity(questions, { operatorSelected: true,
  provider: "indeed", opportunityKey: "indeed:aaaaaaaaaaaaaaaa",
  expectedFormOrigin: "https://smartapply.indeed.com",
  trustedTransitionObserved: true, formTabId: 10, formSessionNonce: "wrong-nonce",
  expectedSessionNonce: "synthetic-nonce" }).attached, false);
assert.equal(board.canAttachToOpportunity(questions, { operatorSelected: true,
  provider: "indeed", opportunityKey: "indeed:aaaaaaaaaaaaaaaa",
  expectedFormOrigin: "https://evil.invalid" }).attached, false);
assert.equal(board.classify("https://smartapply.indeed.com/beta/indeedapply/form/unknown-module/x").mayPrepareAfterPolicyGate, false);

const supporting = board.classify("https://smartapply.indeed.com/beta/indeedapply/form/supporting-documents-module/cover-letter");
const ownerSelected = {
  operatorSelected: true, provider: "indeed", opportunityKey: "indeed:aaaaaaaaaaaaaaaa",
  workspaceOwnerId: "synthetic-applicant-a", expectedFormOrigin: "https://smartapply.indeed.com",
  trustedTransitionObserved: true, formTabId: 10,
  formSessionNonce: "synthetic-nonce", expectedSessionNonce: "synthetic-nonce"
};
const reviewedLetter = {
  kind: "cover_letter", reviewed: true, opportunityKey: ownerSelected.opportunityKey,
  ownerId: ownerSelected.workspaceOwnerId,
  paragraphs: ["Hi, Hiring Team.", "Synthetic work across field\n operations.", "Sincerely,\nSynthetic Applicant"]
};
const textForm = { heading: "Supporting documents",
  fields: [{ tag: "textarea", label: "Cover letter", visible: true, value: "", maxLength: 4000 }] };
const planned = board.planIndeedCoverLetterText(supporting, ownerSelected, reviewedLetter, textForm);
assert.equal(planned.state, "TEXT_PLAN_READY");
assert.equal(planned.text, "Hi, Hiring Team.\n\nSynthetic work across field operations.\n\nSincerely, Synthetic Applicant");
assert.equal(planned.characters, planned.text.length);
assert.equal(planned.userFinalSubmit, "OPERATOR_ONLY");
assert.equal(planned.employerAcceptance, "UNVERIFIED");
assert.equal(board.planIndeedCoverLetterText(supporting, { ...ownerSelected, workspaceOwnerId: "synthetic-applicant-b" }, reviewedLetter, textForm).reason, "applicant_owner_unverified");
assert.equal(board.planIndeedCoverLetterText(supporting, ownerSelected, { ...reviewedLetter, opportunityKey: "indeed:bbbbbbbbbbbbbbbb" }, textForm).reason, "reviewed_role_letter_required");
assert.equal(board.planIndeedCoverLetterText(supporting, { ...ownerSelected, trustedTransitionObserved: false }, reviewedLetter, textForm).reason, "unverified_form_session");
assert.equal(board.planIndeedCoverLetterText(supporting, ownerSelected, reviewedLetter, { ...textForm,
  fields: [{ ...textForm.fields[0], value: "Applicant edit" }] }).reason, "preserve_existing_applicant_edit");
assert.equal(board.planIndeedCoverLetterText(supporting, ownerSelected, reviewedLetter, { ...textForm,
  fields: [...textForm.fields, ...textForm.fields] }).reason, "unique_editable_cover_letter_textarea_required");
assert.equal(board.planIndeedCoverLetterText(supporting, ownerSelected, reviewedLetter, { ...textForm,
  fields: [{ ...textForm.fields[0], tag: "div" }] }).reason, "unique_editable_cover_letter_textarea_required");
assert.equal(board.planIndeedCoverLetterText(supporting, ownerSelected, { ...reviewedLetter,
  paragraphs: ["a".repeat(4001)] }, textForm).reason, "text_exceeds_observed_limit");
assert.equal(board.planIndeedCoverLetterText(supporting, ownerSelected, reviewedLetter, { ...textForm,
  fields: [{ ...textForm.fields[0], maxLength: 60 }] }).reason, "text_exceeds_observed_limit");
assert.equal(board.planIndeedCoverLetterText(supporting, ownerSelected, reviewedLetter, { ...textForm,
  heading: "EEO disclosure" }).reason, "supporting_document_section_unverified");
assert.equal(board.indeedResumeUploadImpact(supporting, "resume").state, "OPERATOR_APPROVAL_REQUIRED");
assert.equal(board.indeedResumeUploadImpact(supporting, "resume").effect, "REPLACES_ONE_GLOBAL_INDEED_RESUME");
assert.equal(board.indeedResumeUploadImpact(supporting, "cover").state, "REVIEW_REQUIRED");

class FakeTextArea {
  constructor(value = "") { this._value = value; this.events = []; this.maxLength = 4000; this.isConnected = true; this.disabled = false; this.readOnly = false; }
  get value() { return this._value; }
  set value(value) { this._value = value; }
  getAttribute(name) { return name === "aria-label" ? "Cover letter" : null; }
  getClientRects() { return [{ width: 100, height: 50 }]; }
  dispatchEvent(event) { this.events.push(event.type); return true; }
}
const fakeView = { HTMLTextAreaElement: FakeTextArea,
  Event: class { constructor(type, options) { this.type = type; this.bubbles = options?.bubbles; } },
  getComputedStyle: () => ({ visibility: "visible" }) };
function syntheticSupportingForm(options = {}) {
  const area = options.area || new FakeTextArea(options.previousValue || "");
  const headings = options.headings === undefined ? [{ textContent: "Supporting documents" }] : options.headings;
  const fields = options.fields || [area];
  const documentObject = {
    location: { href: options.url || "https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1" },
    defaultView: options.view === undefined ? fakeView : options.view,
    querySelectorAll(selector) {
      if (selector === "h1,h2,h3,[role=heading]") return headings;
      if (selector === "textarea") return fields;
      throw new Error("Unsupported synthetic selector: " + selector);
    }
  };
  return { area, documentObject };
}
const live = syntheticSupportingForm();
const result = board.writeIndeedCoverLetterText(live.documentObject, ownerSelected, reviewedLetter);
assert.equal(result.state, "FIELD_READBACK_ONLY");
assert.equal(result.filled, true);
assert.equal(result.maySubmit, false);
assert.equal(result.employerAcceptance, "UNVERIFIED");
assert.equal(live.area.value, planned.text);
assert.deepEqual(live.area.events, ["input", "change"]);
const existing = syntheticSupportingForm({ previousValue: "My approved text already in the form" });
assert.equal(board.writeIndeedCoverLetterText(existing.documentObject, ownerSelected, reviewedLetter).reason, "preserve_existing_applicant_edit");
assert.equal(existing.area.value, "My approved text already in the form");
const wrongApplicant = syntheticSupportingForm();
assert.equal(board.writeIndeedCoverLetterText(wrongApplicant.documentObject,
  { ...ownerSelected, workspaceOwnerId: "wrong-applicant" }, reviewedLetter).reason, "applicant_owner_unverified");
assert.equal(wrongApplicant.area.value, "");
const staleNonce = syntheticSupportingForm();
assert.equal(board.writeIndeedCoverLetterText(staleNonce.documentObject,
  { ...ownerSelected, formSessionNonce: "stale-nonce" }, reviewedLetter).reason, "unverified_form_session");
assert.equal(staleNonce.area.value, "");
const wrongRequisition = syntheticSupportingForm();
assert.equal(board.writeIndeedCoverLetterText(wrongRequisition.documentObject, ownerSelected,
  { ...reviewedLetter, opportunityKey: "indeed:bbbbbbbbbbbbbbbb" }).reason, "reviewed_role_letter_required");
assert.equal(wrongRequisition.area.value, "");
const ambiguouslyLabelled = syntheticSupportingForm({ fields: [new FakeTextArea(), new FakeTextArea()] });
assert.equal(board.writeIndeedCoverLetterText(ambiguouslyLabelled.documentObject, ownerSelected, reviewedLetter).reason,
  "unique_editable_cover_letter_textarea_required");
const noHeading = syntheticSupportingForm({ headings: [] });
assert.equal(board.writeIndeedCoverLetterText(noHeading.documentObject, ownerSelected, reviewedLetter).reason,
  "unique_supporting_document_heading_required");
const unrecognizedRoute = syntheticSupportingForm({ url: "https://smartapply.indeed.com/beta/indeedapply/form/unknown-module/1" });
assert.equal(board.writeIndeedCoverLetterText(unrecognizedRoute.documentObject, ownerSelected, reviewedLetter).reason,
  "recognized_indeed_form_required");
const noNativeSetter = syntheticSupportingForm({ view: { Event: fakeView.Event } });
assert.equal(board.writeIndeedCoverLetterText(noNativeSetter.documentObject, ownerSelected, reviewedLetter).reason,
  "safe_native_textarea_writer_unavailable");
const badEventArea = new FakeTextArea();
badEventArea.dispatchEvent = () => { throw new Error("synthetic dispatch failure"); };
const badEvent = syntheticSupportingForm({ area: badEventArea });
assert.equal(board.writeIndeedCoverLetterText(badEvent.documentObject, ownerSelected, reviewedLetter).reason,
  "native_textarea_write_failed_recheck_required");

assert.equal(board.planIndeedCoverLetterText(supporting, ownerSelected, reviewedLetter, { ...textForm,
  fields: [{ ...textForm.fields[0], maxLength: 0 }] }).reason, "text_exceeds_observed_limit");
const disabledFieldset = syntheticSupportingForm();
disabledFieldset.area.matches = selector => selector === ":disabled";
assert.equal(board.writeIndeedCoverLetterText(disabledFieldset.documentObject, ownerSelected, reviewedLetter).reason,
  "unique_editable_cover_letter_textarea_required");
assert.equal(disabledFieldset.area.value, "");
const routeChange = syntheticSupportingForm();
routeChange.area.dispatchEvent = () => {
  routeChange.documentObject.location.href = "https://smartapply.indeed.com/beta/indeedapply/form/review-module";
};
assert.equal(board.writeIndeedCoverLetterText(routeChange.documentObject, ownerSelected, reviewedLetter).reason,
  "textarea_readback_mismatch");
for (const mutation of [
  selected => { selected.workspaceOwnerId = "foreign-owner"; },
  selected => { selected.expectedSessionNonce = "replaced-session"; },
  selected => { selected.trustedTransitionObserved = false; }
]) {
  const selected = { ...ownerSelected }, changed = syntheticSupportingForm();
  changed.area.dispatchEvent = () => mutation(selected);
  assert.equal(board.writeIndeedCoverLetterText(changed.documentObject, selected, reviewedLetter).reason,
    "textarea_readback_mismatch");
}

console.log("JOB_BOARD_ADAPTER_SYNTHETIC: PASS");

// Opt-in disposable DOM proof. All requests are intercepted: this never opens
// an employer session and cannot establish employer acceptance or persistence.
// Run after installing the cockpit's declared Playwright dependency and Chromium:
// node tests/test_job_board_adapter.mjs --browser
if (process.argv.includes("--browser")) {
  const cockpitRequire = createRequire(new URL("../artifacts/escape-hatch/package.json", import.meta.url));
  const { chromium } = cockpitRequire("@playwright/test");
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../browser/application-assist/job-board-adapter.js", import.meta.url), "utf8");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: `
      <!doctype html><h1>Supporting documents</h1>
      <fieldset><label for="cover">Cover letter</label><textarea id="cover" maxlength="4000"></textarea></fieldset>
      <button type="button">Continue</button><button type="button">Submit</button>
    ` }));
    const url = "https://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1";
    async function runCase(mode) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
      await page.addScriptTag({ content: source });
      return page.evaluate(async ({ selected, artifact, mode }) => {
        const area = document.querySelector("textarea");
        const events = [];
        let clicks = 0;
        document.addEventListener("click", () => clicks++);
        area.addEventListener("input", () => {
          events.push("input");
          if (mode === "route-change") history.pushState({}, "", "/beta/indeedapply/form/review-module");
          if (mode === "rerender") {
            const replacement = area.cloneNode();
            replacement.value = "";
            area.replaceWith(replacement);
          }
        });
        area.addEventListener("change", () => events.push("change"));
        if (mode === "existing-edit") area.value = "Preserved applicant edit";
        if (mode === "disabled-fieldset") area.closest("fieldset").disabled = true;
        if (mode === "zero-limit") area.maxLength = 0;
        if (mode === "foreign-owner") selected.workspaceOwnerId = "foreign-owner";
        const result = EscapeHatchJobBoard.writeIndeedCoverLetterText(document, selected, artifact);
        // A separate browser turn observes the surviving control, rather than
        // equating synchronous setter readback with React or employer persistence.
        await new Promise(resolve => setTimeout(resolve, 50));
        return { result, value: document.querySelector("textarea").value, events, clicks };
      }, { selected: ownerSelected, artifact: reviewedLetter, mode });
    }
    const success = await runCase("success");
    assert.equal(success.result.state, "FIELD_READBACK_ONLY");
    assert.equal(success.value, planned.text);
    assert.deepEqual(success.events, ["input", "change"]);
    assert.equal(success.clicks, 0);
    for (const [mode, reason, value] of [
      ["existing-edit", "preserve_existing_applicant_edit", "Preserved applicant edit"],
      ["disabled-fieldset", "unique_editable_cover_letter_textarea_required", ""],
      ["zero-limit", "text_exceeds_observed_limit", ""],
      ["foreign-owner", "applicant_owner_unverified", ""],
      ["route-change", "textarea_readback_mismatch", planned.text],
      ["rerender", "textarea_readback_mismatch", ""]
    ]) {
      const observed = await runCase(mode);
      assert.equal(observed.result.reason, reason, mode);
      assert.equal(observed.value, value, mode);
      assert.equal(observed.clicks, 0, mode);
    }
    console.log("JOB_BOARD_ADAPTER_CHROMIUM_FIXTURE: PASS (7 cases; intercepted DOM only; no employer session)");
  } finally {
    await browser.close();
  }
}
