import test from 'node:test';
import assert from 'node:assert/strict';
import { projectApplicationJourney, parseJourneyResume, JOURNEY_RESUME_KEY, EMPTY_JOURNEY_RESUME } from './application-journey-projection';

const jobUrl = 'https://jobs.example.com/apply/one';
const base = { jobUrl, emailApproved: true, documentsApproved: true,
  browserOpen: true, authPhase: 'APPLICATION_FORM_READY', formCanResume: true,
  needsOpportunityConfirmation: false, preparationState: null };
test('missing or invalid URL is the current and next visible scene', () => {
  const state = projectApplicationJourney({ ...base, jobUrl: 'javascript:alert(1)' });
  assert.equal(state.current.id, 'OPPORTUNITY_INTAKE');
  assert.equal(state.next.id, 'OPPORTUNITY_INTAKE');
  assert.equal(state.mayAutoSubmit, false);
});
test('missing applicant email takes precedence before browser launch', () => {
  assert.equal(projectApplicationJourney({ ...base, emailApproved: false }).current.id, 'PREREQUISITES');
});
test('login is not marked resolved without stable recognized form', () => {
  const state = projectApplicationJourney({ ...base, authPhase: 'AUTH_HANDOFF', formCanResume: false });
  assert.equal(state.current.id, 'AUTH_HANDOFF');
  assert.equal(state.next.id, 'AUTH_RECHECK');
});
test('SSO origin and unconfirmed page path block auto-progression', () => {
  assert.equal(projectApplicationJourney({ ...base, authPhase: 'SESSION_ORIGIN_CHANGED' }).current.id, 'AUTH_HANDOFF');
  assert.equal(projectApplicationJourney({ ...base, needsOpportunityConfirmation: true }).current.id, 'AUTH_RECHECK');
});
test('no cover-letter package does not block a valid employer form or final review', () => {
  const withoutPackage = projectApplicationJourney({ ...base, documentsApproved: false });
  assert.equal(withoutPackage.current.id, 'FORM_PREPARATION');
  assert.deepEqual(withoutPackage.blockers, []);
  const finalReview = projectApplicationJourney({
    ...base, documentsApproved: false, preparationState: 'REVIEW_READY',
  });
  assert.equal(finalReview.current.id, 'FINAL_REVIEW');
  assert.equal(finalReview.mayAutoSubmit, false);
  const prelaunch = projectApplicationJourney({ ...base, browserOpen: false, documentsApproved: false });
  assert.deepEqual(prelaunch.blockers, []);
});
test('review ready is not automatic submit', () => {
  const state = projectApplicationJourney({ ...base, preparationState: 'REVIEW_READY' });
  assert.equal(state.current.id, 'FINAL_REVIEW');
  assert.equal(state.mayAutoSubmit, false);
});


test('resume selection accepts only exact bounded private metadata and an empty default sentinel', () => {
  const pointer = { opportunityId: 'job-1', applicationUrl: jobUrl };
  assert.deepEqual(parseJourneyResume(pointer), pointer);
  assert.deepEqual(parseJourneyResume(EMPTY_JOURNEY_RESUME), { opportunityId: '', applicationUrl: '' });
  assert.equal(JOURNEY_RESUME_KEY, 'escape-hatch-journey-resume');
  assert.ok(parseJourneyResume({ ...pointer, opportunityId: 'a'.repeat(128) }));
  for (const value of [null, [], {}, { ...pointer, opportunityId: 42 }, { ...pointer, applicationUrl: false }, { ...pointer, opportunityId: '' }, { ...pointer, applicationUrl: '' },
    { ...pointer, opportunityId: 'a'.repeat(129) }, { ...pointer, opportunityId: ' job-1' },
    { ...pointer, opportunityId: 'job\n1' }, { ...pointer, applicationUrl: jobUrl + 'x'.repeat(2048) },
    { ...pointer, launch: true }, { ...pointer, password: 'never accepted' }]) {
    assert.equal(parseJourneyResume(value), null);
  }
});

test('resume selection rejects nonpublic URL forms and cannot grant scene authority', () => {
  for (const applicationUrl of ['http://jobs.example.com/one', 'javascript:alert(1)', 'https://user:pass@jobs.example.com',
    'https://jobs.example.com:8443/one', 'https://localhost/one', 'https://localhost./one', 'https://127.0.0.1/one', 'https://10.0.0.1/one',
    'https://[::1]/one', 'https://jobs.local/one', 'https://jobs.internal/one', 'https://jobs.internal./one', 'https://jobs.example.test/one',
    ' https://jobs.example.com/one', 'https://jobs.example.com/one\n']) {
    assert.equal(parseJourneyResume({ opportunityId: 'job-1', applicationUrl }), null);
  }
  const pointer = parseJourneyResume({ opportunityId: 'job-1', applicationUrl: jobUrl })!;
  assert.deepEqual(Object.keys(pointer), ['opportunityId', 'applicationUrl']);
  const projected = projectApplicationJourney({ ...base, jobUrl: pointer.applicationUrl, browserOpen: false });
  assert.equal(projected.current.id, 'APPLICATION_ENTRY');
  assert.equal(projected.mayAutoSubmit, false);
});
