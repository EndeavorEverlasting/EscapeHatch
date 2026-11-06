import { useState } from 'react';
import { PuzzleGalleryDisplay } from './puzzle-gallery-display';
import { PuzzleAtlasShelf } from './puzzle-atlas-shelf';
import { Link } from 'wouter';
import { Check, CircleHelp, Plus, TriangleAlert } from 'lucide-react';
import type { RecoveredKnowledge } from '@/lib/answer-recovery';
import { projectProfilePuzzle } from '@/lib/profile-puzzle-projection';
import { REUSABLE_PROFILE_PIECES } from '@/lib/mascot-guidance';
import type { Profile } from '@/lib/storage';

const stateLabels = {
  saved: 'Saved locally',
  needs_review: 'Needs review',
  missing: 'Open slot',
  unmeasured: 'Not measured',
} as const;

const stateMarks = { saved: Check, needs_review: TriangleAlert, missing: Plus, unmeasured: CircleHelp };

/** A read-only material view of private owner state; never an employer readiness score. */
export function ProfilePieceBoard({ profile, recovery }: {
  profile: Profile;
  recovery?: { items: readonly RecoveredKnowledge[]; loading: boolean; unavailable: readonly string[] };
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const snapshot = projectProfilePuzzle({ profile, recovery });
  const activePiece = snapshot.pieces.find(piece => piece.key === selected);
  const contactKeys = new Set<string>(REUSABLE_PROFILE_PIECES.map(piece => piece.key));
  const contactPieces = snapshot.pieces.filter(piece => contactKeys.has(piece.key));
  const contactCount = contactPieces.filter(piece => piece.status === 'saved').length;
  const groups = [
    { label: 'Contact details', pieces: contactPieces },
    { label: 'Career story and reusable answers', pieces: snapshot.pieces.filter(piece => !contactKeys.has(piece.key)) },
  ];
  return <section className="profile-puzzle-board mt-5" aria-labelledby="profile-puzzle-heading" data-testid="profile-puzzle-board">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="profile-puzzle-heading" className="font-display text-2xl">Build the board you reuse.</h3>
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">Keep each piece connected to where it was saved. Choose one to inspect its next step.</p>
      </div>
      <div className="profile-puzzle-coverage" data-testid="profile-puzzle-count">
        <span>{contactCount} / {contactPieces.length} contact details saved locally</span>
        <span className="block font-normal text-muted-foreground" data-testid="profile-puzzle-coverage">{snapshot.coverageMeasured ? `${snapshot.savedCount} of ${snapshot.total} local profile signals saved` : 'Coverage not measured'}</span>
      </div>
    </div>
    <PuzzleAtlasShelf snapshot={snapshot} recovery={recovery} />
    <PuzzleGalleryDisplay snapshot={snapshot} />
    {groups.map(group => <div key={group.label} className="mt-4">
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground">{group.label}</h4>
      <div className="profile-puzzle-grid" role="group" aria-label={group.label}>
        {group.pieces.map(piece => {
          const active = selected === piece.key;
          const Mark = stateMarks[piece.status];
          return <button type="button" key={piece.key} onClick={() => setSelected(active ? null : piece.key)}
            className="profile-puzzle-tile" data-testid={`profile-puzzle-piece-${piece.key}`}
            data-piece-state={piece.status} data-selected={active}
            aria-pressed={active} aria-controls="profile-puzzle-inspection"
            aria-label={`${piece.label}: ${stateLabels[piece.status].toLowerCase()}; inspect piece`}>
            <span className="profile-puzzle-tile-mark" aria-hidden="true"><Mark size={18} strokeWidth={2.5} /></span>
            <span className="profile-puzzle-tile-label">{piece.label}</span>
            <span className="profile-puzzle-tile-state">{stateLabels[piece.status]}</span>
          </button>;
        })}
      </div>
    </div>)}
    <div id="profile-puzzle-inspection" className="profile-puzzle-inspection mt-4" data-testid="profile-puzzle-selection">
      <div aria-live="polite" aria-atomic="true">
        {activePiece ? <>
          <p className="text-sm font-bold">{activePiece.label}: {stateLabels[activePiece.status].toLowerCase()}.</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Source: {activePiece.sourceOwner === 'profile' ? 'Private profile' : 'Saved answers and reviewed career story'}{activePiece.updatedAt ? ` · Updated ${activePiece.updatedAt}` : ''}</p>
        </> : <p className="text-xs leading-5">Choose a piece to inspect it. Nothing is sent to an employer.</p>}
      </div>
      <Link href={activePiece?.nextAction.href || '/profile'} className="inline-flex min-h-11 items-center text-xs font-bold text-primary underline underline-offset-4">{activePiece?.nextAction.label || 'Edit your profile'}</Link>
    </div>
    <p className="mt-3 max-w-2xl text-xs leading-5 text-muted-foreground">Profile pieces are not employer requirements. The application form must be inspected separately; a complete board never means ready to submit.</p>
  </section>;
}
