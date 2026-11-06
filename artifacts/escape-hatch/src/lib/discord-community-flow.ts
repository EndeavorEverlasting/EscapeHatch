/** Evidence-gated community companion. This does not handle credentials, join guilds,
 * or submit applications. Only the owner-bound host may supply observations. */
export const DISCORD_COMMUNITY_FLOW_SCHEMA = 'escapehatch/discord-community-flow/v2';
export const MICRO1_DISCORD_ENTRY = 'https://talent.micro1.ai/dashboard?discord=join';
export type EntryKind = 'PARTNER_PORTAL' | 'DISCORD_INVITE';
export type CommunityStage = 'BLOCKED' | 'PARTNER_AUTH_HANDOFF' | 'INVITE_DISCOVERY_REQUIRED' |
  'DISCORD_AUTH_HANDOFF' | 'JOIN_CONSENT_REQUIRED' | 'JOIN_PENDING' |
  'MEMBERSHIP_SCREENING_REQUIRED' | 'MEMBERSHIP_CONFIRMED';
export type DiscordMembershipProof = {
  source: 'trusted_discord_membership_readback';
  opportunityId: string;
  communityKey: string;
  hostSessionBinding: string;
  discordUserBinding: string;
  guildId: string;
  member: true;
  pendingScreening: boolean;
  observedAtUtc: string;
};
export type DiscordCommunityInput = {
  opportunityId: string;
  communityKey: string;
  entryUrl: string;
  hostSessionBinding: string;
  discordUserBinding?: string;
  expectedGuildId?: string;
  partnerAuthenticated: boolean;
  inviteObserved: boolean;
  discordAuthenticated: boolean;
  explicitJoinConsent: boolean;
  membershipProof?: DiscordMembershipProof | null;
};
export type DiscordCommunityVerdict = {
  stage: CommunityStage;
  reason: string;
  entryKind: EntryKind | null;
  canResumeBoundApplication: boolean;
  mayAutoJoin: false;
  mayAutoSubmit: false;
};
const MAX_PROOF_AGE_MS = 15 * 60 * 1000;
const boundedId = (x: unknown): x is string => typeof x === 'string' &&
  x.length > 0 && x.length <= 160 && /^[a-zA-Z0-9:_-]+$/.test(x);
const guildId = (x: unknown): x is string => typeof x === 'string' && /^\d{15,22}$/.test(x);
/** Platform dashboard CTA is not a Discord invite; never follow redirects as authority. */
export function classifyCommunityEntry(url: string): EntryKind | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return null;
    if (u.hostname === 'talent.micro1.ai' && u.pathname === '/dashboard' &&
        u.searchParams.toString() === 'discord=join') return 'PARTNER_PORTAL';
    if (u.search || !(u.hostname === 'discord.gg' || u.hostname === 'discord.com' || u.hostname === 'www.discord.com')) return null;
    if (u.hostname === 'discord.gg' && /^\/[A-Za-z0-9_-]{2,64}\/?$/.test(u.pathname)) return 'DISCORD_INVITE';
    if (/^\/invite\/[A-Za-z0-9_-]{2,64}\/?$/.test(u.pathname)) return 'DISCORD_INVITE';
    return null;
  } catch { return null; }
}
export const validDiscordInvite = (url: string) => classifyCommunityEntry(url) === 'DISCORD_INVITE';
function verdict(stage: CommunityStage, reason: string, entryKind: EntryKind | null,
  canResumeBoundApplication = false): DiscordCommunityVerdict {
  return { stage, reason, entryKind, canResumeBoundApplication, mayAutoJoin: false, mayAutoSubmit: false };
}
export function evaluateDiscordCommunity(input: DiscordCommunityInput, now = new Date()): DiscordCommunityVerdict {
  const kind = input && classifyCommunityEntry(input.entryUrl);
  if (!input || !kind || !boundedId(input.opportunityId) || !boundedId(input.communityKey) ||
      !boundedId(input.hostSessionBinding) || !Number.isFinite(now.getTime())) {
    return verdict('BLOCKED', 'invalid_or_unbound_community_entry', null);
  }
  if (kind === 'PARTNER_PORTAL' && !input.partnerAuthenticated)
    return verdict('PARTNER_AUTH_HANDOFF', 'sign_in_to_partner_platform_with_user_control', kind);
  if (kind === 'PARTNER_PORTAL' && !input.inviteObserved)
    return verdict('INVITE_DISCOVERY_REQUIRED', 'resolve_invitation_from_authenticated_partner_portal', kind);
  // Discord desktop installation is optional; the browser-based join remains available.
  if (!input.discordAuthenticated || !boundedId(input.discordUserBinding))
    return verdict('DISCORD_AUTH_HANDOFF', 'complete_discord_login_or_oauth_with_user_control', kind);
  const proof = input.membershipProof;
  if (proof?.source === 'trusted_discord_membership_readback' && proof.member === true &&
      proof.opportunityId === input.opportunityId && proof.communityKey === input.communityKey &&
      proof.hostSessionBinding === input.hostSessionBinding &&
      proof.discordUserBinding === input.discordUserBinding &&
      guildId(input.expectedGuildId) && proof.guildId === input.expectedGuildId) {
    const observed = Date.parse(proof.observedAtUtc);
    if (Number.isFinite(observed) && observed <= now.getTime() && now.getTime() - observed <= MAX_PROOF_AGE_MS) {
      return proof.pendingScreening
        ? verdict('MEMBERSHIP_SCREENING_REQUIRED', 'server_requires_membership_screening', kind)
        : verdict('MEMBERSHIP_CONFIRMED', 'fresh_exact_user_guild_membership_readback', kind, true);
    }
  }
  if (!input.explicitJoinConsent)
    return verdict('JOIN_CONSENT_REQUIRED', 'user_must_approve_exact_server_join', kind);
  return verdict('JOIN_PENDING', 'await_trusted_membership_readback_for_exact_guild', kind);
}
export async function resumeAfterVerifiedDiscord<T>(
  input: DiscordCommunityInput,
  existingApplicationController: (opportunityId: string) => Promise<T>,
  now = new Date(),
): Promise<{ verdict: DiscordCommunityVerdict; application?: T }> {
  const result = evaluateDiscordCommunity(input, now);
  if (!result.canResumeBoundApplication) return { verdict: result };
  // Existing controller still enforces origin, document, attestation and submit gates.
  return { verdict: result, application: await existingApplicationController(input.opportunityId) };
}
