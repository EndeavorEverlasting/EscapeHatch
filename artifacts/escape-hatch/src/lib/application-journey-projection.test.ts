import test from 'node:test';
import assert from 'node:assert/strict';
import { projectApplicationJourney } from './application-journey-projection';

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
test('approved files are separately required after login', () => {
  const state = projectApplicationJourney({ ...base, documentsApproved: false });
  assert.equal(state.current.id, 'PREREQUISITES');
  assert.match(state.blockers[0], /exact documents/);
});
test('review ready is not automatic submit', () => {
  const state = projectApplicationJourney({ ...base, preparationState: 'REVIEW_READY' });
  assert.equal(state.current.id, 'FINAL_REVIEW');
  assert.equal(state.mayAutoSubmit, false);
});
