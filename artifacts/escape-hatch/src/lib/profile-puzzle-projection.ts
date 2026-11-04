import { REUSABLE_PROFILE_PIECES } from './mascot-guidance.ts';
import type { Profile } from './storage.ts';
import type { RecoveredKnowledge } from './answer-recovery.ts';

export type ProfilePuzzleStatus = 'saved' | 'needs_review' | 'missing' | 'unmeasured';
export type ProfilePuzzlePiece = {
  key: string;
  label: string;
  status: ProfilePuzzleStatus;
  sourceOwner: string;
  updatedAt?: string;
  nextAction: { label: string; href: string };
};
export type ProfilePuzzleInput = {
  profile: Profile;
  recovery?: {
    items: readonly RecoveredKnowledge[];
    loading: boolean;
    unavailable: readonly string[];
  };
};
export type ProfilePuzzleSnapshot = {
  pieces: readonly ProfilePuzzlePiece[];
  savedCount: number;
  total: number;
  coverageMeasured: boolean;
};

const contactQuestions: Record<string, string> = {
  first_name: 'identity.first_name', last_name: 'identity.last_name', email: 'identity.email',
  phone: 'identity.phone', city: 'identity.city', region: 'identity.region',
  country: 'identity.country', linkedin_url: 'identity.linkedin',
};

function latestSourceTime(items: readonly RecoveredKnowledge[]): string | undefined {
  const timestamps = items.flatMap(item => item.variants.flatMap(variant =>
    variant.sources.map(source => source.updatedAt).filter((value): value is string =>
      Boolean(value && !Number.isNaN(Date.parse(value)))).map(value => new Date(value).toISOString())));
  return timestamps.sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function recoveredStatus(items: readonly RecoveredKnowledge[]): ProfilePuzzleStatus {
  if (items.some(item => item.status === 'needs-review')) return 'needs_review';
  return items.some(item => item.status === 'recovered') ? 'saved' : 'missing';
}

/** Public labels and state only. This read-only view grants no fill or approval authority. */
export function projectProfilePuzzle({ profile, recovery }: ProfilePuzzleInput): ProfilePuzzleSnapshot {
  const pieces: ProfilePuzzlePiece[] = REUSABLE_PROFILE_PIECES.map(piece => {
    const contact = recovery?.items.filter(item =>
      item.scope === 'question' && item.questionKey === contactQuestions[piece.key]) ?? [];
    const present = Boolean(profile[piece.key].trim());
    const needsReview = contact.some(item => item.status === 'needs-review') ||
      piece.key === 'phone' && present && profile.phone_authority !== 'user_confirmed_primary';
    const updatedAt = latestSourceTime(contact);
    return {
      key: piece.key, label: piece.label,
      status: needsReview ? 'needs_review' : present ? 'saved' : 'missing',
      sourceOwner: 'profile',
      ...(updatedAt ? { updatedAt } : {}),
      nextAction: { label: 'Review profile detail', href: '/profile' },
    };
  });
  const measured = Boolean(recovery && !recovery.loading && recovery.unavailable.length === 0);
  const reusable = recovery?.items.filter(item => item.scope === 'reusable') ?? [];
  const careerSignals = [
    { key: 'professional-summary', label: 'Professional summary', href: '/assist', action: 'Review career story',
      items: reusable.filter(item => item.questionKey === 'professional-summary') },
    { key: 'reusable-answers', label: 'Reusable answers', href: '/answers', action: 'Review saved answers',
      items: reusable.filter(item => ['strengths', 'relevant-experience'].includes(item.questionKey)) },
  ];
  for (const signal of careerSignals) {
    const updatedAt = latestSourceTime(signal.items);
    pieces.push({
      key: signal.key, label: signal.label,
      status: measured ? recoveredStatus(signal.items) : 'unmeasured',
      sourceOwner: 'answer-recovery',
      ...(updatedAt ? { updatedAt } : {}),
      nextAction: { label: signal.action, href: signal.href },
    });
  }
  return {
    pieces, savedCount: pieces.filter(piece => piece.status === 'saved').length,
    total: pieces.length, coverageMeasured: measured,
  };
}
