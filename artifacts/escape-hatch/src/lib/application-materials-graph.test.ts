import assert from 'node:assert/strict';
import test from 'node:test';
import {proposeApplicationMaterials,validateMaterialsGraph,type MaterialsGraph,type FormSlot} from './application-materials-graph.ts';
const h=(c:string)=>c.repeat(64);
function fixture():MaterialsGraph {return {
 ownerId:'synthetic-applicant-A',opportunityId:'synthetic-opportunity-1',
 evidenceIds:['experience-evidence','project-evidence'],
 nodes:[
  {id:'career-master',ownerId:'synthetic-applicant-A',opportunityId:null,kind:'canonical_resume',sha256:h('a'),revision:'r1',review:'approved',parentIds:[],sourceEvidenceIds:['experience-evidence']},
  {id:'domain-it',ownerId:'synthetic-applicant-A',opportunityId:null,kind:'domain_resume',sha256:h('b'),revision:'r1',review:'approved',parentIds:['career-master'],sourceEvidenceIds:['experience-evidence']},
  {id:'role-resume',ownerId:'synthetic-applicant-A',opportunityId:'synthetic-opportunity-1',kind:'job_resume',sha256:h('c'),revision:'r1',review:'approved',parentIds:['domain-it'],sourceEvidenceIds:['experience-evidence']},
  {id:'role-cover',ownerId:'synthetic-applicant-A',opportunityId:'synthetic-opportunity-1',kind:'cover_letter',sha256:h('d'),revision:'r1',review:'approved',parentIds:['domain-it'],sourceEvidenceIds:['experience-evidence']},
  {id:'role-case',ownerId:'synthetic-applicant-A',opportunityId:'synthetic-opportunity-1',kind:'case_study',sha256:h('e'),revision:'r1',review:'approved',parentIds:['domain-it'],sourceEvidenceIds:['project-evidence']},
 ],
 answers:[{id:'why-role',ownerId:'synthetic-applicant-A',opportunityId:'synthetic-opportunity-1',questionKey:'why-this-role',textDigest:h('f'),review:'approved',sourceEvidenceIds:['experience-evidence']}]
};}
function slot(n:number,override:Partial<FormSlot>={}):FormSlot {return {
 id:'observed-support',kind:'supporting_documents',observed:true,evidenceDigest:h('f'),maxFiles:n,
 acceptedKinds:['cover_letter','job_resume','case_study'],persistence:'isolated_application',...override,
};}
test('observed one supporting document prioritizes cover letter while preserving written answer',()=>{
 const a=proposeApplicationMaterials(fixture(),slot(1));
 assert.deepEqual(a.attachmentIds,['role-cover']);assert.deepEqual(a.answerIds,['why-role']);
 assert.equal(a.mayAutoUpload,false);assert.equal(a.state,'PACKET_PROPOSED');
});
test('observed two document capacity allows cover and isolated role resume',()=>{
 assert.deepEqual(proposeApplicationMaterials(fixture(),slot(2)).attachmentIds,['role-cover','role-resume']);
});
test('observed three document capacity permits cover, job resume, and case study',()=>{
 assert.deepEqual(proposeApplicationMaterials(fixture(),slot(3)).attachmentIds,['role-cover','role-resume','role-case']);
});
test('unknown capacity, unknown purpose or unknown persistence never guessed from Add button',()=>{
 for(const s of [slot(1,{maxFiles:null}),slot(1,{kind:'unknown'}),slot(2,{persistence:'unknown'}),
   slot(1,{observed:false}),slot(1,{evidenceDigest:null})]){
  const r=proposeApplicationMaterials(fixture(),s);
  assert.equal(r.state,'REVIEW_REQUIRED');assert.deepEqual(r.attachmentIds,[]);
 }
});
test('global support slot never carries job resume just because second attachment allowed',()=>{
 const r=proposeApplicationMaterials(fixture(),slot(3,{persistence:'persistent_global'}));
 assert.deepEqual(r.attachmentIds,['role-cover','role-case']);
 assert.ok(r.blockers.includes('JOB_RESUME_MAY_REPLACE_PLATFORM_MASTER'));
 assert.equal(r.state,'REVIEW_REQUIRED');
});
test('explicit cover slot never tries a resume or case study',()=>{
 const r=proposeApplicationMaterials(fixture(),slot(1,{kind:'cover_letter',acceptedKinds:['cover_letter']}));
 assert.deepEqual(r.attachmentIds,['role-cover']);
});
test('explicit resume slot delegates to existing domain resume graph',()=>{
 const r=proposeApplicationMaterials(fixture(),slot(1,{kind:'resume',acceptedKinds:['job_resume']}));
 assert.equal(r.blockers[0],'RESUME_SLOT_USE_RESUME_SELECTION_GRAPH');
 assert.deepEqual(r.attachmentIds,[]);
});
test('missing optional cover is a review suggestion, not fabricated attachment',()=>{
 const g=fixture();g.nodes=g.nodes.filter(n=>n.id!=='role-cover');
 const result=proposeApplicationMaterials(g,slot(1));
 assert.equal(result.state,'REVIEW_REQUIRED');assert.deepEqual(result.attachmentIds,[]);
});
test('ambiguous reviewed cover and stale unapproved case do not slip into packet',()=>{
 const g=fixture(),copy={...g.nodes.find(n=>n.id==='role-cover')!,id:'other-cover'};
 g.nodes.push(copy);
 (g.nodes.find(n=>n.id==='role-case')!).review='draft';
 const r=proposeApplicationMaterials(g,slot(3));
 assert.deepEqual(r.attachmentIds,['role-resume']);
 assert.equal(r.state,'REVIEW_REQUIRED');
});
test('mixed applicant ownership, wrong opportunity and missing claim evidence reject all outputs',()=>{
 const a=fixture();a.nodes[3].ownerId='another-applicant';
 assert.equal(proposeApplicationMaterials(a,slot(3)).blockers[0],'INVALID_MATERIALS_GRAPH');
 const b=fixture();b.answers[0].opportunityId='other';
 assert.equal(proposeApplicationMaterials(b,slot(3)).blockers[0],'INVALID_MATERIALS_GRAPH');
 const c=fixture();c.answers[0].sourceEvidenceIds=['invented'];
 assert.equal(proposeApplicationMaterials(c,slot(3)).blockers[0],'INVALID_MATERIALS_GRAPH');
});
test('cyclic and missing parents fail closed',()=>{
 const a=fixture();a.nodes[0].parentIds=['role-case'];
 assert.throws(()=>validateMaterialsGraph(a),/CYCLE/);
 const b=fixture();b.nodes[0].parentIds=['absent'];
 assert.throws(()=>validateMaterialsGraph(b),/UNKNOWN_PARENT/);
});
test('multi-domain graph with thousands of nodes validates iteratively',()=>{
 const g=fixture();
 for(let i=0;i<1200;i++)g.nodes.push({id:'domain-'+i,ownerId:g.ownerId,opportunityId:null,
   kind:'domain_resume',sha256:h('b'),revision:'r'+i,review:'approved',parentIds:['career-master'],sourceEvidenceIds:['experience-evidence']});
 assert.doesNotThrow(()=>validateMaterialsGraph(g));
 assert.deepEqual(proposeApplicationMaterials(g,slot(1)).attachmentIds,['role-cover']);
});
test('unapproved narrative answer not included even if cover letter approved',()=>{
 const g=fixture();g.answers[0].review='draft';
 const r=proposeApplicationMaterials(g,slot(1));
 assert.deepEqual(r.attachmentIds,['role-cover']);assert.deepEqual(r.answerIds,[]);
});
