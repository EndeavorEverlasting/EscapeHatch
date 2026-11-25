import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOpportunityRubric, normalizeWorkMode, readOpportunityRubric, rubricAllowsRecommendation, mergeRubricNotes } from './opportunity-fit.ts';
import { trackerRowToApplication, selectNextHomeApplication, selectNextActionableOpportunity, type TrackerRow, type TrackerSnapshot } from './tracker-bridge.ts';

const practice = 'EscapeHatch rubric v1: on_site; remote_only; unacceptable; interview_practice';
const career = 'EscapeHatch rubric v1: remote; remote_only; unknown; career';
test('hard eligibility and practice intent remain independent', () => {
  const input = readOpportunityRubric(practice);
  assert.ok(input && input !== 'invalid');
  assert.deepEqual(evaluateOpportunityRubric(input), {
    eligibility: 'incompatible', intent: 'interview_practice',
    reasons: ['REMOTE_REQUIREMENT_MISMATCH', 'COMMUTE_UNACCEPTABLE'],
    recommend: false, priority: 'low', fitScore: 0,
  });
  assert.equal(rubricAllowsRecommendation(career, 'Remote'), true);
  assert.equal(rubricAllowsRecommendation(career.replace('career', 'interview_practice')), false);
  assert.equal(rubricAllowsRecommendation(career, 'On-site'), false);
});
test('unknown and malformed explicit notes are not recommendations; legacy remains compatible', () => {
  assert.equal(normalizeWorkMode('In person'), 'on_site');
  assert.equal(normalizeWorkMode('On-prem'), 'on_site');
  assert.equal(normalizeWorkMode('remote or hybrid'), 'unknown');
  assert.equal(rubricAllowsRecommendation('ordinary notes'), true);
  assert.equal(rubricAllowsRecommendation('EscapeHatch rubric v1: typo'), false);
  assert.equal(rubricAllowsRecommendation(career + '\n' + practice), false);
  assert.equal(rubricAllowsRecommendation('EscapeHatch rubric v1: unknown; remote_only; unknown; career'), false);
  assert.equal(rubricAllowsRecommendation(mergeRubricNotes('local edit\n' + career, practice)), false);
});
test('tracker projection and both recommendation selectors exclude practice without changing status', () => {
  const row: TrackerRow = { sheetRow: 2, company: 'Synthetic A', role: 'Engineer', status: 'Ready to Apply',
    appliedCheckbox: false, priority: 'High', applyUrl: 'https://example.com/job/a', workMode: 'In person', notes: practice };
  const remote: TrackerRow = { ...row, sheetRow: 3, company: 'Synthetic B', priority: 'Medium',
    applyUrl: 'https://example.com/job/b', workMode: 'Remote', notes: career };
  const snapshot = { applications: [row, remote] } as TrackerSnapshot;
  assert.equal(selectNextActionableOpportunity(snapshot), remote);
  const a = trackerRowToApplication(row, '2026-01-01');
  const b = trackerRowToApplication(remote, '2026-01-01');
  assert.equal(a.status, 'preparing');
  assert.equal(a.priority, 'low');
  assert.equal(selectNextHomeApplication(a, [a, b]), b);
  assert.equal(selectNextHomeApplication(a, [a]), null);
  const conflict = trackerRowToApplication({ ...remote, workMode: 'In person' }, '2026-01-01');
  assert.equal(selectNextHomeApplication(conflict, [conflict]), null);
  assert.equal(trackerRowToApplication({ ...row, status: 'Submitted', appliedCheckbox: true }, '2026-01-01').status, 'applied');
});
