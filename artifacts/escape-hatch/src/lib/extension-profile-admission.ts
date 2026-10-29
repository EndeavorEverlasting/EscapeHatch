/**
 * P95 / B0-C: pure, side-effect-free preflight for an extension profile projection.
 * DOES NOT authenticate a user, establish browser identity, write private data,
 * or prove that a caller-supplied authorization came from a trusted service.
 * Integration MUST first run the canonical owner-context admission on the
 * installed, loopback-bound service and read its current owner/revisions.
 * No unsigned client request may construct the trusted arguments directly.
 */
import type { Profile } from './storage.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
export const EXTENSION_PROFILE_FIELDS = [
  'name_prefix', 'first_name', 'last_name', 'preferred_name', 'email', 'phone',
  'linkedin_url', 'street_address', 'city', 'region', 'postal_code', 'country',
] as const satisfies readonly (keyof Profile)[];
type ProjectedField = typeof EXTENSION_PROFILE_FIELDS[number];
export type ApprovedExtensionProfile = Partial<Pick<Profile, ProjectedField>> &
  Pick<Profile, 'phone_authority'>;
export type OwnerAdmission = { ok: true; ownerId: string; workspaceId: string } |
  { ok: false; reason: string };
export type TrustedWorkspace = {
  ownerId: string; workspaceId: string; installationId: string; profileRevision: string;
};
export type ExtensionPairing = {
  ownerId: string; workspaceId: string; installationId: string;
  extensionId: string; browserProfileId: string; pairingConfirmed: true;
};
export type PrivateProfileSnapshot = {
  ownerId: string; workspaceId: string; profileRevision: string;
  profile: Partial<Profile>; approvedFields: readonly string[];
};
export type ExistingExtensionProfile = {
  ownerId: string; workspaceId: string; installationId: string;
  extensionId: string; browserProfileId: string;
  profile: ApprovedExtensionProfile;
};
export type ProfileAdmissionReason =
  'OWNER_UNVERIFIED' | 'OWNER_MISMATCH' | 'WORKSPACE_MISMATCH' |
  'INSTALLATION_MISMATCH' | 'CHROME_PROFILE_MISMATCH' | 'PROFILE_REVISION_MISMATCH' |
  'INVALID_PROFILE' | 'NO_APPROVED_PROFILE' | 'EXISTING_PROFILE_REVIEW_REQUIRED';
export type ProfileAdmissionResult =
  | { ok: false; reason: ProfileAdmissionReason }
  | { ok: true; action: 'PROJECTION_READY' | 'ALREADY_CURRENT'; profile: ApprovedExtensionProfile };

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x);
const digest = (x: unknown): x is string => typeof x === 'string' && SHA256.test(x);
const token = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 256 && !/[\r\n]/.test(x);
const isText = (x: unknown): x is string => typeof x === 'string' && x.length <= 4096;
const fields = new Set<string>(EXTENSION_PROFILE_FIELDS);
const phoneAuthority = (x: unknown) => x === 'user_confirmed_primary' ||
  x === 'secondary_or_forwarded' || x === 'unconfirmed';
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Decisions only: writes/transport, consent and revision checks belong to the trusted host. */
export function admitExtensionProfileProjection(input: {
  admission: OwnerAdmission;
  workspace: TrustedWorkspace;
  pairing: ExtensionPairing;
  snapshot: PrivateProfileSnapshot;
  existing?: ExistingExtensionProfile | null;
}): ProfileAdmissionResult {
  if (!input || !object(input) || !object(input.admission) || input.admission.ok !== true ||
    !object(input.workspace) || !object(input.pairing) || !object(input.snapshot)) {
    return { ok: false, reason: 'OWNER_UNVERIFIED' };
  }
  const { admission, workspace, pairing, snapshot, existing } = input;
  if (!uuid(workspace.ownerId) || !uuid(workspace.workspaceId) || !uuid(workspace.installationId) ||
    !digest(workspace.profileRevision) || pairing.pairingConfirmed !== true ||
    !token(pairing.extensionId) || !token(pairing.browserProfileId)) {
    return { ok: false, reason: 'OWNER_UNVERIFIED' };
  }
  if (admission.ownerId !== workspace.ownerId || pairing.ownerId !== workspace.ownerId ||
    snapshot.ownerId !== workspace.ownerId) return { ok: false, reason: 'OWNER_MISMATCH' };
  if (admission.workspaceId !== workspace.workspaceId || pairing.workspaceId !== workspace.workspaceId ||
    snapshot.workspaceId !== workspace.workspaceId) return { ok: false, reason: 'WORKSPACE_MISMATCH' };
  if (pairing.installationId !== workspace.installationId) return { ok: false, reason: 'INSTALLATION_MISMATCH' };
  if (!digest(snapshot.profileRevision) || snapshot.profileRevision !== workspace.profileRevision) {
    return { ok: false, reason: 'PROFILE_REVISION_MISMATCH' };
  }
  if (!object(snapshot.profile) || !Array.isArray(snapshot.approvedFields) ||
    snapshot.approvedFields.length > EXTENSION_PROFILE_FIELDS.length + 1 ||
    snapshot.approvedFields.some(k => typeof k !== 'string' || k !== 'phone_authority' && !fields.has(k)) ||
    new Set(snapshot.approvedFields).size !== snapshot.approvedFields.length) {
    return { ok: false, reason: 'INVALID_PROFILE' };
  }
  const profile: ApprovedExtensionProfile = { phone_authority: 'unconfirmed' };
  for (const key of EXTENSION_PROFILE_FIELDS) {
    if (!snapshot.approvedFields.includes(key)) continue;
    const value = snapshot.profile[key];
    if (!isText(value)) return { ok: false, reason: 'INVALID_PROFILE' };
    if (value.trim()) profile[key] = value.trim();
  }
  if (snapshot.approvedFields.includes('phone_authority')) {
    if (!phoneAuthority(snapshot.profile.phone_authority)) return { ok: false, reason: 'INVALID_PROFILE' };
    profile.phone_authority = snapshot.profile.phone_authority!;
  }
  // A phone number does not imply that the user has authorized filling it.
  if (!profile.phone) profile.phone_authority = 'unconfirmed';
  if (Object.keys(profile).length === 1) return { ok: false, reason: 'NO_APPROVED_PROFILE' };
  if (existing !== undefined && existing !== null) {
    if (!object(existing) || existing.ownerId !== workspace.ownerId) {
      return { ok: false, reason: 'OWNER_MISMATCH' };
    }
    if (existing.workspaceId !== workspace.workspaceId) return { ok: false, reason: 'WORKSPACE_MISMATCH' };
    if (existing.installationId !== workspace.installationId) return { ok: false, reason: 'INSTALLATION_MISMATCH' };
    if (existing.extensionId !== pairing.extensionId || existing.browserProfileId !== pairing.browserProfileId) {
      return { ok: false, reason: 'CHROME_PROFILE_MISMATCH' };
    }
    if (!equal(existing.profile, profile)) return { ok: false, reason: 'EXISTING_PROFILE_REVIEW_REQUIRED' };
    return { ok: true, action: 'ALREADY_CURRENT', profile };
  }
  return { ok: true, action: 'PROJECTION_READY', profile };
}
