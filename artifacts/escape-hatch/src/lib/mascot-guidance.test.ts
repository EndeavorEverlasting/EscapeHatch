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
  assert.equal(current.nextStep, 2);
  assert.equal(current.href, '/assist');
  assert.match(current.message, /employer form/);
  assert.doesNotMatch(current.message, /ready to submit/i);
});
