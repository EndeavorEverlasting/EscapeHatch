import test from 'node:test';
import assert from 'node:assert/strict';
import { projectApplicationCheckpoint, type ApplicationCheckpoint } from './application-progress-checkpoint.ts';
const url = 'https://jobs.example.org/roles/123';
const now = Date.parse('2026-10-30T17:00:00Z');
const fresh = '2026-10-30T16:59:00Z';
function fixture(): ApplicationCheckpoint {
  return {
    schema: 'escapehatch/application-progress-checkpoint/v1',
    opportunityId: 'job-123', applicationUrl: url,
    activeScene: 'FORM_PREPARATION', activeSectionId: 'skills',
    knownSectionCount: 5,
    sections: [{
      id: 'skills', label: 'Role-specific skills', index: 2, inspectedAt: fresh,
      completeInventory: true, fingerprint: 'synthetic-fingerprint',
      fields: [
        { id: 'skill-a', label: 'Skill A', required: 'required', domVerified: true },
        { id: 'skill-b', label: 'Skill B', required: 'required', domVerified: true },
        { id: 'skill-c', label: 'Skill C', required: 'required', domVerified: true },
        { id: 'skill-d', label: 'Skill D', required: 'required', domVerified: false },
      ],
    }],
  };
}
test('one observed section is not application completion; bounded position is explicitly an estimate', () => {
  const p = projectApplicationCheckpoint(fixture(), 'job-123', url, now);
  assert.equal(p.evidence, 'CURRENT_PAGE_ONLY');
  assert.equal(p.observedFieldsPercent, 75);
  assert.equal(p.positionEstimatePercent, 40);
  assert.equal(p.applicationCompletionPercent, null);
  assert.equal(p.status, 'IN_PROGRESS');
  assert.equal(p.finalSubmitAutomated, false);
});
test('unknown future steps never yield a synthetic whole-job percent', () => {
  const s = fixture(); s.knownSectionCount = null;
  const p = projectApplicationCheckpoint(s, s.opportunityId, url, now);
  assert.equal(p.positionEstimatePercent, null);
  assert.equal(p.applicationCompletionPercent, null);
  assert.equal(p.currentSection, 'Role-specific skills');
});
test('stale evidence keeps named resume point, but invalidates numeric claims', () => {
  const s = fixture(); s.sections[0].inspectedAt = '2026-10-30T16:00:00Z';
  const p = projectApplicationCheckpoint(s, s.opportunityId, url, now);
  assert.equal(p.evidence, 'STALE');
  assert.equal(p.currentSection, 'Role-specific skills');
  assert.equal(p.observedFieldsPercent, null);
  assert.match(p.nextAction, /reinspect/i);
});
test('another opportunity or URL never inherits a checkpoint', () => {
  for (const [id, location] of [['job-OTHER', url], ['job-123','https://other.example.org/jobs/9']]) {
    const p = projectApplicationCheckpoint(fixture(), id, location, now);
    assert.equal(p.status, 'NOT_OBSERVED');
    assert.equal(p.currentSection, null);
    assert.equal(p.observedFieldsPercent, null);
  }
});
test('protected decisions are not counted as verified from DOM checkboxes', () => {
  const s = fixture(); s.sections[0].fields = [{
    id:'privacy',label:'Privacy terms',required:'required',domVerified:true,
    operatorOnly:true,operatorConfirmed:false,
  }];
  const p = projectApplicationCheckpoint(s,s.opportunityId,url,now);
  assert.equal(p.verifiedRequired,0);
  assert.equal(p.manualDecisionsRemaining,1);
  assert.equal(p.status,'NEEDS_USER');
});
test('unknown required controls block readiness even if known fields look complete', () => {
  const s=fixture();s.sections[0].fields=s.sections[0].fields.filter(f=>f.domVerified);
  s.sections[0].fields.push({id:'dynamic',label:'Unmapped control',required:'unknown',domVerified:true});
  const p=projectApplicationCheckpoint(s,s.opportunityId,url,now);
  assert.equal(p.status,'NEEDS_USER');assert.equal(p.observedFieldsPercent,null);
});
test('terminal review is not submission; all sections must be inventoried before Ready', () => {
  const s=fixture();s.sections[0].fields.forEach(f=>f.domVerified=true);
  s.terminalReviewObserved=true;
  assert.equal(projectApplicationCheckpoint(s,s.opportunityId,url,now).status,'IN_PROGRESS');
  s.knownSectionCount=1;s.sections[0].index=0;
  const p=projectApplicationCheckpoint(s,s.opportunityId,url,now);
  assert.equal(p.status,'READY_FOR_FINAL_REVIEW');
  assert.match(p.nextAction,/Final Submit is yours/);
  assert.equal(p.applicationCompletionPercent,null);
});
test('only an independently verified receipt may confer submitted status', () => {
  const s=fixture();s.employerSubmissionReceiptVerified=true;
  assert.equal(projectApplicationCheckpoint(s,s.opportunityId,url,now).status,'SUBMITTED_CONFIRMED');
  s.employerSubmissionReceiptVerified=false;s.terminalReviewObserved=true;
  assert.notEqual(projectApplicationCheckpoint(s,s.opportunityId,url,now).status,'SUBMITTED_CONFIRMED');
});
test('malformed or duplicated sections and fields fail closed', () => {
  const s=fixture();s.sections[0].fields.push({...s.sections[0].fields[0]});
  assert.equal(projectApplicationCheckpoint(s,s.opportunityId,url,now).status,'NOT_OBSERVED');
  const other=fixture();other.knownSectionCount=1;
  assert.equal(projectApplicationCheckpoint(other,other.opportunityId,url,now).status,'NOT_OBSERVED');
});
