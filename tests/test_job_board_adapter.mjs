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
console.log("JOB_BOARD_ADAPTER_SYNTHETIC: PASS");
