import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyEmployerVerificationBlock } from './employer-verification-recovery.ts';

test('explicit address rejection asks the operator for an approved alternative', () => {
  const result = classifyEmployerVerificationBlock('email_entry', 'This email address is not accepted.');
  assert.equal(result.code, 'EMAIL_ADDRESS_REJECTED');
  assert.equal(result.next, 'ASK_USER_APPROVED_EMAIL');
  assert.equal(result.aliasIncompatibilityProven, false);
  assert.equal(result.mayAutomaticallyReplaceEmail, false);
  assert.equal(result.mayAutomaticallySubmitOrVerify, false);
});
test('generic provider error does not establish alias incompatibility', () => {
  const result = classifyEmployerVerificationBlock('email_entry', 'There was a problem. Please try again.');
  assert.equal(result.code, 'UNCLASSIFIED');
  assert.equal(result.aliasIncompatibilityProven, false);
});
test('expired verification code is left to the operator', () => {
  const result = classifyEmployerVerificationBlock('verification_code', 'Code expired');
  assert.equal(result.code, 'VERIFICATION_CODE_REJECTED');
  assert.equal(result.next, 'RETRY_USER_ENTERED_CODE');
  assert.equal(result.mayAutomaticallySubmitOrVerify, false);
});
test('missing code prompts inbox check without bypass', () => {
  const result = classifyEmployerVerificationBlock('verification_code', 'Resend code');
  assert.equal(result.code, 'EMAIL_DELIVERY_UNCONFIRMED');
  assert.equal(result.next, 'CHECK_INBOX_OR_RESEND');
});
