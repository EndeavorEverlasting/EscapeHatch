import './profile-puzzle-gallery.css';
import { useState } from 'react';
import type { ProfilePuzzleSnapshot } from '@/lib/profile-puzzle-projection';
import { PUZZLE_GALLERY_SETS, projectPuzzleGallery } from '@/lib/profile-puzzle-gallery';

export function PuzzleGalleryDisplay({ snapshot }: { snapshot: ProfilePuzzleSnapshot }) {
  const [choice, setChoice] = useState(PUZZLE_GALLERY_SETS[0].id);
  const view = projectPuzzleGallery(snapshot, choice);
  const artwork = view.set.artwork;
  return <section className="profile-gallery mt-4" aria-label="Choose a profile puzzle" data-testid="profile-puzzle-gallery">
    <label className="profile-gallery-choice">Choose your puzzle
      <select value={choice} onChange={event => setChoice(event.target.value)} data-testid="profile-puzzle-set-select">
        {PUZZLE_GALLERY_SETS.map(set => <option key={set.id} value={set.id}>{set.title}</option>)}
      </select>
    </label>
    {artwork ? <figure className="profile-gallery-art">
      <img src={artwork.path} alt={artwork.alt} width={artwork.width}
        height={artwork.height} loading="lazy" data-testid="profile-puzzle-artwork" />
      <div className="profile-gallery-art-overlay" aria-hidden="true">
        {view.pieces.map((piece, index) => <span key={piece.key} data-state={piece.status}
          style={piece.status === 'saved' ? {
            backgroundImage: 'url(' + artwork.path + ')',
            backgroundSize: '500% 200%',
            backgroundPosition: ((index % 5) * 25) + '% ' + (Math.floor(index / 5) * 100) + '%',
          } : undefined} />)}
      </div>
      <figcaption>Illustrative checkmarks in the artwork are not your live status.</figcaption>
    </figure> : <div className="profile-gallery-classic" data-testid="profile-puzzle-classic">Your story, your pace.</div>}
    <p className="mt-2 text-sm" data-testid="profile-puzzle-gallery-count">{view.saved} of {view.total} profile pieces saved locally.</p>
    <p className="mt-1 text-xs" data-testid="profile-puzzle-reward" aria-live="polite">
      {view.unlocked ? view.set.reward.label + ' unlocked — a decorative milestone'
        : view.set.reward.label + ' unlocks when all measured profile pieces are saved.'}
    </p>
    <p className="mt-1 text-xs text-muted-foreground">The gallery never grants identity verification or application readiness. Selection is page-local while secure owner-scoped preferences are unavailable.</p>
  </section>;
}
