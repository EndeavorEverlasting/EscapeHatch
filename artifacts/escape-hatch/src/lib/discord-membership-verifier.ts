/** Official Discord OAuth2 user-member readback for the local EscapeHatch host.
 * Requires identify + guilds.members.read; never joins, sends messages, reads
 * passwords or uses normal-user automation. */
import type { DiscordMembershipProof } from './discord-community-flow.ts';
export type MembershipIdentity = {
  discordUserId: string; guildId: string; opportunityId: string;
  communityKey: string; hostSessionBinding: string;
};
export type MembershipVerification =
  | { ok: true; proof: DiscordMembershipProof }
  | { ok: false; reason: 'INVALID_BINDING' | 'AUTH_REQUIRED' | 'PERMISSION_REQUIRED' |
      'NOT_A_MEMBER' | 'PROVIDER_UNAVAILABLE' | 'MALFORMED_RESPONSE' };
const ID = /^[0-9]{15,22}$/;
const LOCAL_ID = /^[A-Za-z0-9:_-]{1,160}$/;
const BASE = 'https://discord.com/api/v10';
async function readJson(response: Response): Promise<unknown> {
  const limit = 48 * 1024;
  const rawLength = response.headers.get('content-length');
  if (rawLength && Number(rawLength) > limit) throw Error('OVERSIZED');
  if (!/application\/json/i.test(response.headers.get('content-type') || '')) throw Error('NON_JSON');
  const reader = response.body?.getReader();
  if (!reader) throw Error('NO_BODY');
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) throw Error('OVERSIZED');
      parts.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const p of parts) { bytes.set(p, offset); offset += p.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
/** The private host provides the consented OAuth token and trusted guild ID. */
export async function readDiscordMembership(
  accessToken: string, target: MembershipIdentity,
  options: { fetch?: typeof fetch; now?: () => Date } = {},
): Promise<MembershipVerification> {
  if (!accessToken || accessToken.length > 8192 || /[\r\n]/.test(accessToken) ||
      !ID.test(target?.discordUserId || '') || !ID.test(target?.guildId || '') ||
      !LOCAL_ID.test(target?.opportunityId || '') || !LOCAL_ID.test(target?.communityKey || '') ||
      !LOCAL_ID.test(target?.hostSessionBinding || '')) return { ok: false, reason: 'INVALID_BINDING' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
  const caller = options.fetch || fetch;
  const get = (url: string) => caller(url, {
    method: 'GET', headers, redirect: 'error', cache: 'no-store', signal: controller.signal,
  });
  try {
    const who = await get(BASE + '/users/@me');
    if (who.status === 401) return { ok: false, reason: 'AUTH_REQUIRED' };
    if (who.status === 403) return { ok: false, reason: 'PERMISSION_REQUIRED' };
    if (!who.ok) return { ok: false, reason: 'PROVIDER_UNAVAILABLE' };
    const user = await readJson(who) as { id?: unknown };
    if (user?.id !== target.discordUserId) return { ok: false, reason: 'INVALID_BINDING' };
    const memberResponse = await get(BASE + '/users/@me/guilds/' + target.guildId + '/member');
    if (memberResponse.status === 404) return { ok: false, reason: 'NOT_A_MEMBER' };
    if (memberResponse.status === 401) return { ok: false, reason: 'AUTH_REQUIRED' };
    if (memberResponse.status === 403) return { ok: false, reason: 'PERMISSION_REQUIRED' };
    if (!memberResponse.ok) return { ok: false, reason: 'PROVIDER_UNAVAILABLE' };
    const member = await readJson(memberResponse) as { pending?: unknown; user?: { id?: unknown } };
    if (!member || typeof member !== 'object' || typeof member.pending !== 'boolean' ||
        (member.user?.id !== undefined && member.user.id !== target.discordUserId)) {
      return { ok: false, reason: 'MALFORMED_RESPONSE' };
    }
    const now = (options.now || (() => new Date()))();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return { ok: false, reason: 'MALFORMED_RESPONSE' };
    return { ok: true, proof: {
      source: 'trusted_discord_membership_readback',
      opportunityId: target.opportunityId, communityKey: target.communityKey,
      hostSessionBinding: target.hostSessionBinding,
      discordUserBinding: target.discordUserId, guildId: target.guildId,
      member: true, pendingScreening: member.pending, observedAtUtc: now.toISOString(),
    } };
  } catch { return { ok: false, reason: 'PROVIDER_UNAVAILABLE' }; }
  finally { clearTimeout(timer); controller.abort(); }
}
