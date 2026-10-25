import assert from 'node:assert/strict';
import test from 'node:test';
import { projectApplicationPuzzle, type FormInspection, INSPECTION_MAX_AGE_MS } from './application-puzzle';
import { assertInspectionScope } from '../../application-requirements';

const now = Date.now();
const inspection: FormInspection = { opportunityId: 'one', applicationUrl: 'https://example.invalid/job/1', pageUrl: 'https://example.invalid/job/1/apply', capturedAt: new Date(now).toISOString(), scope: 'current_page_only', requirements: [
  { id: 'resume', label: 'Résumé', kind: 'resume', requirement: 'required', populated: false },
  { id: 'cover', label: 'Cover letter', kind: 'cover', requirement: 'optional', populated: false },
  { id: 'custom', label: 'Custom control', kind: 'question', requirement: 'unknown', populated: false },
] };
test('required, optional and unknown remain distinct; no complete-application authority', () => {
  const result = projectApplicationPuzzle(inspection, 'one', inspection.applicationUrl, now);
  assert.equal(result.requiredCount, 1);
  assert.equal(result.unresolvedCount, 1);
  assert.equal(result.unknownCount, 1);
  assert.equal(result.preparationReady, false);
  assert.equal(result.finalSubmitAuthorized, false);
  const populated = { ...inspection, requirements: inspection.requirements.map(piece => ({ ...piece, populated: true })) };
  assert.equal(projectApplicationPuzzle(populated, 'one', inspection.applicationUrl, now).preparationReady, false);
});
test('missing, stale, future, wrong job or changed URL evidence is never reused', () => {
  for (const [value, id, url, time] of [
    [null, 'one', inspection.applicationUrl, now],
    [inspection, 'two', inspection.applicationUrl, now],
    [inspection, 'one', 'https://example.invalid/job/2', now],
    [inspection, 'one', inspection.applicationUrl, now + INSPECTION_MAX_AGE_MS + 1],
    [inspection, 'one', inspection.applicationUrl, now - 1],
  ] as const) {
    const result = projectApplicationPuzzle(value, id, url, time);
    assert.equal(result.current, false); assert.deepEqual(result.pieces, []);
  }
});
test('inspection must match launched job identity and live path, not merely employer origin', () => {
  const url = inspection.applicationUrl;
  assertInspectionScope('one', url, 'one', url, url + '/apply');
  assert.throws(() => assertInspectionScope('one', url + '?job=one', 'one', url + '?job=one', url + '?job=two'), /Application changed/);
  for (const [id, selected, live] of [['two', url, url], ['one', url + 'x', url], ['one', url, url + '0'], ['one', url, 'https://other.invalid/job/1']]) {
    assert.throws(() => assertInspectionScope(id, selected, 'one', url, live), /Application changed/);
  }
});
