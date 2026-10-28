import type { Application, Profile } from './storage';

type ReusableProfileKey = 'first_name' | 'last_name' | 'email' | 'phone' | 'city' | 'region' | 'country' | 'linkedin_url';
type ProfilePiece = { key: ReusableProfileKey; label: string; essential: boolean };

export const REUSABLE_PROFILE_PIECES: readonly ProfilePiece[] = [
  { key: 'first_name', label: 'First name', essential: true },
  { key: 'last_name', label: 'Last name', essential: true },
  { key: 'email', label: 'Email', essential: true },
  { key: 'phone', label: 'Phone', essential: false },
  { key: 'city', label: 'City', essential: false },
  { key: 'region', label: 'Region / state', essential: false },
  { key: 'country', label: 'Country', essential: false },
  { key: 'linkedin_url', label: 'LinkedIn URL', essential: false },
] as const;

export type MascotGuidance = {
  profileCount: number;
  profileTotal: number;
  missing: readonly ProfilePiece[];
  essentialMissing: readonly ProfilePiece[];
  hasOpportunity: boolean;
  nextStep: 0 | 1 | 2;
  eyebrow: string;
  message: string;
  action: string;
  href: string;
};

/** Local reusable details only; never infer employer requirements or submission readiness. */
export function projectMascotGuidance(profile: Profile, applications: readonly Application[], focusOpportunity?: Application): MascotGuidance {
  const missing = REUSABLE_PROFILE_PIECES.filter(piece => !profile[piece.key].trim());
  const essentialMissing = missing.filter(piece => piece.essential);
  const profileCount = REUSABLE_PROFILE_PIECES.length - missing.length;
  const hasOpportunity = applications.some(item => !['applied', 'closed'].includes(item.status));
  if (focusOpportunity && focusOpportunity.url && !['applied', 'closed'].includes(focusOpportunity.status)) {
    const contactReminder = essentialMissing.length
      ? ` Your local profile still needs ${essentialMissing.map(piece => piece.label.toLowerCase()).join(', ')}; review those details before filling.`
      : missing.length ? ' Optional profile details do not block preparing this job. Inspect the employer form to verify its required fields.' : ' Inspect the employer form to verify its actual required fields.';
    return {
      profileCount, profileTotal: REUSABLE_PROFILE_PIECES.length, missing, essentialMissing, hasOpportunity,
      nextStep: 2, eyebrow: 'Your selected application',
      message: `Chirp! ${focusOpportunity.company} — ${focusOpportunity.role} is your next puzzle.${contactReminder}`,
      action: 'Assemble this application',
      href: `/assist?opportunityId=${encodeURIComponent(focusOpportunity.id)}`,
    };
  }
  if (essentialMissing.length) {
    const first = essentialMissing[0];
    return { profileCount, profileTotal: REUSABLE_PROFILE_PIECES.length, missing, essentialMissing, hasOpportunity,
      nextStep: 0, eyebrow: 'A profile piece is waiting',
      message: `Chirp! Add your ${first.label.toLowerCase()} to help reuse verified details across applications.`,
      action: `Add ${first.label.toLowerCase()}`, href: '/profile' };
  }
  if (!hasOpportunity) {
    return { profileCount, profileTotal: REUSABLE_PROFILE_PIECES.length, missing, essentialMissing, hasOpportunity,
      nextStep: 1, eyebrow: 'Your next hatch is open',
      message: missing.length
        ? `Chirp! Your essential profile details are present. ${missing.length} optional detail${missing.length === 1 ? '' : 's'} can wait while you choose a job.`
        : 'Chirp! Your reusable profile checklist is filled. Choose a real opportunity to assemble next.',
      action: 'Choose an opportunity', href: '/applications' };
  }
  if (missing.length) {
    return { profileCount, profileTotal: REUSABLE_PROFILE_PIECES.length, missing, essentialMissing, hasOpportunity,
      nextStep: 2, eyebrow: 'A little profile polish',
      message: `Chirp! ${missing[0].label} is still blank in your reusable profile. It may help on some forms, but it does not block you from preparing this job.`,
      action: `Review ${missing[0].label.toLowerCase()}`, href: '/profile' };
  }
  return { profileCount, profileTotal: REUSABLE_PROFILE_PIECES.length, missing, essentialMissing, hasOpportunity,
    nextStep: 2, eyebrow: 'Ready for the next puzzle piece',
    message: 'Chirp! Your reusable profile checklist is filled. Inspect this employer form to see what it actually requires.',
    action: 'Open application assist', href: '/assist' };
}
