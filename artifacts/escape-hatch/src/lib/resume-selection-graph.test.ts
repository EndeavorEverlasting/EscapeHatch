import test from 'node:test';
import assert from 'node:assert/strict';
import { impactedResumeDescendants, resolveResumeForPlatform, resolveEffectiveMasterForQueue, validateResumeGraph,
  type ResumeGraph, type ResumeNode } from './resume-selection-graph.ts';
const H = (c: string) => c.repeat(64);
function fixture(): ResumeGraph {
  return {
    schema: 'escapehatch/resume-selection-graph/v1', owner: 'synthetic-owner-a',
    nodes: [
      { id: 'base', type: 'resume', owner: 'synthetic-owner-a', tier: 'canonical', revision: 'm1', digest: H('a'), review: 'approved' },
      { id: 'it', type: 'resume', owner: 'synthetic-owner-a', tier: 'domain', domainTags: ['it'], revision: 'i1', digest: H('b'), review: 'approved' },
      { id: 'pm', type: 'resume', owner: 'synthetic-owner-a', tier: 'domain', domainTags: ['management'], revision: 'p1', digest: H('c'), review: 'approved' },
      { id: 'construction', type: 'resume', owner: 'synthetic-owner-a', tier: 'domain', domainTags: ['construction'], revision: 'c1', digest: H('d'), review: 'approved' },
      { id: 'job-specific', type: 'resume', owner: 'synthetic-owner-a', tier: 'job', revision: 'j1', digest: H('e'), review: 'approved' },
      { id: 'example-role', type: 'opportunity', owner: 'synthetic-owner-a', postingDigest: H('f'), domainWeights: { management: 4, it: 2, construction: 1 } },
      { id: 'global', type: 'platform_slot', owner: 'synthetic-owner-a', platform: 'indeed', scope: 'persistent_global', observation: 'verified', observationReceiptDigest: H('a') },
      { id: 'perapp', type: 'platform_slot', owner: 'synthetic-owner-a', platform: 'employer-ats', scope: 'isolated_application', observation: 'verified', observationReceiptDigest: H('b') },
      { id: 'unknown', type: 'platform_slot', owner: 'synthetic-owner-a', platform: 'glassdoor', scope: 'unknown', observation: 'unverified' },
      { id: 'draft-application', type: 'application', owner: 'synthetic-owner-a', opportunityId: 'example-role', state: 'in_progress' },
    ],
    edges: [
      {kind:'derives_from',from:'it',to:'base',parentDigest:H('a')},
      {kind:'derives_from',from:'pm',to:'base',parentDigest:H('a')},
      {kind:'derives_from',from:'construction',to:'base',parentDigest:H('a')},
      {kind:'derives_from',from:'job-specific',to:'pm',parentDigest:H('c')},
      {kind:'targets_opportunity',from:'job-specific',to:'example-role'},
      {kind:'slot_points_to',from:'global',to:'it'},
      {kind:'application_uses',from:'draft-application',to:'job-specific'},
    ],
  };
}
const select = { opportunityId: 'example-role', platformSlotId: 'global' };
test('provider-wide resume resolves domain management master and never returns job-specific derivative', () => {
  const r = resolveResumeForPlatform(fixture(), select);
  assert.deepEqual([r.action,r.reason,r.candidateId,r.mayAutoReplacePersistentResume,r.mayAutoSubmit],
    ['UPLOAD_REQUIRES_CONSENT','PERSISTENT_RESUME_REPLACEMENT_NEEDS_CONSENT','pm',false,false]);
});
test('stable existing domain slot becomes no-op; per application permits reviewed job derivative only by consent', () => {
  const g = fixture(); g.edges = g.edges.map(e => e.kind==='slot_points_to'? {...e,to:'pm'} :e);
  const keep = resolveResumeForPlatform(g,select);
  assert.equal(keep.action,'KEEP_CURRENT');
  assert.equal(keep.candidateId,'pm');
  const separate = resolveResumeForPlatform(g,{opportunityId:'example-role',platformSlotId:'perapp'});
  assert.deepEqual([separate.action,separate.candidateId],['UPLOAD_REQUIRES_CONSENT','job-specific']);
});
test('unknown platform persistence is review, not an upload', () => {
  const r=resolveResumeForPlatform(fixture(),{...select,platformSlotId:'unknown'});
  assert.equal(r.reason,'PLATFORM_SLOT_SEMANTICS_UNVERIFIED');
  assert.equal(r.candidateId,null);
});
test('unverified platform slot still blocks after being classified as global',()=>{
  const g=fixture();const slot=g.nodes.find(n=>n.id==='global');
  if (!slot || slot.type!=='platform_slot') throw Error('fixture missing');
  slot.observation='unverified';
  assert.equal(resolveResumeForPlatform(g,select).action,'REVIEW_REQUIRED');
});
test('a persistent globally uploaded job resume is never silently replaced with another job resume',()=>{
 const g=fixture();g.edges=g.edges.map(e=>e.kind==='slot_points_to'?{...e,to:'job-specific'}:e);
 const r=resolveResumeForPlatform(g,select);
 assert.equal(r.reason,'PERSISTENT_SLOT_HAS_JOB_DERIVATIVE');
 assert.equal(r.candidateId,'pm');
 assert.equal(r.mayAutoReplacePersistentResume,false);
});
test('stale upstream revision invalidates every derivative and never calls it current',()=>{
  const g=fixture();const base=g.nodes.find(n=>n.id==='base') as ResumeNode;base.digest=H('9');
  const r=resolveResumeForPlatform(g,select);
  assert.equal(r.candidateId,'base');
  assert.equal(r.action,'UPLOAD_REQUIRES_CONSENT');
  assert.deepEqual(impactedResumeDescendants(g,'base'),['construction','it','job-specific','pm']);
});
test('a pair of equally matching domain masters requires an explicit choice',()=>{
  const g=fixture();const opp=g.nodes.find(n=>n.id==='example-role');
  if(!opp || opp.type!=='opportunity')throw Error('fixture');
  opp.domainWeights={management:4,it:4,construction:1};
  assert.equal(resolveResumeForPlatform(g,select).reason,'AMBIGUOUS_DOMAIN_MASTERS');
});
test('invalid graph and cross-applicant nodes are rejected without leaking candidate',()=>{
 const g=fixture();g.nodes[1].owner='another-applicant';
 assert.throws(()=>validateResumeGraph(g),/cross-owner/);
 assert.equal(resolveResumeForPlatform(g,select).reason,'INVALID_GRAPH');
});
test('missing parent, duplicated node and malformed fingerprint fail closed',()=>{
 const a=fixture();a.edges=a.edges.filter(e=>e.from!=='pm'||e.kind!=='derives_from');
 assert.throws(()=>validateResumeGraph(a),/source master/);
 const b=fixture();b.nodes.push({...b.nodes[0]});
 assert.throws(()=>validateResumeGraph(b),/duplicate/);
 const c=fixture();c.edges[0].parentDigest='unknown';
 assert.throws(()=>validateResumeGraph(c),/derivation/);
});
test('stable on graph input order permutation',()=>{
 const a=fixture(),b=fixture();b.nodes.reverse();b.edges.reverse();
 assert.deepEqual(resolveResumeForPlatform(a,select),resolveResumeForPlatform(b,select));
});
test('draft/unapproved domain never overrides a reviewed reusable master',()=>{
 const g=fixture();(g.nodes.find(x=>x.id==='pm') as ResumeNode).review='draft';
 const r=resolveResumeForPlatform(g,select);
 assert.equal(r.candidateId,'it');
});
test('unknown opportunity and incomplete schema never permit a file mutation',()=>{
 const g=fixture();
 assert.equal(resolveResumeForPlatform(g,{opportunityId:'missing',platformSlotId:'global'}).action,'REVIEW_REQUIRED');
 (g as unknown as {schema:string}).schema='untrusted';
 assert.equal(resolveResumeForPlatform(g,select).action,'REVIEW_REQUIRED');
});
test('submitting an application cannot change immutable attachment provenance',()=>{
 const g=fixture(),e=g.edges.find(e=>e.kind==='application_uses');
 assert.equal(e?.to,'job-specific');
 (g.nodes.find(n=>n.id==='draft-application') as {state:string}).state='submitted';
 assert.equal(resolveResumeForPlatform(g,select).candidateId,'pm');
 assert.equal(g.edges.find(e=>e.kind==='application_uses')?.to,'job-specific');
});

