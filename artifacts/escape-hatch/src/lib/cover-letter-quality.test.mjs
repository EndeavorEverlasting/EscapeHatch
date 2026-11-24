import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCoverLetter } from './cover-letter-quality.mjs';

const base = {
  text: "Dear Example Works Hiring Team,\n\nI'm applying for the Systems Coordinator position.\n\nSincerely,\n\nExample Candidate",
  employer: "Example Works", role: "Systems Coordinator", signature: "Example Candidate"
};
test("clean text is still review-required; no invented quality ratings or outcomes", () => {
  const result = evaluateCoverLetter(base);
  assert.equal(result.release, "REVIEW_REQUIRED");
  assert.deepEqual(result.findings, []);
  assert.equal(result.dimensions.CL06.state, "PASS");
  for (const id of ["CL02","CL03","CL04","CL05","CL07","CL09","CL10"]) {
    assert.equal(result.dimensions[id].state, "UNSCORED");
  }
  assert.equal(result.dimensions.CL08.paragraphs, 4);
});
const hazards = [
  ["PLACEHOLDER", "[Your achievement]"],
  ["PLACEHOLDER", "{{company}}"],
  ["PLACEHOLDER", "${name}"],
  ["TEMPLATE_INSTRUCTION", "Insert your achievements here"],
  ["TEMPLATE_INSTRUCTION", "Here is your revised cover letter"],
  ["MARKUP", "```text"],
  ["MARKUP", "**Example**"],
  ["AI_META", "As an AI language model"]
];
for (const [code, hazard] of hazards) {
  test("blocks " + code + ": " + hazard, () => {
    const result = evaluateCoverLetter({...base, text: hazard + "\n" + base.text});
    assert.equal(result.release, "REJECT");
    assert.ok(result.findings.includes(code));
  });
}
for (const [key, code] of [["employer","EMPLOYER_MISSING"],["role","ROLE_MISSING"],["signature","SIGNATURE_MISMATCH"]]) {
  test("blocks mismatched " + key, () => {
    const result = evaluateCoverLetter({...base, [key]: "Another value"});
    assert.equal(result.release, "REJECT");
    assert.ok(result.findings.includes(code));
  });
}
test("exact approval and a one-character change remain distinct", () => {
  assert.equal(evaluateCoverLetter({...base, approvedText: base.text}).dimensions.CL09.state, "PASS");
  assert.equal(evaluateCoverLetter({...base, approvedText: base.text + " "}).release, "REJECT");
});
test("normal contractions and material contrast remain permitted", () => {
  const text = base.text.replace("I'm applying", "I value not only quality but also clarity. I'm applying");
  assert.deepEqual(evaluateCoverLetter({...base, text}).findings, []);
});
test("missing expectations and invalid approval fail closed", () => {
  assert.throws(() => evaluateCoverLetter({text: "hello"}), TypeError);
  assert.throws(() => evaluateCoverLetter({...base, approvedText: null}), TypeError);
});
