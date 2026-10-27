/** Safe human-in-the-loop recovery classification for employer email verification.
 * Caller supplies a short, locally observed message. Do not persist addresses,
 * OTPs, form answers, or screen content in public logs.
 */
export type EmployerVerificationStage = 'email_entry' | 'verification_code' | 'unknown';
export type EmployerVerificationBlock = {
  code: 'EMAIL_ADDRESS_REJECTED' | 'VERIFICATION_CODE_REJECTED' | 'EMAIL_DELIVERY_UNCONFIRMED' | 'UNCLASSIFIED';
  aliasIncompatibilityProven: false;
  next: 'ASK_USER_APPROVED_EMAIL' | 'RETRY_USER_ENTERED_CODE' | 'CHECK_INBOX_OR_RESEND' | 'REINSPECT_EMPLOYER_FORM';
  mayAutomaticallyReplaceEmail: false;
  mayAutomaticallySubmitOrVerify: false;
};

export function classifyEmployerVerificationBlock(
  stage: EmployerVerificationStage,
  observedMessage: unknown,
): EmployerVerificationBlock {
  // Avoid retaining or echoing personal addresses and codes: classification only.
  const message = typeof observedMessage === 'string' ? observedMessage.slice(0, 2000).toLowerCase() : '';
  let code: EmployerVerificationBlock['code'] = 'UNCLASSIFIED';
  let next: EmployerVerificationBlock['next'] = 'REINSPECT_EMPLOYER_FORM';
  if (stage === 'email_entry' && /(?:invalid|unsupported|unaccepted|not accepted|disposable|temporary|blocked|rejected).{0,55}(?:email|e-mail|address|domain)|(?:email|e-mail|address|domain).{0,55}(?:invalid|unsupported|unaccepted|not accepted|disposable|temporary|blocked|rejected)/i.test(message)) {
    code = 'EMAIL_ADDRESS_REJECTED';
    next = 'ASK_USER_APPROVED_EMAIL';
  } else if (stage === 'verification_code' && /(?:incorrect|invalid|expired|wrong).{0,35}(?:code|otp)|(?:code|otp).{0,35}(?:incorrect|invalid|expired|wrong)/i.test(message)) {
    code = 'VERIFICATION_CODE_REJECTED';
    next = 'RETRY_USER_ENTERED_CODE';
  } else if (stage === 'verification_code' && /(?:not received|didn't receive|never arrived|not delivered|resend)/i.test(message)) {
    code = 'EMAIL_DELIVERY_UNCONFIRMED';
    next = 'CHECK_INBOX_OR_RESEND';
  }
  // Site refusal is evidence of refusal, not evidence of a specific VPN,
  // alias-provider, anti-spam, or email-delivery policy.
  return { code, next, aliasIncompatibilityProven: false, mayAutomaticallyReplaceEmail: false, mayAutomaticallySubmitOrVerify: false };
}