test('unproven provider slot cannot claim verified persistence with no receipt',()=>{
 const g=fixture(),slot=g.nodes.find(n=>n.id==='global');
 if(!slot || slot.type!=='platform_slot')throw Error('fixture');
 delete slot.observationReceiptDigest;
 assert.equal(resolveResumeForPlatform(g,select).reason,'INVALID_GRAPH');
});
test('a job derivative cannot belong to multiple opportunities or attach to a different one',()=>{
 const g=fixture();
 g.nodes.push({id:'other-opportunity',type:'opportunity',owner:g.owner,postingDigest:H('f'),domainWeights:{it:3}});
 g.edges.push({kind:'targets_opportunity',from:'job-specific',to:'other-opportunity'});
 assert.throws(()=>validateResumeGraph(g),/invalid job target/);
 const a=fixture();
 (a.nodes.find(n=>n.id==='draft-application') as {opportunityId:string}).opportunityId='other-opportunity';
 a.nodes.push({id:'other-opportunity',type:'opportunity',owner:a.owner,postingDigest:H('f'),domainWeights:{it:2}});
 assert.throws(()=>validateResumeGraph(a),/crossed opportunity/);
});
test('large DAG of approved domain variants validates without recursive traversal',()=>{
 const g=fixture(),count=1200;
 for(let i=0;i<count;i++){
   const id='synthetic-domain-'+i;
   g.nodes.push({id,type:'resume',owner:g.owner,tier:'domain',review:'approved',
     revision:'d'+i,digest:H('b'),domainTags:['unique-domain-'+i]});
   g.edges.push({kind:'derives_from',from:id,to:'base',parentDigest:H('a')});
 }
 assert.equal(validateResumeGraph(g).size,10+count);
 assert.equal(resolveResumeForPlatform(g,select).candidateId,'pm');
});

