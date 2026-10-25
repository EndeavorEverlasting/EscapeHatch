import { test, expect } from '@playwright/test';
import { projectApplicationJourney } from './application-journey-projection';

const jobUrl = 'https://jobs.example.com/apply/one';
const base = { jobUrl, emailApproved: true, documentsApproved: true,
  browserOpen: true, authPhase: 'APPLICATION_FORM_READY', formCanResume: true,
  needsOpportunityConfirmation: false, preparationState: null };
test('missing or invalid URL is the current and next visible scene', () => {
  const state = projectApplicationJourney({ ...base, jobUrl: 'javascript:alert(1)' });
  expect(state.current.id).toBe('OPPORTUNITY_INTAKE');
  expect(state.next.id).toBe('OPPORTUNITY_INTAKE');
  expect(state.mayAutoSubmit).toBe(false);
});
test('missing applicant email takes precedence before browser launch', () => {
  expect(projectApplicationJourney({ ...base, emailApproved: false }).current.id).toBe('PREREQUISITES');
});
test('login is not marked resolved without stable recognized form', () => {
  const state = projectApplicationJourney({ ...base, authPhase: 'AUTH_HANDOFF', formCanResume: false });
  expect(state.current.id).toBe('AUTH_HANDOFF');
  expect(state.next.id).toBe('AUTH_RECHECK');
});
test('SSO origin and unconfirmed page path block auto-progression', () => {
  expect(projectApplicationJourney({ ...base, authPhase: 'SESSION_ORIGIN_CHANGED' }).current.id).toBe('AUTH_HANDOFF');
  expect(projectApplicationJourney({ ...base, needsOpportunityConfirmation: true }).current.id).toBe('AUTH_RECHECK');
});
test('approved files are separately required after login', () => {
  const state = projectApplicationJourney({ ...base, documentsApproved: false });
  expect(state.current.id).toBe('PREREQUISITES');
  expect(state.blockers[0]).toMatch(/exact documents/);
});
test('review ready is not automatic submit', () => {
  const state = projectApplicationJourney({ ...base, preparationState: 'REVIEW_READY' });
  expect(state.current.id).toBe('FINAL_REVIEW');
  expect(state.mayAutoSubmit).toBe(false);
});
