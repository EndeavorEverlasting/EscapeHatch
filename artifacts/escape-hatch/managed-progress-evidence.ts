/** Employer-side progress must follow checked DOM effects, never tool invocation. */
export type FillReadback = { filled: string[]; skipped: string[] };
export type AttachmentReadback = Record<string, string>;
export function fieldProgressState(outcome: FillReadback): string {
  if (!outcome.filled.length) return 'fields_unverified_review_required';
  if (outcome.skipped.length) return 'fields_partially_filled_review_required';
  return 'fields_filled_review_required';
}
export function attachmentProgressState(outcome: AttachmentReadback): string {
  const values = Object.values(outcome);
  if (!values.length || values.every(value => value !== 'attached_to_input_review_required')) {
    return 'attachments_unverified_review_required';
  }
  if (values.some(value => value !== 'attached_to_input_review_required')) {
    return 'attachments_partially_staged_review_required';
  }
  return 'attachments_staged_review_required';
}
export function evidenceDescription(state: string): string {
  switch (state) {
    case 'fields_unverified_review_required': return 'No employer form fields were verified as filled.';
    case 'fields_partially_filled_review_required': return 'Some fields were verified; remaining fields need review.';
    case 'fields_filled_review_required': return 'Attempted fields were read back on this page; employer acceptance is not proven.';
    case 'attachments_unverified_review_required': return 'No employer file input was verified as populated.';
    case 'attachments_partially_staged_review_required': return 'Some document inputs were populated; employer acceptance is not proven.';
    case 'attachments_staged_review_required': return 'File inputs were populated; upload acceptance remains unverified.';
    default: return 'Employer-side completion has not been verified.';
  }
}
