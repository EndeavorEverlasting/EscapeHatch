import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPreapplicationStudio } from './preapplication-studio.ts';
import type { AssistProfile } from './assist-contract';
const now='2026-10-30T12:00:00Z';
function profile(): Pick<AssistProfile,'approvedAt'|'contact'|'experience'|'skills'> {
  return {
    approvedAt:now,
    contact: { email: 'synthetic@example.test' } as AssistProfile['contact'],
    skills: ['Python', 'React', 'SQL'],
    experience: [{
      id:'role-one', company:'ExampleCo', title:'Technical Lead',
      dates:'2022 - 2025', location:'Remote', bullets:['Synthetic example'],
      provenance:{source:'user',label:'synthetic',capturedAt:now},
    }],
  };
}
test('role-specific skills are proactively requested even when global profile skills are long', () => {
  const p=projectPreapplicationStudio(profile(),['professional-summary']);
  assert.equal(p.skillsAwaitingRoleReview,1);
  assert.equal(p.nextQuestion?.id,'role.skills.role-one');
  assert.equal(p.nextQuestion?.ownerScene,'STUDIO_ROLE_SKILLS');
  assert.equal(p.kitPrepared,false);
  assert.equal(p.employerSubmissionAuthority,false);
});
test('reviewed role skills do not trigger an invented six-skill quota', () => {
  const p=profile();
  (p.experience[0] as typeof p.experience[0] & {skillsUsed:string[];skillsUsedReviewedAt:string}).skillsUsed=['Python'];
  (p.experience[0] as typeof p.experience[0] & {skillsUsedReviewedAt:string}).skillsUsedReviewedAt=now;
  const x=projectPreapplicationStudio(p,['professional-summary'],{'role-one':['python']});
  assert.equal(x.skillsAwaitingRoleReview,0);
  assert.equal(x.alreadyReviewedRoles,1);
  assert.equal(x.questionCount,0);
  assert.equal(x.kitPrepared,true);
});
test('missing dates are surfaced before an employer asks for a start and end date', () => {
  const p=profile();p.experience[0].dates='';
  const x=projectPreapplicationStudio(p,['professional-summary']);
  assert.equal(x.nextQuestion?.id,'role.timeline.role-one');
  assert.ok(x.questions.some(q=>q.id==='role.skills.role-one'));
  assert.equal(x.nextQuestion?.destination,'private_career_profile');
});
test('role-specific reviewed skills may prompt optional interview evidence without blocking form preparation', () => {
  const p=profile();
  const r=p.experience[0] as typeof p.experience[0] & {skillsUsed:string[];skillsUsedReviewedAt:string};
  r.skillsUsed=['Python'];r.skillsUsedReviewedAt=now;
  const x=projectPreapplicationStudio(p,['professional-summary']);
  assert.equal(x.questionCount,1);
  assert.equal(x.nextQuestion?.ownerScene,'STUDIO_SKILL_STORIES');
  assert.equal(x.kitPrepared,true);
});
test('empty or unreviewed profile prompts for existing career review, not fabricated answers', () => {
  const x=projectPreapplicationStudio(null,[]);
  assert.equal(x.nextQuestion?.id,'career.review');
  assert.equal(x.questions.some(q=>/legal|EEO|attestation/i.test(q.label)),false);
  assert.equal(x.employerSubmissionAuthority,false);
});
test('approved answer memory removes redundant reusable-question prompts', () => {
  const p=profile();
  const before=projectPreapplicationStudio(p);
  const after=projectPreapplicationStudio(p,['professional-summary']);
  assert.equal(after.questionCount,before.questionCount-1);
});
