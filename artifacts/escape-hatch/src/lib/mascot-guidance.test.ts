import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyProfile, type Application } from './storage';
import { projectMascotGuidance, REUSABLE_PROFILE_PIECES } from './mascot-guidance';

const job: Application = { id: 'example', company: 'Example', role: 'Analyst', url: 'https://example.invalid/apply',
  status: 'saved', priority: 'normal', notes: '', nextAction: '', updatedAt: '2026-10-27T12:00:00.000Z' };
const complete = { ...emptyProfile, first_name: 'A', last_name: 'B', email: 'a@example.invalid',
  phone: '123', city: 'New York', region: 'NY', country: 'US', linkedin_url: 'https://example.invalid/u/a' };

test('chirp names the actual next missing essential field rather than inventing an employer requirement', () => {
  const g = projectMascotGuidance(emptyProfile, []);
  assert.equal(g.profileTotal, 8);
  assert.equal(g.profileCount, 0);
  assert.equal(g.essentialMissing.length, 3);
  assert.equal(g.nextStep, 0);
  assert.match(g.message, /first name/);
  assert.equal(g.href, '/profile');
  assert.equal(REUSABLE_PROFILE_PIECES.length, 8);
  assert.equal(projectMascotGuidance({ ...emptyProfile, first_name: 'A' }, []).action, 'Add last name');
});

test('optional blank details never block choosing an opportunity or imply ATS readiness', () => {
  const p = { ...emptyProfile, first_name: 'A', last_name: 'B', email: 'a@example.invalid' };
  const noJob = projectMascotGuidance(p, []);
  assert.equal(noJob.profileCount, 3);
  assert.equal(noJob.nextStep, 1);
  assert.equal(noJob.href, '/applications');
  assert.match(noJob.message, /optional/);
  const withJob = projectMascotGuidance(p, [job]);
  assert.equal(withJob.nextStep, 2);
  assert.equal(withJob.href, '/profile');
  assert.match(withJob.message, /does not block/);
});

test('closed/applied opportunities do not masquerade as active; filled profile never implies submission', () => {
  const done = projectMascotGuidance(complete, [{ ...job, status: 'applied' }]);
  assert.equal(done.nextStep, 1);
  assert.equal(done.profileCount, 8);
  assert.equal(done.missing.length, 0);
  const current = projectMascotGuidance(complete, [job]);
  assert.equal(current.nextStep, 1);
  assert.equal(current.href, '/applications');
  assert.match(current.message, /employer form/);
  assert.doesNotMatch(current.message, /ready to submit/i);
});

test('focused current employer opens matching puzzle even when profile gaps remain', () => {
  const focused = { ...job, company: 'Current Employer', role: 'Operations Lead', id: 'tracker-38' };
  const guidance = projectMascotGuidance(emptyProfile, [focused], focused);
  assert.match(guidance.message, /Current Employer/);
  assert.match(guidance.message, /review those details before filling/);
  assert.equal(guidance.href, '/applications?opportunityId=tracker-38');
  assert.equal(guidance.action, 'Review match and decisions');
  assert.equal(guidance.nextStep, 1);
  assert.doesNotMatch(guidance.message, /submitted|ready to submit/i);
  const submitted = projectMascotGuidance(emptyProfile, [focused], { ...focused, status: 'applied' });
  assert.equal(submitted.href, '/profile');
});

import { effectiveOpportunityDecision, localApplicationPreparationRank, evaluateOpportunityRubric, parseOpportunityDecision } from './opportunity-fit.ts';
import { parseApplicationsStorage } from './storage';
import { applyApplicationDetails } from './application-events.ts';
test('avatar choices persist independently of matching and do not follow a changed opportunity', () => {
  const notes = 'EscapeHatch rubric v2: on_site; remote_only; unacceptable; unknown; undecided; unknown';
  const choice = { jobDesire: 'do_not_want', applicationDecision: 'apply', purpose: 'interview_practice' } as const;
  const record = { ...job, notes, opportunityDecision: choice };
  assert.deepEqual(parseApplicationsStorage([record])?.[0].opportunityDecision, choice);
  assert.equal(localApplicationPreparationRank(notes, choice), 0);
  assert.equal(localApplicationPreparationRank(notes, { ...choice, applicationDecision: 'do_not_apply' }), null);
  assert.equal(effectiveOpportunityDecision(notes, choice).jobDesire, 'do_not_want');
  assert.equal(evaluateOpportunityRubric({workMode:'on_site', preference:'remote_only', commute:'unacceptable'}).eligibility, 'incompatible');
  assert.equal(parseOpportunityDecision({ ...choice, score: 100 }), null);
  assert.equal(applyApplicationDetails(record, { ...record, url: 'https://example.invalid/other' }, record.updatedAt).opportunityDecision, undefined);
  assert.deepEqual(applyApplicationDetails(record, record, record.updatedAt).opportunityDecision, choice);
});

import { selectNextHomeApplication, mergeTrackerIntoApplications, type TrackerSnapshot, trackerRowToApplication } from './tracker-bridge.ts';
test('explicit avatar choices survive same-opportunity tracker refresh and route ahead of recommendations', () => {
  const row = { sheetRow: 3, company: 'Example', role: 'Analyst', applyUrl: job.url, status: 'Ready to Apply', appliedCheckbox: false, priority: 'Low', notes: 'EscapeHatch rubric v2: on_site; remote_only; unacceptable; unknown; undecided; unknown' };
  const imported = trackerRowToApplication(row, job.updatedAt);
  const choice = { jobDesire: 'do_not_want', applicationDecision: 'apply', purpose: 'interview_practice' } as const;
  const selected = { ...imported, opportunityDecision: choice };
  const refreshed = mergeTrackerIntoApplications([selected], { applications: [row], capturedAtUtc: job.updatedAt } as TrackerSnapshot)[0];
  assert.deepEqual(refreshed.opportunityDecision, choice);
  assert.equal(refreshed.notes, imported.notes);
  assert.equal(selectNextHomeApplication(job, [job, refreshed])?.id, refreshed.id);
  assert.equal(selectNextHomeApplication(null, [{ ...refreshed, status: 'applied' }]), null);
});

test('avatar primary action routes undecided, declined and deliberately selected opportunities without changing match', () => {
  const notes = 'EscapeHatch rubric v2: on_site; remote_only; unacceptable; do_not_want; undecided; interview_practice';
  const focused = { ...job, notes };
  const choice = { jobDesire: 'do_not_want', applicationDecision: 'apply', purpose: 'interview_practice' } as const;
  assert.equal(projectMascotGuidance(complete, [focused], focused).href, '/applications?opportunityId=example');
  const declined = { ...focused, opportunityDecision: { ...choice, applicationDecision: 'do_not_apply' as const } };
  assert.equal(projectMascotGuidance(complete, [declined], declined).href, '/applications?opportunityId=example');
  const selected = { ...focused, opportunityDecision: choice };
  const guidance = projectMascotGuidance(complete, [selected], selected);
  assert.equal(guidance.href, '/assist?opportunityId=example');
  assert.equal(guidance.nextStep, 2);
  assert.equal(selected.notes, notes);
  assert.equal(projectMascotGuidance(complete, [selected], { ...selected, status: 'follow_up' }).href, '/applications');
  assert.equal(projectMascotGuidance(complete, [selected], { ...selected, reconciliationConflict: 'opportunity_url_changed' }).href, '/applications');
});
