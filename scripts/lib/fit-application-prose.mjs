/**
 * Fit free-text application answers into a hard character budget without
 * mid-word or mid-sentence truncation. Used by prepare workflows that must
 * never paste broken prose into employer forms.
 */
export function fitApplicationProse(text, maxChars) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const limit = Number(maxChars);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('fit_application_prose_invalid_limit');
  }
  if (!raw) return { text: '', truncated: false, reason: 'empty' };
  if (raw.length <= limit) return { text: raw, truncated: false, reason: 'fits' };

  const sentences = raw.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [raw];
  let kept = '';
  for (const sentence of sentences) {
    const next = kept ? `${kept} ${sentence.trim()}` : sentence.trim();
    if (next.length <= limit) kept = next;
    else break;
  }
  if (kept && /[.!?]$/.test(kept)) {
    return { text: kept, truncated: true, reason: 'sentence_boundary' };
  }
  throw new Error(
    `fit_application_prose_cannot_fit_complete_sentence:need<=${limit},have=${raw.length}`,
  );
}
