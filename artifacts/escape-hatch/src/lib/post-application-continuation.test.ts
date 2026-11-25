import assert from 'node:assert/strict';
import test from 'node:test';
import type { Application } from './storage.ts';
import { recordedApplication, nextIndeedPosting, nextIndeedApplication } from './post-application-continuation.ts';
import { evaluateOpportunityFit, evaluateWorkplaceEligibility, allowsAutomaticRecommendation } from './opportunity-fit.ts';

const a = (id: string, key: string, status: Application['status'] = 'saved', suffix = ''): Application => ({
  id, company: 'Synthetic employer', role: 'Engineer', url: 'https://www.indeed.com/viewjob?jk=' + key + suffix,
  status, priority: 'normal' as Application['priority'], notes: '', nextAction: '', updatedAt: '2026-01-01T00:00:00Z'
});
const done = a('done', '0123456789abcdef', 'applied');
const alias = a('alias', '0123456789abcdef', 'saved', '&from=search');
const next = a('next', '1111111111111111', 'saved', '&from=search');
test('exact recorded outcome remains available without fresh browser evidence', () => {
  const binding = { opportunityId: done.id, applicationUrl: done.url };
  assert.equal(recordedApplication(binding, [done]), done);
  assert.equal(recordedApplication({ ...binding, opportunityId: 'other' }, [done]), null);
  assert.equal(recordedApplication(binding, [{ ...done, status: 'saved' }]), null);
});
test('next route bypasses survey and skips applied aliases, closed and conflicting rows', () => {
  const conflict = { ...a('conflict', '2222222222222222'), reconciliationConflict: 'opportunity_url_changed' as const };
  assert.deepEqual(nextIndeedPosting([done, alias, conflict, a('closed', '3333333333333333', 'closed'), next], done.id), {
    url: 'https://www.indeed.com/viewjob?jk=1111111111111111', company: next.company, role: next.role
  });
  assert.equal(nextIndeedPosting([done, alias], done.id), null);
});
test('matching is deterministic, deduplicated, and distinguishes Java from JavaScript and C from C++', () => {
  const profile = { approvedAt: '2026-01-01T00:00:00Z', skills: ['Java', 'JavaScript', 'C', 'C++', 'Project Management', 'project management'] };
  const result = evaluateOpportunityFit(profile, 'JavaScript, C++, and project management.');
  assert.equal(result.state, 'evidence_available');
  assert.deepEqual(result.matched, ['JavaScript', 'C++', 'project management']);
  assert.deepEqual(result.notMentioned, ['Java', 'C']);
});
test('missing review or description does not invent a fit assessment', () => {
  assert.equal(evaluateOpportunityFit({ skills: ['Python'] }, 'Python').state, 'profile_review_required');
  assert.equal(evaluateOpportunityFit({ approvedAt: '2026-01-01', skills: ['Python'] }, '').state, 'description_required');
  assert.equal(evaluateOpportunityFit({ approvedAt: '2026-01-01', skills: [] }, 'Python').state, 'skills_required');
});

test('remote-only rejects explicit commute requirements even against a remote card', () => {
  const evidence = { workMode: 'Remote', jobDescription: 'Ability to Commute:\n\n- Example Town, NY 00000 (Required)\n\nWork Location: In person' };
  assert.equal(evaluateWorkplaceEligibility(evidence).state, 'required_commute');
  assert.equal(allowsAutomaticRecommendation(evidence, 'remote_only'), false);
  assert.equal(allowsAutomaticRecommendation(evidence, 'any'), true);
});
test('workplace evidence distinguishes hybrid, in-person, unknown, and explicit remote', () => {
  for (const workMode of ['Hybrid', 'On-site', 'In person', 'Remote / Hybrid']) {
    assert.equal(evaluateWorkplaceEligibility({ workMode }).state, 'non_remote_workplace');
  }
  assert.equal(evaluateWorkplaceEligibility({ jobDescription: 'Experience with remote desktop tools and remote interviews.' }).state, 'workplace_unverified');
  assert.equal(evaluateWorkplaceEligibility({ workMode: 'Remote', jobDescription: 'Work Location: In person' }).state, 'non_remote_workplace');
  assert.equal(evaluateWorkplaceEligibility({ jobDescription: 'Work Location: Remote' }).state, 'remote_confirmed');
  assert.equal(evaluateWorkplaceEligibility({ workMode: 'Fully remote' }).state, 'remote_confirmed');
});
test('Indeed continuation skips ineligible and unknown postings without changing recorded outcomes', () => {
  const onsite = { ...a('onsite', '2222222222222222'), workMode: 'In person' };
  const ambiguous = a('unknown', '3333333333333333');
  const remote = { ...next, workMode: 'Remote' };
  assert.equal(nextIndeedPosting([done, onsite, ambiguous, remote], done.id, 'remote_only')?.url, 'https://www.indeed.com/viewjob?jk=1111111111111111');
  assert.equal(nextIndeedPosting([done, onsite, ambiguous], done.id, 'remote_only'), null);
  assert.equal(nextIndeedPosting([done, onsite], done.id)?.url, onsite.url);
  const practice = { ...onsite, status: 'applied' as const };
  assert.equal(recordedApplication({ opportunityId: practice.id, applicationUrl: practice.url }, [practice]), practice);
});

test('managed dispatch and ordinary-browser link share the exact eligible candidate', () => {
  const remote = { ...next, workMode: 'Remote' };
  const misleading = { ...a('misleading', '2222222222222222'), workMode: 'Remote', jobDescription: 'Work Location: In person' };
  const candidates = [done, alias, misleading, remote];
  const target = nextIndeedApplication(candidates, done.id, 'remote_only');
  assert.equal(target, remote);
  assert.equal(target?.url, remote.url);
  assert.equal(nextIndeedPosting(candidates, done.id, 'remote_only')?.url, 'https://www.indeed.com/viewjob?jk=1111111111111111');
  assert.equal(nextIndeedApplication(candidates.map(item => item.id === remote.id ? { ...item, status: 'applied' } : item), done.id, 'remote_only'), null);
});
