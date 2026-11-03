import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectMicro1ProfileStep, reviewRoleSkills } from './employer-profile-step.ts';

const url = 'https://talent.micro1.ai/complete-profile?stepper=1&step=WORK_EXPERIENCE';
const labels = ['Company name', 'Role', 'Skills used', 'Start date', 'End date', 'Currently working', 'Responsibilities'];

test('micro1 job-profile editor recognizes role-scoped fields but cannot authorize navigation', () => {
  const found = inspectMicro1ProfileStep(url, labels);
  assert.equal(found?.scene, 'work_experience_editor');
  assert.deepEqual(found?.mappedFields.find(f => f.label === 'role'), { label: 'role', questionId: 'experience.title' });
  assert.deepEqual(found?.mappedFields.find(f => f.label === 'skills used'), { label: 'skills used', questionId: 'experience.skills_used' });
  assert.equal(found?.autoAdvanceAuthorized, false);
  assert.equal(found?.finalSubmissionProved, false);
});
test('global profile skills and work experience cards are not treated as role editor fields', () => {
  assert.equal(inspectMicro1ProfileStep(url, ['Work experience'])?.scene, 'work_experience_overview');
  assert.equal(inspectMicro1ProfileStep('https://talent.micro1.ai/complete-profile?step=ADD_SKILLS', ['Add Skills'])?.scene, 'global_skills');
  assert.equal(inspectMicro1ProfileStep('https://unrelated.example/complete-profile?step=WORK_EXPERIENCE', labels), null);
});
test('a reviewed company-and-role skill set exposes inherited unrelated tags', () => {
  const roles = [
    { id: 'ops', company: 'Example Clinic', title: 'Technology Coordinator', skillsUsed: ['Project Coordination', 'Quality Assurance'], skillsUsedReviewedAt: '2026-10-30T12:00:00Z' },
    { id: 'dev', company: 'Demo Studio', title: 'Software Developer', skillsUsed: ['Python', 'PostgreSQL'], skillsUsedReviewedAt: '2026-10-30T12:00:00Z' },
  ];
  const mismatch = reviewRoleSkills(roles, 'EXAMPLE CLINIC', 'technology coordinator', ['Python', 'PostgreSQL']);
  assert.equal(mismatch.state, 'skills_mismatch');
  assert.equal(mismatch.experienceId, 'ops');
  assert.deepEqual(mismatch.missing, ['Project Coordination', 'Quality Assurance']);
  assert.deepEqual(mismatch.unexpected, ['Python', 'PostgreSQL']);
  assert.equal(mismatch.automaticSkillFillAuthorized, false);
  assert.equal(reviewRoleSkills(roles, 'Example Clinic', 'Technology Coordinator', ['Quality Assurance', 'Project Coordination']).state, 'skills_match');
});
test('missing, unreviewed, and ambiguous role-bound skills never fall back to global skills', () => {
  const role = { id: 'one', company: 'Example Clinic', title: 'Coordinator', skillsUsed: ['Python'] };
  assert.equal(reviewRoleSkills([role], 'Example Clinic', 'Coordinator', ['Python']).state, 'role_skills_unapproved');
  assert.equal(reviewRoleSkills([role], 'Example Clinic', 'Manager', []).state, 'role_not_found');
  assert.equal(reviewRoleSkills([role, { ...role, id: 'two' }], 'Example Clinic', 'Coordinator', []).state, 'role_ambiguous');
});
