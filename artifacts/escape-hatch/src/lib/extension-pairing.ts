/** Canonical native-pairing envelope parser, shared by host identity and companion transport. */
import { parseWorkspaceOwnerBinding, type WorkspaceOwnerBinding } from './workspace-owner-binding.ts';
import { EXTENSION_PROFILE_FIELDS } from './extension-profile-admission.ts';
export const PAIRING_SCHEMA = 'escapehatch/extension-native-pairing/v1';
export const SAFE_ANSWER_IDS = [
  'identity.professional_title', 'identity.website', 'education.highest_completed_level',
  'education.institution', 'education.credential', 'education.field_of_study',
  'education.dates', 'interview.live_coding_comfort',
] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = /^[a-f0-9]{64}$/;
const profileFields = [...EXTENSION_PROFILE_FIELDS, 'phone_authority'];
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
function list(value: unknown, allowed: readonly string[], nonempty = false): value is string[] {
  return Array.isArray(value) && (!nonempty || value.length > 0) && value.length <= allowed.length &&
    value.every(v => typeof v === 'string' && allowed.includes(v)) && new Set(value).size === value.length;
}
export type Pairing = {
  schema: typeof PAIRING_SCHEMA; binding: WorkspaceOwnerBinding; browserProfileId: string;
  profileDigest: string; preferenceDigest: string; approvedFields: string[];
  approvedAnswerIds: string[]; approvedAt: string;
};
export function parsePairing(input: unknown): Pairing | null {
  if (!object(input) || Object.keys(input).some(k => !['schema','binding','browserProfileId','profileDigest','preferenceDigest','approvedFields','approvedAnswerIds','approvedAt'].includes(k))) return null;
  if (input.schema !== PAIRING_SCHEMA || !parseWorkspaceOwnerBinding(input.binding) || typeof input.browserProfileId !== 'string' || !uuid.test(input.browserProfileId) ||
    typeof input.profileDigest !== 'string' || !sha.test(input.profileDigest) || typeof input.preferenceDigest !== 'string' || !sha.test(input.preferenceDigest) ||
    !list(input.approvedFields, profileFields, true) || !list(input.approvedAnswerIds, SAFE_ANSWER_IDS) || typeof input.approvedAt !== 'string' || Number.isNaN(Date.parse(input.approvedAt))) return null;
  return input as unknown as Pairing;
}