test('queue-level effective master stays reusable across multiple jobs without upload thrash',()=>{
 const g=fixture();
 g.nodes.push({id:'another-management-role',type:'opportunity',owner:g.owner,postingDigest:H('a'),
   domainWeights:{management:4,it:1}});
 const input={opportunityIds:['example-role','another-management-role'],platformSlotId:'global'};
 const result=resolveEffectiveMasterForQueue(g,input);
 assert.equal(result.candidateId,'pm');
 assert.equal(result.action,'UPLOAD_REQUIRES_CONSENT');
 assert.equal(result.mayAutoReplacePersistentResume,false);
 g.edges=g.edges.map(e=>e.kind==='slot_points_to'?{...e,to:'pm'}:e);
 assert.deepEqual(resolveEffectiveMasterForQueue(g,input).action,'KEEP_CURRENT');
 input.opportunityIds.reverse();
 assert.equal(resolveEffectiveMasterForQueue(g,input).candidateId,'pm');
});
test('mixed domain queue tie demands review rather than churning platform master',()=>{
 const g=fixture();
 g.nodes.push({id:'it-job',type:'opportunity',owner:g.owner,postingDigest:H('a'),domainWeights:{it:4}});
 const o=g.nodes.find(n=>n.id==='example-role');
 if(!o||o.type!=='opportunity')throw Error('fixture');
 o.domainWeights={management:4};
 const r=resolveEffectiveMasterForQueue(g,{platformSlotId:'global',opportunityIds:['example-role','it-job']});
 assert.equal(r.reason,'QUEUE_DOMAIN_CONFLICT_REVIEW_REQUIRED');
 assert.equal(r.candidateId,null);
});
test('queue must be opportunity-bound and must target an observed global slot',()=>{
 const g=fixture();
 assert.equal(resolveEffectiveMasterForQueue(g,{platformSlotId:'unknown',opportunityIds:['example-role']}).action,'REVIEW_REQUIRED');
 assert.equal(resolveEffectiveMasterForQueue(g,{platformSlotId:'global',opportunityIds:['unknown-role']}).reason,'QUEUE_HAS_UNKNOWN_OPPORTUNITY');
 assert.equal(resolveEffectiveMasterForQueue(g,{platformSlotId:'global',opportunityIds:['example-role','example-role']}).reason,'MISSING_QUEUE_OPPORTUNITIES');
 assert.equal(resolveEffectiveMasterForQueue(g,{platformSlotId:'perapp',opportunityIds:['example-role']}).reason,'PERSISTENT_PLATFORM_SCOPE_UNVERIFIED');
});
