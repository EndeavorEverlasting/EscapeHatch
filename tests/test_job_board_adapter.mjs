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
const listing = board.classify("https://www.indeed.com/viewjob?jk=3ac648c2c798f4da&from=shareddesktop_copy");
assert.equal(listing.opportunityKey, "indeed:3ac648c2c798f4da");
assert.equal(listing.mayPrepareAfterPolicyGate, false);
for (const url of [
  "http://smartapply.indeed.com/beta/indeedapply/form/questions-module/questions/1",
  "https://smartapply.indeed.com.evil.invalid/beta/indeedapply/form/questions-module/questions/1",
  "https://www.indeed.com.evil.invalid/viewjob?jk=3ac648c2c798f4da",
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
  provider: "indeed", opportunityKey: "indeed:3ac648c2c798f4da",
  expectedFormOrigin: "https://smartapply.indeed.com" }).attached, true);
assert.equal(board.canAttachToOpportunity(questions, { operatorSelected: true,
  provider: "indeed", opportunityKey: "indeed:3ac648c2c798f4da",
  expectedFormOrigin: "https://evil.invalid" }).attached, false);
assert.equal(board.classify("https://smartapply.indeed.com/beta/indeedapply/form/unknown-module/x").mayPrepareAfterPolicyGate, false);
console.log("JOB_BOARD_ADAPTER_SYNTHETIC: PASS");
