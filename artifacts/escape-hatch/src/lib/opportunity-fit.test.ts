import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOpportunityRubric, evaluateOpportunityFit, skillEvidenceCoverage, normalizeWorkMode, readOpportunityRubric, rubricAllowsRecommendation, applicationPreparationRank, mergeRubricNotes } from './opportunity-fit.ts';
import { trackerRowToApplication, selectNextHomeApplication, selectNextActionableOpportunity, type TrackerRow, type TrackerSnapshot } from './tracker-bridge.ts';

const practice = 'EscapeHatch rubric v2: on_site; remote_only; unacceptable; do_not_want; apply; interview_practice';
const career = 'EscapeHatch rubric v2: remote; remote_only; unknown; want; undecided; career';
test('match invariant under all 27 independent intent combinations', () => {
  const input = readOpportunityRubric(practice);
  assert.ok(input && input !== 'invalid');
  const baseline = evaluateOpportunityRubric(input);
  assert.deepEqual(baseline, { eligibility: 'incompatible', reasons: ['REMOTE_REQUIREMENT_MISMATCH', 'COMMUTE_UNACCEPTABLE'] });
  for (const jobDesire of ['want', 'do_not_want', 'unknown'] as const)
    for (const applicationDecision of ['apply', 'do_not_apply', 'undecided'] as const)
      for (const purpose of ['career', 'interview_practice', 'unknown'] as const) {
        const changed = { ...input, jobDesire, applicationDecision, purpose };
        assert.deepEqual(evaluateOpportunityRubric(changed), baseline);
      }
  assert.equal(rubricAllowsRecommendation(practice), false);
  assert.equal(applicationPreparationRank(practice), 0);
  assert.equal(applicationPreparationRank(practice.replace('; apply;', '; do_not_apply;')), null);
  assert.equal(rubricAllowsRecommendation(career), true);
  assert.equal(applicationPreparationRank(career), 1);
});
test('skill evidence is measured, never replaced by a location or intent score', () => {
  const fit = evaluateOpportunityFit({ approvedAt: '2026-01-01', skills: ['Python', 'SQL'] }, 'Python engineer');
  assert.deepEqual(skillEvidenceCoverage(fit), { matched: 1, total: 2, fraction: 0.5 });
  assert.equal(skillEvidenceCoverage(evaluateOpportunityFit({ approvedAt: '2026-01-01', skills: ['Python'] })), null);
});
test('legacy, unknown and contradictory inputs preserve evidence and do not invent choices', () => {
  assert.equal(normalizeWorkMode('In person'), 'on_site');
  assert.equal(normalizeWorkMode('On-prem'), 'on_site');
  assert.equal(normalizeWorkMode('remote or hybrid'), 'unknown');
  assert.equal(applicationPreparationRank('ordinary notes'), 1);
  assert.equal(applicationPreparationRank('EscapeHatch rubric v2: typo'), null);
  assert.equal(applicationPreparationRank(career + '\n' + practice), null);
  const legacy = readOpportunityRubric('EscapeHatch rubric v1: on_site; remote_only; unacceptable; interview_practice');
  assert.ok(legacy && legacy !== 'invalid');
  assert.equal(legacy.jobDesire, 'unknown');
  assert.equal(legacy.applicationDecision, 'undecided');
  assert.equal(applicationPreparationRank(mergeRubricNotes('local edit\n' + career, practice)), 0);
  assert.equal(applicationPreparationRank(career, 'On-site'), null);
  assert.equal(applicationPreparationRank(practice, 'Remote'), 0);
});
test('explicit applications lead the preparation queue independently of match and priority; receipt locks persist', () => {
  const row: TrackerRow = { sheetRow: 2, company: 'Synthetic A', role: 'Engineer', status: 'Ready to Apply',
    appliedCheckbox: false, priority: 'Low', applyUrl: 'https://example.com/job/a', workMode: 'In person', notes: practice };
  const remote: TrackerRow = { ...row, sheetRow: 3, company: 'Synthetic B', priority: 'High',
    applyUrl: 'https://example.com/job/b', workMode: 'Remote', notes: career };
  const snapshot = { applications: [row, remote] } as TrackerSnapshot;
  assert.equal(selectNextActionableOpportunity(snapshot), row);
  const a = trackerRowToApplication(row, '2026-01-01');
  const b = trackerRowToApplication(remote, '2026-01-01');
  assert.equal(a.status, 'preparing');
  assert.equal(a.priority, 'low');
  assert.equal(selectNextHomeApplication(b, [a, b]), a);
  assert.equal(selectNextHomeApplication(a, [a]), a);
  const conflict = trackerRowToApplication({ ...remote, workMode: 'In person' }, '2026-01-01');
  assert.equal(selectNextHomeApplication(conflict, [conflict]), null);
  const selectedConflict = trackerRowToApplication({ ...row, workMode: 'Remote', priority: 'High' }, '2026-01-01');
  assert.equal(selectedConflict.priority, 'high');
  assert.equal(selectNextHomeApplication(selectedConflict, [selectedConflict]), selectedConflict);
  const submitted = trackerRowToApplication({ ...row, status: 'Submitted', appliedCheckbox: true }, '2026-01-01');
  assert.equal(submitted.status, 'applied');
  assert.equal(selectNextHomeApplication(submitted, [submitted]), null);
  assert.equal(selectNextActionableOpportunity({ applications: [{ ...row, appliedCheckbox: true }, remote] } as TrackerSnapshot), remote);
});
