import assert from 'node:assert/strict';
import { test } from 'node:test';
import { admitExtensionProfileProjection, EXTENSION_PROFILE_FIELDS } from './extension-profile-admission.ts';
const id = n => String(n).padStart(8,'0') + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const rev = x => x.repeat(64);
const fresh = () => {
  const ownerId = id(1), workspaceId = id(2), installationId = id(3);
  return {
    admission:{ok:true,ownerId,workspaceId},
    workspace:{ownerId,workspaceId,installationId,profileRevision:rev('a')},
    pairing:{ownerId,workspaceId,installationId,extensionId:'synthetic-extension',browserProfileId:'synthetic-chrome-A',pairingConfirmed:true},
    snapshot:{ownerId,workspaceId,profileRevision:rev('a'),profile:{first_name:'Applicant A', email:'applicant@example.test',phone:'555-0000',phone_authority:'user_confirmed_primary'},approvedFields:['first_name','email','phone']},
  };
};
const run = input => admitExtensionProfileProjection(input);
const deny = (name, mutate, reason) => test(name, () => {let x=fresh();mutate(x);assert.deepEqual(run(x),{ok:false,reason})});
test('approved same-owner snapshot produces only approved values and never infers phone authority',()=>{
  const x=fresh();let r=run(x);assert.equal(r.action,'PROJECTION_READY');assert.deepEqual(r.profile,{first_name:'Applicant A',email:'applicant@example.test',phone:'555-0000',phone_authority:'unconfirmed'});
  assert.equal(JSON.stringify(r).includes('example secret'),false);
});
test('approved phone authority must be separately reviewed',()=>{const x=fresh();x.snapshot.approvedFields.push('phone_authority');let r=run(x);assert.equal(r.profile.phone_authority,'user_confirmed_primary')});
test('same-owner identical profile is idempotent',()=>{let x=fresh();let p=run(x).profile;x.existing={...x.pairing,profile:p}; assert.equal(run(x).action,'ALREADY_CURRENT')});
test('known current extension profile is not silently replaced',()=>{let x=fresh();x.existing={...x.pairing,profile:{email:'earlier@example.test',phone_authority:'unconfirmed'}};assert.equal(run(x).reason,'EXISTING_PROFILE_REVIEW_REQUIRED')});
deny('no trusted admission',x=>{x.admission={ok:false,reason:'OWNER_UNBOUND'}},'OWNER_UNVERIFIED');
deny('applicant B cannot reuse A admission',x=>{x.snapshot.ownerId=id(11)},'OWNER_MISMATCH');
deny('developer context cannot reuse applicant identity',x=>{x.admission.ownerId=id(12)},'OWNER_MISMATCH');
deny('workspace switch cannot retain old browser pairing',x=>{x.pairing.workspaceId=id(4)},'WORKSPACE_MISMATCH');
deny('installation switch requires new pairing',x=>{x.pairing.installationId=id(4)},'INSTALLATION_MISMATCH');
deny('missing pairing is denied',x=>{x.pairing.pairingConfirmed=false},'OWNER_UNVERIFIED');
deny('invalid owner IDs fail closed',x=>{x.workspace.ownerId='Applicant A'},'OWNER_UNVERIFIED');
deny('old profile revision cannot be hydrated',x=>{x.snapshot.profileRevision=rev('b')},'PROFILE_REVISION_MISMATCH');
deny('source cannot request protected fields',x=>{x.snapshot.approvedFields.push('salary_expectation')},'INVALID_PROFILE');
deny('source cannot include duplicate approvals',x=>{x.snapshot.approvedFields.push('email')},'INVALID_PROFILE');
deny('blank profile does not count as ready',x=>{x.snapshot.profile={};x.snapshot.approvedFields=[]},'NO_APPROVED_PROFILE');
deny('wrong existing Chrome profile cannot be overwritten',x=>{x.existing={...x.pairing,browserProfileId:'synthetic-chrome-B',profile:{phone_authority:'unconfirmed'}}},'CHROME_PROFILE_MISMATCH');
deny('wrong existing applicant remains untouched',x=>{x.existing={...x.pairing,ownerId:id(11),profile:{phone_authority:'unconfirmed'}}},'OWNER_MISMATCH');
deny('unapproved phone authority invalid',x=>{x.snapshot.approvedFields.push('phone_authority');x.snapshot.profile.phone_authority='unreviewed'},'INVALID_PROFILE');
test('only the approved bounded identity keys are exported',()=>{assert.ok(EXTENSION_PROFILE_FIELDS.length<20);assert.equal(EXTENSION_PROFILE_FIELDS.includes('password'),false);assert.equal(EXTENSION_PROFILE_FIELDS.includes('eeo'),false)});
