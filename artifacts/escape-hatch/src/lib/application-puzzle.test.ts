import assert from 'node:assert/strict';
import test from 'node:test';
import { projectApplicationPuzzle, sameApplicationUrl, type FormInspection, INSPECTION_MAX_AGE_MS } from './application-puzzle';
import { assertInspectionScope } from '../../application-requirements';

const now = Date.now();
const inspection: FormInspection = { opportunityId: 'one', applicationUrl: 'https://example.invalid/job/1', pageUrl: 'https://example.invalid/job/1/apply', capturedAt: new Date(now).toISOString(), scope: 'current_page_only', requirements: [
  { id: 'resume', label: 'Résumé', kind: 'resume', requirement: 'required', populated: false },
  { id: 'cover', label: 'Cover letter', kind: 'cover', requirement: 'optional', populated: false },
  { id: 'custom', label: 'Custom control', kind: 'question', requirement: 'unknown', populated: false },
] };
const currentPage = { opportunityId: 'one', applicationUrl: inspection.applicationUrl, pageUrl: inspection.pageUrl };
test('required, optional and unknown remain distinct; no complete-application authority', () => {
  const result = projectApplicationPuzzle(inspection, 'one', inspection.applicationUrl, now, currentPage);
  assert.equal(result.requiredCount, 1);
  assert.equal(result.unresolvedCount, 1);
  assert.equal(result.unknownCount, 1);
  assert.equal(result.preparationReady, false);
  assert.equal(result.finalSubmitAuthorized, false);
  const populated = { ...inspection, requirements: inspection.requirements.map(piece => ({ ...piece, populated: true })) };
  assert.equal(projectApplicationPuzzle(populated, 'one', inspection.applicationUrl, now, currentPage).preparationReady, false);
});
test('missing, stale, future, wrong job or changed URL evidence is never reused', () => {
  for (const [value, id, url, time] of [
    [null, 'one', inspection.applicationUrl, now],
    [inspection, 'two', inspection.applicationUrl, now],
    [inspection, 'one', 'https://example.invalid/job/2', now],
    [inspection, 'one', inspection.applicationUrl, now + INSPECTION_MAX_AGE_MS + 1],
    [inspection, 'one', inspection.applicationUrl, now - 1],
  ] as const) {
    const result = projectApplicationPuzzle(value, id, url, time, currentPage);
    assert.equal(result.current, false); assert.deepEqual(result.pieces, []);
  }
});
test('current-page observations invalidate inventory on navigation, closure or another job', () => {
  for (const page of [null, { ...currentPage, pageUrl: inspection.pageUrl + '/later' }, { ...currentPage, opportunityId: 'two' }]) {
    assert.equal(projectApplicationPuzzle(inspection, 'one', inspection.applicationUrl, now, page).current, false);
  }
  assert.equal(sameApplicationUrl('https://EXAMPLE.invalid:443', 'https://example.invalid/'), true);
  assert.equal(sameApplicationUrl('https://example.invalid/?job=one', 'https://example.invalid/?job=two'), false);
  const root = { ...inspection, applicationUrl: 'https://example.invalid/', pageUrl: 'https://example.invalid/' };
  assert.equal(projectApplicationPuzzle(root, 'one', 'https://EXAMPLE.invalid:443', now, { ...currentPage, applicationUrl: root.applicationUrl, pageUrl: root.pageUrl }).current, true);
});
test('inspection must match launched job identity and live path, not merely employer origin', () => {
  const url = inspection.applicationUrl;
  assertInspectionScope('one', url, 'one', url, url + '/apply');
  assertInspectionScope('one', 'https://EXAMPLE.invalid:443', 'one', 'https://example.invalid/', 'https://example.invalid/');
  assert.throws(() => assertInspectionScope('one', url + '?job=one', 'one', url + '?job=one', url + '?job=two'), /Application changed/);
  for (const [id, selected, live] of [['two', url, url], ['one', url + 'x', url], ['one', url, url + '0'], ['one', url, 'https://other.invalid/job/1']]) {
    assert.throws(() => assertInspectionScope(id, selected, 'one', url, live), /Application changed/);
  }
});


test('conditional cover-letter upload changes only the observed required denominator', () => {
  const values: FormInspection = {
    ...inspection,
    requirements: [
      { id: 'resume', label: 'Résumé', requirement: 'required', kind: 'resume', populated: true },
      { id: 'interest', label: 'Why this role?', requirement: 'required', kind: 'question', populated: true },
    ],
  };
  const result = (data: FormInspection) => projectApplicationPuzzle(data, 'one', inspection.applicationUrl, now, currentPage).checkpoint;
  const missing = result(values);
  assert.equal(missing.coverLetter, 'NOT_OBSERVED');
  assert.equal(missing.totalRequired, 2);
  assert.equal(missing.percent, 100);
  assert.equal(missing.wholeApplicationPercent, null);

  const optional: FormInspection = { ...values, requirements: [...values.requirements,
    { id: 'cover', label: 'Cover letter', requirement: 'optional', kind: 'cover', populated: false }] };
  assert.equal(result(optional).coverLetter, 'OPTIONAL');
  assert.equal(result(optional).excludedOptional, 1);
  assert.equal(result(optional).totalRequired, 2);
  assert.equal(result(optional).percent, 100);

  const required: FormInspection = { ...optional, requirements: optional.requirements.map(p =>
    p.id === 'cover' ? { ...p, requirement: 'required' as const } : p) };
  assert.equal(result(required).coverLetter, 'REQUIRED');
  assert.equal(result(required).requiredCoverInputs, 1);
  assert.equal(result(required).totalRequired, 3);
  assert.equal(result(required).percent, 67);
  assert.equal(result(required).verifiedRequired, 2);

  const attached: FormInspection = { ...required, requirements: required.requirements.map(p =>
    p.id === 'cover' ? { ...p, populated: true } : p) };
  assert.equal(result(attached).percent, 100);
  assert.equal(result(attached).wholeApplicationPercent, null);

  const unknown: FormInspection = { ...required, requirements: required.requirements.map(p =>
    p.id === 'cover' ? { ...p, requirement: 'unknown' as const } : p) };
  assert.equal(result(unknown).coverLetter, 'UNKNOWN');
  assert.equal(result(unknown).percent, null);
  // A required free-text cover-letter question is an answer, not a file attachment.
  const textAnswer: FormInspection = { ...values, requirements: [...values.requirements,
    { id: 'essay', label: 'Cover letter or interest statement', requirement: 'required', kind: 'question', populated: false }] };
  assert.equal(result(textAnswer).coverLetter, 'NOT_OBSERVED');
  assert.equal(result(textAnswer).totalRequired, 3);
  assert.equal(result(textAnswer).percent, 67);
});

test('progress disappears on stale, foreign or unverified page inventories', () => {
  const stale = projectApplicationPuzzle(inspection, 'one', inspection.applicationUrl, now + INSPECTION_MAX_AGE_MS + 1, currentPage);
  assert.equal(stale.checkpoint.percent, null);
  assert.equal(stale.checkpoint.coverLetter, 'NOT_OBSERVED');
  assert.equal(stale.checkpoint.totalRequired, 0);
  const switched = projectApplicationPuzzle(inspection, 'two', inspection.applicationUrl, now, currentPage);
  assert.equal(switched.checkpoint.percent, null);
  assert.equal(switched.checkpoint.totalRequired, 0);
});
