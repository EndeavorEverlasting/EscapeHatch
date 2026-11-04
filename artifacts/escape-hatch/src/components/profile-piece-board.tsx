import { useState } from 'react';
import { Link } from 'wouter';
import { Check } from 'lucide-react';
import { REUSABLE_PROFILE_PIECES } from '@/lib/mascot-guidance';
import type { Profile } from '@/lib/storage';

/**
 * The profile board paints only saved-or-missing state, never applicant values.
 * Local profile coverage is not employer-form or submission readiness.
 */
export function ProfilePieceBoard({ profile }: { profile: Profile }) {
  const [selected, setSelected] = useState<string | null>(null);
  const activePiece = REUSABLE_PROFILE_PIECES.find(piece => piece.key === selected);
  const activeFilled = activePiece ? Boolean(profile[activePiece.key].trim()) : false;
  const filled = REUSABLE_PROFILE_PIECES.filter(piece => profile[piece.key].trim()).length;
  return <section className="profile-puzzle-board mt-5" aria-labelledby="profile-puzzle-heading" data-testid="profile-puzzle-board">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.15em] text-primary">Reusable pieces</p>
        <h3 id="profile-puzzle-heading" className="mt-1 font-display text-2xl">Build the board you reuse.</h3>
      </div>
      <span className="rounded-full border border-primary/25 bg-card px-3 py-1.5 text-xs font-bold text-primary" data-testid="profile-puzzle-count">{filled} / {REUSABLE_PROFILE_PIECES.length} saved locally</span>
    </div>
    <div className="profile-puzzle-grid mt-4" role="group" aria-label="Reusable profile puzzle pieces">
      {REUSABLE_PROFILE_PIECES.map((piece, index) => {
        const populated = Boolean(profile[piece.key].trim());
        const active = selected === piece.key;
        return <button type="button" key={piece.key} onClick={() => setSelected(active ? null : piece.key)}
          className="profile-puzzle-tile" data-testid={`profile-puzzle-piece-${piece.key}`}
          data-piece-state={populated ? 'saved' : 'missing'} data-selected={active}
          aria-pressed={active} aria-label={`${piece.label}: ${populated ? 'saved locally' : 'not saved'}; inspect piece`}
          style={{ animationDelay: `${Math.min(index * 45, 315)}ms` }}>
          <span className="profile-puzzle-tile-mark" aria-hidden="true">{populated ? <Check size={18} strokeWidth={2.8} /> : <span>+</span>}</span>
          <span className="profile-puzzle-tile-label">{piece.label}</span>
          <span className="profile-puzzle-tile-state">{populated ? 'In place' : 'Open slot'}</span>
        </button>;
      })}
    </div>
    <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-card/75 px-3 py-2 text-xs" data-testid="profile-puzzle-selection">
      <span aria-live="polite">{activePiece ? `${activePiece.label}: ${activeFilled ? 'saved in your private profile' : 'still available to fill'}.` : 'Choose a piece to inspect it. Nothing is sent to an employer.'}</span>
      <Link href="/profile" className="font-bold text-primary underline underline-offset-4">{activePiece ? 'Review this detail' : 'Edit your profile'}</Link>
    </div>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">Profile pieces are not employer requirements. The application form must be inspected separately; a complete board never means ready to submit.</p>
  </section>;
}
