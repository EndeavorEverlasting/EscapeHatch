import assert from 'node:assert/strict';
import test from 'node:test';
import type { Application } from './storage.ts';
import { recordedApplication, nextIndeedPosting } from './post-application-continuation.ts';
import { evaluateOpportunityFit } from './opportunity-fit.ts';

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
