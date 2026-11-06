import assert from 'node:assert/strict';
import test from 'node:test';
import { readDiscordMembership } from './discord-membership-verifier.ts';
import { evaluateDiscordCommunity, MICRO1_DISCORD_ENTRY } from './discord-community-flow.ts';
const target = { discordUserId: '123456789012345678', guildId:'987654321098765432',
 opportunityId:'synthetic-micro1',communityKey:'synthetic-guild',hostSessionBinding:'synthetic-session' };
const now = new Date('2026-11-06T12:00:00Z');
const json = (o:object, status=200) => new Response(JSON.stringify(o), { status,
 headers:{'content-type':'application/json'} });
function provider(opts:{userId?:string, guildStatus?:number,pending?:boolean}={}){
 const paths:string[]=[];
 const fetcher=async(url:RequestInfo|URL,init?:RequestInit)=>{
   const path=String(url); paths.push(path);
   assert.equal(init?.method,'GET'); assert.equal(init?.redirect,'error');
   assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer secret-test-token');
   if(path.endsWith('/users/@me'))return json({id:opts.userId||target.discordUserId});
   if(path.endsWith('/member'))return opts.guildStatus?json({},opts.guildStatus):json({pending:opts.pending??false,user:{id:target.discordUserId}});
   throw Error('UNEXPECTED_ENDPOINT');
 };
 return {fetcher:fetcher as typeof fetch, paths};
}
test('official endpoints provide scoped readback without exposing OAuth token',async()=>{
 const p=provider(); const result=await readDiscordMembership('secret-test-token',target,{fetch:p.fetcher,now:()=>now});
 assert.equal(result.ok,true); if(!result.ok)return;
 assert.equal(result.proof.guildId,target.guildId);
 assert.equal(result.proof.discordUserBinding,target.discordUserId);
 assert.equal(JSON.stringify(result).includes('secret-test-token'),false);
 assert.equal(p.paths.length,2);
 const stage=evaluateDiscordCommunity({opportunityId:target.opportunityId,communityKey:target.communityKey,
  entryUrl:MICRO1_DISCORD_ENTRY,hostSessionBinding:target.hostSessionBinding,
  discordUserBinding:target.discordUserId,expectedGuildId:target.guildId,
  partnerAuthenticated:true,inviteObserved:true,discordAuthenticated:true,explicitJoinConsent:true,
  membershipProof:result.proof},now);
 assert.equal(stage.stage,'MEMBERSHIP_CONFIRMED');
});
test('wrong identity, missing guild or scope, and screening never count as complete',async()=>{
 assert.deepEqual(await readDiscordMembership('secret-test-token',target,{fetch:provider({userId:'111111111111111111'}).fetcher,now:()=>now}),{ok:false,reason:'INVALID_BINDING'});
 assert.deepEqual(await readDiscordMembership('secret-test-token',target,{fetch:provider({guildStatus:404}).fetcher,now:()=>now}),{ok:false,reason:'NOT_A_MEMBER'});
 assert.deepEqual(await readDiscordMembership('secret-test-token',target,{fetch:provider({guildStatus:403}).fetcher,now:()=>now}),{ok:false,reason:'PERMISSION_REQUIRED'});
 const result=await readDiscordMembership('secret-test-token',target,{fetch:provider({pending:true}).fetcher,now:()=>now});
 assert.equal(result.ok,true); if(result.ok)assert.equal(result.proof.pendingScreening,true);
});
test('invalid token and guild cannot make provider requests',async()=>{
 let called=false;const fetcher=(async()=>{called=true;throw Error('NOT_ALLOWED')}) as typeof fetch;
 const result=await readDiscordMembership('line\nbreak',target,{fetch:fetcher});
 assert.equal(result.ok,false);assert.equal(called,false);
 const wrong=await readDiscordMembership('token',{...target,guildId:'bad'},{fetch:fetcher});
 assert.equal(wrong.ok,false);assert.equal(called,false);
});
