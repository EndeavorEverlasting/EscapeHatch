import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCommunityEntry, evaluateDiscordCommunity, resumeAfterVerifiedDiscord,
  MICRO1_DISCORD_ENTRY, type DiscordCommunityInput, type DiscordMembershipProof } from './discord-community-flow.ts';
const now = new Date('2026-11-06T10:00:00Z');
const input: DiscordCommunityInput = {
  opportunityId: 'synthetic-opportunity', communityKey: 'synthetic-certified-community',
  entryUrl: MICRO1_DISCORD_ENTRY, hostSessionBinding: 'eh-session-1',
  partnerAuthenticated: false, inviteObserved: false, discordAuthenticated: false,
  explicitJoinConsent: false,
};
const proof: DiscordMembershipProof = {
  source:'trusted_discord_membership_readback', opportunityId:input.opportunityId,
  communityKey:input.communityKey, hostSessionBinding:input.hostSessionBinding,
  discordUserBinding:'discord-user-123', guildId:'123456789012345678', member:true,
  pendingScreening:false, observedAtUtc:now.toISOString(),
};
const joined = { ...input, partnerAuthenticated:true, inviteObserved:true, discordAuthenticated:true,
  discordUserBinding:'discord-user-123', expectedGuildId:'123456789012345678', explicitJoinConsent:true,
  membershipProof:proof } as const;
test('micro1 CTA is a partner portal, not a Discord invite, and URL validation fails closed', () => {
  assert.equal(classifyCommunityEntry(MICRO1_DISCORD_ENTRY),'PARTNER_PORTAL');
  assert.equal(classifyCommunityEntry('https://discord.gg/Abcd12'),'DISCORD_INVITE');
  assert.equal(classifyCommunityEntry('https://discord.com/invite/Abcd12'),'DISCORD_INVITE');
  for(const url of ['https://talent.micro1.ai/dashboard?discord=join&redirect=https://evil.test',
    'https://talent.micro1.ai.evil.test/dashboard?discord=join','http://talent.micro1.ai/dashboard?discord=join',
    'https://talent.micro1.ai/dashboard?discord=join#secret','https://discord.gg.evil.test/Abcd12',
    'https://discord.com@evil.test/invite/Abcd12','https://discord.gg/Abcd12?utm=1'])
    assert.equal(classifyCommunityEntry(url),null,url);
});
test('partner login, invite discovery, Discord login and consent are independent gates', () => {
  assert.equal(evaluateDiscordCommunity(input,now).stage,'PARTNER_AUTH_HANDOFF');
  assert.equal(evaluateDiscordCommunity({...input,partnerAuthenticated:true},now).stage,'INVITE_DISCOVERY_REQUIRED');
  assert.equal(evaluateDiscordCommunity({...input,partnerAuthenticated:true,inviteObserved:true},now).stage,'DISCORD_AUTH_HANDOFF');
  assert.equal(evaluateDiscordCommunity({...joined,membershipProof:null,explicitJoinConsent:false},now).stage,'JOIN_CONSENT_REQUIRED');
  assert.equal(evaluateDiscordCommunity({...joined,membershipProof:null},now).stage,'JOIN_PENDING');
});
test('exact session/user/guild/opportunity fresh membership proof is required', () => {
  assert.equal(evaluateDiscordCommunity(joined,now).stage,'MEMBERSHIP_CONFIRMED');
  assert.equal(evaluateDiscordCommunity({...joined,membershipProof:{...proof,pendingScreening:true}},now).stage,'MEMBERSHIP_SCREENING_REQUIRED');
  const variants: Partial<DiscordMembershipProof>[] = [
    {opportunityId:'other'}, {communityKey:'other'}, {hostSessionBinding:'other'},
    {discordUserBinding:'other'}, {guildId:'987654321098765432'},
    {observedAtUtc:'2026-11-05T10:00:00Z'}, {observedAtUtc:'2026-11-06T11:00:00Z'}
  ];
  for(const change of variants) assert.equal(evaluateDiscordCommunity({...joined,membershipProof:{...proof,...change}},now).canResumeBoundApplication,false);
  assert.equal(evaluateDiscordCommunity({...joined,expectedGuildId:'987654321098765432'},now).canResumeBoundApplication,false);
});
test('only joined member resumes prior opportunity, without submit authority', async () => {
  let calls=0;
  const blocked=await resumeAfterVerifiedDiscord(input,async()=>{calls++;return 'SHOULD_NOT_RUN'},now);
  assert.equal(blocked.application,undefined);
  const ready=await resumeAfterVerifiedDiscord(joined,async id=>{calls++;assert.equal(id,input.opportunityId);return 'REVIEW_READY'},now);
  assert.equal(ready.application,'REVIEW_READY');
  assert.equal(ready.verdict.mayAutoJoin,false);
  assert.equal(ready.verdict.mayAutoSubmit,false);
  assert.equal(calls,1);
});
test('Discord desktop installation is not mandatory for browser flow', () => {
  assert.equal(evaluateDiscordCommunity({...joined,membershipProof:null},now).stage,'JOIN_PENDING');
});
